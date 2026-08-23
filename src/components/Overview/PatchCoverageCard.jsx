// src/components/Overview/PatchCoverageCard.jsx
//
// Donut card that buckets devices by "how recently did they install a
// patch". Uses the `patchSummary` field already returned by
// /api/v1/security/compliance/devices — no new backend endpoint.
//
// Buckets match the thresholds agreed with Security Compliance:
//   ≤30d      → Recent       (green)
//   31–90d    → Aging        (amber)
//   >90d      → Stale        (red)
//   no data   → Unknown      (gray)
//
// The same thresholds drive the `PatchChip` in the device table, so
// the dashboard reads consistently with the drilldown.

import { useMemo } from "react";
import { Paper, Box, Typography, Skeleton } from "@mui/material";
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

function daysSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function bucketOf(patchSummary) {
  // Aligns with patchRecencyRole in SecurityCompliance.jsx:
  //   <=30d green, 31-90d amber, >90d red, null = red "unknown".
  // Kept identical by intent, not by import, because the two pages
  // hang off different component trees and pulling a shared util out
  // wasn't worth the churn.
  const days = daysSince(patchSummary?.lastInstalledAtUtc);
  if (days == null) return "unknown";
  if (days <= 30) return "recent";
  if (days <= 90) return "aging";
  return "stale";
}

export default function PatchCoverageCard({ result, loading, onNavigate }) {
  const posture = getValue(result);
  const items = Array.isArray(posture?.items) ? posture.items : [];

  const buckets = useMemo(() => {
    const counts = { recent: 0, aging: 0, stale: 0, unknown: 0 };
    for (const row of items) {
      const b = bucketOf(row?.patchSummary);
      counts[b] += 1;
    }
    return counts;
  }, [items]);

  const data = [
    { name: "≤30d",   value: buckets.recent,  color: ROLE.positive },
    { name: "31–90d", value: buckets.aging,   color: ROLE.caution },
    { name: ">90d",   value: buckets.stale,   color: ROLE.critical },
    { name: "Unknown", value: buckets.unknown, color: BRAND.gray }
  ].filter((x) => x.value > 0);

  const total = items.length;

  const interactive = typeof onNavigate === "function";
  const navigate = () => onNavigate?.("ad");

  return (
    <Paper
      elevation={0}
      onClick={interactive ? navigate : undefined}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        "&:hover": interactive
          ? { borderColor: BRAND.teal, boxShadow: "0 4px 12px rgba(59,64,77,0.08)" }
          : undefined
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{ color: BRAND.dark, fontWeight: 700, mb: 1.5 }}
      >
        Patch coverage
        <Typography
          component="span"
          variant="caption"
          sx={{ color: BRAND.gray, ml: 0.75, fontWeight: 500 }}
        >
          (SCP-enabled)
        </Typography>
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
          <Typography variant="caption">
            {total === 0
              ? "No compliance data yet"
              : "No patch data reported"}
          </Typography>
        </Box>
      ) : (
        // Stacked layout — matches the FleetComposition donuts so the
        // three cards in Row 3 read as a visual unit.
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
                      <text
                        x="50%"
                        y="50%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan x="50%" dy="-2" fontSize="16" fontWeight="800" fill={BRAND.dark}>
                          {total}
                        </tspan>
                        {/* "scanned", not "SCP devices": this counts
                            devices with a completed compliance scan —
                            a device can check in and even finish its
                            inventory scan before SCP runs, so this total
                            can legitimately differ from the other two
                            donuts in this row. */}
                        <tspan x="50%" dy="14" fontSize="10" fill={BRAND.gray}>
                          scanned
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
            {data.map((d) => (
              <Box
                key={d.name}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  minWidth: 0,
                  px: 0.5,
                  mx: -0.5,
                  borderRadius: 1
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
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
