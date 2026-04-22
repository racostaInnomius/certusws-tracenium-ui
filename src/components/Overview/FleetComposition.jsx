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

function compareVersions(a, b) {
  const parse = (v) =>
    String(v || "")
      .split(".")
      .map((x) => {
        const n = Number(x);
        return Number.isFinite(n) ? n : 0;
      });
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

function oneBehind(current, latest) {
  // current is "one behind" if latest > current AND they differ only in
  // the last segment by 1-2 patches OR by a minor that's within 1. This
  // is deliberately forgiving — in a CISO dashboard you want a visual
  // "still safe-ish" bucket separate from "way behind".
  const parse = (v) =>
    String(v || "").split(".").map((x) => Number(x) || 0);
  const c = parse(current);
  const l = parse(latest);
  if (compareVersions(current, latest) >= 0) return false;
  // Same major+minor, patch diff <= 2
  if (c[0] === l[0] && c[1] === l[1] && Math.abs(l[2] - c[2]) <= 2) return true;
  return false;
}

/**
 * Bucket a set of (agent_version, count) rows against the max latest
 * version we know about. Exported because the AttentionPanel uses the
 * same classification for its "agents behind latest" alert — keeping
 * the logic in one place means the two views can't disagree.
 */
export function classifyAgentVersions(byVersion, latestMap) {
  const latestValues = Object.values(latestMap || {}).filter(Boolean);
  // Pick the highest latest across all platforms we got metadata for.
  // In practice this is the same string across platforms once a release
  // ships to all of them, but we don't assume.
  let canonicalLatest = null;
  for (const v of latestValues) {
    if (!canonicalLatest || compareVersions(v, canonicalLatest) > 0) {
      canonicalLatest = v;
    }
  }

  const buckets = { current: 0, oneBehind: 0, older: 0, unknown: 0 };

  if (!Array.isArray(byVersion)) return { buckets, canonicalLatest };

  for (const row of byVersion) {
    const version = row?.version;
    const count = Number(row?.count ?? 0);
    if (!count) continue;

    if (!version || version === "unknown" || !canonicalLatest) {
      buckets.unknown += count;
      continue;
    }

    const cmp = compareVersions(version, canonicalLatest);
    if (cmp >= 0) buckets.current += count;
    else if (oneBehind(version, canonicalLatest)) buckets.oneBehind += count;
    else buckets.older += count;
  }

  return { buckets, canonicalLatest };
}

function AgentVersionDonut({ byVersion, latestMap, loading }) {
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
    />
  );
}

function DonutCard({ title, data, loading, totalLabel = "items", fallbackLabel = "No data" }) {
  const total = data.reduce((sum, x) => sum + x.value, 0);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%"
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
        <Box sx={{ display: "flex", alignItems: "center", height: 170 }}>
          <Box sx={{ flex: "0 0 130px", height: 140 }}>
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
                        <tspan x="50%" dy="-2" fontSize="18" fontWeight="800" fill={BRAND.dark}>
                          {total || "—"}
                        </tspan>
                        <tspan x="50%" dy="16" fontSize="11" fill={BRAND.gray}>
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

          <Box sx={{ ml: 2, display: "flex", flexDirection: "column", gap: 0.75, flex: 1, overflow: "hidden" }}>
            {data.map((d) => (
              <Box
                key={d.name}
                sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}
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
                <Typography variant="body2" sx={{ color: BRAND.dark, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.name}
                </Typography>
                <Typography variant="body2" sx={{ color: BRAND.gray, fontWeight: 600 }}>
                  {d.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
}

export default function FleetComposition({ results, loading }) {
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

  const osData = Array.isArray(osRaw)
    ? osRaw
        .map((row) => ({
          name: row.os_platform ?? row.name ?? row.platform ?? "Unknown",
          value: Number(row.host_count ?? row.count ?? row.value ?? 0),
          color: null
        }))
        .filter((x) => x.value > 0)
    : [];

  const osColors = [BRAND.teal, BRAND.dark, BRAND.cyan, BRAND.gray];
  const osDataColored = osData.map((d, i) => ({
    ...d,
    color: osColors[i % osColors.length]
  }));

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

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <DonutCard
          title="OS platform"
          data={osDataColored}
          loading={loading}
          totalLabel="devices"
          fallbackLabel="No platform breakdown available"
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <AgentVersionDonut
          byVersion={byVersion}
          latestMap={latestMap}
          loading={loading}
        />
      </Grid>
    </Grid>
  );
}
