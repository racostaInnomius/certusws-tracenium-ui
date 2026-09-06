// src/components/software-delivery/OverviewTab.jsx
//
// Software Delivery overview — the summary the page was missing.
//
// Everything here except the two analytics calls is derived client-side from
// lists the page already needed, so the extra cost of this tab is two cheap
// aggregate queries (NOT the deployments list, which carries a documented
// N+1: one counts query per row).
//
// House primitives only: SummaryCard for the KPI row, CompositionBars for the
// categorical breakdowns, and the Recharts wiring copied from
// components/Overview/JobsTimeseriesChart.jsx.

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
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";

import SectionPaper from "../common/SectionPaper";
import InstallFailuresPanel from "./InstallFailuresPanel";
import SummaryCard from "../common/SummaryCard";
import CompositionBars from "../common/CompositionBars";
import InstallsOverTimeChart, { InstallsLegend } from "./InstallsOverTimeChart";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { platformColor } from "../../utils/platform";
import {
  listPackages,
  listDeployments,
  listIntakes,
  listSites,
  listDistributionPoints,
  getDeploymentTimeseries,
  getDownloadTierStats,
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

function sumOutcomes(deployments, outcomes) {
  let total = 0;
  for (const dep of deployments) {
    for (const key of outcomes) total += Number(dep?.counts?.[key] ?? 0);
  }
  return total;
}

function percent(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

// Read-only surface: every call degrades to an empty card on failure, so
// there is nothing to raise to the page-level snackbar.
export default function OverviewTab({ onNavigateTab }) {
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
  });

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Each call degrades independently: one failing endpoint blanks its own
    // card instead of taking the whole overview down.
    Promise.all([
      listPackages().catch(() => null),
      listDeployments({ limit: DEPLOYMENT_SAMPLE }).catch(() => null),
      listIntakes({ limit: 200 }).catch(() => null),
      listSites().catch(() => null),
      listDistributionPoints().catch(() => null),
      getDeploymentTimeseries(windowKey).catch(() => null),
      getDownloadTierStats(windowKey).catch(() => null),
    ])
      .then(([pkgs, deps, intakes, sites, dps, ts, tiers]) => {
        if (cancelled) return;
        setData({
          packages: listFrom(pkgs),
          deployments: listFrom(deps),
          intakes: listFrom(intakes),
          sites: listFrom(sites),
          dps: listFrom(dps),
          buckets: Array.isArray(ts?.buckets) ? ts.buckets : [],
          tiers: tiers?.stats ?? null,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowKey]);

  const stats = React.useMemo(() => {
    const { packages, deployments, intakes, sites, dps, tiers } = data;

    const activePackages = packages.filter((p) => p.isActive).length;
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

    const platformCounts = packages.reduce((acc, p) => {
      const key = p.platform || "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalPackages: packages.length,
      activePackages,
      inFlightCount: inFlight.length,
      devicesInFlight,
      successRate: percent(succeeded, settled),
      settled,
      failed,
      pendingIntakes: pendingIntakes.length,
      intakesCapped: intakes.length >= 200,
      lowConfidence,
      coveredSites,
      totalActiveSites: activeSites.length,
      uncoveredSites: activeSites.length - coveredSites,
      platformCounts,
      outcomeItems: [
        { label: "Succeeded", value: sumOutcomes(deployments, ["success"]), color: ROLE.positive },
        { label: "Already installed", value: sumOutcomes(deployments, ["already_installed"]), color: BRAND.teal },
        { label: "Reboot required", value: sumOutcomes(deployments, ["reboot_required"]), color: ROLE.caution },
        { label: "Failed", value: sumOutcomes(deployments, ["failed"]), color: ROLE.critical },
        { label: "Rejected", value: sumOutcomes(deployments, ["rejected"]), color: BRAND.gray },
        { label: "Timed out", value: sumOutcomes(deployments, ["timed_out"]), color: BRAND.gray },
        { label: "Signature invalid", value: sumOutcomes(deployments, ["signature_invalid"]), color: ROLE.critical },
      ].filter((i) => i.value > 0),
      tierItems: tiers
        ? [
            { label: "Distribution point (LAN)", value: tiers.dp, color: BRAND.teal },
            { label: "CDN", value: tiers.cdn, color: BRAND.dark },
            { label: "Origin", value: tiers.origin, color: BRAND.gray },
            { label: "Not recorded", value: tiers.unknown, color: BRAND.border },
          ].filter((i) => i.value > 0)
        : [],
      dpShare: tiers && tiers.total ? percent(tiers.dp, tiers.total) : null,
    };
  }, [data]);

  const platformItems = React.useMemo(
    () =>
      [
        { label: "Windows", value: stats.platformCounts.windows ?? 0, color: platformColor("windows").dot },
        { label: "macOS", value: stats.platformCounts.macos ?? 0, color: platformColor("macos").dot },
        { label: "Linux", value: stats.platformCounts.linux ?? 0, color: platformColor("linux").dot },
      ].filter((i) => i.value > 0),
    [stats.platformCounts]
  );

  const chartData = React.useMemo(
    () =>
      data.buckets.map((b) => ({
        day: String(b.bucket ?? "").slice(5), // MM-DD keeps the axis readable
        succeeded: Number(b.succeeded ?? 0),
        failed: Number(b.failed ?? 0),
      })),
    [data.buckets]
  );

  const hasChartData = chartData.some((d) => d.succeeded > 0 || d.failed > 0);

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

      {/* ── KPI row ─────────────────────────────────────────────── */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <SummaryCard
            title="Packages"
            value={loading ? "—" : stats.totalPackages}
            icon={<Inventory2OutlinedIcon fontSize="small" />}
            titleHint="Packages in the catalog for this tenant."
            onClick={() => onNavigateTab?.("catalog")}
            sx={{ height: "100%" }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <SummaryCard
            title="Active deployments"
            value={loading ? "—" : stats.inFlightCount}
            icon={<RocketLaunchOutlinedIcon fontSize="small" />}
            accent={stats.inFlightCount > 0 ? ROLE.caution : BRAND.teal}
            tint={stats.inFlightCount > 0 ? ROLE.cautionSoft : BRAND.tealSoft}
            titleHint="Deployments still scheduled, queued or running."
            onClick={() => onNavigateTab?.("deployments")}
            sx={{ height: "100%" }}
          />
        </Grid>
        {/* ⚠️ Con fallos, el bloque de arriba YA dice "8 de 9 fallaron" y
            además lleva a la causa. Repetirlo aquí como un 11% suelto es la
            versión decorativa del mismo dato. Sin fallos, esta tarjeta sí es
            la noticia. */}
        {stats.failed ? null : (
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <SummaryCard
            title="Success rate"
            value={loading || stats.successRate == null ? "—" : `${stats.successRate}%`}
            icon={<CheckCircleOutlineIcon fontSize="small" />}
            accent={stats.successRate != null && stats.successRate < 90 ? ROLE.critical : ROLE.positive}
            tint={stats.successRate != null && stats.successRate < 90 ? ROLE.criticalSoft : ROLE.positiveSoft}
            titleHint={`Across the last ${DEPLOYMENT_SAMPLE} deployments. Counts installed, already-installed and reboot-required as successful.`}
            sx={{ height: "100%" }}
          />
        </Grid>)}
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <SummaryCard
            title="Intakes to review"
            value={loading ? "—" : `${stats.pendingIntakes}${stats.intakesCapped ? "+" : ""}`}
            icon={<AutoAwesomeOutlinedIcon fontSize="small" />}
            accent={stats.pendingIntakes > 0 ? ROLE.caution : BRAND.teal}
            tint={stats.pendingIntakes > 0 ? ROLE.cautionSoft : BRAND.tealSoft}
            titleHint="Uploads verified and awaiting an approve/reject decision."
            // ⚠️ Ya no hay pestaña "intake" (fase 3). Lleva al catálogo y pide
            // abrir la cola de revisión: sin el segundo argumento esto sería un
            // enlace muerto —TAB_INDEX["intake"] es undefined y el `?? 0` te
            // dejaría en el Overview— que es exactamente el fallo silencioso
            // que la retirada de la pestaña podía introducir.
            onClick={() => onNavigateTab?.("catalog", { reviewQueue: true })}
            sx={{ height: "100%" }}
          />
        </Grid>
        {/* ⚠️ `0/0` NO es una cobertura del 0%: es "este tenant no tiene sitios
            configurados". Mostrarlo como métrica gasta una tarjeta en un
            estado vacío disfrazado de dato — cuatro de las cinco de esta fila
            estaban así en tenant 111. */}
        {stats.totalActiveSites === 0 ? null : (
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <SummaryCard
            title="Site coverage"
            value={loading ? "—" : `${stats.coveredSites}/${stats.totalActiveSites}`}
            icon={<HubOutlinedIcon fontSize="small" />}
            accent={stats.uncoveredSites > 0 ? ROLE.caution : ROLE.positive}
            tint={stats.uncoveredSites > 0 ? ROLE.cautionSoft : ROLE.positiveSoft}
            titleHint="Sites with at least one active distribution point. Uncovered sites download from CDN or origin instead of the LAN."
            onClick={() => onNavigateTab?.("distribution")}
            sx={{ height: "100%" }}
          />
        </Grid>)}
      </Grid>

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
                  Installs over time
                </Typography>
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                  Per-device outcomes by day
                </Typography>
              </Box>
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" gap={1}>
                <InstallsLegend />
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

            <Box sx={{ height: 220 }}>
              {loading ? (
                <Skeleton variant="rounded" height={220} />
              ) : !hasChartData ? (
                <Box
                  sx={{
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    color: BRAND.gray,
                    fontSize: TEXT.md,
                  }}
                >
                  No installs completed in this window
                </Box>
              ) : (
                <InstallsOverTimeChart data={chartData} />
              )}
            </Box>
          </SectionPaper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <CompositionBars
            title="Install outcomes"
            items={stats.outcomeItems}
            totalLabel="installs"
            emptyLabel="No install results yet"
            minHeight={286}
          />
        </Grid>
      </Grid>

      {/* ── Download sources + catalog mix ──────────────────────── */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <CompositionBars
            title="Download sources"
            items={stats.tierItems}
            totalLabel="downloads"
            emptyLabel="No downloads recorded in this window"
            minHeight={230}
            headerExtra={
              stats.dpShare != null ? (
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                  {stats.dpShare}% served from the LAN
                </Typography>
              ) : null
            }
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <CompositionBars
            title="Catalog by platform"
            items={platformItems}
            totalLabel="packages"
            emptyLabel="Catalog is empty"
            minHeight={230}
          />
        </Grid>
      </Grid>
    </Stack>
  );
}
