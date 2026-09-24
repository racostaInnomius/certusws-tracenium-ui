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
import CoverageDevicesDrawer from "./CoverageDevicesDrawer";
import DeployWizardDialog from "./DeployWizardDialog";
import InstallFailuresPanel from "./InstallFailuresPanel";
import LanSavingsPanel from "./LanSavingsPanel";
import OverviewStatusBand from "./OverviewStatusBand";
import CatalogCoveragePanel from "./CatalogCoveragePanel";
import InFlightDeployments, {
  FAILURE_OUTCOMES,
  IN_FLIGHT_STATUSES,
  SUCCESS_OUTCOMES,
} from "./InFlightDeployments";
import CompositionBars from "../common/CompositionBars";
import InstallActivityCalendar from "./InstallActivityCalendar";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import {
  deployPackage,
  listPackages,
  listDeployments,
  listIntakes,
  listSites,
  listDistributionPoints,
  getDeploymentTimeseries,
  getLanSavings,
  getGlobalCatalog,
  getCatalogCoverage,
} from "../../api/softwareDelivery";
import { listFrom } from "../../api/shape";
import { formatDate } from "../../utils/format";

// ⚠️ Los tres conjuntos viven en InFlightDeploymentsPanel y se importan: eran
// una copia aquí y otra allí, y dos listas de desenlaces que se separen hacen
// que la franja de arriba y el embudo de abajo cuenten cosas distintas del
// mismo despliegue.

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
  "savings",
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

// Los datos siguen degradando a una tarjeta vacía cuando fallan; lo que ya NO
// es de sólo lectura es la cobertura: desde el 24-sep un tramo de su barra
// abre sus equipos y permite mandarles el paquete. Por eso esta pestaña recibe
// ahora `canManage` y `notify` — un despliegue sí tiene que poder gritar.
export default function OverviewTab({
  onNavigateTab,
  refreshNonce = 0,
  canManage = false,
  notify,
  onDeployFire,
}) {
  const [loading, setLoading] = React.useState(true);
  const [windowKey, setWindowKey] = React.useState("30d");
  const [data, setData] = React.useState({
    packages: [],
    deployments: [],
    intakes: [],
    sites: [],
    dps: [],
    buckets: [],
    savings: null,
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
      getLanSavings(windowKey),
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
          savings: val(6) ?? null,
          globalCatalog: val(7)?.entries ?? [],
          coverage: val(8) ?? null,
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

    const inFlight = deployments.filter((d) => IN_FLIGHT_STATUSES.includes(d.status));
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

  // ── De la gráfica al despliegue ───────────────────────────────
  //
  // Dos estados y no uno: el cajón enseña QUIÉN está en ese tramo, y el wizard
  // decide CÓMO se les manda. Fundirlos haría que pulsar una barra empezara un
  // despliegue, que es justo lo que no puede pasar.
  const [cell, setCell] = React.useState(null);
  const [deploy, setDeploy] = React.useState(null);

  const handleDeployFromCell = React.useCallback(
    ({ packageId, deviceIds, hostnames }) => {
      const pkg = data.packages.find((p) => String(p.id) === String(packageId));
      if (!pkg) {
        // Puede pasar si el catálogo cambió mientras el cajón estaba abierto.
        // Decirlo es mejor que abrir un wizard sin paquete.
        notify?.("error", "That package is no longer in the catalog. Refresh and try again.");
        return;
      }
      setCell(null);
      setDeploy({ pkg, preset: { deviceIds, hostnames } });
    },
    [data.packages, notify]
  );

  const handleDeployConfirm = React.useCallback(
    async (body) => {
      if (!deploy?.pkg) return;
      const res = await deployPackage(deploy.pkg.id, body);
      notify?.(
        "success",
        `Deployment #${res?.deployment?.id} created — ${res?.deployment?.counts?.pending ?? 0} job(s) queued`
      );
      setDeploy(null);
      onDeployFire?.(res?.deployment?.id);
    },
    [deploy, notify, onDeployFire]
  );

  return (
    <Stack spacing={2}>
      {/* ── La franja contesta, no inventaria ─────────────────────
          Va PEGADA a las pestañas desde el 24-sep. Es lo primero que se mira
          —«¿hay algo en marcha?»— y ahora trae dentro el detalle por
          despliegue, que hasta entonces repetía este mismo titular en otra
          tarjeta media pantalla más abajo. */}
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
      >
        {!loading ? (
          <InFlightDeployments
            deployments={data.deployments}
            formatTime={formatDate}
            onOpenDeployment={(deployment) =>
              onNavigateTab?.("deployments", { deploymentId: deployment.id })
            }
          />
        ) : null}
      </OverviewStatusBand>

      {/* ── Lo que hay que atender ───────────────────────────────
          Debajo de la franja y en una sola línea: son dos o tres causas, y
          ocupaban tres bloques de ancho completo con la mitad derecha vacía. */}
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

      {/* ── El estado del parque, antes que la actividad ─────────
          La actividad de la herramienta es escasa por naturaleza (28
          instalaciones en 30 días en T111); esto tiene dato todos los días y
          además es accionable: «26 equipos sin Chrome» es un despliegue. */}
      <CatalogCoveragePanel
        loading={loading}
        coverage={data.coverage}
        failed={data.failures.has("coverage")}
        onNavigateTab={onNavigateTab}
        onOpenCell={(item, state) =>
          setCell({ titleKey: item.titleKey, name: item.name, state })
        }
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
        loading={loading}
        savings={data.savings}
        failed={data.failures.has("savings")}
      />

      <CoverageDevicesDrawer
        open={Boolean(cell)}
        titleKey={cell?.titleKey}
        name={cell?.name}
        state={cell?.state}
        canManage={canManage}
        onClose={() => setCell(null)}
        onDeploy={handleDeployFromCell}
      />

      <DeployWizardDialog
        open={Boolean(deploy)}
        pkg={deploy?.pkg}
        preset={deploy?.preset}
        onClose={() => setDeploy(null)}
        onConfirm={handleDeployConfirm}
        notify={notify}
      />
    </Stack>
  );
}
