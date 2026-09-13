// src/pages/Overview.jsx
//
// Entry point for the "Overview" sidebar item — the page every user lands on
// after login.
//
// Three blocks, one per subscription tier (ADR-0010 tiers are additive):
//
//   1. Fleet & operations — every plan: AMP + SDP + alerts, jobs, reports,
//      audit and licences. This block IS the Starter product and has to stand
//      on its own.
//   2. Security & access  — Professional: SCP + RCP.
//   3. Patching & crypto  — Enterprise: PMP + CDP.
//
// A block is the unit of gating (components/Overview/overviewPlan.js): it
// mounts whole or not at all, and one that does not mount requests nothing.
// Analysis and rationale: docs/analysis/overview-page-2026-09.md.
//
// Each block loads its own slice (api/overview.js) with allSettled — any
// failing endpoint leaves its card in a quiet empty state instead of blanking
// the page.

import { useCallback, lazy, Suspense } from "react";
import GoToReportButton from "../components/common/GoToReportButton";

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
import { Box, Grid, Stack, Typography } from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import {
  fetchOverviewCore,
  fetchOverviewOperations,
  fetchOverviewSecurity,
} from "../api/overview";
import { useAuthContext } from "../auth/AuthContext";
import { usePluginCatalog } from "../hooks/usePluginCatalog";
import HeroKpis from "../components/Overview/HeroKpis";
import SecurityKpis from "../components/Overview/SecurityKpis";
import AttentionPanel from "../components/Overview/AttentionPanel";
import LatestAlerts from "../components/Overview/LatestAlerts";
import LicenseUsageCard from "../components/Overview/LicenseUsageCard";
import HealthDistributionCard from "../components/Overview/HealthDistributionCard";
import {
  CryptoDiscoveryCard,
  PatchManagementCard,
  ReportsCard,
  SoftwareDeliveryCard,
} from "../components/Overview/PluginSummaryCards";
import { OverviewBlock, PlanScopeNotice } from "../components/Overview/OverviewBlock";
import { resolveOverviewPlan } from "../components/Overview/overviewPlan";
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
import { BRAND } from "../theme/brand";

function navigateWithQuery(page, extraQuery = {}) {
  // Mirrors the AppShell query-param routing pattern. Setting page=
  // via window.location so the Sidebar's controlled state picks up the
  // change on next render without us having to plumb a ref through.
  // Se parte de una URL LIMPIA, no de la actual. La barra lateral sólo cambia
  // `page` y deja lo demás, así que la URL del Overview arrastraba filtros de
  // la última página visitada (`status`, `since`, `score-band`…) y este enlace
  // se los pasaba a la siguiente, que los aplicaba sin que nadie los pidiera.
  const params = new URLSearchParams();
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

// 24h, against the 10-minute default. This is what decides whether a
// returning operator sees their fleet or an empty page: the cache is painted
// on mount and revalidated in the background. With a 10-minute horizon the
// entry was always evicted by the time anyone came back. Painting a stale
// slice is only honest because the header stamps the capture time.
const CACHE_OPTIONS = { storageMaxAgeMs: 24 * 60 * 60 * 1000 };

export default function Overview({ onNavigate } = {}) {
  // ── Plan ──────────────────────────────────────────────────────────
  const { entitled, loading: catalogLoading } = usePluginCatalog();
  const plan = resolveOverviewPlan({ entitled, loading: catalogLoading });
  const core = plan.blocks.find((b) => b.id === "core");
  const security = plan.blocks.find((b) => b.id === "security");
  const operations = plan.blocks.find((b) => b.id === "operations");

  const hasSdp = core.has("sdp");
  const hasScp = Boolean(security?.has("scp"));
  const hasRcp = Boolean(security?.has("rcp"));
  const hasPmp = Boolean(operations?.has("pmp"));
  const hasCdp = Boolean(operations?.has("cdp"));

  // ── Data, one slice per block ─────────────────────────────────────
  //
  // The cache key carries what the loader asks for: a plan change must not
  // paint the previous plan's slice (or skip a request the new one needs).
  const coreLoader = useCallback(() => fetchOverviewCore({ sdp: hasSdp }), [hasSdp]);
  const securityLoader = useCallback(
    () => fetchOverviewSecurity({ scp: hasScp, rcp: hasRcp }),
    [hasScp, hasRcp]
  );
  const operationsLoader = useCallback(
    () => fetchOverviewOperations({ pmp: hasPmp, cdp: hasCdp }),
    [hasPmp, hasCdp]
  );

  const coreFetch = useCachedFetch(`overview:core:${hasSdp ? "sdp" : "base"}`, coreLoader, CACHE_OPTIONS);
  const securityFetch = useCachedFetch(
    `overview:security:${hasScp ? "scp" : ""}${hasRcp ? "rcp" : ""}`,
    securityLoader,
    { ...CACHE_OPTIONS, enabled: Boolean(security) }
  );
  const operationsFetch = useCachedFetch(
    `overview:operations:${hasPmp ? "pmp" : ""}${hasCdp ? "cdp" : ""}`,
    operationsLoader,
    { ...CACHE_OPTIONS, enabled: Boolean(operations) }
  );

  const coreRefetch = coreFetch.refetch;
  const securityRefetch = securityFetch.refetch;
  const operationsRefetch = operationsFetch.refetch;
  const refetchAll = useCallback(
    () =>
      Promise.all([
        coreRefetch?.(),
        security ? securityRefetch?.() : null,
        operations ? operationsRefetch?.() : null,
      ]),
    [coreRefetch, securityRefetch, operationsRefetch, security, operations]
  );

  const results = coreFetch.data;
  const loading = coreFetch.loading;
  const refreshing =
    coreFetch.refreshing || securityFetch.refreshing || operationsFetch.refreshing;

  // When the first paint comes from cache this is the moment it was captured,
  // not "now" — shown so nobody reads yesterday's numbers as today's.
  const refreshedAt = coreFetch.lastUpdatedAt ? new Date(coreFetch.lastUpdatedAt) : null;

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refetchAll, "overviewAutoRefresh");
  const errorMsg = coreFetch.error ? coreFetch.error?.message || "Failed to load overview data" : null;

  // Control-DB roster, handed to the patch-recency donut so its total
  // reconciles to the same "Devices" number block 1 shows.
  const fleetDevices =
    results?.dashboardSummary?.status === "fulfilled"
      ? results.dashboardSummary.value?.fleetDevices ?? null
      : null;

  // Fleet Health Report button: ADMIN/OWNER, same split the backend applies.
  // "View plans" is OWNER only — Billing turns everyone else away.
  const { auth } = useAuthContext();
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");
  const isOwner = isActiveMember && tenantRole === "OWNER";

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Overview"
        icon={<DashboardOutlinedIcon />}
        chips={
          errorMsg ? (
            <Typography variant="caption" sx={{ color: BRAND.alert.errorText }}>
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
              <GoToReportButton
                onNavigate={onNavigate}
                reportKey={FLEET_HEALTH_KEY}
                tooltip="Fleet health report"
              />
            ) : null}
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={refetchAll}
              loading={loading || refreshing}
            />
          </Stack>
        }
      />

      {/* ── Block 1 · Fleet & operations — every plan ─────────────── */}
      <OverviewBlock block={core}>
        <HeroKpis results={results} loading={loading} onNavigate={navigateWithQuery} hasSdp={hasSdp} />

        {/* The one number here that can eventually stop enrollment. Renders
            nothing for tenants the license rule doesn't apply to. */}
        <LicenseUsageCard result={results?.dashboardSummary} loading={loading} onNavigate={navigateWithQuery} />

        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: hasSdp ? 7 : 12 }}>
            <Suspense fallback={<ChartSlot height={360} />}>
              <FleetComposition results={results} loading={loading} onNavigate={navigateWithQuery} />
            </Suspense>
          </Grid>
          {hasSdp ? (
            <Grid size={{ xs: 12, md: 5 }}>
              <SoftwareDeliveryCard results={results} loading={loading} onNavigate={navigateWithQuery} />
            </Grid>
          ) : null}
        </Grid>

        {/* What needs a person, side by side: derived signals, the alert
            feed, and what was reported. */}
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: 4 }}>
            <AttentionPanel results={results} onNavigate={navigateWithQuery} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <LatestAlerts result={results?.alertEvents} loading={loading} onNavigate={navigateWithQuery} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <ReportsCard results={results} loading={loading} onNavigate={navigateWithQuery} />
          </Grid>
        </Grid>

        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: 6 }}>
            <Suspense fallback={<ChartSlot height={320} />}>
              <JobsTimeseriesChart result={results?.jobsTimeseries} loading={loading} onNavigate={navigateWithQuery} />
            </Suspense>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Suspense fallback={<ChartSlot height={320} />}>
              {/* Carril admin: el mismo que abre la página de Audit. Con los dos
                  carriles la gráfica llegaba a ~600 eventos/día (el bucle de
                  política) y el clic aterrizaba en una página que enseñaba 983
                  en 30 días: dos números para la misma tarjeta. */}
              <AuditTimeseriesChart
                result={results?.auditTimeseries}
                loading={loading}
                onNavigate={navigateWithQuery}
                lane="admin"
              />
            </Suspense>
          </Grid>
        </Grid>
      </OverviewBlock>

      {/* ── Block 2 · Security & access — Professional ─────────────── */}
      {security ? (
        <OverviewBlock block={security}>
          <SecurityKpis
            results={securityFetch.data}
            loading={securityFetch.loading}
            onNavigate={navigateWithQuery}
            has={security.has}
          />
          {hasScp ? (
            // Trend and current state are two halves of one question: the
            // slope alone doesn't say "those 3 devices below 60", and the
            // distribution alone doesn't say "and it's been like this a week".
            <Grid container spacing={2} alignItems="stretch">
              <Grid size={{ xs: 12, md: 5 }}>
                <Suspense fallback={<ChartSlot />}>
                  <ComplianceTrendCard
                    result={securityFetch.data?.fleetComplianceTimeseries}
                    loading={securityFetch.loading}
                    onNavigate={navigateWithQuery}
                  />
                </Suspense>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <HealthDistributionCard
                  result={securityFetch.data?.devicePosture}
                  loading={securityFetch.loading}
                  onNavigate={navigateWithQuery}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Suspense fallback={<ChartSlot />}>
                  <PatchCoverageCard
                    result={securityFetch.data?.devicePosture}
                    loading={securityFetch.loading}
                    onNavigate={navigateWithQuery}
                    fleetDevices={fleetDevices}
                  />
                </Suspense>
              </Grid>
            </Grid>
          ) : null}
        </OverviewBlock>
      ) : null}

      {/* ── Block 3 · Patching & crypto — Enterprise ───────────────── */}
      {operations ? (
        <OverviewBlock block={operations}>
          <Grid container spacing={2} alignItems="stretch">
            {hasPmp ? (
              <Grid size={{ xs: 12, md: hasCdp ? 6 : 12 }}>
                <PatchManagementCard
                  results={operationsFetch.data}
                  loading={operationsFetch.loading}
                  onNavigate={navigateWithQuery}
                />
              </Grid>
            ) : null}
            {hasCdp ? (
              <Grid size={{ xs: 12, md: hasPmp ? 6 : 12 }}>
                <CryptoDiscoveryCard
                  results={operationsFetch.data}
                  loading={operationsFetch.loading}
                  onNavigate={navigateWithQuery}
                />
              </Grid>
            ) : null}
          </Grid>
        </OverviewBlock>
      ) : null}

      <PlanScopeNotice locked={plan.locked} canManageBilling={isOwner} onNavigate={navigateWithQuery} />
    </Box>
  );
}
