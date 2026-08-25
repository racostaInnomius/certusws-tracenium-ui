// src/components/Overview/RecentActivity.jsx
//
// Two thin tables side by side: "Recent hosts" (using /dashboard/hosts
// data we already fetched) and "Recent jobs" (using the same 7-day
// timeseries aggregation — we slice the latest bucket to show today's
// activity; for a real "last N jobs" view we'd want a dedicated
// endpoint, but this is good-enough-for-now Overview content and
// avoids one more backend round-trip on initial page load).
//
// Both tables stay to 5 rows max and link the footer to the full page.

import {
  Paper,
  Grid,
  Typography,
  Box,
  Stack,
  Skeleton,
  Link
} from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

function formatRelative(iso) {
  // "2 min ago" / "3h ago" / "Apr 17" — keep super compact so the cell
  // stays narrow on small screens.
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function platformLabel(raw) {
  const v = String(raw || "").toLowerCase();
  if (v.startsWith("win")) return "Windows";
  if (v === "darwin" || v === "macos" || v === "osx") return "macOS";
  if (v === "linux") return "Linux";
  return raw || "—";
}

function RecentHosts({ result, loading, onNavigate }) {
  const data = getValue(result);
  // `/dashboard/hosts` returns a plain JSON array; legacy shapes
  // (items/rows/hosts) also accepted for forward/backward compat.
  const rows = Array.isArray(data)
    ? data
    : (data?.items ?? data?.rows ?? data?.hosts ?? []);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{ color: BRAND.dark, fontWeight: 700, mb: 1.5 }}
      >
        Recent hosts
      </Typography>

      {loading ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={36} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: BRAND.gray,
            py: 2
          }}
        >
          <Typography variant="caption">No hosts yet</Typography>
        </Box>
      ) : (
        <Stack spacing={0.75}>
          {rows.slice(0, 5).map((row, idx) => {
            const hostname =
              row.hostname ??
              row.host_name ??
              row.deviceName ??
              row.agent_id ??
              row.deviceId ??
              "—";
            const platform = platformLabel(
              row.os_platform ?? row.osPlatform ?? row.platform
            );
            // `/dashboard/hosts` doesn't expose agentVersion, only
            // os_version — surface OS version as the secondary label
            // so the row doesn't read "macOS · —" for every host.
            const osVersion = row.os_version ?? row.osVersion ?? null;
            const version =
              row.agentVersion ?? row.agent_version ?? (osVersion ? `OS ${osVersion}` : "—");
            const seen =
              row.lastSeenAt ??
              row.last_seen_at ??
              row.collected_at_utc ??
              row.collectedAtUtc ??
              row.updated_at ??
              row.updatedAt;

            return (
              <Box
                key={row.deviceId ?? row.device_id ?? hostname ?? idx}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  alignItems: "center",
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  borderRadius: 1,
                  "&:hover": { backgroundColor: BRAND.surfaceMuted }
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: BRAND.dark,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {hostname}
                  </Typography>
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    {platform} · {version}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{ color: BRAND.tealText, fontWeight: 500 }}
                >
                  {formatRelative(seen)}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      )}

      <Box sx={{ mt: "auto", pt: 1.5, textAlign: "right" }}>
        <Link
          component="button"
          onClick={() => onNavigate?.("assets")}
          underline="hover"
          sx={{ fontSize: TEXT.sm, color: BRAND.tealText, fontWeight: 600 }}
        >
          View all →
        </Link>
      </Box>
    </Paper>
  );
}

function RecentJobs({ result, loading, onNavigate }) {
  // We get this from the jobs timeseries: the latest bucket (today)
  // tells us "today's activity" in aggregate. It's not a real per-job
  // list — the Overview doesn't need that depth — but it lets the user
  // eyeball "am I getting work done today?" without clicking through.
  const value = getValue(result);
  const buckets = Array.isArray(value?.buckets) ? value.buckets : [];
  const today = buckets[buckets.length - 1] ?? null;
  const yesterday = buckets[buckets.length - 2] ?? null;

  const rows = today
    ? [
        {
          key: "completed",
          label: "Completed today",
          value: today.completed ?? 0,
          color: ROLE.positive,
          bg: ROLE.positiveSoft,
          prev: yesterday?.completed ?? null
        },
        {
          key: "in_flight",
          label: "In flight now",
          value: today.inFlight ?? 0,
          color: BRAND.teal,
          bg: BRAND.tealSoft,
          prev: yesterday?.inFlight ?? null
        },
        {
          key: "failed",
          label: "Failed today",
          value: today.failed ?? 0,
          color: ROLE.critical,
          bg: ROLE.criticalSoft,
          prev: yesterday?.failed ?? null
        }
      ]
    : [];

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{ color: BRAND.dark, fontWeight: 700, mb: 1.5 }}
      >
        Jobs today
      </Typography>

      {loading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={52} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: BRAND.gray,
            py: 2
          }}
        >
          <Typography variant="caption">No job activity</Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {rows.map((r) => {
            const delta =
              r.prev != null ? r.value - r.prev : null;
            return (
              <Box
                key={r.key}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  p: 1.25,
                  borderRadius: 1.5,
                  backgroundColor: r.bg
                }}
              >
                <Typography
                  variant="h5"
                  sx={{ color: r.color, fontWeight: 700, minWidth: 44 }}
                >
                  {r.value}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ color: BRAND.dark, fontWeight: 600, lineHeight: 1.2 }}
                  >
                    {r.label}
                  </Typography>
                  {delta != null && (
                    <Typography
                      variant="caption"
                      sx={{ color: BRAND.gray }}
                    >
                      {delta === 0
                        ? "same as yesterday"
                        : delta > 0
                        ? `+${delta} vs yesterday`
                        : `${delta} vs yesterday`}
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Stack>
      )}

      <Box sx={{ mt: "auto", pt: 1.5, textAlign: "right" }}>
        <Link
          component="button"
          onClick={() => onNavigate?.("jobs")}
          underline="hover"
          sx={{ fontSize: TEXT.sm, color: BRAND.tealText, fontWeight: 600 }}
        >
          View all →
        </Link>
      </Box>
    </Paper>
  );
}

export default function RecentActivity({ results, loading, onNavigate }) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <RecentHosts
          result={results?.recentHosts}
          loading={loading}
          onNavigate={onNavigate}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <RecentJobs
          result={results?.jobsTimeseries}
          loading={loading}
          onNavigate={onNavigate}
        />
      </Grid>
    </Grid>
  );
}
