// src/components/Overview/FleetComposition.jsx
//
// Three donuts: OS platform · Agent version · Patch coverage (the third
// one rendered by PatchCoverageCard.jsx, which reuses `DonutCard` below
// via the parent's `patchCoverageSlot`).
//
// "Top manufacturers" was in this panel originally but removed — an
// Overview about operational health shouldn't lead with vendor mix.
// The same data is available on the Assets page for anyone curious.
//
// The Agent version donut is the interesting one — it's not served as
// a first-class backend aggregate, so we compute it client-side by
// matching each host's `agent_version` against the "latest published"
// map we got from the binaries metadata endpoint. That means:
//   - "current" = reported version equals latest for its platform+arch
//   - "one behind" = reported version is within one minor
//   - "older" = everything else (or unknown)
// Zero surface area backend-side; any time the auto-update shippability
// threshold changes we adjust the classifier here.
//
// Reconciled totals ("pending" bucket): each donut used to show only
// what its own source table already had — OS platform counted
// host_current_status rows, Agent versions counted the `agent` table,
// Patch coverage counted completed SCP scans. Those totals can
// legitimately differ (they're different pipeline stages), but showing
// three different totals side by side on the same row reads as the
// dashboard's numbers not "adding up". Fix: every donut here now also
// accepts `fleetDevices` (the control-DB enrollment roster — the same
// number the "Devices" KPI card shows) and, when given, reconciles to
// it by rendering the gap as an explicit "pending" segment instead of
// silently excluding those devices from the total. No new backend
// query — `fleetDevices` already rides along in the dashboard summary
// bundle this page already fetches.

import { useMemo } from "react";
import { Paper, Grid, Typography, Box, Skeleton } from "@mui/material";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Label
} from "recharts";
import { BRAND, ROLE } from "../../theme/brand";

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

import { classifyAgentVersions, compareVersions } from "./agentVersions";

// Muted, desaturated gray for the "pending" bucket — deliberately
// distinct from BRAND.gray, which every donut here already uses for its
// own internal "Unknown" bucket. Reusing BRAND.gray for both would make
// "we don't know this device's OS" and "this device hasn't reported at
// all yet" look like the same segment.
export const PENDING_COLOR = "#C7CBD1";

// Exported as a named export so the Assets page can reuse the exact
// same donut (classification + coloring + legend) instead of
// re-implementing it. The default export of this module stays the
// composition wrapper; individual primitives are opt-in for pages
// that only want one slice.
export function AgentVersionDonut({
  byVersion,
  latestMap,
  loading,
  onCardClick,
  onSegmentClick,
  fleetDevices = null,
  agentTotal = null
}) {
  const { buckets, canonicalLatest } = classifyAgentVersions(
    byVersion,
    latestMap
  );

  const data = [
    { name: "Current", value: buckets.current, color: ROLE.positive },
    { name: "One behind", value: buckets.oneBehind, color: ROLE.caution },
    { name: "Older", value: buckets.older, color: ROLE.critical },
    { name: "Unknown", value: buckets.unknown, color: BRAND.gray }
  ].filter((x) => x.value > 0);

  const fallback = !canonicalLatest
    ? "No latest-version data"
    : !Array.isArray(byVersion) || byVersion.length === 0
    ? "No enrolled devices"
    : "No version data";

  // Reconcile against the enrollment roster (see file header comment).
  // `agentTotal` is the backend's own count of `agent` rows — prefer it
  // over re-summing `byVersion` since it's the exact same number the
  // pre-reconciliation "checked in" label used to show.
  const knownTotal =
    agentTotal ??
    (Array.isArray(byVersion)
      ? byVersion.reduce((sum, r) => sum + Number(r?.count ?? 0), 0)
      : 0);
  const pendingValue =
    fleetDevices != null ? Math.max(fleetDevices - knownTotal, 0) : null;

  return (
    <DonutCard
      title={
        canonicalLatest ? `Agent versions (latest ${canonicalLatest})` : "Agent versions"
      }
      data={data}
      loading={loading}
      // "checked in", not "devices": this counts rows in the `agent`
      // table (agent has connected at least once), an earlier pipeline
      // stage than the "reporting" total the OS platform donut shows —
      // the two can legitimately differ. Once fleetDevices is known,
      // the total is reconciled to the full roster and the label
      // switches to "enrolled" (see DonutCard's pending handling).
      totalLabel={fleetDevices != null ? "enrolled" : "checked in"}
      fallbackLabel={fallback}
      onCardClick={onCardClick}
      onSegmentClick={onSegmentClick}
      pendingValue={pendingValue}
      pendingLabel="Not connected"
    />
  );
}

export function DonutCard({
  title,
  data,
  loading,
  totalLabel = "items",
  fallbackLabel = "No data",
  onCardClick,
  onSegmentClick,
  // When set (and > 0), a "pending" segment is appended to the chart —
  // devices counted in the reconciled roster (see file header comment)
  // that this particular donut's own source table doesn't have a row
  // for yet. `null` means "no roster to reconcile against" (an older
  // backend, or the roster fetch failed) — falls back to the donut's
  // own total, exactly like before this existed.
  pendingValue = null,
  pendingLabel = "Pending"
}) {
  const knownTotal = data.reduce((sum, x) => sum + x.value, 0);
  const hasPending = pendingValue != null && pendingValue > 0;
  const total = hasPending ? knownTotal + pendingValue : knownTotal;
  const chartData = hasPending
    ? [...data, { name: pendingLabel, value: pendingValue, color: PENDING_COLOR, pending: true }]
    : data;
  // The card header + empty body is clickable as a whole (drops the
  // operator at the target page with no filter). Individual legend
  // rows are clickable when `onSegmentClick` is wired — those carry a
  // filter for the segment name.
  const interactive = typeof onCardClick === "function";

  return (
    <Paper
      elevation={0}
      onClick={interactive ? onCardClick : undefined}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        "&:hover": interactive
          ? {
              borderColor: BRAND.teal,
              boxShadow: "0 4px 12px rgba(59,64,77,0.08)"
            }
          : undefined
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{ color: BRAND.dark, fontWeight: 700, mb: 1.5 }}
      >
        {title}
      </Typography>

      {loading ? (
        <Skeleton variant="rounded" height={170} />
      ) : data.length === 0 && !hasPending ? (
        <Box
          sx={{
            height: 170,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: BRAND.gray
          }}
        >
          <Typography variant="caption">{fallbackLabel}</Typography>
        </Box>
      ) : (
        // Stacked layout: donut on top, legend below. Previously the
        // legend was to the right of the donut — fine at md:6 per
        // column, broken at md:4 (labels truncated to "m"/"w"). With
        // the donut centered and legend stacked we get full horizontal
        // room for readable labels even when the card is narrow.
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <Box sx={{ position: "relative", width: 120, height: 120 }}>
            {hasPending && (
              // Dashed ring flags "this total includes an inferred
              // pending bucket" — drawn outside the circle (inset: -5)
              // so it doesn't shrink the chart itself.
              <Box
                sx={{
                  position: "absolute",
                  inset: -5,
                  borderRadius: "50%",
                  border: "2px dashed rgba(154,160,166,0.65)",
                  pointerEvents: "none"
                }}
              />
            )}
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={2}
                >
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                  <Label
                    position="center"
                    content={() => (
                      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                        <tspan x="50%" dy="-2" fontSize="16" fontWeight="800" fill={BRAND.dark}>
                          {total || "—"}
                        </tspan>
                        <tspan x="50%" dy="14" fontSize="10" fill={BRAND.gray}>
                          {totalLabel}
                        </tspan>
                      </text>
                    )}
                  />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Box>

          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              width: "100%",
              overflow: "hidden"
            }}
          >
            {chartData.map((d) => {
              // Per-segment nav. stopPropagation so clicking the legend
              // row doesn't also trigger the card-level onClick (which
              // would lose the filter). Only rows with a handler get
              // the hover/pointer cue — no-op rows stay static. The
              // pending row never navigates: there's no "pending"
              // filter on the drilldown pages.
              const segClick =
                !d.pending && typeof onSegmentClick === "function"
                  ? (e) => {
                      e.stopPropagation();
                      onSegmentClick(d);
                    }
                  : null;

              return (
                <Box
                  key={d.name}
                  onClick={segClick || undefined}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    minWidth: 0,
                    px: 0.5,
                    mx: -0.5,
                    borderRadius: 1,
                    cursor: segClick ? "pointer" : "default",
                    transition: "background-color 120ms ease",
                    "&:hover": segClick
                      ? { backgroundColor: BRAND.surfaceMuted }
                      : undefined
                  }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      flexShrink: 0,
                      ...(d.pending
                        ? {
                            background: `repeating-linear-gradient(45deg, ${PENDING_COLOR}, ${PENDING_COLOR} 1.5px, transparent 1.5px, transparent 3px)`,
                            border: `1px solid ${PENDING_COLOR}`
                          }
                        : { bgcolor: d.color })
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      color: d.pending ? BRAND.gray : BRAND.dark,
                      fontStyle: d.pending ? "italic" : "normal",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 12.5
                    }}
                  >
                    {d.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: BRAND.gray,
                      fontWeight: 600,
                      fontSize: 12.5,
                      fontStyle: d.pending ? "italic" : "normal"
                    }}
                  >
                    {d.pending ? `+${d.value}` : d.value}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Paper>
  );
}

export default function FleetComposition({ results, loading, onNavigate, patchCoverageSlot = null }) {
  const dashboard = getValue(results?.dashboardSummary);
  const latest = getValue(results?.latestVersions);
  const agentVersions = getValue(results?.agentVersions);

  // Control-DB enrollment roster — the reconciliation denominator (see
  // file header comment). Same field HeroKpis' "Devices" card already
  // uses, so this donut row and that KPI never disagree on what "the
  // fleet" is.
  const fleetDevices =
    typeof dashboard?.fleetDevices === "number" ? dashboard.fleetDevices : null;

  // OS platform data. Backend shapes vary across versions — try a few
  // common shapes before giving up.
  const osRaw =
    dashboard?.osPlatforms ??
    dashboard?.osPlatform ??
    dashboard?.platforms ??
    null;

  // Memoized so the PieChart gets a stable data reference across parent
  // re-renders (only recomputes when the raw OS aggregate changes).
  const osDataColored = useMemo(() => {
    const osColors = [BRAND.teal, BRAND.dark, BRAND.cyan, BRAND.gray];
    const osData = Array.isArray(osRaw)
      ? osRaw
          .map((row) => ({
            name: row.os_platform ?? row.name ?? row.platform ?? "Unknown",
            value: Number(row.host_count ?? row.count ?? row.value ?? 0),
            color: null
          }))
          .filter((x) => x.value > 0)
      : [];
    return osData.map((d, i) => ({ ...d, color: osColors[i % osColors.length] }));
  }, [osRaw]);

  const osPending =
    fleetDevices != null
      ? Math.max(fleetDevices - osDataColored.reduce((sum, x) => sum + x.value, 0), 0)
      : null;

  // Agent version donut is now powered by a dedicated backend aggregate
  // (`/dashboard/agent-versions`), which is the only place this tenant's
  // per-version distribution lives — `/dashboard/hosts` omits the field.
  const latestMap = {};
  if (Array.isArray(latest)) {
    for (const entry of latest) {
      if (entry?.ok && entry.data?.latestVersion) {
        latestMap[`${entry.platform}:${entry.arch}`] = entry.data.latestVersion;
      }
    }
  }
  const byVersion = Array.isArray(agentVersions?.byVersion)
    ? agentVersions.byVersion
    : [];

  // Navigation helpers. OS platform + Agent versions are fleet-wide
  // breakdowns (count every enrolled device, not just the SCP-reporting
  // subset), so clicks land on Asset Management rather than Security
  // Compliance — the previous `ad` destination silently dropped devices
  // that hadn't reported SCP facts yet, causing a count mismatch
  // between the donut and the filtered page.
  //
  // Patch Coverage is the exception: it IS SCP-specific by
  // construction, so its drilldown stays in `ad` (handled by the
  // parent via `patchCoverageSlot`).
  const navToAssets = (query) => onNavigate?.("assets", query);

  // FleetComposition now renders 3 donuts internally (OS platform,
  // Agent versions, Patch coverage). At md:4 each inside a md:6 outer
  // wrapper they're narrow — we accepted that when the user asked to
  // keep the composition compact. The PatchCoverageDonut is rendered
  // by the parent via the `patchCoverageSlot` prop so this component
  // doesn't need to know the patches data shape.
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <DonutCard
          title="OS platform"
          data={osDataColored}
          loading={loading}
          // "reporting", not "devices": this counts host_current_status
          // rows (full inventory received), a later pipeline stage than
          // "Agent versions"' totalLabel — a device can check in before
          // its inventory scan completes, so the two totals can differ.
          // Once fleetDevices is known the total reconciles to the full
          // roster (see file header comment) and the label follows.
          totalLabel={fleetDevices != null ? "enrolled" : "reporting"}
          fallbackLabel="No platform breakdown available"
          onCardClick={() => navToAssets()}
          onSegmentClick={(segment) =>
            navToAssets({ platform: String(segment.name || "").toLowerCase() })
          }
          pendingValue={osPending}
          pendingLabel="Pending inventory"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <AgentVersionDonut
          byVersion={byVersion}
          latestMap={latestMap}
          loading={loading}
          fleetDevices={fleetDevices}
          agentTotal={typeof agentVersions?.total === "number" ? agentVersions.total : null}
          onCardClick={() => navToAssets()}
          onSegmentClick={(segment) => {
            // Map the visible legend label back to a filter key the
            // Assets page can consume. "Current" / "One behind" /
            // "Older" / "Unknown" — mirrors the buckets from
            // classifyAgentVersions.
            const label = String(segment.name || "").toLowerCase();
            const bucket = label.includes("current")
              ? "current"
              : label.includes("one behind")
              ? "one_behind"
              : label.includes("older")
              ? "older"
              : label.includes("unknown")
              ? "unknown"
              : null;
            if (bucket) navToAssets({ versionBucket: bucket });
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        {patchCoverageSlot}
      </Grid>
    </Grid>
  );
}
