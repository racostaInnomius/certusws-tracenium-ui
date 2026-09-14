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
//   · hallazgos abiertos y cobertura, en la misma rejilla;
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
import { SEVERITY_META } from "../../theme/severity";
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

function Tile({ label, children, sx }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, bgcolor: BRAND.surfaceMuted, minWidth: 0, ...sx }}>
      <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", mb: 0.5 }}>{label}</Typography>
      {children}
    </Box>
  );
}

export default function ScoreCard({ detail, bands, open, canEdit, onChanged }) {
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
    <SectionPaper sx={{ mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>Score</Typography>
        {canEdit ? (
          <Button size="small" onClick={() => setEditing(true)} sx={{ textTransform: "none", color: BRAND.tealText, minWidth: 0, py: 0 }}>
            Set target
          </Button>
        ) : null}
      </Stack>

      {/* Gauge a la izquierda; a la derecha, las lecturas en una rejilla que
          ocupa el ancho (antes todo iba centrado en una columna y sobraba medio
          tablero). En móvil, una columna. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(260px, 380px) minmax(0, 1fr)" },
          gap: { xs: 2, md: 3 },
          alignItems: "center",
          mt: 1,
        }}
      >
        <Box>
          <ScoreGauge score={score} target={target.value} bands={bands} />
          <Box sx={{ textAlign: "center", mt: 0.5 }}>
            <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: scoreBandTextRole(score, bands) ?? TEXT_MUTED }}>
              {scoreBandLabel(score, bands)}
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              {detail.lastScore?.scoredAt ? `Scored ${formatDate(detail.lastScore.scoredAt)}` : "No complete run yet"}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }, gap: 1.5 }}>
          <Tile label="vs. previous">
            {delta ? (
              <>
                <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: deltaColor }}>
                  {DeltaIcon ? <DeltaIcon sx={{ fontSize: ICON.xl }} /> : null}
                  <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: "inherit", lineHeight: 1.2 }}>
                    {delta.delta > 0 ? `+${delta.delta}` : delta.delta}
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>from {delta.previousScore} on {formatDate(delta.previousAt)}</Typography>
              </>
            ) : (
              <>
                <Typography sx={{ fontSize: TEXT.lg, fontWeight: 700, color: TEXT_MUTED, lineHeight: 1.5 }}>First scored run</Typography>
                <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>The next run shows the change</Typography>
              </>
            )}
          </Tile>

          <Tile label={`Target ${target.value}`}>
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, lineHeight: 1.5, color: score !== null && score >= target.value ? BRAND.alert.successText : BRAND.dark }}>
              {targetGapText(score, target.value)}
            </Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{target.source === "instance" ? "Set for this domain" : "Tenant On track threshold"}</Typography>
          </Tile>

          <Tile label="Open findings">
            <Stack direction="row" gap={1.5} flexWrap="wrap">
              {["critical", "high", "medium", "low"].map((sev) => (
                <Box key={sev}>
                  <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: SEVERITY_META[sev].fg, lineHeight: 1.2 }}>{open?.[sev] ?? 0}</Typography>
                  <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{SEVERITY_META[sev].label}</Typography>
                </Box>
              ))}
            </Stack>
          </Tile>

          <Tile label="Coverage">
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark, lineHeight: 1.5 }}>
              {coverage && Number.isFinite(coverage.total) && coverage.total > 0 ? `${coverage.assessable} of ${coverage.total}` : "—"}
            </Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
              {partial ? "Unreadable checks are left out of the score, never counted as passing" : "Checks assessable from this collector"}
            </Typography>
          </Tile>

          {projections.length > 0 ? (
            <Tile label="What would move it" sx={{ gridColumn: "1 / -1" }}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, columnGap: 3, rowGap: 0.5 }}>
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
            </Tile>
          ) : null}
        </Box>
      </Box>

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
