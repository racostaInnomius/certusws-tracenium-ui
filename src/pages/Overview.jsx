// src/pages/Overview.jsx
//
// Entry point for the "Overview" sidebar item — the dashboard CISOs and
// IT admins hit right after login. Designed to answer four questions:
//
//   1. Is the fleet healthy?              — Hero KPIs
//   2. What needs my attention today?     — Attention panel
//   3. How are we moving vs. last week?   — Timeseries charts
//   4. Who and what is in my fleet?       — Fleet composition + Recent activity
//
// All data comes from fetchOverviewBundle (api/overview.js), which fans
// out 10+ parallel requests with allSettled — any failing endpoint
// leaves its slot in a quiet zero state instead of blanking the page.

import { useCallback, useMemo, lazy, Suspense } from "react";
import { updateSearchParams } from "../utils/browserState";

// La clave del catálogo de reportes (`REPORT_REGISTRY`) que corresponde a
// este panel. El botón de arriba no genera nada: manda a Reports con este
// informe ya elegido, y allí se confirma y se genera por el MOTOR.
//
// Antes abría aquí mismo un diálogo que descargaba por `/api/v1/fleet-report`.
// El fichero salía igual, pero no quedaba constancia: `report_runs` es el
// ledger que contesta "¿quién se llevó qué y cuándo?" y del que cuelgan la
// re-entrega y el SHA-256 del artefacto. Un export que lo esquiva es una copia
// sin trazabilidad circulando por ahí — y eran nueve puertas así.
const FLEET_HEALTH_KEY = "global.fleet-health";
import { Box, Button, Grid, Stack, Tooltip, Typography } from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import { fetchOverviewBundle } from "../api/overview";
import { useAuthContext } from "../auth/AuthContext";
import HeroKpis from "../components/Overview/HeroKpis";
import AttentionPanel from "../components/Overview/AttentionPanel";
import RecentActivity from "../components/Overview/RecentActivity";
import LatestAlerts from "../components/Overview/LatestAlerts";
import PluginCoverageStrip from "../components/Overview/PluginCoverageStrip";
import LicenseUsageCard from "../components/Overview/LicenseUsageCard";
import HealthDistributionCard from "../components/Overview/HealthDistributionCard";
// ── Recharts, off the first paint ────────────────────────────────────
//
// Overview is the landing page, so its chunk is what stands between login
// and seeing anything. Measured on the deployed build: the shell is ~303 KB
// compressed and charts-vendor adds ~152 KB on top — a third of the
// critical path — to draw cards that are all below the fold. Nothing above
// it needs Recharts: the Hero KPIs use an inline SVG sparkline on purpose,
// and the licence bar and Attention panel are plain layout.
//
// So the five chart-bearing cards load on their own. The KPIs paint as
// soon as the shell is ready and the charts arrive a beat later, which is
// the order an operator reads them in anyway.
//
// This is why the "cache the last load" idea would not have helped: the
// data was never the thing being waited on — the page could not paint
// until this JS had parsed, cached data or not.
// All five chart cards come from ONE dynamic import. Calling loadCharts()
// repeatedly is free: a dynamic import is memoised, so the five lazy()
// wrappers below share a single in-flight promise and a single request.
//
// Five separate lazy() imports meant five chunks and five round-trips on the
// critical path, for 1-2 KB of wrapper each — Recharts itself is in the shared
// `charts` chunk they all pull. On a measured MSP client switch those landed
// at 1194/1196/1200/1207 and 2769 ms, the last a third waterfall level, and
// each card's API call waits on its own chunk. See charts.lazy.js.
const loadCharts = () => import("../components/Overview/charts.lazy");
const FleetComposition = lazy(() => loadCharts().then((m) => ({ default: m.FleetComposition })));
const AuditTimeseriesChart = lazy(() => loadCharts().then((m) => ({ default: m.AuditTimeseriesChart })));
const JobsTimeseriesChart = lazy(() => loadCharts().then((m) => ({ default: m.JobsTimeseriesChart })));
const PatchCoverageCard = lazy(() => loadCharts().then((m) => ({ default: m.PatchCoverageCard })));
const ComplianceTrendCard = lazy(() => loadCharts().then((m) => ({ default: m.ComplianceTrendCard })));

import PageHeader from "../components/common/PageHeader";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import { useCachedFetch } from "../hooks/useCachedFetch";
import { BRAND, ICON, ROLE } from "../theme/brand";

function navigateWithQuery(page, extraQuery = {}) {
  // Mirrors the AppShell query-param routing pattern. Setting page=
  // via window.location so the Sidebar's controlled state picks up the
  // change on next render without us having to plumb a ref through.
  const params = new URLSearchParams(window.location.search);
  params.set("page", page);
  Object.entries(extraQuery).forEach(([key, value]) => {
    if (value == null) params.delete(key);
    else params.set(key, String(value));
  });

  // Normalize the pathname before rebuilding. Some auth redirects
  // land users on `http://localhost:5173//?page=overview` (two
  // leading slashes — collapsed from `UI_BASE_URL + "/?page="`).
  // `pushState` treats a URL starting with `//` as protocol-relative
  // and silently rejects it as cross-origin, so the address bar
  // never updates and the click looks broken. Collapsing to a single
  // leading slash fixes that without affecting correctly-rooted URLs.
  const pathname = window.location.pathname.replace(/^\/+/, "/") || "/";
  const next = `${pathname}?${params.toString()}`;
  window.history.pushState({}, "", next);
  // AppShell reads from search params on its next render; the simplest
  // way to force that re-render is dispatching a popstate so any
  // listeners in the app shell update themselves.
  window.dispatchEvent(new PopStateEvent("popstate"));
}


/**
 * Stand-in while a chart chunk loads. Reserves the card's height on
 * purpose: letting the page reflow as each chart lands reads as jank,
 * which is a worse experience than the extra beat it saves.
 */
function ChartSlot({ height = 280 }) {
  return (
    <Box
      sx={{
        height,
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.08)",
        backgroundColor: BRAND.surface,
      }}
    />
  );
}

export default function Overview({ onNavigate } = {}) {
  // Stale-while-revalidate cache. On second visit (or after a reload
  // within the same session) the page paints from cache instantly and
  // refetches in the background — `loading` stays false, `refreshing`
  // toggles for the spinner. The bundle's allSettled-shaped
  // `{ status, value }` rows are JSON-serializable so sessionStorage
  // can persist them across reloads.
  const loader = useCallback(async () => {
    const { results } = await fetchOverviewBundle();
    return results;
  }, []);

  const { data: results, loading, refreshing, error, refetch, lastUpdatedAt } =
    useCachedFetch("overview:bundle", loader, {
      // 24h, against the 10-minute default. This is the entry that decides
      // whether a returning operator sees their fleet or an empty page: the
      // cache is read on mount and painted immediately, then revalidated in
      // the background (revalidateOnMount defaults to "stale"). With a
      // 10-minute horizon the entry was always already evicted by the time
      // anyone came back, so the dashboard opened blank and waited on ~28
      // requests before showing a single number.
      //
      // Painting a stale bundle is only honest if the page says so — the
      // header stamps the capture time, and the refresh lands seconds later.
      storageMaxAgeMs: 24 * 60 * 60 * 1000,
    });

  // When the first paint comes from cache this is the moment it was captured,
  // not "now". Shown in the header so nobody reads yesterday's numbers as
  // today's while the background refresh is still in flight.
  const refreshedAt = lastUpdatedAt ? new Date(lastUpdatedAt) : null;

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refetch, "overviewAutoRefresh");
  const errorMsg = error ? error?.message || "Failed to load overview data" : null;

  // Control-DB enrollment roster (same number HeroKpis' "Devices" card
  // shows) — passed down to PatchCoverageCard so its donut can reconcile
  // to the same total the other two Row-3 donuts use. See
  // FleetComposition.jsx's header comment for the full rationale.
  const fleetDevices =
    results?.dashboardSummary?.status === "fulfilled"
      ? results.dashboardSummary.value?.fleetDevices ?? null
      : null;

  // Fleet Health Report — admin-gated, same RBAC convention as
  // SecurityCompliance.jsx's export buttons: this only decides what to
  // render, the backend enforces the same split (requireRole on
  // /api/v1/fleet-report).
  const { auth } = useAuthContext();
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  // Build a device_id → hostname index from the hosts bundle so the
  // Latest alerts strip can render hostnames instead of raw UUIDs.
  // Falls back to an empty Map when the hosts endpoint errors out
  // (we'd rather show UUIDs than blank out the whole card).
  const deviceIndex = useMemo(() => {
    const map = new Map();
    const hosts = results?.recentHosts?.status === "fulfilled"
      ? results.recentHosts.value
      : null;
    const items =
      (Array.isArray(hosts?.items) && hosts.items) ||
      (Array.isArray(hosts) && hosts) ||
      [];
    for (const h of items) {
      const id = h?.device_id || h?.deviceId;
      const name = h?.hostname || h?.host;
      if (id && name) {
        map.set(String(id), String(name));
        map.set(String(id).toLowerCase(), String(name));
      }
    }
    return map;
  }, [results]);

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Overview"
        icon={<DashboardOutlinedIcon />}
        chips={
          errorMsg ? (
            <Typography variant="caption" sx={{ color: ROLE.critical }}>
              {errorMsg}
            </Typography>
          ) : refreshedAt ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {refreshing
                ? `Last refresh ${refreshedAt.toLocaleTimeString()} · updating…`
                : `Last refresh ${refreshedAt.toLocaleTimeString()}`}
            </Typography>
          ) : null
        }
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {canManage ? (
              <Tooltip title="Fleet health report" arrow placement="bottom">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AssessmentOutlinedIcon sx={{ fontSize: ICON.md }} />}
                    onClick={() => {
                      // A Reports, con el informe ya elegido. Allí se pide
                      // confirmación y se genera POR EL MOTOR, que es lo que
                      // deja la fila en `report_runs`.
                      updateSearchParams({ reportKey: FLEET_HEALTH_KEY, reportFormat: "pdf" });
                      onNavigate?.("reports");
                    }}
                    sx={{ textTransform: "none" }}
                  >
                    Report
                  </Button>
                </span>
              </Tooltip>
            ) : null}
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={refetch}
              loading={loading || refreshing}
            />
          </Stack>
        }
      />

      {/* Row 1 — Hero KPIs (full width, all cards now clickable) */}
      <Box sx={{ mb: 2 }}>
        <HeroKpis
          results={results}
          loading={loading}
          onNavigate={navigateWithQuery}
        />
      </Box>

      {/* Row 1.5 — License usage. Full width and slim: it is the only
          number here that can eventually stop enrollment working, and a
          seventh card would break the 6-across KPI grid. Renders nothing
          for tenants the license rule doesn't apply to. */}
      <Box sx={{ mb: 2 }}>
        <LicenseUsageCard
          result={results?.dashboardSummary}
          loading={loading}
          onNavigate={navigateWithQuery}
        />
      </Box>

      {/* Row 2 — Fleet composition (3 donuts, md:8: OS Platform, Agent
          Versions, Patch Coverage) + Plugin coverage (md:4). Moved above
          Attention/Audit — these are the cards operators want first, so
          they sit higher than the timeseries below.
          Previously the right column stacked LatestAlerts ON TOP OF
          PluginCoverageStrip which made it ~280px taller than the three
          compact donuts on the left — the mismatch showed up as an ugly
          empty band under the donuts. PluginCoverageStrip has moved down
          next to the Jobs chart (Row 4) so both rows have balanced
          heights and the dashboard reads as a tight grid instead of a
          misaligned patchwork. */}
      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
        <Grid size={{ xs: 12, md: 8 }}>
          <Suspense fallback={<ChartSlot height={360} />}>
          <FleetComposition
            results={results}
            loading={loading}
            onNavigate={navigateWithQuery}
            patchCoverageSlot={
              <PatchCoverageCard
                result={results?.devicePosture}
                loading={loading}
                onNavigate={navigateWithQuery}
                fleetDevices={fleetDevices}
              />
            }
          />
          </Suspense>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <PluginCoverageStrip
            result={results?.pluginCoverage}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Row 3 — Attention + Audit timeseries (side by side on md+) */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 5 }}>
          <AttentionPanel
            results={results}
            onNavigate={navigateWithQuery}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Suspense fallback={<ChartSlot height={320} />}>
            <AuditTimeseriesChart
              result={results?.auditTimeseries}
              loading={loading}
              onNavigate={navigateWithQuery}
            />
          </Suspense>
        </Grid>
      </Grid>

      {/* Row 3.5 — Compliance trend (U2) + Health distribution (U3).
          Two halves of the same question: U2 is "how is the fleet
          moving over time?", U3 is "right now, where does each
          device sit?". Side-by-side so the operator can read trend
          and current state in one glance — the trend ALONE doesn't
          say "but those 3 devices below 60 are the problem", and the
          distribution alone doesn't say "and it's been like this for
          a week". */}
      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
        <Grid size={{ xs: 12, md: 6 }}>
          <Suspense fallback={<ChartSlot />}>
            <ComplianceTrendCard
              result={results?.fleetComplianceTimeseries}
              loading={loading}
              onNavigate={navigateWithQuery}
            />
          </Suspense>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <HealthDistributionCard
            result={results?.devicePosture}
            loading={loading}
            onNavigate={navigateWithQuery}
          />
        </Grid>
      </Grid>

      {/* Row 4 — Jobs-by-status (md:8) + Plugin coverage (md:4). Plugin
          coverage moved here from Row 3 to rebalance column heights.
          Both cards are chart-like and similar in dimension, so the
          row sits flush with the donut row above. */}
      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
        <Grid size={{ xs: 12, md: 8 }}>
          <Suspense fallback={<ChartSlot height={320} />}>
            <JobsTimeseriesChart
              result={results?.jobsTimeseries}
              loading={loading}
              onNavigate={navigateWithQuery}
            />
          </Suspense>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <LatestAlerts
            result={results?.alertEvents}
            loading={loading}
            onNavigate={navigateWithQuery}
            deviceIndex={deviceIndex}
          />
        </Grid>
      </Grid>

      {/* Row 5 — Recent activity spans the full page width. It's a
          multi-source stream (jobs, certs, compliance events) whose
          density benefits from the extra horizontal room once it no
          longer has to share a row with the Jobs chart. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <RecentActivity
            results={results}
            loading={loading}
            onNavigate={navigateWithQuery}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
