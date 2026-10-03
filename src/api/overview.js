// src/api/overview.js
//
// Thin aggregator over the existing per-domain api modules. The Overview
// page needs data from 6+ endpoints; instead of having each component
// fire its own call (and each component handling its own loading/error
// state separately), we fan out from here with Promise.allSettled and
// let the page render partial data if one backend endpoint is slow or
// broken. A failing /jobs/timeseries shouldn't blank out the whole Hero.
//
// Each helper is a single GET — no heavy client-side composition, just
// friendlier names. Individual pages (Audit, Jobs, Certs, Compliance)
// still own their own deeper views; this module only serves the Hero +
// charts + tables on the Overview.

import { httpGetJson, isTemporaryApiError } from "./http";
import { getDevicePosture } from "./compliance";
import { getDeploymentTimeseries, listDeployments } from "./softwareDelivery";
import { getRemoteControlSummary } from "./remoteControl";
import { getPatchSummary } from "./patchManagement";
import { getCdpSummary } from "./cdp";
import { getReportRuns, listReportSchedules } from "./reports";
import { getHardwareInventorySummary } from "./inventoryDashboard";

// ---- existing endpoints we already ship -------------------------------

export async function getDashboardSummary() {
  return httpGetJson("/api/v1/dashboard/summary");
}

export async function getExpiringCertificates(days = 30, options) {
  // `days`, no `withinDays`: es lo que lee el controlador
  // (certificates.controller.ts). Con el nombre equivocado la ventana se
  // ignoraba y siempre valía el defecto — hoy 30, así que no se notaba.
  return httpGetJson(`/api/v1/security/certificates/expiring?days=${days}`, options);
}

export async function getConnectedDevices() {
  return httpGetJson("/api/v1/orchestrator/devices-connected");
}

export async function getAgentVersionsSummary() {
  // Raw per-tenant counts of `device_enrollments.agent_version`.
  // Shape: { ok, total, byVersion: [{ version, count }, ...] }
  return httpGetJson("/api/v1/dashboard/agent-versions");
}

export async function getPluginCoverageSummary() {
  // Per-plugin enablement across the tenant's fleet.
  // Shape: { ok, total, byPlugin: [{ plugin: "scp", count: 3 }, ...] }
  return httpGetJson("/api/v1/dashboard/plugin-coverage");
}

// ---- new endpoints for the Overview ----------------------------------

// Sprint 2 item 7 — these two used to be byte-identical copies of the
// helpers in api/compliance.js (same URLs, drifting doc comments).
// Imported AND re-exported: fetchOverviewSecurity below uses them
// locally, and Overview components import them from this module.
import { getComplianceSummary, getFleetComplianceTimeseries } from "./compliance";
export { getComplianceSummary, getFleetComplianceTimeseries };

export async function getAuditTimeseries(windowDays = 7, lane, options) {
  // `lane` es opcional: Overview no lo manda y sigue viendo toda la
  // actividad, la página de Audit sí para que la gráfica enseñe lo mismo
  // que la tabla de debajo.
  const laneQs = lane ? `&lane=${encodeURIComponent(lane)}` : "";
  return httpGetJson(`/api/v1/security/audit/timeseries?window=${windowDays}d${laneQs}`, options);
}

export async function getJobsTimeseries(windowDays = 7) {
  return httpGetJson(`/api/v1/orchestrator/jobs/timeseries?window=${windowDays}d`);
}

// ---- agent version (for "outdated" alert logic) ----------------------

/**
 * Latest published version per platform+arch. Used to compute the
 * "agent X% outdated" Hero card.
 *
 * ONE request via the bulk endpoint. This used to fan out to four — macos and
 * windows × x64 and arm64 — inside a client switch that already fires ~28, and
 * where a 1 KB response costs a full round-trip queued behind everything else.
 *
 * The old fan-out also hard-coded its platform list, so Linux agents were never
 * compared against a published version and could never show as outdated. The
 * bulk endpoint derives the combinations server-side from the platforms it
 * actually serves, which is why that list is gone from here rather than simply
 * having "linux" appended: a hard-coded copy is what let it drift.
 *
 * Falls back to the old fan-out when the endpoint isn't there. The UI and the
 * backend deploy independently, so shipping this first must not blank the Hero
 * card — a 404 means "old backend", and we take the four requests for now.
 */
export async function getLatestAgentVersions() {
  try {
    const bulk = await httpGetJson("/api/v1/binaries/agent/metadata/all", {
      notifyOnTemporaryError: false,
    });
    if (Array.isArray(bulk?.items)) {
      return bulk.items.map((item) => ({
        platform: item.platform,
        arch: item.arch,
        data: item.data,
        ok: item.ok !== false,
      }));
    }
    // Shape we don't recognise — treat like a missing endpoint rather than
    // handing the Hero card something it will silently mis-read.
  } catch (err) {
    // A real outage must surface, exactly as it did before: the caller
    // distinguishes "no build published" from "backend down", and swallowing
    // a 5xx here would report every agent as up-to-date.
    if (isTemporaryApiError(err)) {
      throw err;
    }
    // Anything else (404 on an older backend) → fall through.
  }

  return getLatestAgentVersionsPerCombo();
}

/**
 * Pre-bulk fan-out, kept only as the fallback above. Delete once every
 * deployed backend serves /agent/metadata/all.
 */
async function getLatestAgentVersionsPerCombo() {
  const platforms = ["macos", "windows"];
  const arches = ["arm64", "x64"];

  const calls = platforms.flatMap((platform) =>
    arches.map((arch) =>
      httpGetJson(
        `/api/v1/binaries/agent/metadata?platform=${platform}&arch=${arch}`
      )
        .then((data) => ({ platform, arch, data, ok: true }))
        .catch((err) => {
          // A missing combination (e.g. no x64 macOS build yet) is a
          // benign 404 — degrade to an empty slot so the caller just
          // skips it. But a REAL server error (500/503, network,
          // timeout — anything the http layer flags as temporary/5xx)
          // must NOT be swallowed: rethrowing lets the caller / UI /
          // telemetry distinguish "no build published" from "backend
          // down". Previously both looked identical (silent { ok:false }).
          if (isTemporaryApiError(err)) {
            throw err;
          }
          return { platform, arch, ok: false };
        })
    )
  );

  return Promise.all(calls);
}

// ---- one loader per Overview block ------------------------------------
//
// El Overview se parte en tres bloques, uno por tier (ver
// components/Overview/overviewPlan.js), y cada uno carga lo SUYO. Antes un
// bundle único disparaba 16 peticiones a cualquier tenant — incluidas las de
// SCP a un Starter que no tiene el plugin y recibía "0 findings" en verde.
//
// Mismo contrato que el bundle viejo: allSettled, un slot por fuente, y la
// página decide qué pintar con cada `{ status, value }`. Un endpoint lento o
// roto deja su card en estado vacío, no la página en blanco.
//
// Cada loader recibe qué plugins de SU bloque concede el plan. Un plugin no
// concedido no se pide: su slot queda ausente, no rechazado, que es lo que la
// card lee como "no aplica" en vez de "falló".

async function settle(entries) {
  const live = entries.filter(Boolean);
  const settled = await Promise.allSettled(live.map(([, p]) => p));
  return Object.fromEntries(live.map(([key], idx) => [key, settled[idx]]));
}

// ---- qué capacidad exige cada petición ---------------------------------
//
// La capacidad que pide la RUTA del backend (`requireCapability`), leída de
// cada *.routes.ts — no la del área que la card resume. Una ruta sin
// capacidad no está aquí y se pide siempre: dashboard/summary,
// devices-connected, agent-versions, binaries/agent/metadata,
// jobs/timeseries, compliance summary/fleet-timeseries/devices,
// patch-management/summary y las lecturas de SDP (detrás de
// requireEntitlement, que responde 402 y no abre el diálogo de permisos).
//
// Sin la capacidad, el slot no se pide y queda AUSENTE, que la card lee como
// "no aplica" — igual que un plugin fuera del plan. Antes se pedía igual, el
// 403 abría el diálogo "Insufficient permissions" al aterrizar, y con varios
// a la vez el diálogo sólo enseñaba el último ("Remote Control").
export const OVERVIEW_GATES = {
  hardwareSummary: "assets_view", // dashboard.routes.ts /hardware-inventory/summary
  signalCoverage: "assets_view", // dashboard.routes.ts /signal-coverage
  auditTimeseries: "audit_log", // audit.routes.ts /timeseries
  expiringCerts: "pki", // certificates.routes.ts /expiring
  reportRuns: "reports", // reports.routes.ts /runs
  // + requireRole(ADMIN, OWNER): a un rol personalizado le responde
  // FORBIDDEN, que no es PERMISSION_DENIED y no abre el diálogo.
  reportSchedules: "reports", // reports.routes.ts /schedules
  rcpSummary: "remote_control", // remote-control.routes.ts, router.use()
  cdpSummary: "crypto_discovery", // crypto-discovery.routes.ts /summary
};

// Las cargas del Overview no las pidió nadie con un clic: un 403 se queda en
// su card y no abre el diálogo. Hace falta aunque se filtre por capacidad:
// requireCapability también deniega cuando el plugin está en el plan pero no
// activado en la política guardada del tenant (roles-gate.ts), y eso le pasa
// a un ADMIN. Sólo en las peticiones con capacidad; las demás no pueden
// responder PERMISSION_DENIED.
export const BACKGROUND = { notifyOnPermissionDenied: false };

const ALLOW_ALL = () => true;

/**
 * `can(capability)` dice si el rol la tiene. Por defecto todo: sin saber las
 * capacidades se pide como antes, y BACKGROUND evita el diálogo.
 */
function gate(can, slot) {
  const capability = OVERVIEW_GATES[slot];
  return !capability || can(capability);
}

/** Bloque 1 — todos los planes: AMP + SDP + alertas, jobs, informes, auditoría. */
export async function fetchOverviewCore({ sdp = false, can = ALLOW_ALL } = {}) {
  return settle([
    ["dashboardSummary", getDashboardSummary()],
    // connectedDevices is the authoritative source for "online now". The
    // dashboard summary exposes totals but NOT the session-based count.
    ["connectedDevices", getConnectedDevices()],
    ["latestVersions", getLatestAgentVersions()],
    ["agentVersions", getAgentVersionsSummary()],
    // `fleet.composition` (laptops/desktops/servers + virtuales) para la dona
    // de composición — la misma que Hardware Inventory. Capacidad
    // `assets_view`, que el rol USER también trae.
    gate(can, "hardwareSummary") && ["hardwareSummary", getHardwareInventorySummary(BACKGROUND)],
    ["jobsTimeseries", getJobsTimeseries(7)],
    // Carril admin, el que abre la página de Audit (ver Overview.jsx).
    gate(can, "auditTimeseries") && ["auditTimeseries", getAuditTimeseries(7, "admin", BACKGROUND)],
    // Certificados mTLS de los propios agentes (PKI de Tracenium, no CDP).
    // Exige la capacidad `pki`: sin ella la fila de Attention no aparece.
    gate(can, "expiringCerts") && ["expiringCerts", getExpiringCertificates(30, BACKGROUND)],
    // 3 y no 5: la card comparte fila con Attention y Reports y tiene que
    // medir lo mismo que ellas. Es un vistazo; la lista está en Alerts. El
    // feed ya trae `hostname` desde el servidor.
    // `limit: 1` da la última corrida y, por `COUNT(*) OVER()`, el total.
    gate(can, "reportRuns") && ["reportRuns", getReportRuns({ limit: 1 }, BACKGROUND)],
    gate(can, "reportSchedules") && ["reportSchedules", listReportSchedules(BACKGROUND)],
    sdp && ["sdpTimeseries", getDeploymentTimeseries("30d")],
    // Dos estados y no "todas las recientes": el listado se corta en `limit`
    // y una campaña larga en marcha podía quedar fuera de las 100 últimas.
    sdp && ["sdpRunning", listDeployments({ status: "running", limit: 500 })],
    sdp && ["sdpQueued", listDeployments({ status: "queued", limit: 500 })],
  ]);
}

/** Bloque 2 — Professional: SCP + RCP. */
export async function fetchOverviewSecurity({ scp = false, rcp = false, can = ALLOW_ALL } = {}) {
  return settle([
    scp && ["complianceSummary", getComplianceSummary()],
    // 30 días: el periodo de tendencia que se mira, y por debajo del suelo
    // de retención de snapshots (90 d).
    scp && ["fleetComplianceTimeseries",
      getFleetComplianceTimeseries(30).catch(() => ({ windowDays: 30, buckets: [] }))],
    // Una fila por equipo con `overallScore` y `patchSummary`: alimenta la
    // distribución de salud y la antigüedad de parches sin otra petición.
    scp && ["devicePosture", getDevicePosture().catch(() => ({ items: [] }))],
    // Capacidad `remote_control`, que el USER no trae: sin ella las KPIs de
    // RCP no se pintan.
    rcp && gate(can, "rcpSummary") && ["rcpSummary", getRemoteControlSummary(BACKGROUND)],
  ]);
}

/** Bloque 3 — Business: PMP + CDP. */
export async function fetchOverviewOperations({ pmp = false, cdp = false, can = ALLOW_ALL } = {}) {
  return settle([
    pmp && ["patchSummary", getPatchSummary()],
    cdp && gate(can, "cdpSummary") && ["cdpSummary", getCdpSummary(BACKGROUND)],
  ]);
}

/**
 * Resumen de la página de Audit: qué pasó y qué no salió bien.
 *
 * Sustituye a `getAuditTimeseries` en esa página — a dos acciones
 * administrativas al día, una serie por día no dice nada. Overview sigue
 * usando la serie, que ahí mira todos los carriles y sí tiene forma.
 */
export async function getAuditBreakdown(windowDays = 30, lane) {
  const laneQs = lane ? `&lane=${encodeURIComponent(lane)}` : "";
  return httpGetJson(`/api/v1/security/audit/breakdown?window=${windowDays}d${laneQs}`);
}
