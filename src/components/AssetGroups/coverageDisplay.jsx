// src/components/AssetGroups/coverageDisplay.jsx
//
// Small display primitives for the Asset Groups page, extracted from the
// AssetGroups god-component: number/percent formatters with coverage-domain
// fallbacks ("0%" / "0" for non-finite), the coverage tone/palette mapping,
// and the static-vs-dynamic KindChip. All pure/presentational and self-
// contained. The formatters keep their coverage-specific "0" fallback rather
// than reusing src/utils/format (whose missing→"—" semantics would be wrong
// for a coverage percentage).

import * as React from "react";
import { Chip } from "@mui/material";
import { BRAND, ROLE } from "../../theme/brand";

export function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n)}%`;
}

export function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US").format(n);
}

export function getCoverageTone(coverage) {
  const ungrouped = Number(coverage?.ungroupedDevices || 0);
  if (ungrouped <= 0) return "success";
  const percent = Number(coverage?.coveragePercent || 0);
  if (percent >= 85) return "info";
  if (percent >= 60) return "warning";
  return "critical";
}

export function getCoveragePalette(tone) {
  // Keep the coverage notice shell consistent with Tracenium chrome.
  // Status severity is expressed only by the "X% covered" chip text,
  // so the card never turns red/yellow and does not visually alarm the
  // operator unless they read the actual coverage value.
  if (tone === "success") {
    return { color: ROLE.positive };
  }
  if (tone === "critical") {
    return { color: ROLE.critical };
  }
  if (tone === "warning") {
    return { color: ROLE.caution };
  }
  return { color: BRAND.tealText };
}

export function KindChip({ kind }) {
  if (kind === "dynamic") {
    return (
      <Chip
        size="small"
        label="Dynamic"
        sx={{
          bgcolor: BRAND.cyanSoft,
          color: BRAND.dark,
          fontWeight: 700,
          border: `1px solid ${BRAND.cyan}88`,
        }}
      />
    );
  }
  return (
    <Chip
      size="small"
      label="Static"
      sx={{
        bgcolor: BRAND.tealSoft,
        color: BRAND.tealText,
        fontWeight: 700,
        border: `1px solid ${BRAND.teal}55`,
      }}
    />
  );
}
