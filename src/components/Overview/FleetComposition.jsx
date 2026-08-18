// src/components/Overview/FleetComposition.jsx
//
// Two donuts side-by-side: OS platform · Agent version.
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


// Exported as a named export so the Assets page can reuse the exact
// same donut (classification + coloring + legend) instead of
// re-implementing it. The default export of this module stays the
// composition wrapper; individual primitives are opt-in for pages
// that only want one slice.
export function AgentVersionDonut({ byVersion, latestMap, loading, onCardClick, onSegmentClick }) {
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

  return (
    <DonutCard
      title={
        canonicalLatest ? `Agent versions (latest ${canonicalLatest})` : "Agent versions"
      }
      data={data}
      loading={loading}
      totalLabel="devices"
      fallbackLabel={fallback}
      onCardClick={onCardClick}
      onSegmentClick={onSegmentClick}
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
  onSegmentClick
}) {
  const total = data.reduce((sum, x) => sum + x.value, 0);
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
      ) : data.length === 0 ? (
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
          <Box sx={{ width: 120, height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={2}
                >
                  {data.map((d, i) => (
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
            {data.map((d) => {
              // Per-segment nav. stopPropagation so clicking the legend
              // row doesn't also trigger the card-level onClick (which
              // would lose the filter). Only rows with a handler get
              // the hover/pointer cue — no-op rows stay static.
              const segClick =
                typeof onSegmentClick === "function"
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
                      bgcolor: d.color,
                      flexShrink: 0
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      color: BRAND.dark,
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
                    sx={{ color: BRAND.gray, fontWeight: 600, fontSize: 12.5 }}
                  >
                    {d.value}
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
          totalLabel="devices"
          fallbackLabel="No platform breakdown available"
          onCardClick={() => navToAssets()}
          onSegmentClick={(segment) =>
            navToAssets({ platform: String(segment.name || "").toLowerCase() })
          }
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <AgentVersionDonut
          byVersion={byVersion}
          latestMap={latestMap}
          loading={loading}
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
