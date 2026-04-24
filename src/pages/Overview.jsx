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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Stack, Grid, Typography, IconButton, Tooltip, Chip } from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
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
import { BRAND, ROLE } from "../theme/brand";

// Auto-refresh cadence. Don't refetch too aggressively — every call is
// 10 parallel backend hits across 3 DBs; every 60s is plenty for a
// dashboard. The manual refresh button is there for the "right now"
// case (e.g. after triggering a job, reload to see it land).
const REFRESH_MS = 60_000;

// Coarse relative-time formatter used by the Freshness chip. Matches
// the same buckets the Alerts page uses so the dashboard reads
// consistently. Deliberately lossy past "minutes" — a dashboard that
// shows "3h ago" is a dashboard nobody is watching; the big signal is
// "is this recent or not".
function formatRelativeFresh(date) {
  if (!date) return "never";
  const delta = Date.now() - date.getTime();
  const secs = Math.max(0, Math.round(delta / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleString();
}

// Color bucket for the chip based on data age. Green when we refreshed
// under a minute ago (current); teal when under a 2× the refresh
// cadence (still ok); amber beyond that — something is wrong with the
// polling loop.
function freshnessRole(date) {
  if (!date) return { label: "offline" };
  const delta = Date.now() - date.getTime();
  if (delta < REFRESH_MS) return { label: "live" };
  if (delta < REFRESH_MS * 3) return { label: "fresh" };
  return { label: "stale" };
}

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
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, "", next);
  // AppShell reads from search params on its next render; the simplest
  // way to force that re-render is dispatching a popstate so any
  // listeners in the app shell update themselves.
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function Overview() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { results } = await fetchOverviewBundle();
      setResults(results);
      setRefreshedAt(new Date());
    } catch (err) {
      setError(err?.message || "Failed to load overview data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh on a gentle interval. Pause when the tab is hidden
    // to avoid wasting backend cycles on an un-watched dashboard.
    timerRef.current = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  return (
    <Box sx={{ pb: 4 }}>
      {/* Header strip: title + refresh */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.2 }}
          >
            Overview
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
            <FreshnessChip refreshedAt={refreshedAt} loading={loading} error={error} />
            {error ? (
              <Typography variant="caption" sx={{ color: ROLE.critical }}>
                {error}
              </Typography>
            ) : null}
          </Stack>
        </Box>
        <Tooltip title="Refresh now">
          <span>
            <IconButton
              onClick={load}
              disabled={loading}
              size="small"
              sx={{
                color: BRAND.teal,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 1.5,
                "&:hover": { backgroundColor: BRAND.tealSoft }
              }}
            >
              <RefreshOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Row 1 — Hero KPIs (full width, all cards now clickable) */}
      <Box sx={{ mb: 2 }}>
        <HeroKpis
          results={results}
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

      {/* Row 3 — Fleet composition (3 donuts inside, md:8 outer) +
          Latest alerts (md:4). The donuts are compact by design (each
          ~1/6 of page width on md+) — the user's original ask was
          "keep them small". Adding Patch coverage as a third donut
          inside FleetComposition keeps the fleet-health story on one
          row instead of scattering it.

          LatestAlerts drops from md:6 to md:4 here. Rows in the strip
          stay readable because the component caps at 5 items and the
          summary text truncates with ellipsis. */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
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
          {/* Right column stacks LatestAlerts on top and the plugin
              coverage strip below. The two complement each other:
              LatestAlerts answers "what's happening right now", plugin
              coverage answers "is the fleet actually instrumented to
              tell me if something happens".

              No forced height on the Stack — each card sizes to its
              own content. LatestAlerts caps at 5 items so the stack
              stays bounded; PluginCoverageStrip is a fixed ~140px
              regardless of plugin count. */}
          <Stack spacing={2}>
            <LatestAlerts
              result={results?.alertEvents}
              loading={loading}
              onNavigate={navigateWithQuery}
            />
            <PluginCoverageStrip
              result={results?.pluginCoverage}
              loading={loading}
            />
          </Stack>
        </Grid>
      </Grid>

      {/* Row 4 — Jobs chart + Recent activity */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <JobsTimeseriesChart
            result={results?.jobsTimeseries}
            loading={loading}
            onNavigate={navigateWithQuery}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
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

/**
 * Small freshness pill in the Overview header. Runs its own ticking
 * interval (every 15s) so the "3m ago" label stays honest even if the
 * parent page's data fetch succeeded at t=0 and the user hasn't moved
 * — without this, the label would be stuck at "just now" forever.
 */
function FreshnessChip({ refreshedAt, loading, error }) {
  // Local tick — decoupled from the parent's refresh cadence so the
  // label animates independently. 15s is fine-grained enough to feel
  // "alive" without re-rendering the whole header every second.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const role = useMemo(() => freshnessRole(refreshedAt), [refreshedAt]);

  const label = loading
    ? "Refreshing…"
    : refreshedAt
    ? `Updated ${formatRelativeFresh(refreshedAt)}`
    : "Loading…";

  // Color bucket: live = ok, fresh = neutral, stale/offline = warn.
  // An error flag from the parent wins — paints red regardless.
  const tint = error
    ? ROLE.criticalSoft
    : role.label === "live"
    ? ROLE.positiveSoft
    : role.label === "fresh"
    ? BRAND.tealSoft
    : ROLE.cautionSoft;
  const fg = error
    ? ROLE.critical
    : role.label === "live"
    ? ROLE.positive
    : role.label === "fresh"
    ? BRAND.tealText
    : ROLE.caution;

  return (
    <Tooltip
      title={
        refreshedAt
          ? `Last refresh: ${refreshedAt.toLocaleString()}`
          : "No refresh yet"
      }
    >
      <Chip
        size="small"
        icon={
          <SyncOutlinedIcon
            sx={{
              fontSize: 14,
              color: fg,
              animation: loading ? "spin 1.2s linear infinite" : "none",
              "@keyframes spin": {
                from: { transform: "rotate(0deg)" },
                to: { transform: "rotate(360deg)" }
              }
            }}
          />
        }
        label={label}
        sx={{
          height: 22,
          bgcolor: tint,
          color: fg,
          fontWeight: 600,
          fontSize: 11,
          border: `1px solid ${fg}33`,
          "& .MuiChip-icon": { color: fg, ml: "6px", mr: "-2px" }
        }}
      />
    </Tooltip>
  );
}
