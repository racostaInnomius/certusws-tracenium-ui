// src/components/Compliance/SlaPanel.jsx
//
// El compromiso de remediación: cuántos días dijimos que íbamos a tardar, y
// si lo estamos cumpliendo.
//
// El producto ya medía el tiempo hasta remediar; lo que faltaba era CONTRA
// QUÉ. Un auditor no pregunta cuánto tardas, pregunta cuánto dijiste que ibas
// a tardar — y una media sin objetivo no es una respuesta.
//
// Va encima de la cola de trabajo a propósito: el compromiso es lo que decide
// qué se hace primero, así que se lee antes que la lista.
//
// ── Lo que esta pantalla NO hace ────────────────────────────────────────
//
// · No inventa objetivos. Sin compromiso declarado no dice "cumpliendo": dice
//   que no se está midiendo, e invita a fijarlo. Estrenar la función con
//   incumplimientos que nadie prometió sería declarar el compromiso en nombre
//   del cliente y acto seguido reprochárselo.
// · No pinta el riesgo aceptado como incumplimiento: es una decisión de
//   gobierno, con su aprobador. Pero tampoco lo esconde — se cuenta aparte,
//   para que no se vuelva el sitio donde se guarda lo incómodo.

import * as React from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import SectionPaper from "../common/SectionPaper";
import { getComplianceSla, updateComplianceSettings } from "../../api/compliance";

const SEVERITIES = [
  { key: "critical", label: "Critical", patchKey: "slaDaysCritical" },
  { key: "high", label: "High", patchKey: "slaDaysHigh" },
  { key: "medium", label: "Medium", patchKey: "slaDaysMedium" },
  { key: "low", label: "Low", patchKey: "slaDaysLow" },
];

/** Qué titular corresponde. `null` no es 100%: es "no se está midiendo". */
export function headline(sla) {
  if (!sla?.configured) {
    return { text: "No remediation targets set — nothing is being measured against a commitment.", tone: "info" };
  }
  if (sla.compliancePct === null) {
    return { text: "Targets are set, but no open finding falls under them yet.", tone: "info" };
  }
  if (sla.breached > 0) {
    return { text: `${sla.breached} open finding${sla.breached === 1 ? "" : "s"} past the committed time`, tone: "error" };
  }
  return { text: "Every measured finding is within its committed time.", tone: "success" };
}

/** El texto del objetivo. Sin objetivo se dice, no se pinta un guion mudo. */
export function targetText(row) {
  return row.targetDays === null ? "no target" : `${row.targetDays} d`;
}

export default function SlaPanel({ reloadKey, canManage = false, onToast }) {
  const [sla, setSla] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSla(await getComplianceSla());
    } catch (e) {
      setError(e?.body?.error || e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load, reloadKey]);

  const startEdit = () => {
    setDraft(
      Object.fromEntries(
        SEVERITIES.map((s) => [s.patchKey, sla?.targets?.[s.key] == null ? "" : String(sla.targets[s.key])])
      )
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      // Un campo vacío se manda como null y RETIRA el compromiso. Es una
      // decisión, no un "no tocar": sin esto no habría forma de dejar de
      // sostener un objetivo que ya no se sostiene.
      const patch = {};
      for (const s of SEVERITIES) {
        const raw = (draft[s.patchKey] ?? "").trim();
        patch[s.patchKey] = raw === "" ? null : Number(raw);
      }
      await updateComplianceSettings(patch);
      setDraft(null);
      onToast?.("Remediation targets saved", "success");
      await load();
    } catch (e) {
      onToast?.(e?.body?.error || e?.message || "Could not save the targets", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !sla) {
    return (
      <SectionPaper variant="panel" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={16} />
          <Typography sx={{ color: "text.secondary" }}>Checking the clock…</Typography>
        </Stack>
      </SectionPaper>
    );
  }

  if (error) {
    return (
      <SectionPaper variant="panel" sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </SectionPaper>
    );
  }

  const head = headline(sla);

  return (
    <SectionPaper variant="panel" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TimerOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
          <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>
            Remediation targets
          </Typography>
        </Stack>
        {canManage && !draft ? (
          <Button size="small" onClick={startEdit} sx={{ textTransform: "none" }}>
            {sla?.configured ? "Edit targets" : "Set targets"}
          </Button>
        ) : null}
      </Stack>

      <Alert severity={head.tone} sx={{ mb: 2 }}>{head.text}</Alert>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Severity</TableCell>
            <TableCell>Target</TableCell>
            <TableCell>Past due</TableCell>
            <TableCell>Due soon</TableCell>
            <TableCell>Within target</TableCell>
            <TableCell>Oldest open</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(sla?.bySeverity ?? []).map((row) => {
            const sev = SEVERITIES.find((s) => s.key === row.severity);
            return (
              <TableRow key={row.severity}>
                <TableCell sx={{ fontWeight: 700 }}>{sev?.label ?? row.severity}</TableCell>
                <TableCell>
                  {draft ? (
                    <TextField
                      size="small"
                      type="number"
                      placeholder="none"
                      value={draft[sev.patchKey] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [sev.patchKey]: e.target.value })}
                      inputProps={{ min: 1, max: 3650, "aria-label": `${sev.label} target in days` }}
                      sx={{ width: 110 }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: TEXT.sm, color: row.targetDays === null ? "text.secondary" : BRAND.dark }}>
                      {targetText(row)}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {row.breached > 0 ? (
                    <Chip size="small" color="error" label={row.breached} />
                  ) : (
                    <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>—</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {row.atRisk > 0 ? <Chip size="small" color="warning" label={row.atRisk} /> : "—"}
                </TableCell>
                <TableCell>{row.onTime}</TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                    {row.oldestOpenDays === null ? "—" : `${row.oldestOpenDays} d`}
                  </Typography>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {draft ? (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} justifyContent="flex-end">
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", flex: 1, alignSelf: "center" }}>
            Leave a field empty to drop that commitment. Days are counted from the first time the
            finding was detected.
          </Typography>
          <Button size="small" onClick={() => setDraft(null)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button size="small" variant="contained" disabled={saving} onClick={save} sx={{ textTransform: "none" }}>
            Save
          </Button>
        </Stack>
      ) : null}

      {(sla?.excluded ?? 0) > 0 || (sla?.noTarget ?? 0) > 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 1.5 }}>
          Outside the clock:{" "}
          {sla.excluded > 0 ? (
            <Tooltip title="Risk accepted or won't fix: a governance decision with its approver, not a missed deadline. Counted here so it is not invisible either.">
              <span>{sla.excluded} with an accepted exception</span>
            </Tooltip>
          ) : null}
          {sla.excluded > 0 && sla.noTarget > 0 ? " · " : ""}
          {sla.noTarget > 0 ? `${sla.noTarget} with no target for their severity` : ""}
        </Typography>
      ) : null}

      {(sla?.worst?.length ?? 0) > 0 ? (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, mb: 0.5 }}>
            Longest overdue
          </Typography>
          <Stack spacing={0.5}>
            {sla.worst.map((w) => (
              <Typography key={`${w.deviceId}:${w.checkId}`} sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                <strong>{w.overdueDays} d</strong> over · {w.hostname || w.deviceId} · {w.title || w.checkId}
              </Typography>
            ))}
          </Stack>
        </Box>
      ) : null}
    </SectionPaper>
  );
}
