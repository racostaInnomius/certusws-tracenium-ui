// src/components/software-delivery/IntakeVerdictBanner.jsx
//
// The security verdict for an intake, rendered as a banner: the verdict badge,
// the signer (when signed), and the deterministic reasons the gate recorded.
// Shown at the top of the review dialog so the operator sees WHY before they
// approve a proposal.
//
// ADR-0022 — y, cuando VirusTotal no conoce el fichero, la acción de subirlo.

import * as React from "react";
import { Box, Button, CircularProgress, Link, Stack, Typography } from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import VerdictBadge from "./VerdictBadge";

function bgFor(verdict) {
  if (verdict === "blocked") return BRAND.alert?.errorSoft;
  if (verdict === "verified") return BRAND.alert?.successSoft;
  return BRAND.alert?.warningSoft;
}

/**
 * ADR-0022 condición 1: SÓLO se ofrece subir cuando la consulta por hash se hizo
 * y VirusTotal respondió «sin registro» (o una subida anterior falló).
 *
 * ⚠️ El backend aplica la misma regla y rechaza lo demás: esto decide si se
 * enseña el botón, no si está permitido. Mostrarlo donde el servidor lo va a
 * rechazar sería invitar a un error.
 */
export function canSubmitToVirusTotal(intake) {
  const rep = intake?.verification?.reputation;
  if (!rep || intake?.status !== "pending_review") return false;
  const phase = rep.submission?.phase ?? null;
  return rep.verdict === "unknown" && rep.source === "virustotal" && (phase === null || phase === "failed");
}

export default function IntakeVerdictBanner({ intake, canManage = false, onSubmitToVirusTotal }) {
  const v = intake?.verification || {};
  const verdict = v.verdict || intake?.verdict || "unknown";
  const reasons = Array.isArray(v.reasons) ? v.reasons : [];
  const signer = v.signature?.signerCommonName || null;
  const rep = v.reputation || null;
  const pending = rep?.verdict === "pending";
  const showSubmit = canManage && typeof onSubmitToVirusTotal === "function" && canSubmitToVirusTotal(intake);
  const reportLink = rep?.permalink && (rep.verdict === "clean" || rep.verdict === "malicious") ? rep.permalink : null;

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

      {pending ? (
        // Se ve que está en marcha, no sólo que «falta algo»: el cajón vuelve a
        // pedir el intake mientras dure.
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <CircularProgress size={14} />
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
            VirusTotal analysis in progress — this usually takes a few minutes.
          </Typography>
        </Stack>
      ) : null}

      {reportLink ? (
        <Link href={reportLink} target="_blank" rel="noopener noreferrer" sx={{ display: "inline-block", mt: 1, fontSize: TEXT.sm }}>
          View VirusTotal report
        </Link>
      ) : null}

      {showSubmit ? (
        <Box sx={{ mt: 1 }}>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={<CloudUploadOutlinedIcon fontSize="small" />}
            onClick={onSubmitToVirusTotal}
          >
            Submit file to VirusTotal…
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
