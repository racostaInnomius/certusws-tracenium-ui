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

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Stack, Grid, Typography, IconButton, Tooltip } from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { fetchOverviewBundle } from "../api/overview";
import HeroKpis from "../components/Overview/HeroKpis";
import AttentionPanel from "../components/Overview/AttentionPanel";
import FleetComposition from "../components/Overview/FleetComposition";
import AuditTimeseriesChart from "../components/Overview/AuditTimeseriesChart";
import JobsTimeseriesChart from "../components/Overview/JobsTimeseriesChart";
import RecentActivity from "../components/Overview/RecentActivity";
import { BRAND } from "../theme/brand";

// Auto-refresh cadence. Don't refetch too aggressively — every call is
// 10 parallel backend hits across 3 DBs; every 60s is plenty for a
// dashboard. The manual refresh button is there for the "right now"
// case (e.g. after triggering a job, reload to see it land).
const REFRESH_MS = 60_000;

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
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {refreshedAt
              ? `Last refresh ${refreshedAt.toLocaleTimeString()}`
              : "Loading…"}
            {error && ` · ${error}`}
          </Typography>
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

      {/* Row 1 — Hero KPIs (full width) */}
      <Box sx={{ mb: 2 }}>
        <HeroKpis results={results} loading={loading} />
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
          />
        </Grid>
      </Grid>

      {/* Row 3 — Fleet composition (3 donuts full width) */}
      <Box sx={{ mb: 2 }}>
        <FleetComposition results={results} loading={loading} />
      </Box>

      {/* Row 4 — Jobs chart + Recent activity */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <JobsTimeseriesChart
            result={results?.jobsTimeseries}
            loading={loading}
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
