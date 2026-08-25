// src/components/software-delivery/IntakeVerdictBanner.jsx
//
// The security verdict for an intake, rendered as a banner: the verdict badge,
// the signer (when signed), and the deterministic reasons the gate recorded.
// Shown at the top of the review dialog so the operator sees WHY before they
// approve a proposal.

import * as React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import VerdictBadge from "./VerdictBadge";

function bgFor(verdict) {
  if (verdict === "blocked") return BRAND.alert?.errorSoft;
  if (verdict === "verified") return BRAND.alert?.successSoft;
  return BRAND.alert?.warningSoft;
}

export default function IntakeVerdictBanner({ intake }) {
  const v = intake?.verification || {};
  const verdict = v.verdict || intake?.verdict || "unknown";
  const reasons = Array.isArray(v.reasons) ? v.reasons : [];
  const signer = v.signature?.signerCommonName || null;

  return (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: bgFor(verdict), border: `1px solid ${BRAND.border}` }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
        <VerdictBadge verdict={verdict} />
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
          Security verdict
        </Typography>
        {signer ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>· signed by {signer}</Typography>
        ) : null}
      </Stack>
      {reasons.length ? (
        <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
          {reasons.map((r, i) => (
            <Typography key={i} component="li" sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
              {r}
            </Typography>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
