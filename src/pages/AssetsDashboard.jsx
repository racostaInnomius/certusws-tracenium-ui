// src/pages/AssetsDashboard.jsx
//
// Asset Management — dashboard surface (first tab under the
// `Asset Management` sidebar item). Redesigned to homologate with
// the rest of the app:
//
//   - KPI row uses the shared <SummaryCard> (icon + title caps +
//     value), not the old two-tone <MetricCard> with the loud teal
//     banner. Matches Overview/Jobs/PKI visually.
//   - Charts live inside <SectionPaper variant="panel"> — same
//     borderRadius 3 + BRAND.shadow the Clásicas use.
//   - Bottom section is just the hosts table. The old
//     "Selected Host Detail" panel was removed (the operator can
//     drill through via the hostname link / future row click into a
//     dedicated Host page).
//   - "Total Printers" KPI and "Printers by Vendor" chart removed
//     — the printers view moved to its own card under Hardware
//     Inventory where it belongs.
//
// Data sources (unchanged):
//   * /api/v1/dashboard/summary  → KPI counts + chart aggregates
//   * /api/v1/dashboard/hosts    → host rows for the table
//   * /api/v1/orchestrator/devices-connected → online/offline flag
//     for the new "Online" column (traffic-light dot).

import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Backdrop,
  Box,
  Chip,
  Fade,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";
import WifiTetheringOutlinedIcon from "@mui/icons-material/WifiTetheringOutlined";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";

import { dashboardApi } from "../api/dashboard";
import { httpGetJson } from "../api/http";
import { getConnectedDevices, getLatestAgentVersions } from "../api/overview";
import { listAssetGroups, listAssetGroupMembers } from "../api/assetGroups";

import HostsTable from "../components/Charts/HostsTable";
import SectionPaper from "../components/common/SectionPaper";
import SummaryCard from "../components/common/SummaryCard";
import CompositionBars from "../components/common/CompositionBars";
import { AgentVersionDonut, DonutCard } from "../components/Overview/FleetComposition";
import { useCachedFetch } from "../hooks/useCachedFetch";

import { BRAND, ROLE } from "../theme/brand";

// ---------- deep-link filter helpers -----------------------------------------
//
// The Asset Management page accepts filter params from the Overview's
// fleet-wide donuts (OS platform / Agent versions). Example URLs:
//   ?page=assets&platform=windows
//   ?page=assets&versionBucket=one_behind
//
// Anything the page doesn't recognize is silently ignored — we don't
// trust the query string to set arbitrary state beyond the whitelist
// below.

const ALLOWED_PLATFORMS = new Set(["windows", "macos", "linux"]);
const ALLOWED_VERSION_BUCKETS = new Set([
  "current",
  "one_behind",
  "older",
  "unknown"
]);

function readUrlFilters() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const platform = (params.get("platform") || "").toLowerCase();
  const versionBucket = (params.get("versionBucket") || "").toLowerCase();
  // Phase 4: optional `groupId` deep-link from the Asset Groups tab —
  // operator can click "View devices" on a group and land on the
  // Dashboard pre-scoped to that group's membership. We coerce to a
  // positive integer string; anything else falls back to "".
  const rawGroupId = String(params.get("groupId") || "").trim();
  const groupIdValid = /^[0-9]+$/.test(rawGroupId) && Number(rawGroupId) > 0;
  return {
    platform: ALLOWED_PLATFORMS.has(platform) ? platform : "",
    versionBucket: ALLOWED_VERSION_BUCKETS.has(versionBucket)
      ? versionBucket
      : "",
    groupId: groupIdValid ? rawGroupId : "",
  };
}

// Semver-ish comparison returning a classic -1 / 0 / +1 trichotomy.
// Non-numeric segments become 0 — matches the tolerance of the
// classifyAgentVersions helper used by the Overview donut.
function compareVersions(a, b) {
  const parse = (v) =>
    String(v || "").split(".").map((x) => Number(x) || 0);
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai !== bi) return ai > bi ? 1 : -1;
  }
  return 0;
}

// Mirror of FleetComposition/classifyAgentVersions bucketing. Kept
// local here because AssetsDashboard is in a different component
// subtree and pulling a shared util out for 15 lines wasn't worth
// adding a new shared module.
function bucketOfVersion(version, canonicalLatest) {
  if (!version || !canonicalLatest) return "unknown";
  const cmp = compareVersions(version, canonicalLatest);
  if (cmp >= 0) return "current";
  const v = String(version).split(".").map((x) => Number(x) || 0);
  const l = String(canonicalLatest).split(".").map((x) => Number(x) || 0);
  if (v[0] === l[0] && v[1] === l[1] && Math.abs((l[2] || 0) - (v[2] || 0)) <= 2) {
    return "one_behind";
  }
  return "older";
}

function normalizePlatform(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "windows" || v === "win32" || v.startsWith("win")) return "windows";
  if (v === "macos" || v === "darwin" || v === "osx" || v === "mac os x") return "macos";
  if (v === "linux") return "linux";
  return null;
}

function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getOsVersionDisplayTitle(row) {
  return (
    row?.display_title ||
    row?.commercial_name ||
    row?.os_label ||
    "Unknown OS"
  );
}

function getOsVersionDisplaySubtitle(row) {
  return (
    row?.display_subtitle ||
    row?.technical_version ||
    row?.os_version ||
    ""
  );
}

// ---------- component --------------------------------------------------------

export default function AssetsDashboard({ onAssetsEmptyStateChange, refreshNonce = 0 }) {
  // Set<agent_id> of devices currently connected (has an active
  // gRPC session in the last heartbeat window). Drives the "Online
  // now" KPI and the traffic-light dot on each row in the hosts
  // table. Same endpoint the Overview Hero uses.
  const [connectedIds, setConnectedIds] = React.useState(() => new Set());

  // Deep-link filters from the Overview donuts. Read once on mount
  // (stored in state so the user can dismiss them with the chip X
  // without the URL fighting back). Clearing the chip only updates
  // state — the URL param lingers, which is fine because a manual
  // reload would just re-apply the same filter and the user already
  // saw the toggle.
  const initialFilters = React.useMemo(() => readUrlFilters(), []);
  const [platformFilter, setPlatformFilter] = React.useState(
    initialFilters.platform || ""
  );
  const [versionBucketFilter, setVersionBucketFilter] = React.useState(
    initialFilters.versionBucket || ""
  );
  // Phase 4: filter by Asset Group membership. Two pieces of state —
  // the selected group id (as a string so the dropdown plays nicely
  // with empty=""), and the resolved Set of deviceIds for that group.
  // Loaded on demand: empty selection skips the fetch entirely so
  // operators who never use the filter pay zero extra requests.
  const [groupFilter, setGroupFilter] = React.useState(
    initialFilters.groupId || ""
  );
  const [groupCatalog, setGroupCatalog] = React.useState([]);
  const [groupMembers, setGroupMembers] = React.useState(null); // null = not loaded; Set otherwise
  const [groupMembersLoading, setGroupMembersLoading] = React.useState(false);

  // Bundled loader: summary + hosts + latestMap fetched together so the
  // cache snapshot is consistent — the table, KPIs and version donut
  // all reflect the same point in time when the page rehydrates.
  // `latestMap` keys "windows:arm64" → "1.1.2" classify each host's
  // agent_version into current / one_behind / older buckets.
  //
  // Important: we keep explicit success/error flags for summary and
  // hosts. This prevents the Welcome sidebar item / empty-state overlay
  // from appearing when the IDP/backend is waking up, timing out, or
  // returning an auth/server error. Empty state should only mean "loaded
  // successfully and there is truly no inventory data".
  const loader = React.useCallback(async () => {
    const [sumRes, hostsRes, latestRes] = await Promise.allSettled([
      dashboardApi.getSummary(),
      httpGetJson("/api/v1/dashboard/hosts"),
      getLatestAgentVersions(),
    ]);

    const summaryOk = sumRes.status === "fulfilled";
    const hostsOk = hostsRes.status === "fulfilled" && Array.isArray(hostsRes.value);

    const summary = summaryOk ? sumRes.value : null;
    const hosts = hostsOk ? hostsRes.value : [];

    const latestMap = {};
    if (latestRes.status === "fulfilled" && Array.isArray(latestRes.value)) {
      for (const e of latestRes.value) {
        if (e?.ok && e.data?.latestVersion) {
          latestMap[`${e.platform}:${e.arch}`] = e.data.latestVersion;
        }
      }
    }

    return {
      summary,
      hosts,
      latestMap,
      loadState: {
        summaryLoaded: summaryOk,
        hostsLoaded: hostsOk,
        summaryError: !summaryOk,
        hostsError: !hostsOk,
      },
    };
  }, []);

  const { data, loading, refetch } = useCachedFetch("assets:bundle", loader);
  // Memoize the destructured slices so identity is stable across
  // renders — `data?.foo ?? []` would create a fresh fallback every
  // render and invalidate downstream useMemo deps unnecessarily.
  const summary = data?.summary ?? null;
  const hosts = React.useMemo(() => data?.hosts ?? [], [data]);
  const latestMap = React.useMemo(() => data?.latestMap ?? {}, [data]);

  const loadState = React.useMemo(
    () =>
      data?.loadState ?? {
        summaryLoaded: false,
        hostsLoaded: false,
        summaryError: false,
        hostsError: false,
      },
    [data]
  );

  // Page-level refresh signal from the Assets wrapper — bumps the
  // cached fetch so the active tab pulls fresh data.
  React.useEffect(() => {
    if (refreshNonce > 0) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  // Connected-devices set (drives the "Online" dot + KPI). Refreshes
  // on a gentle 30s cadence so the table reflects disconnects within
  // ~30s of happening without hammering the backend. Visibility-aware:
  // skips the tick when the tab is hidden.
  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await getConnectedDevices();
        if (cancelled) return;
        // The endpoint shape is `{ ok, tenantId, deviceIds: [...],
        // count }` but we defensively handle `{ items: [...] }` and
        // a bare array too in case an older deployment is still
        // returning one of those legacy shapes.
        const ids =
          (Array.isArray(res?.deviceIds) && res.deviceIds) ||
          (Array.isArray(res?.items) && res.items) ||
          (Array.isArray(res) && res) ||
          [];
        setConnectedIds(new Set(ids.map((id) => String(id))));
      } catch (e) {
        if (cancelled) return;
        // Silent: an auth blip or backend hiccup should leave the
        // dots gray until next tick, not crash the page.
        console.warn("devices-connected fetch failed:", e?.message || e);
        setConnectedIds(new Set());
      }
    };

    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Phase 4: Asset-group filter wiring ─────────────────────────
  //
  // (1) Catalog: load the tenant's groups once. We only need {id, name,
  //     kind, memberCount} to render the dropdown — refresh follows the
  //     page-level refreshNonce so a freshly-created group appears
  //     after the operator hits Refresh.
  React.useEffect(() => {
    let cancelled = false;
    listAssetGroups()
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        setGroupCatalog(items);
      })
      .catch((err) => {
        if (cancelled) return;
        // Soft-fail: dashboard works without the filter dropdown if the
        // backend doesn't return groups (e.g. older deployment).
        console.warn("asset-groups list failed:", err?.message || err);
        setGroupCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  // (2) Members for the selected group. Refetched whenever the
  //     selection or the page-level refresh nonce changes — dynamic
  //     groups especially benefit, since "Refresh" should re-evaluate.
  React.useEffect(() => {
    if (!groupFilter) {
      setGroupMembers(null);
      setGroupMembersLoading(false);
      return undefined;
    }
    let cancelled = false;
    setGroupMembersLoading(true);
    listAssetGroupMembers(groupFilter)
      .then((res) => {
        if (cancelled) return;
        const ids = Array.isArray(res?.items) ? res.items.map((m) => String(m.deviceId)) : [];
        setGroupMembers(new Set(ids));
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("asset-group members fetch failed:", err?.message || err);
        // Empty set rather than null on error — the table shows zero
        // rows under the chip, which signals "filter is active and
        // matched nothing" instead of silently bypassing the filter.
        setGroupMembers(new Set());
      })
      .finally(() => {
        if (!cancelled) setGroupMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupFilter, refreshNonce]);

  const selectedGroup = React.useMemo(
    () => groupCatalog.find((g) => String(g.id) === String(groupFilter)) || null,
    [groupCatalog, groupFilter]
  );

  const dashboardLoadedSuccessfully =
    !loading &&
    loadState.summaryLoaded &&
    loadState.hostsLoaded &&
    !loadState.summaryError &&
    !loadState.hostsError;

  const hasNoAssetsData =
    dashboardLoadedSuccessfully &&
    (!hosts || hosts.length === 0) &&
    Number(summary?.activeHosts ?? 0) === 0;

  React.useEffect(() => {
    onAssetsEmptyStateChange?.(hasNoAssetsData);
  }, [hasNoAssetsData, onAssetsEmptyStateChange]);

  // Canonical "latest" version across platforms — we pick the max so
  // a tenant with only macOS targets still classifies correctly. Kept
  // as a derived value (not state) so it updates live when the
  // metadata fetch lands.
  const canonicalLatest = React.useMemo(() => {
    const values = Object.values(latestMap || {}).filter(Boolean);
    if (values.length === 0) return null;
    return values.sort((a, b) => compareVersions(b, a))[0];
  }, [latestMap]);

  // Client-side filter applied over the raw hosts list. Two concerns:
  //   * platformFilter → match on host.os_platform (normalized).
  //   * versionBucketFilter → compute bucket per host against
  //     canonicalLatest, keep matches only.
  // Filtering is deliberately additive (AND): chips can combine so a
  // user can deep-link "Windows devices one-behind" in the future.
  const filteredHosts = React.useMemo(() => {
    const groupFilterActive = !!groupFilter;
    if (!platformFilter && !versionBucketFilter && !groupFilterActive) return hosts;
    // While the member set is still loading, hide rows so the operator
    // doesn't briefly see the unfiltered fleet under an active chip.
    if (groupFilterActive && groupMembers === null) return [];
    return hosts.filter((h) => {
      if (platformFilter) {
        const p = normalizePlatform(h.os_platform);
        if (p !== platformFilter) return false;
      }
      if (versionBucketFilter) {
        const bucket = bucketOfVersion(h.agent_version, canonicalLatest);
        if (bucket !== versionBucketFilter) return false;
      }
      if (groupFilterActive && groupMembers) {
        if (!groupMembers.has(String(h.agent_id))) return false;
      }
      return true;
    });
  }, [
    hosts,
    platformFilter,
    versionBucketFilter,
    canonicalLatest,
    groupFilter,
    groupMembers,
  ]);

  // ── Data shaped for the composition charts ─────────────────────────
  //
  // All three breakdown charts (OS Platform, Top Manufacturer, OS
  // Versions) consume the shared `<CompositionBars>` component, which
  // expects `items: [{ label, value, color?, sub? }]`. We derive
  // client-side from the dashboard summary so the categorical colors
  // match what the rest of the app uses for each platform family —
  // and so we don't have to change the backend to change a palette.

  // Color palette keyed by normalized platform. Matches the chips the
  // HostsTable uses so the two surfaces read as a single language.
  const platformColors = React.useMemo(
    () => ({
      windows: BRAND.dark,
      macos: BRAND.teal,
      linux: "#ed6c02",
    }),
    []
  );

  // Donut-shaped data for the shared OS platform chart from Overview's
  // FleetComposition. Same palette as the bar items above so swapping
  // visual idioms doesn't change which slice maps to which platform.
  // Cycles through teal/dark/cyan/gray for any tail beyond the keyed
  // platforms — matches the Overview donut's color sequence.
  function formatPlatformLabel(value) {
    return String(value || "Unknown")
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  const osDonutData = React.useMemo(() => {
    const cycleColors = [BRAND.teal, BRAND.dark, BRAND.cyan, BRAND.gray];
    const rows = Array.isArray(summary?.osPlatform) ? summary.osPlatform : [];
    return rows
      .map((r, i) => {
        const rawName = String(r?.os_platform ?? r?.name ?? "Unknown");
        const normalized = normalizePlatform(rawName);
        return {
          name: formatPlatformLabel(rawName),
          value: Number(r?.host_count ?? r?.count ?? 0),
          color: normalized ? platformColors[normalized] : cycleColors[i % cycleColors.length],
        };
      })
      .filter((d) => d.value > 0);
  }, [summary, platformColors]);

const osVersionItems = React.useMemo(() => {
  const rows = Array.isArray(summary?.osVersions) ? summary.osVersions : [];

  return rows.map((r) => {
    const platform = String(r?.os_platform ?? "").toLowerCase();
    const normalized = normalizePlatform(platform);

    return {
      label: getOsVersionDisplayTitle(r),
      sub: getOsVersionDisplaySubtitle(r),
      value: toSafeNumber(r?.host_count ?? r?.count),
      color: normalized ? platformColors[normalized] : BRAND.gray,
      raw: r,
    };
  });
}, [summary, platformColors]);

  // `byVersion` for the AgentVersionDonut. The Overview endpoint
  // (/dashboard/agent-versions) would return this directly, but we
  // can reconstruct it from the hosts list without an extra call.
  const byVersion = React.useMemo(() => {
    const counts = new Map();
    for (const h of hosts) {
      const v = String(h?.agent_version || "").trim();
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([version, count]) => ({
      version,
      count,
    }));
  }, [hosts]);

  // KPI values derived from the loaded data. `onlineCount` is the
  // intersection of connected IDs and the raw hosts list so a
  // connected device that isn't in the dashboard/hosts response
  // (shouldn't happen, but belt-and-suspenders) doesn't inflate the
  // number. OS-platform + agent-version cardinality come straight
  // from the summary + hosts aggregates.
  const kpis = React.useMemo(() => {
    const activeHosts = Number(summary?.activeHosts ?? hosts.length ?? 0);
    const platformBuckets = Array.isArray(summary?.osPlatform)
      ? summary.osPlatform.length
      : new Set(
          hosts
            .map((h) => normalizePlatform(h.os_platform))
            .filter(Boolean)
        ).size;
    const versionSet = new Set(
      hosts
        .map((h) => String(h.agent_version || "").trim())
        .filter(Boolean)
    );
    const onlineCount = hosts.reduce(
      (acc, h) => acc + (connectedIds.has(String(h.agent_id)) ? 1 : 0),
      0
    );
    return {
      activeHosts,
      onlineCount,
      inactiveAssets7d: Number(summary?.inactiveAssets7d ?? 0),
      versionCount: versionSet.size,
    };
  }, [summary, hosts, connectedIds]);

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "calc(100dvh - 220px)",
        pb: 1,
      }}
    >
      {/* Row 1 — KPI strip. Matches the 2.4/3/3/3 layout used by
          Jobs/Audit/PKI hero rows: 4 shared SummaryCards, each with
          its own icon and semantic accent. */}
      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Active hosts"
            value={kpis.activeHosts}
            icon={<DevicesOtherOutlinedIcon />}
            titleHint="Devices that have communicated with Tracenium in the last 24 hours. Use this metric to understand recent activity across your enrolled environment."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Online now"
            value={kpis.onlineCount}
            icon={<WifiTetheringOutlinedIcon />}
            accent={ROLE.positive}
            tint={ROLE.positiveSoft}
            titleHint="Devices with an active gRPC session in the last heartbeat window. Refreshes every 30s."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Inactive assets"
            value={kpis.inactiveAssets7d}
            icon={<ReportProblemOutlinedIcon />}
            accent={ROLE.caution}
            tint={ROLE.cautionSoft}
            titleHint="Devices that have not reported inventory or telemetry in more than 7 days."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Agent versions"
            value={kpis.versionCount}
            icon={<SystemUpdateAltOutlinedIcon />}
          />
        </Grid>
      </Grid>

      {/* Row 2 — Fleet composition (4 cards in one row at md+):
          Agent versions · OS platform · Top manufacturers · OS versions.
          Previously OS versions was on its own full-width row below;
          consolidated here so the four breakdowns are scannable
          side by side. At md the columns are tight (md:3 each) so
          long version labels in the OS versions list ellipsize —
          that's an acceptable trade for the at-a-glance comparison.
          On lg+ each column gets more room. */}
      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
        <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            {/* AgentVersionDonut uses its own <Paper> wrapper via
                DonutCard — no SectionPaper around it or we'd double
                the border. */}
            <AgentVersionDonut
              byVersion={byVersion}
              latestMap={latestMap}
              loading={loading}
            />
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            {/* Reuses the same OS platform donut Overview shows in
                FleetComposition so the two surfaces stay visually
                consistent. */}
            <DonutCard
              title="OS platform"
              data={osDonutData}
              loading={loading}
              totalLabel="devices"
              fallbackLabel="No platform breakdown available"
            />
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            <CompositionBars
              title="OS versions"
              items={osVersionItems}
              totalLabel="hosts"
              emptyLabel="No version data"
              minHeight={260}
              maxItems={6}
            />
          </Box>
        </Grid>
      </Grid>

      {/* Row 4 — Devices table. No more "Selected Host Detail"
          panel below — the table stands on its own. Deep-link
          filter chips render above when any filter is applied. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}
            >
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
                  Devices
                </Typography>
                {/* Group filter dropdown. Lazy-bound to the Asset
                    Groups catalog. Empty option clears the filter.
                    Hidden entirely when the tenant has no groups, so
                    the toolbar doesn't carry dead weight for tenants
                    who never opened the Groups tab. */}
                {groupCatalog.length > 0 ? (
                  <TextField
                    select
                    size="small"
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    sx={{
                      minWidth: 180,
                      "& .MuiInputBase-root": { fontSize: 13 },
                    }}
                    SelectProps={{ displayEmpty: true }}
                  >
                    <MenuItem value="">
                      <Typography sx={{ fontSize: 13, color: BRAND.gray }}>
                        Filter by group…
                      </Typography>
                    </MenuItem>
                    {groupCatalog.map((g) => (
                      <MenuItem key={g.id} value={String(g.id)}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                            {g.name}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: BRAND.gray }}>
                            {g.kind === "dynamic" ? "dyn" : "static"}
                            {Number.isFinite(g.memberCount)
                              ? ` · ${g.memberCount}`
                              : ""}
                          </Typography>
                        </Stack>
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}
              </Stack>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {filteredHosts.length} of {hosts.length} · {kpis.onlineCount} online
              </Typography>
            </Stack>

            {(platformFilter || versionBucketFilter || groupFilter) ? (
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ mb: 1.5, flexWrap: "wrap", gap: 0.5, alignItems: "center" }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: BRAND.gray, fontWeight: 600, mr: 0.5 }}
                >
                  Filtered
                </Typography>
                {platformFilter ? (
                  <Chip
                    size="small"
                    label={`Platform: ${platformFilter}`}
                    onDelete={() => setPlatformFilter("")}
                    sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 600 }}
                  />
                ) : null}
                {versionBucketFilter ? (
                  <Chip
                    size="small"
                    label={`Version: ${versionBucketFilter.replace("_", " ")}`}
                    onDelete={() => setVersionBucketFilter("")}
                    sx={{ bgcolor: ROLE.cautionSoft, color: ROLE.caution, fontWeight: 600 }}
                  />
                ) : null}
                {groupFilter ? (
                  <Chip
                    size="small"
                    label={
                      groupMembersLoading
                        ? `Group: ${selectedGroup?.name || groupFilter}…`
                        : `Group: ${selectedGroup?.name || groupFilter} (${
                            groupMembers ? groupMembers.size : 0
                          })`
                    }
                    onDelete={() => setGroupFilter("")}
                    sx={{
                      bgcolor: BRAND.cyanSoft || BRAND.tealSoft,
                      color: BRAND.tealText,
                      fontWeight: 600,
                    }}
                  />
                ) : null}
              </Stack>
            ) : null}

            <HostsTable rows={filteredHosts} connectedIds={connectedIds} />
          </SectionPaper>
        </Grid>
      </Grid>

      {hasNoAssetsData && (
        <Backdrop
          open
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            borderRadius: 2,
            backgroundColor: "rgba(15, 23, 42, 0.20)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            pt: { xs: "26vh", sm: "24vh", md: "22vh" },
          }}
        >
          <Fade in={hasNoAssetsData} timeout={{ enter: 320, exit: 200 }}>
            <Paper
              elevation={0}
              sx={{
                width: "100%",
                maxWidth: 520,
                mx: 2,
                px: { xs: 3, sm: 4 },
                py: { xs: 3, sm: 4 },
                borderRadius: 3,
                textAlign: "center",
                border: `1px solid ${BRAND.border}`,
                // The empty-state dialog floats over a blurred backdrop,
                // so it gets a slightly deeper shadow than the standard
                // panel to separate it from the frosted layer behind.
                boxShadow: "0 18px 45px rgba(59,64,77,0.18)",
                transform: hasNoAssetsData
                  ? "scale(1) translateY(0)"
                  : "scale(0.96) translateY(12px)",
                opacity: hasNoAssetsData ? 1 : 0,
                transition: "transform 320ms ease, opacity 320ms ease",
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, color: BRAND.dark, mb: 1.5 }}
              >
                Aún no hay información disponible
              </Typography>
              <Typography
                sx={{
                  color: "text.secondary",
                  fontSize: 16,
                  lineHeight: 1.6,
                  mb: 3,
                }}
              >
                No tienes agentes instalados o tus agentes no han reportado datos todavía.
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                <Inventory2OutlinedIcon
                  sx={{
                    fontSize: 48,
                    color: BRAND.tealSoftStrong,
                    animation: "pulse 2s infinite",
                    "@keyframes pulse": {
                      "0%": { opacity: 0.4 },
                      "50%": { opacity: 1 },
                      "100%": { opacity: 0.4 },
                    },
                  }}
                />
              </Box>
            </Paper>
          </Fade>
        </Backdrop>
      )}
    </Box>
  );
}