// src/components/software-delivery/IntakeProposalBanner.jsx
//
// The AI proposal's self-assessment for an intake: the model's confidence
// (high/medium/low) + free-text notes flagging anything the operator should
// verify. The backend generates these explicitly to be "surfaced in the UI,
// never auto-applied" — so this banner sits next to the security verdict at the
// top of the review dialog, giving the operator the AI's own caveats before
// they publish. Renders nothing for a blocked / AI-failed intake (no proposal).

import * as React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { BRAND } from "../../theme/brand";

// Low confidence is the loud one — it means "look harder before you publish".
const CONFIDENCE_META = {
  high: { label: "High confidence", bg: BRAND.alert?.successSoft, fg: BRAND.alert?.success },
  medium: { label: "Medium confidence", bg: BRAND.alert?.warningSoft, fg: "#7a5c00" },
  low: { label: "Low confidence", bg: BRAND.alert?.errorSoft, fg: BRAND.alert?.error },
};

export default function IntakeProposalBanner({ intake }) {
  const cfg = intake?.proposedConfig || null;
  if (!cfg) return null; // blocked or AI-failed intake → no proposal to describe

  const conf =
    CONFIDENCE_META[cfg.confidence] || {
      label: cfg.confidence ? `${cfg.confidence} confidence` : "confidence unknown",
      bg: BRAND.darkSoft,
      fg: BRAND.gray,
    };
  const notes = typeof cfg.notes === "string" ? cfg.notes.trim() : "";

  return (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: BRAND.tealSoft, border: `1px solid ${BRAND.border}`, mt: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
        <AutoAwesomeOutlinedIcon sx={{ fontSize: 16, color: BRAND.tealText }} />
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>AI proposal</Typography>
        <Chip
          size="small"
          label={conf.label}
          sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: conf.bg, color: conf.fg }}
        />
        <Typography sx={{ fontSize: 11, color: BRAND.gray }}>
          · review + edit below before publishing; nothing is auto-applied
        </Typography>
      </Stack>
      {notes ? (
        <Typography sx={{ fontSize: 12, color: BRAND.dark, mt: 1 }}>
          <strong>Notes:</strong> {notes}
        </Typography>
      ) : null}
    </Box>
  );
}
