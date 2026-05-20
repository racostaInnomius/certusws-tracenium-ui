import React from "react";
import { Box, Typography } from "@mui/material";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Legend,
  Tooltip,
  Cell,
} from "recharts";

// Stable per-vendor color map. The backend (dashboard.service.ts:
// PRINTER_VENDOR_CASE_SQL) classifies each device_printers row into
// one of these 15 known vendors, "Other", or "Unknown". By mapping
// each vendor to a FIXED hex we get visual consistency across
// refreshes (HP is always teal, Brother always slate) instead of
// the previous behavior where colors drifted with rank — HP being
// the largest slice today and the 3rd-largest tomorrow would flip
// it from teal to navy, making the donut look like a different
// chart every refresh.
//
// Palette stays inside the Tracenium brand range (teals + slates +
// cyans). Brand-real vendor colors (HP's signature blue, Canon's
// red) are intentionally NOT used — it'd clash with the dashboard's
// teal-heavy theme and make the chart pop incongruously next to
// neighboring components.
const KNOWN_VENDOR_COLORS = {
  HP:               "#2F8F8A",
  Brother:          "#113634",
  Epson:            "#3DC2AE",
  Canon:            "#1C5950",
  Xerox:            "#05B0FA",
  Lexmark:          "#277C6F",
  "Konica Minolta": "#013146",
  Ricoh:            "#329F8F",
  Kyocera:          "#3DC2C2",
  Samsung:          "#02A9CF",
  Dell:             "#1D5956",
  OKI:              "#5DE0FD",
  Toshiba:          "#0284A2",
  Sharp:            "#60CDBD",
  Panasonic:        "#44DBE9",
};

// Catch-all categories from PRINTER_VENDOR_CASE_SQL. Both render as
// neutral grays so they don't visually compete with the named-brand
// slices — even when "Other" is large, the operator's eye should
// land on the actual brands first because those are actionable
// (HP fleet refresh, Canon driver standardization, etc.) while
// Other/Unknown are noise/data-quality issues.
const OTHER_COLOR   = "#A8B0B5"; // neutral mid-gray, slightly cool
const UNKNOWN_COLOR = "#D0D5D8"; // lighter — even less attention-grabbing

// Fallback for any future vendor name the backend's CASE WHEN might
// emit that's not in KNOWN_VENDOR_COLORS yet (e.g., a 16th vendor
// added to the SQL but not propagated here). Positional from this
// muted palette so it gets SOME color, just not a brand-prominent
// one.
const FALLBACK_COLORS = ["#8FEAF2", "#30D7FD", "#03CFFC", "#0372A1", "#5FCDFC"];

function getVendorColor(name, fallbackIndex) {
  if (name === "Other") return OTHER_COLOR;
  if (name === "Unknown") return UNKNOWN_COLOR;
  return (
    KNOWN_VENDOR_COLORS[name] ||
    FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
  );
}

// Push "Other" + "Unknown" to the end of the legend regardless of
// their count, so the visual scan goes: named brands (high-value)
// first, catch-alls last. Within each group we still sort by count
// descending so the biggest brand leads the named section.
function vendorSortKey(name) {
  if (name === "Unknown") return 2;
  if (name === "Other") return 1;
  return 0;
}

function normalizeVendors(printersByVendor) {
  const rows = Array.isArray(printersByVendor) ? printersByVendor : [];

  return rows
    .map((r) => {
      const name = (r?.vendor ?? "Unknown") || "Unknown";
      const value = Number(r?.printer_count ?? r?.count ?? 0) || 0;
      return { name, value };
    })
    .filter((x) => x.value > 0)
    .sort((a, b) => {
      const groupDiff = vendorSortKey(a.name) - vendorSortKey(b.name);
      if (groupDiff !== 0) return groupDiff;
      return b.value - a.value;
    });
}

// Custom tooltip — Recharts' default just shows "name: value" with
// no percentage or visual weight, which is functionally fine but
// looks bare next to other dashboard tooltips that include
// share-of-total. Compute % client-side from the slice's value vs
// the donut's total.
function VendorTooltip({ active, payload, total }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const value = Number(entry?.value ?? 0);
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        px: 1.25,
        py: 0.75,
        boxShadow: 2,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <Box sx={{ fontWeight: 700 }}>{entry?.name}</Box>
      <Box sx={{ color: "text.secondary" }}>
        {value} printer{value === 1 ? "" : "s"} · {pct}%
      </Box>
    </Box>
  );
}

export default function PrintersByVendorPie({ printersByVendor }) {
  const data = normalizeVendors(printersByVendor);
  const total = data.reduce((sum, x) => sum + x.value, 0);

  // Pre-compute the fallback index that getVendorColor needs for
  // unknown-to-this-component vendor names. Iterating over `data`
  // with the index passed in keeps coloring deterministic across
  // re-renders (same data → same colors).
  let fallbackCursor = 0;

  // Altura garantizada para que Recharts no quede en width/height -1
  return (
    <Box sx={{ height: "100%", minHeight: 220, display: "flex", flexDirection: "column" }}>
      <Typography sx={{ fontWeight: 600, mb: 1 }}>
        Printers by Vendor
      </Typography>

      <Box sx={{ flex: 1, minHeight: 180 }}>
        {data.length === 0 ? (
          <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: "text.secondary" }}>
            No data
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<VendorTooltip total={total} />} />
              <Legend
                verticalAlign="middle"
                align="right"
                layout="vertical"
                iconType="circle"
                formatter={(value) => (
                  <span style={{ color: "black", fontWeight: 500 }}>{value}</span>
                )}
              />

              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="0%"
                outerRadius="89%"
                paddingAngle={0}
                stroke="transparent"
                labelLine={false}
              >
                {data.map((d, i) => {
                  // Only advance the fallback cursor when we actually
                  // USE a fallback color — keeps mappings predictable
                  // even when adding/removing named vendors.
                  let color;
                  if (d.name === "Other") color = OTHER_COLOR;
                  else if (d.name === "Unknown") color = UNKNOWN_COLOR;
                  else if (KNOWN_VENDOR_COLORS[d.name]) color = KNOWN_VENDOR_COLORS[d.name];
                  else color = getVendorColor(d.name, fallbackCursor++);
                  return <Cell key={i} fill={color} />;
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}