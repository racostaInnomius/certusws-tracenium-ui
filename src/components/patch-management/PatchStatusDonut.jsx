// src/components/patch-management/PatchStatusDonut.jsx
//
// «How much of the fleet is actually done?» — the Status column of the devices
// table, counted, next to the Start here queue (where there was empty space).
//
// ⚠️ COLOUR IS THE SECOND ENCODING, NEVER THE FIRST. Every band is named with
// its count in the legend, so the donut is readable without distinguishing the
// hues. The critical fill is `errorText` (#B23A33) rather than the soft red for
// the reason InstallsOverTimeChart documents: soft red against the positive
// green separates by ΔE 3.1 for a deuteranope, which is no separation at all.

import * as React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { Cell, Pie, PieChart } from "recharts";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { patchStatusChartData } from "./patchStatusChart";

const FILL = {
  positive: ROLE.positive,
  caution: ROLE.caution,
  critical: BRAND.alert.errorText,
  info: BRAND.teal,
  muted: BRAND.gray,
};

export default function PatchStatusDonut({ statusBreakdown, size = 148 }) {
  const data = React.useMemo(() => patchStatusChartData(statusBreakdown), [statusBreakdown]);

  if (data.reporting === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>Fleet patch status</Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5 }}>
          No device has reported its patch status yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark, mb: 1 }}>
        Fleet patch status
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
          <PieChart width={size} height={size}>
            <Pie
              data={data.segments}
              dataKey="value"
              nameKey="label"
              innerRadius={size * 0.32}
              outerRadius={size * 0.48}
              paddingAngle={1}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              stroke={BRAND.surface}
            >
              {data.segments.map((s) => (
                <Cell key={s.key} fill={FILL[s.tone] ?? BRAND.gray} />
              ))}
            </Pie>
          </PieChart>
          {/* El dato que se busca, en el centro y en palabras. */}
          <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark, lineHeight: 1 }}>
              {data.patchedPct}%
            </Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>fully patched</Typography>
          </Box>
        </Box>

        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, minWidth: 150 }}>
          {data.segments.map((s) => (
            <Box component="li" key={s.key} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.25 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: FILL[s.tone] ?? BRAND.gray, flexShrink: 0 }} />
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, flex: 1 }}>{s.label}</Typography>
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{s.value}</Typography>
            </Box>
          ))}
        </Box>
      </Stack>

      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 1 }}>
        {data.patched} of {data.reporting} reporting devices
        {data.notKnown > 0 ? (
          <Tooltip
            arrow
            placement="top"
            title="A failed scan arrives with no pending patches, and an inventory-only device never ran one. Neither is evidence the device is patched."
          >
            <Box component="span" sx={{ cursor: "help", borderBottom: `1px dotted ${BRAND.gray}`, ml: 0.5 }}>
              · {data.notKnown} not known to be patched
            </Box>
          </Tooltip>
        ) : null}
      </Typography>
    </Box>
  );
}
