// src/components/patch-management/EmergencyInstallChoice.jsx
//
// ADR-0038 D6 — a zero-day cannot wait for Saturday night. "Install now"
// skips the maintenance window ON PURPOSE: it needs a reason, the reason is
// audited, and the job carries it so the delivery-time window check lets it
// through. Snapshots, blocked patches and the post-patch check still apply.

import * as React from "react";
import { Box, FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";


export default function EmergencyInstallChoice({ checked, reason, onChange }) {
  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}>
      <FormControlLabel
        control={<Switch checked={checked} onChange={(e) => onChange({ checked: e.target.checked, reason })} inputProps={{ "aria-label": "Emergency: install now, outside the maintenance window" }} />}
        label={<Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>Emergency: install now, outside the maintenance window</Typography>}
      />
      {checked ? (
        <>
          <TextField
            size="small"
            label="Why it cannot wait (required)"
            value={reason}
            onChange={(e) => onChange({ checked, reason: e.target.value })}
            fullWidth
            inputProps={{ maxLength: 300 }}
            sx={{ mt: 1 }}
          />
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.warningText, mt: 0.5 }}>
            Goes out now, in office hours if that is now. Recorded in the audit log with your reason. Snapshots and the post-patch
            check still apply.
          </Typography>
        </>
      ) : null}
    </Box>
  );
}
