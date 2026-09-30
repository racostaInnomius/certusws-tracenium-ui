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
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";
import SectionPaper from "../common/SectionPaper";
import { getComplianceSla, updateComplianceSettings } from "../../api/compliance";
import { getAlertRules } from "../../api/alerts";

const SEVERITIES = [
  { key: "critical", label: "Critical", patchKey: "slaDaysCritical" },
  { key: "high", label: "High", patchKey: "slaDaysHigh" },
  { key: "medium", label: "Medium", patchKey: "slaDaysMedium" },
  { key: "low", label: "Low", patchKey: "slaDaysLow" },
];

/**
 * Qué titular corresponde, y con qué tono. `null` no es 100%: es "no se está
 * midiendo".
 *
 * ⚠️ El tono es PROPORCIONAL (30-sep). Antes cualquier vencido pintaba una
 * alerta roja a todo lo ancho: T1, con el 99,9 % dentro de plazo y 6 vencidos
 * de 5.584, se leía como una emergencia — y el titular no decía ni el 99,9 %
 * ni los 9 a punto de vencer, que es donde todavía se puede actuar.
 *   error   → algo vencido en un equipo crítico o de severidad crítica
 *   warning → algo vencido
 *   info    → nada vencido, pero algo por vencer
 *   success → todo dentro de plazo
 */
export function headline(sla) {
  if (!sla?.configured) {
    return { text: "No remediation targets set — nothing is being measured against a commitment.", tone: "info" };
  }
  if (sla.compliancePct === null) {
    return { text: "Targets are set, but no open finding falls under them yet.", tone: "info" };
  }
  const atRisk = sla.atRisk ?? 0;
  const dueSoon = atRisk > 0 ? ` · ${atRisk} due soon` : "";
  if (sla.breached > 0) {
    // Los que caen en equipos críticos van en el titular: cuatro vencidos en
    // el controlador de dominio no pesan lo mismo que cuatro en portátiles.
    // null (no se pudo saber) y 0 no añaden nada.
    const onCritical = sla.breachedOnCritical > 0 ? ` — ${sla.breachedOnCritical} on critical devices` : "";
    const criticalSeverity = (sla.bySeverity ?? []).some((r) => r.severity === "critical" && r.breached > 0);
    return {
      text: `${sla.breached} past due${onCritical}${dueSoon}`,
      tone: sla.breachedOnCritical > 0 || criticalSeverity ? "error" : "warning",
    };
  }
  if (atRisk > 0) return { text: `None past due · ${atRisk} due soon`, tone: "info" };
  return { text: "Every measured finding is within its committed time.", tone: "success" };
}

const TONE_COLOR = {
  error: ROLE.critical,
  warning: ROLE.caution,
  info: BRAND.teal,
  success: ROLE.positive,
};

/**
 * La franja del titular: el % dentro de plazo manda, y vencidos / por vencer
 * al lado con el color sólo en la cifra. El borde lleva el tono.
 */
function SummaryStrip({ sla, head, alertAction }) {
  const n = (v) => Number(v ?? 0).toLocaleString();
  return (
    <Box
      data-testid="sla-summary"
      data-tone={head.tone}
      sx={{
        mb: 2, px: 2, py: 1.25, borderRadius: 1.5,
        border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${TONE_COLOR[head.tone]}`,
        bgcolor: BRAND.surface, display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 3, rowGap: 1,
      }}
    >
      <Box>
        <Typography component="div" sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>
          {sla.compliancePct}%
          <Typography component="span" sx={{ fontSize: TEXT.sm, fontWeight: 600, color: BRAND.gray, ml: 1 }}>
            within target
          </Typography>
        </Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
          {n(sla.measured - sla.breached)} of {n(sla.measured)} measured findings
        </Typography>
      </Box>
      <Stack direction="row" spacing={3}>
        <Box>
          <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: sla.breached > 0 ? BRAND.alert.errorText : BRAND.gray }}>{n(sla.breached)}</Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
            past due{sla.breachedOnCritical > 0 ? ` · ${n(sla.breachedOnCritical)} on critical devices` : ""}
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: sla.atRisk > 0 ? BRAND.alert.warningText : BRAND.gray }}>{n(sla.atRisk)}</Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>due soon (last fifth of the target)</Typography>
        </Box>
      </Stack>
      <Box sx={{ ml: "auto" }}>{alertAction}</Box>
    </Box>
  );
}

/** El texto del objetivo. Sin objetivo se dice, no se pinta un guion mudo. */
export function targetText(row) {
  return row.targetDays === null ? "no target" : `${row.targetDays} d`;
}

// `onOpenAlertRules`: la página lleva a Alerts → Rules. Con él, el panel dice si
// la alerta «Remediation target» está encendida y, si no, ofrece encenderla.
export default function SlaPanel({ reloadKey, canManage = false, onToast, onOpenAlertRules = null }) {
  const [sla, setSla] = React.useState(null);
  // null = no se sabe (sin permiso de alertas, o fallo): no se ofrece nada.
  const [alertOn, setAlertOn] = React.useState(null);
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

  React.useEffect(() => {
    if (!onOpenAlertRules) return undefined;
    let alive = true;
    getAlertRules()
      .then((res) => {
        const rules = Array.isArray(res?.rules) ? res.rules : [];
        if (alive) setAlertOn(rules.some((r) => r?.source === "compliance_sla" && r?.enabled));
      })
      .catch(() => alive && setAlertOn(null));
    return () => { alive = false; };
  }, [onOpenAlertRules, reloadKey]);

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
      // `{severity, message}`: es la forma que espera el toast de la página.
      onToast?.({ severity: "success", message: "Remediation targets saved" });
      await load();
    } catch (e) {
      onToast?.({
        severity: "error",
        message: e?.body?.error || e?.message || "Could not save the targets",
      });
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

      {sla?.configured && sla.compliancePct !== null ? (
        <SummaryStrip
          sla={sla}
          head={head}
          alertAction={
            alertOn === true ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <NotificationsActiveOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.tealText }} />
                <Typography sx={{ fontSize: TEXT.xs, color: BRAND.tealText }}>Alerting before targets are missed</Typography>
              </Stack>
            ) : alertOn === false ? (
              <Button
                size="small"
                variant="outlined"
                startIcon={<NotificationsActiveOutlinedIcon />}
                onClick={onOpenAlertRules}
                sx={{ textTransform: "none" }}
              >
                Alert me before targets are missed
              </Button>
            ) : null
          }
        />
      ) : (
        <Alert severity={head.tone} sx={{ mb: 2 }}>{head.text}</Alert>
      )}

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

      {(sla?.dueNext?.length ?? 0) > 0 || (sla?.worst?.length ?? 0) > 0 ? (
        <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {(sla?.dueNext?.length ?? 0) > 0 ? (
            <Box>
              <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, mb: 0.5 }}>
                Due next — still time to fix
              </Typography>
              <Stack spacing={0.5}>
                {sla.dueNext.map((d) => (
                  <Typography key={`${d.deviceId}:${d.checkId}`} sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                    <strong style={{ color: BRAND.alert.warningText }}>{d.daysLeft === null ? "—" : `${d.daysLeft} d`}</strong> left · {d.hostname || d.deviceId} · {d.title || d.checkId}
                    {d.criticality === "critical" ? (
                      <Chip size="small" label="critical device" sx={{ ml: 1, height: 18, bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.errorText, fontWeight: 700 }} />
                    ) : null}
                  </Typography>
                ))}
              </Stack>
            </Box>
          ) : null}
          {(sla?.worst?.length ?? 0) > 0 ? (
            <Box>
              <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, mb: 0.5 }}>
                {sla.worst.some((w) => w.criticality === "critical") ? "Overdue — critical devices first" : "Longest overdue"}
              </Typography>
              <Stack spacing={0.5}>
                {sla.worst.map((w) => (
                  <Typography key={`${w.deviceId}:${w.checkId}`} sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                    <strong>{w.overdueDays} d</strong> over · {w.hostname || w.deviceId} · {w.title || w.checkId}
                    {w.criticality === "critical" ? (
                      <Chip
                        size="small"
                        label="critical device"
                        sx={{ ml: 1, height: 18, bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.errorText, fontWeight: 700 }}
                      />
                    ) : null}
                  </Typography>
                ))}
              </Stack>
            </Box>
          ) : null}
        </Box>
      ) : null}
    </SectionPaper>
  );
}
