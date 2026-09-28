// src/components/Alerts/CriteriaFieldInputs.jsx
//
// Los controles de un criterio, a partir de los campos declarados en
// `criteriaFields.js`. Lo usan el editor de una regla existente
// (`RuleCriteriaEditor`) y el formulario de una regla nueva
// (`NewRuleDialog`): antes el render vivía dentro del editor, y el
// formulario habría sido una segunda copia del mismo `map`.

import * as React from "react";
import { Box, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

export default function CriteriaFieldInputs({ fields, values, errors = {}, busy = false, onChange }) {
  const set = (key, value) => onChange({ ...values, [key]: value });
  return (
    <Stack spacing={1.5}>
      {fields.map((f) =>
        f.type === "number" ? (
          <TextField
            key={f.key}
            size="small"
            type="number"
            label={f.label}
            value={values[f.key]}
            onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value))}
            disabled={busy}
            error={Boolean(errors[f.key])}
            helperText={errors[f.key] || f.help}
            inputProps={{ min: f.min, max: f.max, step: 1, "aria-label": f.label }}
            sx={{ maxWidth: 420 }}
          />
        ) : f.type === "choice" ? (
          <TextField
            key={f.key}
            select
            size="small"
            label={f.label}
            value={values[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
            disabled={busy}
            helperText={f.help}
            slotProps={{ htmlInput: { "aria-label": f.label } }}
            sx={{ maxWidth: 420 }}
          >
            {f.choices.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <Box key={f.key}>
            <FormControlLabel
              control={
                <Switch
                  checked={values[f.key] === true}
                  onChange={(e) => set(f.key, e.target.checked)}
                  disabled={busy}
                  slotProps={{ input: { "aria-label": f.label } }}
                />
              }
              label={<Typography sx={{ fontSize: TEXT.sm }}>{f.label}</Typography>}
            />
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, ml: 6 }}>{f.help}</Typography>
          </Box>
        )
      )}
    </Stack>
  );
}
