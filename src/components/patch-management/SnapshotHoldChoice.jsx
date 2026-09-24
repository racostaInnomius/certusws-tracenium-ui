// src/components/patch-management/SnapshotHoldChoice.jsx
//
// «Keep the snapshot until I validate» en los diálogos de instalar parches
// (P1, 23-sep-2026). Sólo aplica a VMs detrás de un Infrastructure Gateway; en
// el resto no hay snapshot que conservar, y así lo dice.

import React from "react";
import { Box, FormControlLabel, Switch, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { describeSnapshotHold } from "./bulkInstallOutcome";

export default function SnapshotHoldChoice({ checked, onChange }) {
  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}>
      <FormControlLabel
        control={
          <Switch
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            inputProps={{ "aria-label": "Keep the snapshot until I validate" }}
          />
        }
        label={
          <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
            Keep the snapshot until I validate
          </Typography>
        }
      />
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5 }}>
        {describeSnapshotHold(checked)}
      </Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 0.5 }}>
        Only for VMs behind an Infrastructure Gateway — other devices get no snapshot.
      </Typography>
    </Box>
  );
}
