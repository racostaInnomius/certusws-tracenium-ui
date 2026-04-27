// src/components/Overview/PluginCoverageStrip.jsx
//
// Compact horizontal stat block that sits inside the Fleet composition
// row and shows "how many of the N enrolled agents have plugin X
// enabled" — one row per plugin. Answers the operator's question "do
// my devices have SCP / PMP / AMP turned on?" without having to drill
// into each device.
//
// Data comes from /api/v1/dashboard/plugin-coverage:
//   { total: 4, byPlugin: [{ plugin: "scp", count: 3 }, ...] }
//
// The layout is a mini progress-bar-per-plugin. We deliberately do NOT
// render it as a donut/pie — the operator cares about "how close to
// 100% is each plugin", a direction that bars convey instantly. Pie
// slices for three separate plugins would force the reader to compare
// arc lengths, which is slower.

import { Paper, Box, Stack, Typography, Skeleton, LinearProgress, Tooltip } from "@mui/material";
import { BRAND, ROLE } from "../../theme/brand";

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

// Plugin display metadata. Ordered intentionally — SCP first because
// it's the compliance-story plugin we surface most, PMP second for
// patching, AMP third for inventory. A plugin the backend reports
// that we don't have metadata for still renders (generic label).
const PLUGIN_META = {
  scp: { label: "SCP · Compliance" },
  pmp: { label: "PMP · Patching" },
  amp: { label: "AMP · Inventory" }
};

// Enablement rate color. 100% green, >50% teal, <50% amber, 0% red.
function colorForRate(rate) {
  if (rate >= 1) return ROLE.positive;
  if (rate >= 0.5) return BRAND.teal;
  if (rate > 0) return ROLE.caution;
  return ROLE.critical;
}

export default function PluginCoverageStrip({ result, loading }) {
  const value = getValue(result);
  const total = Number(value?.total ?? 0);
  const byPlugin = Array.isArray(value?.byPlugin) ? value.byPlugin : [];

  // Build a row for each known plugin even if the backend omitted it
  // (count = 0). That way the UI is deterministic — always shows SCP,
  // PMP, AMP — and "agent has no plugins on" reads as explicit zeros
  // rather than an empty strip.
  const rows = Object.keys(PLUGIN_META).map((key) => {
    const found = byPlugin.find((r) => String(r.plugin).toLowerCase() === key);
    return {
      key,
      label: PLUGIN_META[key].label,
      count: Number(found?.count ?? 0)
    };
  });

  // Append any unknown plugins the backend reported but we don't have
  // metadata for — they still render with a generic label.
  for (const row of byPlugin) {
    const key = String(row.plugin).toLowerCase();
    if (!PLUGIN_META[key]) {
      rows.push({
        key,
        label: key.toUpperCase(),
        count: Number(row.count ?? 0)
      });
    }
  }

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
      <Stack direction="row" alignItems="baseline" sx={{ mb: 1.5, gap: 0.75 }}>
        <Typography
          variant="subtitle2"
          sx={{ color: BRAND.dark, fontWeight: 700 }}
        >
          Plugin coverage
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 500 }}>
          across {total} enrolled
        </Typography>
      </Stack>

      {loading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={22} />
          ))}
        </Stack>
      ) : total === 0 ? (
        <Typography variant="caption" sx={{ color: BRAND.gray }}>
          No agents reporting yet.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {rows.map((row) => {
            const rate = total > 0 ? row.count / total : 0;
            const color = colorForRate(rate);
            return (
              <Tooltip
                key={row.key}
                title={`${row.count} of ${total} agents have ${row.key.toUpperCase()} enabled`}
                placement="top"
                arrow
              >
                <Box>
                  <Stack
                    direction="row"
                    alignItems="baseline"
                    justifyContent="space-between"
                    sx={{ mb: 0.25 }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ color: BRAND.dark, fontWeight: 600, fontSize: 12.5 }}
                    >
                      {row.label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color, fontWeight: 700 }}
                    >
                      {row.count}/{total}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={Math.round(rate * 100)}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: BRAND.surfaceMuted,
                      "& .MuiLinearProgress-bar": {
                        backgroundColor: color,
                        borderRadius: 3
                      }
                    }}
                  />
                </Box>
              </Tooltip>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
