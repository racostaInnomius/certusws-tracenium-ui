// src/pages/Reports.test.jsx
//
// ADR-0008 Fase F1a — the catalog is entirely server-driven, so this
// test's main job is proving the page renders exactly what /types
// returns (no client-side gating to duplicate) and that clicking a
// format button goes through the authenticated blob path, not a raw
// link.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server, respond, API_BASE } from "../test/msw/server";

vi.mock("../utils/browserState", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, saveBlob: vi.fn() };
});
import { saveBlob } from "../utils/browserState";
import { clearCachedFetch } from "../hooks/useCachedFetch";

// EmailReportDialog (rendered inside Reports, just not visibly "open"
// until a row's Email button is clicked) calls useAuthContext()
// unconditionally — same mock TenantsAdministrator.test.jsx uses.
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 7 },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

import { ConfirmProvider } from "../components/common/ConfirmDialog";
import Reports from "./Reports";

beforeEach(() => {
  // Lo consulta la pestaña Catalog en TODOS los tests que la montan, así que
  // se simula una vez aquí en vez de en cada uno.
  simularCatalogoDePlugins();
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // ⚠️ La pestaña activa vive en la URL (`?reportsTab=`), a propósito: un
  // enlace puede apuntar a una y una recarga no pierde el sitio. En los tests
  // eso se filtra de uno al siguiente — el que abría "Schedules" dejaba al
  // siguiente arrancando ahí, sin catálogo, y el fallo salía como "container
  // undefined" en un test que nadie había tocado.
  window.history.replaceState({}, "", "/");
  // `saveBlob` es un doble de módulo: vive fuera del árbol y NO lo limpia
  // `cleanup()`, así que su contador se acumulaba a lo largo de los 51 tests.
  // Mientras sólo se afirmaba "se llamó", nadie lo notó; en cuanto un test
  // afirma "NO se llamó todavía" —que es lo que separa generar de descargar—
  // hereda las llamadas de los anteriores y falla sin culpa propia.
  saveBlob.mockClear();
  // ⚠️ `useCachedFetch` guarda EN MÓDULO y en localStorage, así que sobrevive
  // a `cleanup()`: el catálogo de plugins del primer test se servía a todos
  // los demás, y el que prueba un tenant SIN un plugin recibía los derechos
  // completos del anterior. Sale verde por la caché, no por el código.
  clearCachedFetch();
});

const BASE = "/api/v1/reports";

/**
 * El catálogo de plugins, que la pestaña Catalog consulta desde que agrupa por
 * PÁGINA: es lo que distingue "no está construido" de "este tenant no lo tiene
 * contratado". `entitled` con todo dentro para que ninguna fila salga como no
 * contratada por accidente — el que prueba ese caso lo sobreescribe.
 */
function simularCatalogoDePlugins(entitled = ["amp", "sdp", "scp", "rcp", "pmp", "cdp", "mdm"]) {
  respond("get", "/api/v1/policies/plugins/catalog", {
    ok: true,
    catalog: entitled.map((k) => ({ key: k, required: false })),
    entitled,
  });
}

/**
 * Abre la fila de una PÁGINA del catálogo.
 *
 * Desde que el catálogo se agrupa por página, los informes nacen plegados: la
 * lista existe para ver de un vistazo qué páginas tienen informe y cuáles no,
 * y once filas abiertas no caben en pantalla. Un test que quiera un informe
 * concreto abre su página primero, igual que el operador.
 */
async function abrirPagina(nombre) {
  const { fireEvent } = await import("@testing-library/react");
  const fila = await screen.findByRole("group", { name: nombre }, { timeout: 4000 });
  // Idempotente: si ya está abierta no se toca. Volver a pulsar la cerraría, y
  // un test que abra dos veces la misma página se quedaría sin sus informes
  // por un motivo que no tiene nada que ver con lo que prueba.
  const boton = within(fila).getByRole("button", { name: new RegExp(`(Expand|Collapse) ${nombre}`, "i") });
  if (boton.getAttribute("aria-expanded") !== "true") fireEvent.click(boton);
  return fila;
}

/**
 * Espera a que el catálogo haya cargado.
 *
 * Antes se esperaba a ver el nombre de un informe. Desde que el catálogo se
 * agrupa por página los informes nacen plegados, así que la señal es la FILA
 * DE LA PÁGINA — que además está ahí aunque esa página no tenga ningún
 * informe, o sea que sirve también para los casos de catálogo vacío.
 */
async function esperarCatalogo() {
  return screen.findByRole("group", { name: "Security Compliance" }, { timeout: 4000 });
}

const TYPES = {
  ok: true,
  types: [
    {
      key: "cdp.cbom",
      label: "Crypto Bill of Materials (CBOM)",
      description: "CycloneDX 1.6 crypto asset inventory.",
      group: "CDP",
      formats: ["json"],
    },
    {
      key: "audit.events",
      label: "Audit Events",
      description: "Security/audit event trail export.",
      group: "Audit",
      formats: ["csv"],
    },
    {
      key: "global.fleet-health",
      label: "Fleet Health Report",
      description: "Cross-domain executive summary.",
      group: "Global",
      formats: ["json", "csv", "pdf"],
    },
    {
      key: "scp.evidence-pack",
      label: "Evidence Pack",
      description: "Audit-ready evidence for one framework over a period.",
      group: "SCP",
      formats: ["pdf", "json"],
      params: [
        { name: "framework", label: "Framework", kind: "framework", required: true },
        { name: "from", label: "From month", kind: "month", required: true },
        { name: "to", label: "To month", kind: "month", required: true },
      ],
    },
  ],
};

const RUNS = {
  ok: true,
  runs: [
    {
      occurredAt: "2026-08-22T00:00:00.000Z",
      key: "cdp.cbom",
      format: "json",
      outcome: "ok",
      actor: "op@tracenium.test",
    },
  ],
};

/**
 * Abre una pestaña por su rótulo.
 *
 * Desde U1 la página son cuatro pestañas y no cuatro tablas apiladas, así que
 * un test que mira el historial o las programaciones tiene que ir allí
 * primero. Se hace por el ROL de pestaña y su nombre visible, que es como
 * llega un operador — no por el índice, que cambiaría al añadir la quinta.
 */
async function abrirPestana(nombre) {
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.click(await screen.findByRole("tab", { name: nombre }));
}

describe("Reports page", () => {
  it("renders only the report types the server returns", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    // Los informes viven dentro de la fila de SU página, así que se abre la
    // que toca. Que estén ahí y no en otra es la mitad de lo que prueba que el
    // agrupado sale del `group` que manda el servidor.
    const cdp = await abrirPagina("Crypto Discovery");
    expect(within(cdp).getByText("Crypto Bill of Materials (CBOM)")).toBeInTheDocument();

    const audit = await abrirPagina("Audit");
    expect(within(audit).getByText("Audit Events")).toBeInTheDocument();

    // A type NOT present in the server response must never appear —
    // proves there's no client-side catalog to drift from the backend.
    expect(screen.queryByText("CVE Exposure")).not.toBeInTheDocument();
    // Y su página SÍ sale, marcada como hueco: es justo lo que esta vista
    // viene a enseñar.
    const pmp = screen.getByRole("group", { name: "Patch Management" });
    expect(within(pmp).getByText("Not built yet")).toBeInTheDocument();
  });

  it("renders the recent-runs history from the server", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);

    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await abrirPestana(/history/i);

    expect(await screen.findByText("op@tracenium.test")).toBeInTheDocument();
  });

  it("running a report goes through the authenticated blob path, not a link", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    const runCalls = respond("get", `${BASE}/cdp.cbom/run`, { ok: true });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    // La FILA del catálogo, por su nombre accesible: es un `role="group"`
    // etiquetado con el informe, así que localizarla no depende de la
    // maquetación ni de que la etiqueta salga también en el historial.
    await abrirPagina("Crypto Discovery");
    const fila = await screen.findByRole("group", { name: "Crypto Bill of Materials (CBOM)" });
    await userEvent.click(within(fila).getByRole("button", { name: /^Generate / }));

    // Generar es ahora una pregunta: hasta confirmarla no sale petición.
    expect(runCalls).toHaveLength(0);
    const dialogo = await screen.findByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(runCalls).toHaveLength(1));
    expect(runCalls[0].search).toEqual({ format: "json" });
    expect(runCalls[0].credentials).toBe("include");

    // ⚠️ Generar NO descarga. El fichero existe, y es AHORA cuando se
    // pregunta qué hacer con él: descargarlo o mandarlo.
    expect(saveBlob).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: /^Download$/ }));
    expect(saveBlob).toHaveBeenCalledTimes(1);
    // No <a href> anywhere on the page for a report download.
    expect(document.querySelector("a[href*='/reports/']")).toBeNull();
  });

  // ⚠️ "Email" YA NO ESTÁ EN EL CATÁLOGO, y se afirma su ausencia: no se puede
  // mandar lo que todavía no existe. Se ofrece sobre el informe ya generado,
  // que es cuando la opción significa algo.
  it("Email no se ofrece antes de generar; sí sobre lo ya generado", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/cdp.cbom/run`, { ok: true });
    respond("get", "/api/v1/tenants/7/members", { items: [] });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    await abrirPagina("Crypto Discovery");
    const fila = await screen.findByRole("group", { name: "Crypto Bill of Materials (CBOM)" });
    expect(within(fila).queryByRole("button", { name: /email/i })).toBeNull();

    await userEvent.click(within(fila).getByRole("button", { name: /^Generate / }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Generate" }));

    await userEvent.click(await screen.findByRole("button", { name: /Email it/i }));
    expect(await screen.findByText(/Email "Crypto Bill of Materials \(CBOM\)"/i)).toBeInTheDocument();
  });

  // ⭐ Regenerar para mandar produce OTRA fila en el ledger con OTRO SHA-256:
  // "el informe que miré" y "el que mandé" acaban siendo dos documentos, con
  // datos distintos si algo se movió entre medias. Desde que las corridas
  // interactivas se archivan, se manda EL MISMO.
  it("Email it manda el run archivado, no regenera otro", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", "/api/v1/tenants/7/members", { items: [] });
    const runCalls = respond("get", `${BASE}/cdp.cbom/run`, { ok: true });
    // El historial devuelve la corrida recién hecha, archivada y con el mismo
    // tamaño que el blob que acaba de llegar — así es como la página sabe cuál
    // de las filas es la suya.
    respond("get", `${BASE}/runs`, {
      ok: true, total: 1,
      runs: [{ id: 42, occurredAt: "2026-09-08T10:00:00.000Z", key: "cdp.cbom", format: "json", trigger: "manual", outcome: "ok", actor: "op@tracenium.test", sha256: "abc", filename: "cbom.json", bytes: 11, downloadable: true }],
    });
    const envioDeRun = respond("post", `${BASE}/runs/42/email`, { ok: true, sent: ["op@tracenium.test"], failed: [] });
    const envioRegenerando = respond("post", `${BASE}/cdp.cbom/email`, { ok: true, sent: [], failed: [] });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    await abrirPagina("Crypto Discovery");
    const fila = await screen.findByRole("group", { name: "Crypto Bill of Materials (CBOM)" });
    await userEvent.click(within(fila).getByRole("button", { name: /^Generate / }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(runCalls).toHaveLength(1));

    await userEvent.click(await screen.findByRole("button", { name: /Email it/i }));
    const correo = await screen.findByRole("dialog");
    // Sin selector de formato: el fichero ya existe y tiene el suyo.
    expect(within(correo).queryByLabelText("Format")).toBeNull();
    await userEvent.type(within(correo).getByLabelText(/external/i), "auditor@example.com");
    await userEvent.click(within(correo).getByRole("button", { name: /^Send$/i }));

    await waitFor(() => expect(envioDeRun).toHaveLength(1));
    // ⚠️ Y NO por el camino que regenera.
    expect(envioRegenerando).toHaveLength(0);
    // Una sola generación en toda la secuencia.
    expect(runCalls).toHaveLength(1);
  });

  // ⚠️ El id del run NO puede venir en una cabecera: la fila se escribe en el
  // `finish` de la respuesta, después de mandar las cabeceras. Se resuelve
  // preguntando por la más reciente de ese tipo — y ahí está el riesgo: con
  // dos personas generando el mismo informe a la vez, la más reciente puede
  // ser la del otro. El TAMAÑO es lo que lo descarta.
  it("si la última corrida no cuadra con lo generado, no se manda esa", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", "/api/v1/tenants/7/members", { items: [] });
    respond("get", `${BASE}/cdp.cbom/run`, { ok: true });
    respond("get", `${BASE}/runs`, {
      ok: true, total: 1,
      // Archivada y del mismo tipo, pero de OTRO tamaño: no es la nuestra.
      runs: [{ id: 99, occurredAt: "2026-09-08T10:00:00.000Z", key: "cdp.cbom", format: "json", trigger: "manual", outcome: "ok", actor: "otra@acme.test", sha256: "zzz", filename: "cbom.json", bytes: 999999, downloadable: true }],
    });
    const envioDeRun = respond("post", `${BASE}/runs/99/email`, { ok: true, sent: [], failed: [] });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    await abrirPagina("Crypto Discovery");
    const fila = await screen.findByRole("group", { name: "Crypto Bill of Materials (CBOM)" });
    await userEvent.click(within(fila).getByRole("button", { name: /^Generate / }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Generate" }));

    await userEvent.click(await screen.findByRole("button", { name: /Email it/i }));
    const correo = await screen.findByRole("dialog");
    // Se cae al camino que regenera —que es correcto, aunque cueste otra
    // corrida— en vez de mandar el fichero de otra persona. El selector de
    // formato volviendo a aparecer es la señal de que ese es el camino.
    expect(within(correo).getByLabelText("Format")).toBeInTheDocument();
    expect(envioDeRun).toHaveLength(0);
  });

  it("shows an error snackbar when the catalog fails to load", async () => {
    respond("get", `${BASE}/types`, { error: "TENANT_NOT_RESOLVED" }, { status: 403 });
    respond("get", `${BASE}/runs`, { error: "TENANT_NOT_RESOLVED" }, { status: 403 });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    expect(await screen.findByText(/could not load reports|tenant_not_resolved/i)).toBeInTheDocument();
  });
});

describe("Reports page (types with params)", () => {
  it("a type that declares params asks for them and sends them as query on run", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", "/api/v1/security/compliance/frameworks", { ok: true, frameworks: [{ framework: "soc2_tsc_2017", shortName: "SOC 2 (TSC 2017)" }] });
    const runCalls = respond("get", `${BASE}/scp.evidence-pack/run`, { ok: true });
    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    await abrirPagina("Security Compliance");
    const fila = await screen.findByRole("group", { name: "Evidence Pack" });
    await userEvent.click(within(fila).getByRole("button", { name: /^Generate / }));

    // Primero el FORMATO. El tipo ofrece PDF y JSON, así que hay pregunta.
    const formatos = await screen.findByRole("dialog");
    await userEvent.click(within(formatos).getByRole("button", { name: "PDF" }));
    await userEvent.click(within(formatos).getByRole("button", { name: "Continue" }));

    // Y sólo después el alcance. Nada ha salido a la red todavía.
    expect(runCalls).toHaveLength(0);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByLabelText("Framework")).toHaveTextContent("SOC 2 (TSC 2017)"));
    const from = within(dialog).getByLabelText("From month");
    const to = within(dialog).getByLabelText("To month");
    await userEvent.clear(from); await userEvent.type(from, "2026-06");
    await userEvent.clear(to); await userEvent.type(to, "2026-08");
    await userEvent.click(within(dialog).getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(runCalls).toHaveLength(1));
    expect(runCalls[0].search).toEqual({ format: "pdf", framework: "soc2_tsc_2017", from: "2026-06", to: "2026-08" });
    // Generar no descarga: hay que pedirlo.
    expect(saveBlob).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: /^Download$/ }));
    expect(saveBlob).toHaveBeenCalled();
  });
});

// ── ADR-0014 E3: schedules panel + archived runs ──────────────────────

const SCHEDULES = {
  ok: true,
  schedules: [
    {
      id: 5,
      reportKey: "scp.evidence-pack",
      format: "pdf",
      params: { framework: "soc2_tsc_2017" },
      periodMonths: 1,
      recipientMemberIds: [11],
      recipientExternal: ["auditor@example.com"],
      enabled: true,
      nextRunAt: "2026-10-01T06:00:00.000Z",
      lastRunAt: null,
      lastRunStatus: null,
    },
  ],
};

describe("Reports — schedules (E3)", () => {
  it("programar NO se hace desde el catálogo, sino desde su pestaña — para cualquier tipo", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, SCHEDULES);
    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await esperarCatalogo();

    // ⚠️ Se afirma la AUSENCIA. Había un "Schedule" por fila del catálogo
    // compitiendo con la acción principal, y llevaba al mismo sitio que la
    // pestaña. Si vuelve, vuelven los dos caminos.
    expect(screen.queryAllByRole("button", { name: /^schedule$/i })).toHaveLength(0);

    await abrirPestana(/schedules/i);
    expect(await screen.findByText("Previous month", { exact: false })).toBeTruthy();
    expect(screen.queryByTestId("schedules-empty")).toBeNull();

    // Y desde aquí se llega a CUALQUIER tipo del catálogo: quitar el botón de
    // la fila no quita capacidad, sólo el segundo camino.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByRole("button", { name: /New schedule/i }));
    const menu = await screen.findByRole("menu");
    for (const t of TYPES.types) {
      expect(within(menu).getByRole("menuitem", { name: t.label })).toBeInTheDocument();
    }
  });

  it("a backend without schedules still renders the catalog", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { error: "NOT_FOUND" }, { status: 404 });
    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await esperarCatalogo();
    await abrirPestana(/schedules/i);
    expect(await screen.findByTestId("schedules-empty")).toBeTruthy();
  });

  // ⭐ 403 ≠ "no hay ninguna". El listado sólo lo ven ADMIN/OWNER; decirle a un
  // USER "No schedules yet. Use Schedule on a catalog row" es mentirle dos
  // veces: puede haber programaciones, y ese botón le va a dar 403.
  it("a un miembro sin permiso le dice la verdad y le quita el botón", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { error: "FORBIDDEN" }, { status: 403 });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    await esperarCatalogo();
    await abrirPestana(/schedules/i);
    const vacio = await screen.findByTestId("schedules-empty");
    expect(vacio.textContent).toMatch(/administrators/i);
    expect(vacio.textContent).not.toMatch(/No schedules yet/i);
    await waitFor(() =>
      expect(screen.queryAllByRole("button", { name: /New schedule/i })).toHaveLength(0)
    );
  });

  // El contraste: un backend que simplemente no tiene el endpoint (404) NO es
  // una negativa de permiso, y ahí el mensaje de "aún no hay ninguna" sí vale.
  it("un 404 no se confunde con una negativa de permiso", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { error: "NOT_FOUND" }, { status: 404 });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    await esperarCatalogo();

    await abrirPestana(/schedules/i);
    const vacio = await screen.findByTestId("schedules-empty");
    expect(vacio.textContent).toMatch(/No schedules yet/i);
    // Y el botón que ese texto nombra existe de verdad: decirle a alguien que
    // use "New schedule" y que no esté es peor que no decir nada.
    expect(screen.getByRole("button", { name: /New schedule/i })).toBeInTheDocument();
  });

  it("an archived run gets a download button that goes through the blob path", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, {
      ok: true,
      runs: [{ id: 9, occurredAt: "2026-09-01T06:00:00.000Z", key: "scp.evidence-pack", format: "pdf", trigger: "schedule", outcome: "sent", actor: "schedule:5", sha256: "abc", filename: "pack.pdf", downloadable: true }],
    });
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    server.use(
      http.get(`${API_BASE}${BASE}/runs/9/download`, () =>
        new HttpResponse("%PDF", { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="pack.pdf"' } })
      )
    );
    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await abrirPestana(/history/i);
    const btn = await screen.findByRole("button", { name: /download archived copy/i });
    await userEvent.setup().click(btn);
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(saveBlob.mock.calls[0][1]).toBe("pack.pdf");
  });
});

// ── Lo que el historial tiene que decir (plan R0, punto 4) ──────────
describe("Reports — el historial", () => {
  const RUN_CON_HASH = {
    ok: true,
    runs: [{
      id: 9, occurredAt: "2026-09-01T06:00:00.000Z", key: "scp.evidence-pack", format: "pdf",
      trigger: "schedule", outcome: "sent", actor: "schedule:5",
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    }],
  };

  it("enseña la ETIQUETA del tipo, no la key cruda", async () => {
    // `scp.evidence-pack` es un identificador nuestro; el catálogo de arriba
    // ya trae "Evidence Pack" y la tabla lo tenía a mano.
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUN_CON_HASH);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await abrirPestana(/history/i);

    await screen.findByText("schedule:5");

    // La key cruda no aparece en ninguna parte; la etiqueta sí.
    expect(screen.queryByText("scp.evidence-pack")).toBeNull();
    expect(screen.getAllByText("Evidence Pack").length).toBeGreaterThan(0);
  });

  it("el hash se LEE, no hay que descubrirlo con el ratón", async () => {
    // Un SHA-256 que sólo existe en un tooltip no sirve para verificar nada.
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUN_CON_HASH);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await abrirPestana(/history/i);

    await screen.findByText("schedule:5");
    expect(screen.getByText(/^0123456789abcdef/)).toBeInTheDocument();
  });

  it("el motivo del fallo se ve sin pasar por encima", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, {
      ok: true,
      runs: [{ id: 10, occurredAt: "2026-09-01T06:00:00.000Z", key: "audit.events", format: "csv", trigger: "manual", outcome: "failed", actor: "op@x.test", error: "mailer_not_configured" }],
    });
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await abrirPestana(/history/i);

    expect(await screen.findByText("mailer_not_configured")).toBeInTheDocument();
  });
});

/**
 * Abre el menú de acciones de una ficha de programación.
 *
 * Desde U3 las programaciones son fichas y no filas: Run now / Edit / Delete
 * viven en su menú `⋮`, no como tres iconos sueltos por fila.
 */
async function menuDeProgramacion(id) {
  await userEvent.click(await screen.findByRole("button", { name: `Schedule ${id} actions` }));
}

describe("Reports — borrar una programación pide confirmación", () => {
  it("cancelar no borra nada", async () => {
    // Se lleva por delante destinatarios y destinos GRC, y no hay deshacer.
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, SCHEDULES);
    const deletes = respond("delete", `${BASE}/schedules/5`, { ok: true });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await abrirPestana(/schedules/i);
    await screen.findByText("Previous month", { exact: false });

    await menuDeProgramacion(5);
    await userEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(deletes).toHaveLength(0);
  });

  it("confirmar sí borra", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, SCHEDULES);
    const deletes = respond("delete", `${BASE}/schedules/5`, { ok: true });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await abrirPestana(/schedules/i);
    await screen.findByText("Previous month", { exact: false });

    await menuDeProgramacion(5);
    await userEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await userEvent.click(await screen.findByRole("button", { name: /delete schedule/i }));

    await waitFor(() => expect(deletes).toHaveLength(1));
  });
});

// ── Llegar con el informe ya elegido (?reportKey=) ──
//
// Es por donde entran los once botones "Report". Aterriza en los informes de
// ESA página, con su fila ya abierta.
//
// ⚠️ Antes confirmaba y generaba de una. Se cambió por dos motivos: una página
// puede tener DOS informes y su botón sólo apunta a uno —quien pulsaba desde
// Security Compliance no llegaba a ver que existía el Evidence Pack—, y aquel
// camino elegía el formato solo, que es justo lo que el rediseño convirtió en
// una pregunta.
describe("Reports — preselección por URL", () => {
  it("⭐ aterriza en los informes de ESA página, con su fila abierta", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    const runCalls = respond("get", `${BASE}/global.fleet-health/run`, { ok: true });
    window.history.replaceState({}, "", "/?page=reports&reportKey=global.fleet-health&reportFormat=pdf");

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    // La fila de Overview llega ABIERTA: su informe se ve sin desplegar nada.
    const overview = await screen.findByRole("group", { name: "Overview" }, { timeout: 4000 });
    await waitFor(() =>
      expect(within(overview).getByText("Fleet Health Report")).toBeInTheDocument()
    );

    // ⚠️ Y NO se genera solo. Generar arma el documento entero y deja una fila
    // con el nombre de quien lo pidió: un clic en OTRA página no puede
    // provocar eso sin que nadie lo pida aquí.
    expect(runCalls).toHaveLength(0);

    // Y el parámetro se consume: recargar no vuelve a abrir una página que el
    // operador puede haber cerrado.
    expect(new URL(window.location.href).searchParams.get("reportKey")).toBeNull();
  });

  it("las demás páginas siguen plegadas", async () => {
    // Se abre la de origen, no el catálogo entero: la lista sigue cabiendo de
    // un vistazo, que es para lo que se agrupó por página.
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    window.history.replaceState({}, "", "/?page=reports&reportKey=global.fleet-health");

    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await screen.findByRole("group", { name: "Overview" }, { timeout: 4000 });
    await waitFor(() => expect(screen.getByText("Fleet Health Report")).toBeInTheDocument());

    expect(screen.queryByText("Evidence Pack")).toBeNull();
    expect(screen.queryByText("Audit Events")).toBeNull();
  });

  it("⚠️ el alcance que arrastra el enlace NO se pierde al aterrizar", async () => {
    // Security Compliance manda el framework seleccionado para que el
    // documento cubra lo que la pantalla estaba enseñando. `audit.events` no
    // declara `params`, así que esto viaja como query de la ejecución: si se
    // perdiera, el informe saldría con el alcance por defecto y nadie lo
    // notaría hasta leerlo.
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    const runCalls = respond("get", `${BASE}/audit.events/run`, { ok: true });
    window.history.replaceState(
      {}, "",
      `/?page=reports&reportKey=audit.events&reportParams=${encodeURIComponent(JSON.stringify({ eventType: "POLICY_ACK" }))}`
    );

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    const audit = await screen.findByRole("group", { name: "Audit" }, { timeout: 4000 });
    await waitFor(() => expect(within(audit).getByText("Audit Events")).toBeInTheDocument());

    const fila = screen.getByRole("group", { name: "Audit Events" });
    await userEvent.click(within(fila).getByRole("button", { name: /^Generate / }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(runCalls).toHaveLength(1));
    expect(runCalls[0].search.eventType).toBe("POLICY_ACK");
  });

  it("un tipo que no está en el catálogo lo dice, no se queda callado", async () => {
    // El catálogo sólo trae lo que esta sesión puede ver (el backend filtra
    // por plugin y por rol). Un silencio se lee como que la app se colgó.
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    window.history.replaceState({}, "", "/?page=reports&reportKey=pmp.cve-exposure");

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    expect(await screen.findByText(/not available for this tenant or for your role/i)).toBeTruthy();
  });

  it("sin el parámetro no pregunta nada", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    window.history.replaceState({}, "", "/?page=reports");

    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    await esperarCatalogo();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ── La vista previa, dentro de Reports ──
//
// Vivía en Overview y traía sus propios botones de descarga, que sacaban el
// fichero por `/api/v1/fleet-report` sin dejar fila en `report_runs`. La
// pantalla vuelve; la puerta de salida por su cuenta, no.
describe("Reports — vista previa", () => {
  const abrirCatalogo = () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    window.history.replaceState({}, "", "/?page=reports");
    render(<ConfirmProvider><Reports /></ConfirmProvider>);
  };

  it("la ofrece todo tipo que sepa dar JSON — y sólo ésos", async () => {
    // Desde U4 el preview genérico cubre cualquier informe con formato json:
    // enseña tamaño, colecciones y el documento, sin adivinar un titular que
    // no puede calcular. Los que no dan json siguen sin ofrecerlo, porque un
    // PDF no se pinta en pantalla.
    abrirCatalogo();
    await esperarCatalogo();

    // Se abren TODAS las páginas con informes: el recuento es sobre el
    // catálogo entero, y lo que está plegado no está en el DOM.
    for (const pagina of ["Overview", "Security Compliance", "Crypto Discovery", "Audit"]) {
      await abrirPagina(pagina);
    }
    const conJson = TYPES.types.filter((t) => t.formats.includes("json"));
    expect(screen.getAllByRole("button", { name: /^preview$/i })).toHaveLength(conJson.length);

    // El de sólo-CSV del fixture no lo tiene.
    const soloCsv = screen.getByRole("group", { name: "Audit Events" });
    expect(within(soloCsv).queryByRole("button", { name: /^preview$/i })).toBeNull();
  });

  it("se pinta con el JSON del MOTOR, no con la ruta legacy", async () => {
    const previewCalls = respond("get", `${BASE}/global.fleet-health/run`, {
      ok: true,
      report: { tenant: { name: "Banco X" }, kpis: { devices: 40 }, trend: [], deltas: {} },
    });
    abrirCatalogo();

    await abrirPagina("Overview");
    const tarjeta = await screen.findByRole("group", { name: "Fleet Health Report" });
    await userEvent.click(within(tarjeta).getByRole("button", { name: /^preview$/i }));

    await waitFor(() => expect(previewCalls.length).toBeGreaterThan(0));
    expect(previewCalls[0].search.format).toBe("json");
    // Marcada como vista previa: el backend se salta el ledger. Mirar no es
    // entregar, y `report_runs` es de lo que se entrega.
    expect(previewCalls[0].search.preview).toBe("1");
    expect(await screen.findByText("Banco X")).toBeTruthy();
  });

  it("generar desde la vista previa pasa por el motor y arrastra el periodo", async () => {
    const calls = respond("get", `${BASE}/global.fleet-health/run`, {
      ok: true,
      report: { tenant: { name: "Banco X" }, kpis: { devices: 40 }, trend: [], deltas: {} },
    });
    abrirCatalogo();

    await abrirPagina("Overview");
    const tarjeta = await screen.findByRole("group", { name: "Fleet Health Report" });
    await userEvent.click(within(tarjeta).getByRole("button", { name: /^preview$/i }));
    await screen.findByText("Banco X");

    await userEvent.click(screen.getByRole("button", { name: /generate pdf/i }));

    await waitFor(() => expect(calls.some((c) => c.search.format === "pdf")).toBe(true));
    const pdf = calls.find((c) => c.search.format === "pdf");
    // Y generar NO lleva la marca: ese sí queda en el ledger.
    expect(pdf.search.preview).toBeUndefined();
    // El fichero cubre lo que se estaba mirando, no un rango por defecto
    // distinto — eso sería una trampa silenciosa.
    expect(pdf.search.from).toBeTruthy();
    expect(pdf.search.to).toBeTruthy();
  });
});

// ── U1 · cabecera y pestañas (docs/analysis/reports-page-2026-09.md) ──
//
// Era la única página del MENÚ sin `PageHeader` —y por tanto sin control de
// refresco— justo cuando pasó a ser el destino de once botones "Report".
// Y eran cuatro Paper apilados en un scroll donde el resto del portal usa
// pestañas.
describe("Reports — U1: cabecera y pestañas", () => {
  const montar = () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    return render(<ConfirmProvider><Reports /></ConfirmProvider>);
  };

  it("tiene cabecera canónica con refresco", async () => {
    montar();
    await esperarCatalogo();

    expect(screen.getByRole("heading", { name: "Reports" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^refresh$/i })).toBeTruthy();
    expect(screen.getByLabelText(/auto refresh/i)).toBeTruthy();
  });

  it("las cuatro pestañas, y sólo se pinta la activa", async () => {
    // Que sólo se monte una es lo que hace que la página deje de ser un scroll
    // de cuatro tablas — y de paso, que no se pidan datos de lo que no se ve.
    montar();
    await esperarCatalogo();

    for (const n of [/catalog/i, /schedules/i, /history/i, /settings/i]) {
      expect(screen.getByRole("tab", { name: n })).toBeTruthy();
    }
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("la pestaña viaja en la URL, para poder enlazarla y para no perderla al recargar", async () => {
    montar();
    await esperarCatalogo();

    await abrirPestana(/history/i);

    expect(new URL(window.location.href).searchParams.get("reportsTab")).toBe("history");
  });

  it("se abre en la pestaña que diga la URL", async () => {
    window.history.replaceState({}, "", "/?page=reports&reportsTab=settings");
    montar();

    // La de Settings trae el conector GRC; el catálogo no está montado.
    expect(await screen.findByText(/GRC platform pull the evidence-pack/i)).toBeTruthy();
    expect(screen.queryByRole("grid", { name: /report catalog/i })).toBeNull();
  });

  it("refrescar vuelve a pedir el catálogo", async () => {
    // Con la caché de 60 s de `httpGetJson`, volver a llamar al loader no
    // garantiza una petición: es `RefreshControl` quien la tira antes.
    const typeCalls = respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    await esperarCatalogo();
    const antes = typeCalls.length;

    await userEvent.setup().click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(() => expect(typeCalls.length).toBeGreaterThan(antes));
  });
});

// El refresco tiene que alcanzar TAMBIÉN a la pestaña de Settings, que carga
// por su cuenta y no pasa por el `loadData` de la página. Es la trampa de este
// control en toda la app: un botón que sólo refresca lo que su autor tenía
// delante se comporta igual que uno que funciona.
describe("Reports — U1: el refresco alcanza a Settings", () => {
  it("pulsar Refresh en Settings vuelve a pedir claves y destinos", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    const keyCalls = respond("get", `${BASE}/api-keys`, { ok: true, keys: [], scopes: [] });
    respond("get", `${BASE}/grc/targets`, { ok: true, targets: [], secretsConfigured: true });
    respond("get", `${BASE}/grc/deliveries`, { ok: true, deliveries: [] });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await esperarCatalogo();
    await abrirPestana(/settings/i);

    await waitFor(() => expect(keyCalls.length).toBeGreaterThan(0));
    const antes = keyCalls.length;

    await userEvent.setup().click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(() => expect(keyCalls.length).toBeGreaterThan(antes), { timeout: 3000 });
  });
});

// ── U2 · el historial (docs/analysis/reports-page-2026-09.md) ────────
//
// Estaba capado a 20 filas, sin filtros ni paginación, y tiraba la mitad de lo
// que el backend ya le mandaba en cada run: alcance, destinatarios, de qué
// programación salió y tamaño. Sin eso no contesta las tres preguntas por las
// que existe un ledger.
describe("Reports — U2: el historial", () => {
  const RUN = {
    id: 42,
    occurredAt: "2026-09-01T06:00:00.000Z",
    key: "scp.evidence-pack",
    format: "pdf",
    trigger: "schedule",
    scheduleId: 7,
    outcome: "sent",
    actor: "schedule:7",
    sha256: "abc123",
    bytes: 2_200_000,
    filename: "pack.pdf",
    params: { framework: "cis_win11", from: "2026-07", to: "2026-09" },
    recipients: ["a@x.test", "b@x.test", "c@x.test", "d@x.test"],
    sent: 4,
    downloadable: true,
  };

  const montarHistorial = (runsBody, extra = {}) => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    respond("get", `${BASE}/grc/targets`, extra.targets ?? { ok: true, targets: [] });
    const runCalls = respond("get", `${BASE}/runs`, runsBody);
    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    return runCalls;
  };

  it("enseña el alcance, a quién llegó, de qué programación salió y el tamaño", async () => {
    // Los cuatro venían YA en el DTO y la tabla los tiraba.
    montarHistorial({ ok: true, total: 1, runs: [RUN] });
    await abrirPestana(/history/i);

    await screen.findByText("schedule:7");
    expect(screen.getByText(/cis_win11 · 2026-07 → 2026-09/)).toBeTruthy();  // alcance
    expect(screen.getByText("4 destinatarios")).toBeTruthy();                 // a quién llegó
    expect(screen.getByText("#7")).toBeTruthy();                              // qué programación
    expect(screen.getByText("2.1 MB")).toBeTruthy();                          // tamaño
  });

  it("un envío parcial NO se lee como un éxito", async () => {
    // "4 destinatarios" con 2 enviados esconde justo lo que hay que ver.
    montarHistorial({ ok: true, total: 1, runs: [{ ...RUN, sent: 2 }] });
    await abrirPestana(/history/i);

    expect(await screen.findByText("2 de 4 enviados")).toBeTruthy();
  });

  it("los filtros los aplica el SERVIDOR, no el navegador", async () => {
    const runCalls = montarHistorial({ ok: true, total: 0, runs: [] });
    await abrirPestana(/history/i);
    await waitFor(() => expect(runCalls.length).toBeGreaterThan(0));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Filter by actor"), "ana");

    // La petición lleva el filtro: filtrar en el cliente sobre lo ya
    // descargado miente en cuanto hay más filas que la página.
    await waitFor(() => {
      expect(runCalls.some((c) => c.search.actor === "ana")).toBe(true);
    });
  });

  it("pagina en servidor: pide offset y respeta el total de la consulta", async () => {
    const runCalls = montarHistorial({ ok: true, total: 137, runs: [RUN] });
    await abrirPestana(/history/i);
    await waitFor(() => expect(runCalls.length).toBeGreaterThan(0));

    // El paginador conoce las 137 aunque sólo tenga una fila en memoria.
    expect(await screen.findByText(/of 137/i)).toBeTruthy();
  });

  it("⭐ se puede RE-ENTREGAR un run a un destino GRC", async () => {
    // `deliverRunToGrcTarget` llevaba desde E4 sin un solo consumidor: la
    // re-entrega manual, que es lo que la migración de `params` (R0.2) vino a
    // habilitar, no tenía dónde pulsarse.
    const deliverCalls = respond("post", `${BASE}/grc/targets/3/deliver`, {
      ok: true,
      result: { targetId: 3, status: "ok", httpStatus: 200 },
    });
    montarHistorial(
      { ok: true, total: 1, runs: [RUN] },
      { targets: { ok: true, targets: [{ id: 3, label: "Drata hook", enabled: true }] } }
    );
    await abrirPestana(/history/i);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /re-deliver run 42/i }));
    // El destino se elige por su NOMBRE: "1 destino" no dice si es el bueno.
    await user.click(await screen.findByRole("menuitem", { name: "Drata hook" }));

    await waitFor(() => expect(deliverCalls).toHaveLength(1));
    expect(deliverCalls[0].body).toEqual({ runId: 42 });
  });

  it("la entrega GRC se ve EN LA FILA del run que la originó", async () => {
    // `grc_deliveries.run_id` existía desde E4 y nadie lo cruzaba: las
    // entregas vivían sueltas en el panel del conector, así que un informe
    // generado y NO entregado se leía igual que uno entregado.
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    respond("get", `${BASE}/grc/targets`, { ok: true, targets: [] });
    respond("get", `${BASE}/runs`, { ok: true, total: 1, runs: [RUN] });
    respond("get", `${BASE}/grc/deliveries`, {
      ok: true,
      deliveries: [{ id: 1, runId: 42, targetId: 3, status: "failed", httpStatus: 500, error: "webhook returned 500" }],
    });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await abrirPestana(/history/i);

    expect(await screen.findByText("failed")).toBeTruthy();
  });

  it("una entrega de OTRO run no se pinta en esta fila", async () => {
    // El contraste: sin el cruce por `runId`, cualquier entrega aparecería en
    // cualquier fila y la columna no significaría nada.
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    respond("get", `${BASE}/grc/targets`, { ok: true, targets: [] });
    respond("get", `${BASE}/runs`, { ok: true, total: 1, runs: [RUN] });
    respond("get", `${BASE}/grc/deliveries`, {
      ok: true,
      deliveries: [{ id: 1, runId: 999, targetId: 3, status: "failed" }],
    });

    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await abrirPestana(/history/i);

    await screen.findByText("schedule:7");
    expect(screen.queryByText("failed")).toBeNull();
  });

  it("sin destinos GRC no se ofrece la re-entrega", async () => {
    montarHistorial({ ok: true, total: 1, runs: [RUN] });
    await abrirPestana(/history/i);

    await screen.findByText("schedule:7");
    expect(screen.queryByRole("button", { name: /re-deliver/i })).toBeNull();
  });
});

// ── U3 · programaciones: crear desde su pestaña y EDITAR ─────────────
describe("Reports — U3: programaciones", () => {
  const SCHED = {
    id: 3,
    reportKey: "scp.evidence-pack",
    format: "pdf",
    params: { framework: "cis_win11" },
    periodMonths: 3,
    recipientMemberIds: [11],
    recipientExternal: ["auditor@example.com"],
    targetIds: [],
    enabled: true,
    nextRunAt: "2026-10-01T06:00:00.000Z",
    lastRunAt: null,
    lastRunStatus: null,
  };

  const montar = () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [SCHED] });
    respond("get", `${BASE}/grc/targets`, { ok: true, targets: [] });
    respond("get", "/api/v1/tenants/7/members", { ok: true, items: [{ id: 11, email: "ana@acme.test", isActive: true }] });
    respond("get", /\/api\/v1\/security\/compliance\/frameworks.*/, { ok: true, frameworks: [{ framework: "cis_win11", shortName: "CIS Win11" }] });
    return render(<ConfirmProvider><Reports /></ConfirmProvider>);
  };

  it('se puede crear desde la propia pestaña, no sólo desde el catálogo', async () => {
    // Quien entra a gestionar programaciones no tiene por qué adivinar que se
    // crean en otra pestaña.
    montar();
    await esperarCatalogo();
    await abrirPestana(/schedules/i);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new schedule/i }));
    // Una programación es siempre DE un tipo: lo primero es elegir cuál.
    await user.click(await screen.findByRole("menuitem", { name: "Evidence Pack" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("⭐ una programación se puede EDITAR, con sus valores ya puestos", async () => {
    // Sin esto, cambiar un destinatario obligaba a borrar y recrear — y eso
    // rompe el vínculo con su historial, porque los runs anteriores apuntan a
    // la programación vieja.
    montar();
    await esperarCatalogo();
    await abrirPestana(/schedules/i);

    const user = userEvent.setup();
    await menuDeProgramacion(3);
    await user.click(await screen.findByRole("menuitem", { name: /edit/i }));

    const dialogo = await screen.findByRole("dialog");
    // Parte de lo GUARDADO: un formulario de edición que arranca vacío no
    // edita, pisa.
    expect(dialogo.textContent).toMatch(/Edit schedule/i);
    expect(screen.getByDisplayValue("auditor@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeTruthy();
  });

  it("guardar la edición manda un PATCH, no crea otra", async () => {
    const patchCalls = respond("patch", `${BASE}/schedules/3`, { ok: true, schedule: SCHED });
    const postCalls = respond("post", `${BASE}/schedules`, { ok: true, schedule: SCHED });
    montar();
    await esperarCatalogo();
    await abrirPestana(/schedules/i);

    const user = userEvent.setup();
    await menuDeProgramacion(3);
    await user.click(await screen.findByRole("menuitem", { name: /edit/i }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    // Y NO crea una segunda: duplicar la programación al editarla dejaría dos
    // enviando lo mismo.
    expect(postCalls).toHaveLength(0);
  });
});

// ── U3 · el catálogo, ahora por filas ────────────────────────────────
describe("Reports — U3: catálogo por filas", () => {
  const montar = (runsBody = RUNS) => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, runsBody);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    return render(<ConfirmProvider><Reports /></ConfirmProvider>);
  };

  // ⚠️ El `group` del servidor es la SIGLA del plugin —"SCP", "PMP", "CDP"—
  // porque es lo que usan el gate y los entitlements. En la consola nadie ve
  // esas siglas: ve "Security Compliance" en el menú, y ese es el nombre con
  // el que busca su informe. Se afirma el rótulo Y la ausencia de la sigla.
  // ⚠️ El `group` del servidor es la SIGLA del plugin —"SCP", "CDP"— porque es
  // lo que usan el gate y los entitlements. En la consola nadie ve esas
  // siglas: ve "Security Compliance" en el menú. Antes esto lo decía un chip
  // en cada informe; desde que el catálogo se agrupa por página lo dice la
  // fila que los contiene, y el chip se retiró por redundante.
  it("las filas se llaman como el menú, no como la sigla del plugin", async () => {
    montar();
    await esperarCatalogo();

    expect(screen.getByRole("group", { name: "Security Compliance" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Crypto Discovery" })).toBeTruthy();
    expect(screen.queryByText("SCP")).toBeNull();
    expect(screen.queryByText("CDP")).toBeNull();
  });

  it("cada fila enseña su ÚLTIMO run, que es lo que se pregunta antes de generar otro", async () => {
    // Estaba en `report_runs` desde E3 y obligaba a bajar a otra tabla.
    montar({
      ok: true,
      total: 1,
      runs: [{ id: 1, occurredAt: "2026-09-01T06:00:00.000Z", key: "cdp.cbom", format: "json", trigger: "manual", outcome: "ok", actor: "ana@acme.test" }],
    });

    await abrirPagina("Crypto Discovery");
    const fila = await screen.findByRole("group", { name: "Crypto Bill of Materials (CBOM)" });
    expect(within(fila).getByText(/2026/)).toBeTruthy();

    // Y el que no se ha generado nunca lo dice, en vez de dejar el hueco.
    await abrirPagina("Audit");
    const otra = screen.getByRole("group", { name: "Audit Events" });
    expect(within(otra).getByText(/never generated/i)).toBeTruthy();
  });

  it("un tipo que pide parámetros lo AVISA antes de pulsar", async () => {
    // Si no, pulsar un formato abre un diálogo por sorpresa.
    montar();

    await abrirPagina("Security Compliance");
    const fila = await screen.findByRole("group", { name: "Evidence Pack" });
    expect(within(fila).getByText("params")).toBeTruthy();

    await abrirPagina("Audit");
    const sinParams = screen.getByRole("group", { name: "Audit Events" });
    expect(within(sinParams).queryByText("params")).toBeNull();
  });

  // ── El catálogo por PÁGINA (09-sep) ─────────────────────────────
  //
  // Se listaba por informe: seis filas para once páginas con botón "Report",
  // así que las páginas sin informe propio no salían por ningún lado y no
  // había forma de ver qué falta por construir.
  it("⭐ las páginas SIN informe salen, marcadas como hueco", async () => {
    montar();
    await esperarCatalogo();

    // El fixture no trae ningún tipo de estas cuatro, y aun así tienen fila.
    for (const pagina of ["Asset Management", "Software Delivery", "Remote Control", "Jobs"]) {
      const fila = screen.getByRole("group", { name: pagina });
      expect(within(fila).getByText("Not built yet"), pagina).toBeInTheDocument();
    }
  });

  it("una página sin informe propio dice qué abre su botón hoy", async () => {
    // Si no, la fila diría "nada" justo cuando el operador acaba de pulsar ese
    // botón en Asset Management y ha salido un informe de flota.
    montar();
    await esperarCatalogo();

    const assets = screen.getByRole("group", { name: "Asset Management" });
    expect(within(assets).getByText(/global\.fleet-health/)).toBeInTheDocument();
  });

  it("la fila cuenta cuántos informes tiene esa página", async () => {
    montar();
    await esperarCatalogo();

    // La cuenta se deriva del FIXTURE, no se escribe a mano: así el test no
    // miente si mañana alguien añade un tipo al fixture y se olvida de aquí.
    const porGrupo = (g) => TYPES.types.filter((t) => t.group === g).length;
    const singular = (n) => `${n} report${n === 1 ? "" : "s"}`;

    const scp = screen.getByRole("group", { name: "Security Compliance" });
    expect(within(scp).getByText(singular(porGrupo("SCP")))).toBeInTheDocument();
    const overview = screen.getByRole("group", { name: "Overview" });
    expect(within(overview).getByText(singular(porGrupo("Global")))).toBeInTheDocument();
  });

  it("⚠️ un plugin sin contratar NO se cuenta como hueco de producto", async () => {
    // El servidor no manda los tipos de un plugin sin derecho, así que sin
    // esta distinción un tenant sin CDP vería "Crypto Discovery — 0" y leería
    // una carencia que no existe. Son cosas opuestas y en una fila que dice 0
    // se leen igual.
    simularCatalogoDePlugins(["amp", "sdp", "scp", "rcp", "pmp", "mdm"]); // sin cdp
    respond("get", `${BASE}/types`, { ok: true, types: TYPES.types.filter((t) => t.group !== "CDP") });
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await esperarCatalogo();

    // ⚠️ Se espera al mensaje ANTES de afirmar la ausencia del chip.
    // `isEntitled` devuelve `true` mientras no sabe —falla abierto a
    // propósito—, así que justo al montar la fila dice "Not built yet" y sólo
    // se corrige cuando llegan los derechos. Afirmar sin esperar probaría el
    // parpadeo, no el resultado.
    await screen.findByText(/Plugin not enabled/i, {}, { timeout: 4000 });
    const cdp = screen.getByRole("group", { name: "Crypto Discovery" });
    expect(within(cdp).queryByText("Not built yet")).toBeNull();
  });

  it("un catálogo vacío explica POR QUÉ", async () => {
    // El servidor filtra por plugin y por rol: "no hay nada" tiene una causa
    // concreta, y decirla ahorra un ticket.
    respond("get", `${BASE}/types`, { ok: true, types: [] });
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    render(<ConfirmProvider><Reports /></ConfirmProvider>);

    const vacio = await screen.findByTestId("catalog-empty");
    expect(vacio.textContent).toMatch(/plugins the tenant has enabled and by your role/i);
  });
});

// ── U4 · vista previa genérica ──────────────────────────────────────
//
// `FleetHealthPreview` sabe qué significan los campos de SU informe y por eso
// pinta KPIs y una tendencia. Eso no se generaliza: un CBOM y un pack de
// evidencia no comparten forma, y un componente que la adivinara enseñaría
// basura con confianza.
//
// Lo que sí se puede dar para cualquiera es lo que contesta la pregunta que
// trae aquí: "¿esto es lo que creo, antes de generarlo o firmarlo?".
describe("Reports — U4: vista previa genérica", () => {
  const montar = () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [] });
    return render(<ConfirmProvider><Reports /></ConfirmProvider>);
  };

  it("enseña qué trae el informe y cuánto, sin inventarse un titular", async () => {
    // Distinguir "el informe está vacío" de "el informe no se pudo construir"
    // es justo lo que un volcado sin resumen no deja hacer.
    const previewCalls = respond("get", `${BASE}/cdp.cbom/run`, {
      ok: true,
      components: [{ name: "rsa-2048" }, { name: "ecdsa-p256" }],
      metadata: { tool: "tracenium" },
    });
    montar();

    await abrirPagina("Crypto Discovery");
    const tarjeta = await screen.findByRole("group", { name: "Crypto Bill of Materials (CBOM)" });
    await userEvent.setup().click(within(tarjeta).getByRole("button", { name: /^preview$/i }));

    await waitFor(() => expect(previewCalls.length).toBeGreaterThan(0));
    // Por el MOTOR y marcado como vista previa: mirar no deja fila en el
    // ledger, que es de los ficheros que salen.
    expect(previewCalls[0].search.format).toBe("json");
    expect(previewCalls[0].search.preview).toBe("1");

    expect(await screen.findByText("components: 2")).toBeTruthy();
    expect(screen.getByLabelText("Report preview JSON")).toBeTruthy();
  });

  it("desde la vista previa se genera POR LA PÁGINA, no desde el diálogo", async () => {
    // Una sola puerta de salida: es el único sitio donde queda registrada la
    // ejecución.
    respond("get", `${BASE}/cdp.cbom/run`, { ok: true, components: [] });
    montar();

    await abrirPagina("Crypto Discovery");
    const tarjeta = await screen.findByRole("group", { name: "Crypto Bill of Materials (CBOM)" });
    const user = userEvent.setup();
    await user.click(within(tarjeta).getByRole("button", { name: /^preview$/i }));
    await screen.findByLabelText("Report preview JSON");

    // El botón lleva nombre accesible ESTABLE: el rótulo pasa a "…" mientras
    // genera, y sin eso se queda sin nombre justo cuando hace falta.
    expect(screen.getByRole("button", { name: "Generate JSON" })).toBeTruthy();
  });
});

// ── U3 · fichas de programación ─────────────────────────────────────
//
// Eran ocho columnas apretadas donde lo importante —qué manda, a quién y
// cuándo— quedaba repartido y ninguna celda lo contaba entero.
describe("Reports — U3: fichas de programación", () => {
  const SCHED = {
    id: 9,
    reportKey: "scp.evidence-pack",
    format: "pdf",
    params: { framework: "cis_win11" },
    periodMonths: 3,
    recipientMemberIds: [11],
    recipientExternal: ["auditor@example.com"],
    targetIds: [3, 4],
    enabled: true,
    nextRunAt: "2026-10-01T06:00:00.000Z",
    lastRunAt: "2026-09-01T06:00:00.000Z",
    lastRunStatus: "sent",
  };

  const montar = (targets) => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [SCHED] });
    respond("get", `${BASE}/grc/targets`, { ok: true, targets });
    return render(<ConfirmProvider><Reports /></ConfirmProvider>);
  };

  it("⭐ los destinos GRC salen por su NOMBRE, no por su cuenta", async () => {
    // "2 destinos" no dice si son los buenos, y en una programación mensual el
    // error se descubre un mes después.
    montar([
      { id: 3, label: "Drata hook", enabled: true },
      { id: 4, label: "Vanta prod", enabled: true },
    ]);
    await abrirPestana(/schedules/i);

    const ficha = await screen.findByRole("group", { name: /Schedule Evidence Pack/i });
    expect(ficha.textContent).toContain("Drata hook");
    expect(ficha.textContent).toContain("Vanta prod");
  });

  it("un destino BORRADO se dice por su id, no desaparece", async () => {
    // Una programación que empuja a un destino que ya no existe es justo lo
    // que hay que ver; esconderlo la deja pareciendo correcta.
    montar([{ id: 3, label: "Drata hook", enabled: true }]);
    await abrirPestana(/schedules/i);

    const ficha = await screen.findByRole("group", { name: /Schedule Evidence Pack/i });
    expect(ficha.textContent).toContain("Drata hook");
    expect(ficha.textContent).toContain("target 4");
  });

  it("un destino DESHABILITADO se sigue nombrando", async () => {
    // Nombrarlo siempre; re-entregar, sólo a los encendidos. Son dos preguntas
    // distintas y antes se resolvían con la misma lista filtrada.
    montar([
      { id: 3, label: "Drata hook", enabled: false },
      { id: 4, label: "Vanta prod", enabled: true },
    ]);
    await abrirPestana(/schedules/i);

    const ficha = await screen.findByRole("group", { name: /Schedule Evidence Pack/i });
    expect(ficha.textContent).toContain("Drata hook");
  });

  it("la ficha cuenta qué manda, a quién y cuándo, sin abrir nada", async () => {
    montar([{ id: 3, label: "Drata hook", enabled: true }, { id: 4, label: "Vanta prod", enabled: true }]);
    await abrirPestana(/schedules/i);

    const ficha = await screen.findByRole("group", { name: /Schedule Evidence Pack/i });
    expect(ficha.textContent).toMatch(/PDF/);                 // qué formato
    expect(ficha.textContent).toMatch(/Previous 3 months/i);  // qué periodo
    expect(ficha.textContent).toMatch(/2 recipients/i);       // a quién
    expect(ficha.textContent).toMatch(/Next/);                // cuándo la próxima
    expect(ficha.textContent).toMatch(/Sent/i);               // cómo fue la última
  });

  it("una programación que no ha corrido nunca lo dice", async () => {
    respond("get", `${BASE}/types`, TYPES);
    respond("get", `${BASE}/runs`, RUNS);
    respond("get", `${BASE}/schedules`, { ok: true, schedules: [{ ...SCHED, lastRunAt: null, lastRunStatus: null }] });
    respond("get", `${BASE}/grc/targets`, { ok: true, targets: [] });
    render(<ConfirmProvider><Reports /></ConfirmProvider>);
    await abrirPestana(/schedules/i);

    const ficha = await screen.findByRole("group", { name: /Schedule Evidence Pack/i });
    expect(ficha.textContent).toMatch(/never run yet/i);
  });
});
