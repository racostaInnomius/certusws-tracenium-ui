// src/components/Compliance/GpoInventory.jsx
//
// ADR-0012 — renders the Computer/User GPO lists the Windows agent already
// collects (gpresult) and the backend now surfaces as evidence on the
// `windows.domain.gpo_inventory_available` finding. Pure presentation — no
// data fetching, same pattern as PatchLevelSection.

import * as React from "react";
import { Box, Chip, Grid, Paper, Stack, Typography } from "@mui/material";
import { BRAND } from "../../theme/brand";

const GPO_INVENTORY_CHECK_ID = "windows.domain.gpo_inventory_available";

function GpoList({ label, gpos }) {
  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <Typography
        variant="caption"
        sx={{ color: BRAND.gray, textTransform: "uppercase", fontWeight: 600, display: "block", mb: 0.5 }}
      >
        {label} ({Array.isArray(gpos) ? gpos.length : 0})
      </Typography>
      {Array.isArray(gpos) && gpos.length > 0 ? (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
          {gpos.map((name, idx) => (
            <Chip
              key={`${name}-${idx}`}
              size="small"
              label={name}
              sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.dark }}
            />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: BRAND.gray }}>
          None applied
        </Typography>
      )}
    </Grid>
  );
}

/**
 * GPO inventory section for the device drawer. Reads the evidence off the
 * `windows.domain.gpo_inventory_available` finding (already present in the
 * drawer's `findings` list — no separate fetch). Renders nothing when the
 * finding isn't there: non-domain-joined devices, non-Windows devices, or
 * an agent on a collector older than 1.0.87.
 */
export function GpoInventorySection({ findings }) {
  const finding = React.useMemo(
    () => (Array.isArray(findings) ? findings.find((f) => f?.checkId === GPO_INVENTORY_CHECK_ID) : null),
    [findings]
  );

  if (!finding) return null;

  const computerGpos = finding.evidence?.appliedComputerGpos;
  const userGpos = finding.evidence?.appliedUserGpos;

  return (
    <Paper
      elevation={0}
      sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }}
    >
      <Typography
        variant="caption"
        sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
      >
        Applied Group Policy Objects
      </Typography>
      <Box>
        <Grid container spacing={1.5}>
          <GpoList label="Computer" gpos={computerGpos} />
          <GpoList label="User" gpos={userGpos} />
        </Grid>
      </Box>
    </Paper>
  );
}
