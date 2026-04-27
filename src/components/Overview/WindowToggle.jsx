// src/components/Overview/WindowToggle.jsx
//
// Tiny segmented toggle for "1d / 7d / 30d" time windows. Lives next
// to a chart title and is shared by the Audit and Jobs charts (and
// whatever else wants a window picker later). Kept dumb: it's just a
// controlled button group — the parent owns the state and re-fetches
// when the selection changes.

import { Box, ButtonBase } from "@mui/material";
import { BRAND } from "../../theme/brand";

const OPTIONS = [
  { label: "1d", value: 1 },
  { label: "7d", value: 7 },
  { label: "30d", value: 30 }
];

export default function WindowToggle({ value, onChange, disabled = false }) {
  return (
    <Box
      role="group"
      aria-label="Time window"
      sx={{
        display: "inline-flex",
        border: `1px solid ${BRAND.border}`,
        borderRadius: 1,
        overflow: "hidden",
        bgcolor: BRAND.surface,
        opacity: disabled ? 0.5 : 1
      }}
    >
      {OPTIONS.map((opt, idx) => {
        const active = opt.value === value;
        return (
          <ButtonBase
            key={opt.value}
            onClick={(e) => {
              // Don't bubble into parent card onClicks (chart cards
              // are whole-card clickable → audit/jobs page navigation).
              e.stopPropagation();
              if (!disabled && !active) onChange(opt.value);
            }}
            disabled={disabled}
            sx={{
              px: 1.25,
              py: 0.5,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.3,
              color: active ? BRAND.surface : BRAND.dark,
              bgcolor: active ? BRAND.teal : "transparent",
              borderLeft:
                idx === 0 ? "none" : `1px solid ${BRAND.border}`,
              transition: "background-color 120ms ease",
              "&:hover": {
                bgcolor: active ? BRAND.teal : BRAND.tealSoft
              }
            }}
          >
            {opt.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
