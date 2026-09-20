// src/components/software-delivery/OverviewTab.jsx
//
// Software Delivery overview — the summary the page was missing.
//
// Everything here except the two analytics calls is derived client-side from
// lists the page already needed, so the extra cost of this tab is two cheap
// aggregate queries (NOT the deployments list, which carries a documented
// N+1: one counts query per row).
//
// La franja de arriba (OverviewStatusBand) sustituyó a cinco SummaryCard que
// en tenant 111 decían 2 · 0 · 0 · 2/2, y absorbió "Catalog by platform", que
// era una barra sola al 100 %. Una barra sola no es una gráfica.

import * as React from "react";
import {
  Box,
  Grid,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import SectionPaper from "../common/SectionPaper";
import InstallFailuresPanel from "./InstallFailuresPanel";
import LanSavingsPanel from "./LanSavingsPanel";
import OverviewStatusBand from "./OverviewStatusBand";
import CatalogCoveragePanel from "./CatalogCoveragePanel";
import CompositionBars from "../common/CompositionBars";
import InstallActivityCalendar from "./InstallActivityCalendar";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import {
  listPackages,
  listDeployments,
  listIntakes,
  listSites,
  listDistributionPoints,
  getDeploymentTimeseries,
  getAgentUpdateSources,
  getDownloadTierStats,
  getGlobalCatalog,
  getCatalogCoverage,
} from "../../api/softwareDelivery";
import { listFrom } from "../../api/shape";

// Deployment statuses that still consume fleet capacity.
const IN_FLIGHT_STATUSES = new Set(["scheduled", "queued", "running"]);
// Per-device outcomes the operator reads as a good landing.
const SUCCESS_OUTCOMES = ["success", "already_installed", "reboot_required"];
const FAILURE_OUTCOMES = ["failed", "rejected", "signature_invalid", "timed_out"];

// How many deployments we pull for the client-side rollup. Deliberately
// modest: every row costs an extra counts query server-side, so this is the
// honest ceiling behind the "last N deployments" label on the success card.
const DEPLOYMENT_SAMPLE = 100;

// El orden ES el de las llamadas de abajo: `allSettled` devuelve por posición,
// así que estas claves son las que convierten "la tercera falló" en algo que un
// panel puede leer.
const SOURCE_KEYS = [
  "packages",
  "deployments",
  "intakes",
  "sites",
  "dps",
  "buckets",
  "tiers",
  "agentTiers",
  "globalCatalog",
  "coverage",
];

/**
 * Cuántos títulos enlazados tienen una versión más nueva sin enlazar.
 *
 * ⚠️ SE CUENTAN TÍTULOS, NO ENTRADAS. Chrome con una versión nueva para Windows
 * y otra para macOS es UNA novedad que atender, no dos: el operador decide una
 * vez por producto. Contar entradas inflaría el aviso justo en los títulos
 * multiplataforma, que son los que más se usan.
 */
export function countCatalogUpdates(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const conNovedad = new Set();
  for (const e of rows) {
    // Vigente + el tenant tiene otra versión del título + no tiene ésta.
    if (e?.supersededBy == null && e?.linkedVersionOfTitle && e?.linkedPackageId == null) {
      conNovedad.add(e.titleKey || e.title);
    }
  }
  return conNovedad.size;
}

function sumOutcomes(deployments, outcomes) {
  let total = 0;
  for (const dep of deployments) {
    for (const key of outcomes) total += Number(dep?.counts?.[key] ?? 0);
  }
  return total;
}

// Read-only surface: every call degrades to an empty card on failure, so
// there is nothing to raise to the page-level snackbar.
export default function OverviewTab({ onNavigateTab, refreshNonce = 0 }) {
  const [loading, setLoading] = React.useState(true);
  const [windowKey, setWindowKey] = React.useState("30d");
  const [data, setData] = React.useState({
    packages: [],
    deployments: [],
    intakes: [],
    sites: [],
    dps: [],
    buckets: [],
    tiers: null,
    agentTiers: null,
    globalCatalog: [],
    coverage: null,
    failures: new Set(),
  });

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // ⚠️ DEGRADAR NO ES DESAPARECER.
    //
    // Esto era `Promise.all` con un `.catch(() => null)` por llamada. Cada
    // tarjeta caía sola —que está bien— pero caía EN SILENCIO, y un panel que
    // se esfuma es indistinguible de uno que no tiene datos.
    //
    // Lo pagamos en campo: el panel de LAN salió a producción enseñando sólo
    // los 9 eventos de software de terceros mientras los 398 updates de agente
    // de tenant 111 no aparecían por ningún lado. La página decía exactamente
    // lo mismo que habría dicho si ese tenant no usara el DP. Con un aviso de
    // "no pude cargar" se habría visto de un vistazo, sin abrir la consola.
    //
    // `allSettled` deja saber CUÁL falló; `failures` viaja a los paneles.
    Promise.allSettled([
      listPackages(),
      listDeployments({ limit: DEPLOYMENT_SAMPLE }),
      listIntakes({ limit: 200 }),
      listSites(),
      listDistributionPoints(),
      getDeploymentTimeseries(windowKey),
      getDownloadTierStats(windowKey),
      getAgentUpdateSources(windowKey),
      getGlobalCatalog(),
      // Sin ventana: es una foto del parque, no actividad (ver el cliente).
      getCatalogCoverage(),
    ])
      .then((results) => {
        if (cancelled) return;
        const val = (i) => (results[i].status === "fulfilled" ? results[i].value : null);
        const failures = new Set(
          SOURCE_KEYS.filter((_k, i) => results[i].status === "rejected")
        );
        for (const [i, r] of results.entries()) {
          if (r.status === "rejected") {
            console.warn(`[sdp overview] ${SOURCE_KEYS[i]} failed:`, r.reason?.message || r.reason);
          }
        }
        setData({
          packages: listFrom(val(0)),
          deployments: listFrom(val(1)),
          intakes: listFrom(val(2)),
          sites: listFrom(val(3)),
          dps: listFrom(val(4)),
          buckets: Array.isArray(val(5)?.buckets) ? val(5).buckets : [],
          tiers: val(6)?.stats ?? null,
          agentTiers: val(7)?.stats ?? null,
          globalCatalog: val(8)?.entries ?? [],
          coverage: val(9) ?? null,
          failures,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowKey, refreshNonce]);

  const stats = React.useMemo(() => {
    const { deployments, intakes, sites, dps } = data;

    const inFlight = deployments.filter((d) => IN_FLIGHT_STATUSES.has(d.status));
    const devicesInFlight = inFlight.reduce(
      (acc, d) => acc + Number(d?.counts?.pending ?? 0) + Number(d?.counts?.running ?? 0),
      0
    );

    const succeeded = sumOutcomes(deployments, SUCCESS_OUTCOMES);
    const failed = sumOutcomes(deployments, FAILURE_OUTCOMES);
    const settled = succeeded + failed;

    const pendingIntakes = intakes.filter((i) => i.status === "pending_review");
    const lowConfidence = pendingIntakes.filter(
      (i) => i?.proposedConfig?.confidence === "low"
    ).length;

    // Coverage: a site is covered when at least one ACTIVE DP points at it.
    const activeDpSiteIds = new Set(
      dps.filter((dp) => dp.status === "active").map((dp) => dp.siteId)
    );
    const activeSites = sites.filter((s) => s.isActive);
    const coveredSites = activeSites.filter((s) => activeDpSiteIds.has(s.id)).length;

    return {
      inFlightCount: inFlight.length,
      devicesInFlight,
      settled,
      failed,
      pendingIntakes: pendingIntakes.length,
      intakesCapped: intakes.length >= 200,
      lowConfidence,
      coveredSites,
      totalActiveSites: activeSites.length,
      uncoveredSites: activeSites.length - coveredSites,
      outcomeItems: [
        { label: "Succeeded", value: sumOutcomes(deployments, ["success"]), color: ROLE.positive },
        { label: "Already installed", value: sumOutcomes(deployments, ["already_installed"]), color: BRAND.teal },
        { label: "Reboot required", value: sumOutcomes(deployments, ["reboot_required"]), color: ROLE.caution },
        { label: "Failed", value: sumOutcomes(deployments, ["failed"]), color: ROLE.critical },
        { label: "Rejected", value: sumOutcomes(deployments, ["rejected"]), color: BRAND.gray },
        { label: "Timed out", value: sumOutcomes(deployments, ["timed_out"]), color: BRAND.gray },
        { label: "Signature invalid", value: sumOutcomes(deployments, ["signature_invalid"]), color: ROLE.critical },
      ].filter((i) => i.value > 0),
    };
  }, [data]);

  // ⚠️ El calendario recibe los buckets CRUDOS: necesita el día completo
  // (YYYY-MM-DD) para rotular los extremos de la ventana, y recortarlo a
  // "MM-DD" para un eje —lo que hacía la gráfica que esto sustituye— dejaba
  // una fecha que no se puede leer como fecha.
  const hasChartData = data.buckets.some(
    (b) => Number(b?.succeeded ?? 0) > 0 || Number(b?.failed ?? 0) > 0
  );
  const catalogUpdates = React.useMemo(
    () => countCatalogUpdates(data.globalCatalog),
    [data.globalCatalog]
  );

  return (
    <Stack spacing={2}>
      {/* ── Lo que hay que atender, antes que nada ──────────────── */}
      {!loading ? (
        <InstallFailuresPanel
          deployments={data.deployments}
          failed={stats.failed}
          settled={stats.settled}
          onOpen={(_cause, single) =>
            // Con un solo despliegue detrás se abre ESE, reutilizando la
            // fontanería que la página ya tiene para el deploy recién lanzado.
            onNavigateTab?.("deployments", single ? { deploymentId: single.id } : undefined)
          }
        />
      ) : null}

      {/* ── La franja contesta, no inventaria ─────────────────── */}
      <OverviewStatusBand
        loading={loading}
        packages={data.packages}
        inFlightCount={stats.inFlightCount}
        devicesInFlight={stats.devicesInFlight}
        // ⚠️ CRUDOS, no `chartData`: éste recorta la fecha a "MM-DD" para el
        // eje, y con eso la banda no puede restar días — `new Date("08-18")`
        // no es una fecha. La banda necesita el día completo.
        buckets={data.buckets}
        settled={stats.settled}
        failed={stats.failed}
        catalogUpdates={catalogUpdates}
        pendingIntakes={stats.pendingIntakes}
        intakesCapped={stats.intakesCapped}
        coveredSites={stats.coveredSites}
        totalActiveSites={stats.totalActiveSites}
        uncoveredSites={stats.uncoveredSites}
        onNavigateTab={onNavigateTab}
      />

      {/* ── El estado del parque, antes que la actividad ─────────
          La actividad de la herramienta es escasa por naturaleza (28
          instalaciones en 30 días en T111); esto tiene dato todos los días y
          además es accionable: «26 equipos sin Chrome» es un despliegue. */}
      <CatalogCoveragePanel
        loading={loading}
        coverage={data.coverage}
        failed={data.failures.has("coverage")}
        onNavigateTab={onNavigateTab}
      />

      {/* ── Trend + outcomes ────────────────────────────────────── */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <SectionPaper variant="card" sx={{ p: 2 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
              flexWrap="wrap"
              gap={1}
            >
              <Box>
                <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
                  When installs happened
                </Typography>
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                  One square per day in the window
                </Typography>
              </Box>
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" gap={1}>
                <ToggleButtonGroup
                size="small"
                exclusive
                value={windowKey}
                onChange={(_e, v) => v && setWindowKey(v)}
              >
                <ToggleButton value="7d" sx={{ textTransform: "none", px: 1.5 }}>7d</ToggleButton>
                <ToggleButton value="30d" sx={{ textTransform: "none", px: 1.5 }}>30d</ToggleButton>
                <ToggleButton value="90d" sx={{ textTransform: "none", px: 1.5 }}>90d</ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Stack>

            <Box>
              {loading ? (
                <Skeleton variant="rounded" height={140} />
              ) : (
                // ⚠️ El calendario se pinta TAMBIÉN sin actividad: los días
                // vacíos son la respuesta a «¿cada cuánto entregamos?», y un
                // cartel de "no installs" ocupa el mismo sitio diciendo menos.
                <>
                  <InstallActivityCalendar buckets={data.buckets} />
                  {!hasChartData ? (
                    <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 1 }}>
                      Nothing was installed in this window.
                    </Typography>
                  ) : null}
                </>
              )}
            </Box>
          </SectionPaper>
        </Grid>

        {/* El desglose por desenlace dice lo que el calendario no: siete
            categorías (ya instalado, pendiente de reinicio, firma inválida…)
            no caben en una leyenda de colores. */}
        <Grid size={{ xs: 12, md: 5 }}>
          <CompositionBars
            title="Install outcomes"
            items={stats.outcomeItems}
            totalLabel="installs"
            emptyLabel="No install results yet"
            minHeight={220}
          />
        </Grid>
      </Grid>

      {/* ── De dónde se sirvieron las descargas ─────────────────── */}
      <LanSavingsPanel
        agentStats={data.agentTiers}
        softwareStats={data.tiers}
        hasDistributionPoints={data.dps.length > 0}
        agentFailed={data.failures.has("agentTiers")}
        softwareFailed={data.failures.has("tiers")}
      />

    </Stack>
  );
}
