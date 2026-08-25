// src/components/Overview/HealthDistributionCard.jsx
//
// U3 — fleet health distribution. Buckets every device-with-a-score
// into one of four bands and renders a horizontal bar chart:
//
//   ≥85   → Good       (positive)
//   60-84 → Warning    (caution)
//   <60   → Critical   (critical)
//   no    → Unscored   (gray)
//
// Why bars (not a donut): the existing Overview row already carries
// donuts (FleetComposition, PatchCoverage). Bars give the operator a
// different visual rhythm and read more naturally at a glance:
// "critical" sits at the right and is RED — that's the bar you go to
// first.
//
// Data source: results.devicePosture (the same array PatchCoverageCard
// uses — no extra backend hit). Each row has `overallScore` which we
// bucket client-side.
//
// Clicks navigate to the Security/Compliance page filtered by band
// — the SCP page already accepts ?score-band= (added alongside this
// card; non-matching values fall through to the unfiltered view).

import { useMemo } from "react";
import { Paper, Box, Typography, Skeleton, Stack } from "@mui/material";
import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { scoreBandKey } from "../../theme/scoreBands";
import { useComplianceBands } from "../../hooks/useComplianceBands";

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

// Sprint 2 item 1 — thresholds come from the tenant's configured bands
// (the panel's help text always promised this card obeyed them; now it
// does). bandOf keeps the "unscored" bucket that scoreBandKey models as
// null.
function bandOf(score, bands) {
  return scoreBandKey(score, bands) ?? "unscored";
}

const BANDS = [
  {
    key: "good",
    label: "Good",
    color: ROLE.positive,
    soft: ROLE.positiveSoft,
    filter: "good",
  },
  {
    key: "warning",
    label: "Warning",
    color: ROLE.caution,
    soft: ROLE.cautionSoft,
    filter: "warning",
  },
  {
    key: "critical",
    label: "Critical",
    color: ROLE.critical,
    soft: ROLE.criticalSoft,
    filter: "critical",
  },
  {
    key: "unscored",
    label: "Unscored",
    color: BRAND.gray,
    soft: BRAND.darkSoft,
    filter: "unscored",
  },
];

export default function HealthDistributionCard({
  result,
  loading,
  onNavigate,
}) {
  const posture = getValue(result);
  const items = Array.isArray(posture?.items) ? posture.items : [];
  const bands = useComplianceBands();

  const counts = useMemo(() => {
    const c = { good: 0, warning: 0, critical: 0, unscored: 0 };
    for (const row of items) {
      c[bandOf(row?.overallScore, bands)] += 1;
    }
    return c;
  }, [items, bands]);

  // Range captions follow the configured thresholds.
  const rangeFor = {
    good: `\u2265${bands.goodMin}`,
    warning: `${bands.warningMin}\u2013${bands.goodMin - 1}`,
    critical: `<${bands.warningMin}`,
    unscored: "no data",
  };

  const total = items.length;
  const interactive = typeof onNavigate === "function";

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1.5,
            bgcolor: BRAND.tealSoft,
            color: BRAND.teal,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <HealthAndSafetyOutlinedIcon fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{ color: BRAND.dark, fontWeight: 700 }}
          >
            Health distribution
            <Typography
              component="span"
              variant="caption"
              sx={{ color: BRAND.gray, ml: 0.75, fontWeight: 500 }}
            >
              ({total} devices)
            </Typography>
          </Typography>
        </Box>
      </Stack>

      {loading ? (
        <Skeleton variant="rounded" height={140} />
      ) : total === 0 ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: BRAND.gray,
            minHeight: 140,
          }}
        >
          <Typography variant="caption">No device posture yet</Typography>
        </Box>
      ) : (
        // One row per band. Width of the colored bar = % of total.
        // Even bands with zero devices render an empty slot so the
        // four-row rhythm is consistent across tenants — easier to
        // scan than a card whose row count changes as devices move.
        <Stack spacing={1.25} sx={{ mt: 0.5 }}>
          {BANDS.map((band) => {
            const count = counts[band.key];
            const pct = total > 0 ? (count / total) * 100 : 0;
            const clickable =
              interactive && count > 0 && band.key !== "unscored";
            return (
              <Box
                key={band.key}
                onClick={
                  clickable ? () => onNavigate("ad", { "score-band": band.filter }) : undefined
                }
                sx={{
                  cursor: clickable ? "pointer" : "default",
                  borderRadius: 1,
                  px: 0.5,
                  mx: -0.5,
                  transition: "background-color 120ms ease",
                  "&:hover": clickable
                    ? { backgroundColor: BRAND.tealSoft }
                    : undefined,
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ mb: 0.5 }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: band.color,
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: TEXT.sm,
                      color: BRAND.dark,
                      fontWeight: 600,
                      flex: 1,
                    }}
                  >
                    {band.label}
                    <Typography
                      component="span"
                      sx={{
                        fontSize: TEXT.xs,
                        color: BRAND.gray,
                        ml: 0.5,
                        fontWeight: 500,
                      }}
                    >
                      ({rangeFor[band.key]})
                    </Typography>
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: TEXT.sm,
                      color: BRAND.dark,
                      fontWeight: 700,
                      minWidth: 24,
                      textAlign: "right",
                    }}
                  >
                    {count}
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    height: 6,
                    borderRadius: 1,
                    bgcolor: band.soft,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      height: "100%",
                      // 1% min so a band with one device still shows a
                      // visible sliver instead of vanishing.
                      width: count > 0 ? `${Math.max(pct, 1)}%` : "0%",
                      bgcolor: band.color,
                      transition: "width 200ms ease",
                    }}
                  />
                </Box>
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
