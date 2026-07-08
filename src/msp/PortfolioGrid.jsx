// src/msp/PortfolioGrid.jsx
//
// The reusable child-card grid (F1). Renders one card per portfolio item
// — an MSP card (vendor level) or a client card (MSP level). Same
// component, two levels: the only difference is the childCount chip on
// MSP cards and the click behavior the parent wires via onSelect.
//
// Each card shows the four locked metrics: Devices, Online%, Alerts,
// Compliance% (see docs/MSP_PLATFORM_SPEC.md). Missing roll-up data
// (tenant never swept) renders as "—" rather than a misleading 0.

import * as React from "react";
import { Box, Chip, Grid, Stack, Typography } from "@mui/material";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import SectionPaper from "../components/common/SectionPaper";
import { BRAND } from "../theme/brand";

function MetricChip({ label, value, tone = "neutral" }) {
  const tones = {
    neutral: { bg: BRAND.darkSoft, fg: BRAND.dark },
    teal: { bg: BRAND.tealSoft, fg: BRAND.tealText },
    good: { bg: BRAND.alert.successSoft, fg: BRAND.alert.success },
    warn: { bg: BRAND.alert.warningSoft, fg: BRAND.alert.warning },
    bad: { bg: BRAND.alert.errorSoft, fg: BRAND.alert.error },
  };
  const s = tones[tone] || tones.neutral;
  return (
    <Chip
      label={`${label}: ${value}`}
      size="small"
      sx={{ bgcolor: s.bg, color: s.fg, fontWeight: 700, fontSize: 11 }}
    />
  );
}

// Compliance tone: green ≥90, amber ≥70, red below.
function complianceTone(pct) {
  if (pct == null) return "neutral";
  if (pct >= 90) return "good";
  if (pct >= 70) return "warn";
  return "bad";
}
// Alerts tone: green 0, amber 1-4, red 5+.
function alertsTone(n) {
  if (n == null) return "neutral";
  if (n === 0) return "good";
  if (n < 5) return "warn";
  return "bad";
}

const dash = (v) => (v == null ? "—" : v);

function PortfolioCard({ item, onSelect }) {
  const isMsp = item.tenantType === "msp";
  return (
    <SectionPaper
      variant="panel"
      hoverable
      onClick={() => onSelect?.(item)}
      sx={{ cursor: "pointer", height: "100%" }}
    >
      <Stack sx={{ p: 2, height: "100%" }} spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 36, height: 36, borderRadius: 1.5,
              display: "flex", alignItems: "center", justifyContent: "center",
              bgcolor: BRAND.tealSoft, color: BRAND.tealText, flexShrink: 0,
            }}
          >
            {isMsp ? <BusinessOutlinedIcon fontSize="small" /> : <DevicesOutlinedIcon fontSize="small" />}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              sx={{ fontWeight: 800, color: BRAND.dark, lineHeight: 1.1, wordBreak: "break-word" }}
            >
              {item.name || `Tenant ${item.tenantId}`}
            </Typography>
            {isMsp ? (
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                {dash(item.childCount)} {item.childCount === 1 ? "client" : "clients"}
              </Typography>
            ) : (
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                Tenant #{item.tenantId}
              </Typography>
            )}
          </Box>
          <ArrowForwardOutlinedIcon sx={{ color: BRAND.gray, fontSize: 18, flexShrink: 0 }} />
        </Stack>

        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: "auto" }}>
          <MetricChip label="Devices" value={dash(item.deviceCount)} tone="neutral" />
          <MetricChip
            label="Online"
            value={item.onlinePct == null ? "—" : `${item.onlinePct}%`}
            tone="teal"
          />
          <MetricChip label="Alerts" value={dash(item.openAlerts)} tone={alertsTone(item.openAlerts)} />
          <MetricChip
            label="Compliance"
            value={item.compliancePct == null ? "—" : `${item.compliancePct}%`}
            tone={complianceTone(item.compliancePct)}
          />
        </Box>
      </Stack>
    </SectionPaper>
  );
}

export default function PortfolioGrid({ items, onSelect, emptyLabel }) {
  if (!items || items.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <Typography sx={{ color: BRAND.gray }}>
          {emptyLabel || "Nothing to show yet."}
        </Typography>
      </Box>
    );
  }
  return (
    <Grid container spacing={2} alignItems="stretch">
      {items.map((item) => (
        <Grid key={item.tenantId} size={{ xs: 12, sm: 6, lg: 4 }}>
          <PortfolioCard item={item} onSelect={onSelect} />
        </Grid>
      ))}
    </Grid>
  );
}
