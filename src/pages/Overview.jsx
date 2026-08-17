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

import { useCallback, useMemo } from "react";
import { Box, Grid, Typography } from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import { fetchOverviewBundle } from "../api/overview";
import HeroKpis from "../components/Overview/HeroKpis";
import AttentionPanel from "../components/Overview/AttentionPanel";
import FleetComposition from "../components/Overview/FleetComposition";
import AuditTimeseriesChart from "../components/Overview/AuditTimeseriesChart";
import JobsTimeseriesChart from "../components/Overview/JobsTimeseriesChart";
import RecentActivity from "../components/Overview/RecentActivity";
import LatestAlerts from "../components/Overview/LatestAlerts";
import PatchCoverageCard from "../components/Overview/PatchCoverageCard";
import PluginCoverageStrip from "../components/Overview/PluginCoverageStrip";
import LicenseUsageCard from "../components/Overview/LicenseUsageCard";
import ComplianceTrendCard from "../components/Overview/ComplianceTrendCard";
import HealthDistributionCard from "../components/Overview/HealthDistributionCard";
import PageHeader from "../components/common/PageHeader";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import { useCachedFetch } from "../hooks/useCachedFetch";
import { ROLE } from "../theme/brand";

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

export default function Overview() {
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

  const { data: results, loading, refreshing, error, refetch } = useCachedFetch(
    "overview:bundle",
    loader,
  );

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refetch, "overviewAutoRefresh");
  const errorMsg = error ? error?.message || "Failed to load overview data" : null;

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
          ) : null
        }
        actions={
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={setRefreshSeconds}
            onRefresh={refetch}
            loading={loading || refreshing}
          />
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

      {/* Row 2 — Attention + Audit timeseries (side by side on md+) */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 5 }}>
          <AttentionPanel
            results={results}
            onNavigate={navigateWithQuery}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <AuditTimeseriesChart
            result={results?.auditTimeseries}
            loading={loading}
            onNavigate={navigateWithQuery}
          />
        </Grid>
      </Grid>

      {/* Row 3 — Fleet composition (3 donuts, md:8) + Latest alerts
          (md:4). Previously the right column stacked LatestAlerts ON
          TOP OF PluginCoverageStrip which made it ~280px taller than
          the three compact donuts on the left — the mismatch showed up
          as an ugly empty band under the donuts. PluginCoverageStrip
          has moved down next to the Jobs chart (Row 4) so both rows
          have balanced heights and the dashboard reads as a tight
          grid instead of a misaligned patchwork. */}
      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
        <Grid size={{ xs: 12, md: 8 }}>
          <FleetComposition
            results={results}
            loading={loading}
            onNavigate={navigateWithQuery}
            patchCoverageSlot={
              <PatchCoverageCard
                result={results?.devicePosture}
                loading={loading}
                onNavigate={navigateWithQuery}
              />
            }
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <PluginCoverageStrip
            result={results?.pluginCoverage}
            loading={loading}
          />
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
          <ComplianceTrendCard
            result={results?.fleetComplianceTimeseries}
            loading={loading}
            onNavigate={navigateWithQuery}
          />
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
          <JobsTimeseriesChart
            result={results?.jobsTimeseries}
            loading={loading}
            onNavigate={navigateWithQuery}
          />
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
