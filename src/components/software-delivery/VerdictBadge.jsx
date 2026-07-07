// src/components/software-delivery/VerdictBadge.jsx
//
// Security-verdict chip for an SDP intake. Maps the deterministic integrity
// gate's verdict (verified / warn / blocked) to a brand-coloured badge.
//   * verified → green   (signed + clean reputation + hash ok)
//   * warn     → amber    (unsigned / no threat-intel — needs an operator ack)
//   * blocked  → red      (hash mismatch / flagged malware — never distributable)

import * as React from "react";
import { Chip } from "@mui/material";
import { BRAND } from "../../theme/brand";

const VERDICTS = {
  verified: { label: "Verified", bg: BRAND.alert?.successSoft, color: BRAND.alert?.success },
  warn: { label: "Needs review", bg: BRAND.alert?.warningSoft, color: BRAND.alert?.warning },
  blocked: { label: "Blocked", bg: BRAND.alert?.errorSoft, color: BRAND.alert?.error },
};

export default function VerdictBadge({ verdict, size = "small" }) {
  const v = VERDICTS[verdict] || {
    label: verdict || "unknown",
    bg: BRAND.darkSoft,
    color: BRAND.gray,
  };
  return (
    <Chip
      label={v.label}
      size={size}
      sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: v.bg, color: v.color }}
    />
  );
}
