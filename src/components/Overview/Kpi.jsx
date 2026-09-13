// src/components/Overview/Kpi.jsx
//
// KPI card primitives shared by every Overview block. Reuses the SummaryCard
// visual pattern; kept here so the blocks (HeroKpis, SecurityKpis) don't each
// carry a copy.

import { Box, Grid, Paper, Skeleton, Stack, Typography, Tooltip } from "@mui/material";
import { BRAND } from "../../theme/brand";

/**
 * Tiny inline sparkline (no chart lib). Takes an array of numbers and
 * renders a polyline + area under the curve, sized to fit a KPI card.
 * Kept dependency-free so adding sparklines to other KPIs later only
 * needs data — no Recharts instantiation overhead per card.
 */
function Sparkline({ points = [], color = BRAND.teal, height = 24 }) {
  if (!Array.isArray(points) || points.length < 2) return null;

  const w = 64;
  const h = height;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;

  // Map each point to an (x, y) in the SVG viewBox.
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / span) * (h - 2) - 1;
    return [x, y];
  });

  const linePath = coords.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={areaPath} fill={color} opacity={0.15} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Kpi({ title, value, subtitle, icon: Icon, accent, tint, loading, onClick, sparkline }) {
  // The card becomes a button only when a target is wired. That way
  // "dead" KPIs (no drilldown yet) don't show a pointer cursor or
  // invite clicks that do nothing — a worse UX than being visibly
  // static.
  const interactive = typeof onClick === "function";

  const content = (
    <>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tint,
            color: accent,
            flexShrink: 0
          }}
        >
          <Icon fontSize="small" />
        </Box>
        <Typography
          variant="body2"
          sx={{ color: BRAND.dark, fontWeight: 600, lineHeight: 1.2 }}
        >
          {title}
        </Typography>
      </Stack>

      {loading ? (
        <Skeleton variant="text" width={90} height={40} />
      ) : (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography
            variant="h4"
            sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.1, flex: 1 }}
          >
            {value}
          </Typography>
          {sparkline && sparkline.length >= 2 ? (
            // Small inline trend for the last-N-days window. Color
            // inherits the KPI's accent so it reads as the same
            // signal at a glance (no "is this a different metric?"
            // confusion).
            <Tooltip title={`Trend · last ${sparkline.length} days`} arrow>
              <Box sx={{ flexShrink: 0 }}>
                <Sparkline points={sparkline} color={accent} />
              </Box>
            </Tooltip>
          ) : null}
        </Stack>
      )}

      {subtitle != null && !loading && (
        <Typography variant="caption" sx={{ color: BRAND.tealText, fontWeight: 500 }}>
          {subtitle}
        </Typography>
      )}
    </>
  );

  return (
    <Paper
      elevation={0}
      component={interactive ? "button" : "div"}
      onClick={interactive ? onClick : undefined}
      type={interactive ? "button" : undefined}
      sx={{
        p: 2,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "left",
        gap: 1.25,
        // Native <button> resets we need once the Paper becomes
        // interactive — otherwise MUI's default button styling (font
        // family, background) bleeds through.
        backgroundColor: BRAND.surface,
        backgroundImage: "none",
        font: "inherit",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease",
        "&:hover": interactive
          ? {
              borderColor: BRAND.teal,
              transform: "translateY(-1px)",
              boxShadow: "0 4px 12px rgba(59,64,77,0.08)"
            }
          : { borderColor: BRAND.borderStrong }
      }}
    >
      {content}
    </Paper>
  );
}

/**
 * A row of KPI cards that fills the width whatever the count. Blocks carry
 * a different number of cards per plan (block 1 has no SDP card on a tenant
 * with no subscription row), and a fixed `lg: 2` left a hole where the
 * missing card would have gone.
 */
export function KpiRow({ cards, loading }) {
  return (
    <Grid container spacing={2}>
      {cards.map((card) => (
        <Grid key={card.title} size={{ xs: 12, sm: 6, md: 4, lg: "grow" }}>
          <Kpi {...card} loading={loading} />
        </Grid>
      ))}
    </Grid>
  );
}

