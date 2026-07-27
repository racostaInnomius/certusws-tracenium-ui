// src/components/Policies/IntervalScheduleCard.jsx
//
// One collection-interval card in the PolicyForm — deduped from four
// near-identical inline blocks (inventory / compliance / patch / update). A
// labeled numeric field over form[formKey].intervalSeconds with range
// validation; blank clears the value (null) so policyTransforms omits the
// block and the backend default applies. Props-driven; the parent owns the
// per-card copy (title/label/bounds/step/tint) and the render gate.

import * as React from "react";
import { Box, TextField, Typography } from "@mui/material";
import { BRAND } from "../../theme/brand";

export default function IntervalScheduleCard({
  form,
  onChange,
  readOnly = false,
  formKey,
  title,
  label,
  min,
  max,
  step,
  helperText,
  bgcolor = BRAND.surfaceMuted,
  titleColor = BRAND.dark,
}) {
  const rawValue = form?.[formKey]?.intervalSeconds;
  const displayValue =
    rawValue === null || rawValue === undefined || rawValue === ""
      ? ""
      : String(rawValue);
  const numeric = Number(rawValue);
  const outOfRange =
    rawValue !== null &&
    rawValue !== undefined &&
    rawValue !== "" &&
    (!Number.isFinite(numeric) || numeric < min || numeric > max);

  return (
    <Box
      sx={{
        mt: 2,
        p: 1.5,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 2,
        bgcolor,
      }}
    >
      <Typography
        variant="overline"
        sx={{ color: titleColor, fontWeight: 800, letterSpacing: 1.2 }}
      >
        {title}
      </Typography>
      <TextField
        label={label}
        type="number"
        size="small"
        fullWidth
        value={displayValue}
        onChange={(e) => {
          const raw = e.target.value;
          const next = raw === "" ? null : Number(raw);
          onChange({
            ...form,
            [formKey]: { ...(form[formKey] || {}), intervalSeconds: next },
          });
        }}
        disabled={readOnly}
        inputProps={{ min, max, step }}
        error={outOfRange}
        helperText={
          outOfRange ? `Must be between ${min} and ${max} seconds` : helperText
        }
        sx={{ mt: 1, bgcolor: "#ffffff", borderRadius: 1 }}
      />
    </Box>
  );
}
