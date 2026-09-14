// src/components/Assessments/ScoreCard.jsx
//
// ADR-0022 — la tarjeta del score en el detalle de una instancia:
//   · el gauge con el score de la última corrida COMPLETA y el objetivo;
//   · la banda en palabras (On track / Needs attention / Action required);
//   · la variación contra la corrida puntuada anterior;
//   · cuántos puntos faltan para el objetivo;
//   · lo que subiría el score arreglando los críticos (y los altos). Lo calcula
//     el backend con la misma fórmula que la corrida, así que el número que se
//     promete es el que daría la corrida siguiente;
//   · si la cobertura no es completa, que el score sale de menos indicadores.
//
// El objetivo es de la instancia. Sin objetivo propio se usa el umbral On
// track de las bandas del tenant, y se dice de dónde sale.

import * as React from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingFlatRoundedIcon from "@mui/icons-material/TrendingFlatRounded";
import { BRAND, ICON, TEXT, TEXT_MUTED } from "../../theme/brand";
import { scoreBandLabel, scoreBandTextRole } from "../../theme/scoreBands";
import { formatDate } from "../../utils/format";
import { setAssessmentTarget } from "../../api/assessments";
import SectionPaper from "../common/SectionPaper";
import ScoreGauge from "./ScoreGauge";
import { effectiveTarget, projectionLabel, scoreDelta, targetGapText } from "./assessmentModel";

function TargetDialog({ open, instance, bands, onClose, onSaved }) {
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  // Sólo al abrir: `bands` es un objeto nuevo en cada render y reiniciaría el
  // campo mientras se escribe.
  React.useEffect(() => {
    if (!open) return;
    setValue(String(effectiveTarget(instance, bands).value));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 100;

  async function save(target) {
    setSaving(true);
    setError(null);
    try {
      await setAssessmentTarget(instance.id, target);
      onSaved?.();
    } catch (e) {
      setError(e?.body?.message || e?.body?.error || e?.message || "Could not save the target.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Target score</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 2 }}>
          The score this domain should reach. Without a target of its own it uses your tenant's "On track" threshold ({bands.goodMin}).
        </Typography>
        <TextField
          label="Target"
          type="number"
          size="small"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={value !== "" && !valid}
          helperText={value !== "" && !valid ? "A whole number from 1 to 100" : " "}
          slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }}
          sx={{ width: 160 }}
        />
        {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}
      </DialogContent>
      <DialogActions>
        {instance?.targetScore != null ? (
          <Button onClick={() => save(null)} disabled={saving} sx={{ textTransform: "none", mr: "auto", color: BRAND.tealText }}>
            Use tenant threshold
          </Button>
        ) : null}
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => save(n)}
          disabled={saving || !valid}
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          Save target
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ScoreCard({ detail, bands, canEdit, onChanged }) {
  const [editing, setEditing] = React.useState(false);
  const inst = detail.instance;
  const score = Number.isFinite(detail.lastScore?.score) ? detail.lastScore.score : null;
  const target = effectiveTarget(inst, bands);
  const delta = scoreDelta(detail.history);
  const coverage = detail.coverage;
  const partial = coverage && Number.isFinite(coverage.total) && coverage.assessable < coverage.total;
  const projections = (detail.projections || []).filter((p) => Number.isFinite(p.score) && score !== null && p.score > score);

  const DeltaIcon = !delta ? null : delta.delta > 0 ? TrendingUpRoundedIcon : delta.delta < 0 ? TrendingDownRoundedIcon : TrendingFlatRoundedIcon;
  const deltaColor = !delta || delta.delta === 0 ? TEXT_MUTED : delta.delta > 0 ? BRAND.alert.successText : BRAND.alert.errorText;

  return (
    <SectionPaper>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>Score</Typography>
        {canEdit ? (
          <Button size="small" onClick={() => setEditing(true)} sx={{ textTransform: "none", color: BRAND.tealText, minWidth: 0, py: 0 }}>
            Set target
          </Button>
        ) : null}
      </Stack>

      <Box sx={{ mt: 1 }}>
        <ScoreGauge score={score} target={target.value} bands={bands} />
      </Box>

      <Box sx={{ textAlign: "center", mt: 0.5 }}>
        <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: scoreBandTextRole(score, bands) ?? TEXT_MUTED }}>
          {scoreBandLabel(score, bands)}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          {detail.lastScore?.scoredAt ? `Scored ${formatDate(detail.lastScore.scoredAt)}` : "No complete run yet"}
        </Typography>
      </Box>

      <Stack direction="row" justifyContent="center" gap={2} flexWrap="wrap" sx={{ mt: 1.5 }}>
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", textTransform: "uppercase", fontWeight: 700 }}>vs. previous</Typography>
          {delta ? (
            <Stack direction="row" alignItems="center" justifyContent="center" gap={0.5} sx={{ color: deltaColor }}>
              {DeltaIcon ? <DeltaIcon sx={{ fontSize: ICON.lg }} /> : null}
              <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: "inherit" }}>
                {delta.delta > 0 ? `+${delta.delta}` : delta.delta}
              </Typography>
            </Stack>
          ) : (
            <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>First scored run</Typography>
          )}
          {delta ? <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>from {delta.previousScore} on {formatDate(delta.previousAt)}</Typography> : null}
        </Box>
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", textTransform: "uppercase", fontWeight: 700 }}>Target {target.value}</Typography>
          <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: score !== null && score >= target.value ? BRAND.alert.successText : BRAND.dark }}>
            {targetGapText(score, target.value)}
          </Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{target.source === "instance" ? "Set for this domain" : "Tenant On track threshold"}</Typography>
        </Box>
      </Stack>

      {projections.length > 0 ? (
        <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}>
          <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", mb: 0.5 }}>What would move it</Typography>
          {projections.map((p) => (
            <Stack key={p.severities.join("+")} direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{projectionLabel(p)}</Typography>
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: BRAND.dark, whiteSpace: "nowrap" }}>
                → {p.score}
                {p.score >= target.value ? <Box component="span" sx={{ fontWeight: 600, color: BRAND.alert.successText }}> · reaches target</Box> : null}
              </Typography>
            </Stack>
          ))}
        </Box>
      ) : null}

      {partial ? (
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 1.5 }}>
          Based on {coverage.assessable} of {coverage.total} checks. Checks that could not be assessed are left out of the score, not counted as passing.
        </Typography>
      ) : null}

      <TargetDialog
        open={editing}
        instance={inst}
        bands={bands}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged?.();
        }}
      />
    </SectionPaper>
  );
}
