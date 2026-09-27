// src/components/Compliance/AppliedFixesSection.jsx
//
// «Fixes applied from Tracenium» en la ficha de un equipo: qué le cambió
// Tracenium y cómo deshacerlo.
//
// 27-sep: «necesitamos poder revertir un fix enviado desde Tracenium, en caso
// de que el equipo presente alguna afectación con otro servicio». Hasta ahora
// un fix era de un solo sentido, y además quedaba escondido: en cuanto pasa,
// su hallazgo sale de la lista de «sólo fallos». Aquí se ven todos, el último
// por control, con:
//   · «Check device» — un revert simulado: el agente lee lo que hay HOY. Si
//     alguien cambió el valor después del fix, se dice antes de pisarlo.
//   · «Revert…» — confirma con la tabla de lo que se restaura (y lo que el fix
//     había puesto) y lo aplica. El hallazgo vuelve a abrirse.
// Lo que no se puede revertir dice por qué (sin estado anterior, agente sin
// soporte, secedit que no se puede «desponer»…).

import * as React from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { getAppliedFixes, revertRemediationResult } from "../../api/patchManagement";
import { listFrom } from "../../api/shape";
import { outcomeColors } from "../patch-management/outcomeTone";
import { formatRelativeTime } from "./PatchLevel";

const POLL_MS = 5000;

/** Un valor de registro/estado, legible: null = «not set». */
export function showValue(v) {
  if (v === null || v === undefined) return "not set";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(empty)";
  if (typeof v === "boolean") return v ? "on" : "off";
  return String(v);
}

function Pill({ label, bg, fg, title }) {
  const chip = (
    <Chip size="small" label={label} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: bg, color: fg }} />
  );
  return title ? <Tooltip arrow title={title}>{chip}</Tooltip> : chip;
}

function ChangesTable({ changes }) {
  if (!changes?.length) return null;
  return (
    <Table size="small" sx={{ mt: 1 }}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>Setting</TableCell>
          <TableCell sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>Fix set</TableCell>
          <TableCell sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>Restores</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {changes.map((c) => (
          <TableRow key={c.target}>
            <TableCell sx={{ fontSize: TEXT.xs, fontFamily: "monospace", wordBreak: "break-all" }}>{c.target}</TableCell>
            <TableCell sx={{ fontSize: TEXT.xs }}>{showValue(c.fixValue)}</TableCell>
            <TableCell sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>{showValue(c.restore)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FixRow({ fix, canRevert, busy, onCheck, onRevert }) {
  const applied = outcomeColors(fix.outcome);
  const reverted = fix.reverted;
  const check = fix.lastCheck;
  const checking = fix.inFlight?.mode === "dry_run";
  const reverting = fix.inFlight?.mode === "apply";
  return (
    <Box sx={{ py: 1, borderTop: `1px solid ${BRAND.border}`, "&:first-of-type": { borderTop: "none" } }} data-testid={`applied-fix-${fix.resultId}`}>
      <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{fix.title || fix.checkId}</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25, flexWrap: "wrap" }} useFlexGap>
            <Pill label={fix.outcome === "applied_reboot_required" ? "applied (reboot)" : "applied"} bg={applied.bg} fg={applied.fg} />
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
              {fix.appliedAt ? formatRelativeTime(fix.appliedAt) : "—"}
              {fix.appliedBy ? ` · ${fix.appliedBy}` : ""} · #{fix.remediationId}
            </Typography>
            {reverted ? (
              <Pill
                label={`Reverted ${reverted.at ? formatRelativeTime(reverted.at) : ""}`.trim()}
                bg={BRAND.darkSoft}
                fg={BRAND.dark}
                title={`Undone by remediation #${reverted.remediationId}${reverted.by ? ` (${reverted.by})` : ""}.`}
              />
            ) : null}
            {checking ? <Pill label="Checking device…" bg={BRAND.alert.infoSoft} fg={BRAND.alert.infoText} /> : null}
            {reverting ? <Pill label="Reverting…" bg={BRAND.alert.warningSoft} fg={BRAND.alert.warningText} /> : null}
          </Stack>
          {!reverted && check && !checking ? (
            check.drift?.length ? (
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.warningText, mt: 0.5 }} data-testid="revert-drift">
                Changed since the fix: {check.drift.map((d) => `${d.target} (fix set ${showValue(d.fixValue)}, now ${showValue(d.now)})`).join("; ")}.
                Reverting will overwrite it.
              </Typography>
            ) : check.outcome === "dryrun_already_compliant" ? (
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.5 }}>
                Already back to the previous value (checked {check.at ? formatRelativeTime(check.at) : "just now"}).
              </Typography>
            ) : check.outcome === "dryrun_would_apply" ? (
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.successText, mt: 0.5 }}>
                The device is still as the fix left it (checked {check.at ? formatRelativeTime(check.at) : "just now"}).
              </Typography>
            ) : (
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.errorText, mt: 0.5 }}>
                The check did not complete ({check.outcome.replace(/_/g, " ")}).
              </Typography>
            )
          ) : null}
          {!fix.revertible && !reverted ? (
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.5 }}>{fix.reason}</Typography>
          ) : null}
        </Box>
        {canRevert && fix.revertible && !reverted ? (
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
            <Button size="small" disabled={busy || Boolean(fix.inFlight)} onClick={() => onCheck(fix)} sx={{ textTransform: "none" }}>
              Check device
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<UndoOutlinedIcon sx={{ fontSize: ICON.sm }} />}
              disabled={busy || Boolean(fix.inFlight)}
              onClick={() => onRevert(fix)}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              Revert…
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}

export default function AppliedFixesSection({ agentId, canRevert = false, onToast = null, onChanged = null }) {
  const [expanded, setExpanded] = React.useState(false);
  const [fixes, setFixes] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null);
  const toastRef = React.useRef(onToast);
  toastRef.current = onToast;

  // Un revert que estaba en camino y ya no: el agente contestó y el hallazgo
  // pudo reabrirse — la ficha se recarga para que se vea.
  const revertingRef = React.useRef(new Set());
  const changedRef = React.useRef(onChanged);
  changedRef.current = onChanged;

  const load = React.useCallback(async () => {
    if (!agentId) return;
    try {
      const items = listFrom(await getAppliedFixes(agentId), { context: "appliedFixes" });
      const nowReverting = new Set(items.filter((f) => f.inFlight?.mode === "apply").map((f) => f.resultId));
      const finished = [...revertingRef.current].some((id) => !nowReverting.has(id));
      revertingRef.current = nowReverting;
      setFixes(items);
      setError(null);
      if (finished) changedRef.current?.();
    } catch (e) {
      setError(e?.body?.message || e?.message || "Could not load the fixes applied to this device.");
    }
  }, [agentId]);

  React.useEffect(() => {
    setFixes(null);
    load();
  }, [load]);

  // Mientras algo va en camino (una comprobación o un revert), se vuelve a
  // mirar cada 5 s: el resultado lo trae el agente, no esta pantalla.
  const anyInFlight = (fixes ?? []).some((f) => f.inFlight);
  React.useEffect(() => {
    if (!anyInFlight) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [anyInFlight, load]);

  const send = async (fix, mode) => {
    setBusy(true);
    try {
      await revertRemediationResult(fix.resultId, mode);
      toastRef.current?.({
        severity: "success",
        message: mode === "dry_run"
          ? `Checking ${fix.title || fix.checkId} on the device…`
          : `Reverting ${fix.title || fix.checkId}. The finding will reopen once the device confirms.`,
      });
      await load();
    } catch (e) {
      toastRef.current?.({ severity: "error", message: e?.body?.message || e?.message || "Could not send the revert." });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const count = fixes?.length ?? 0;
  const revertedCount = (fixes ?? []).filter((f) => f.reverted).length;

  return (
    <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
        sx={{ cursor: "pointer" }}
      >
        <UndoOutlinedIcon sx={{ fontSize: ICON.md, color: BRAND.tealText }} />
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: BRAND.tealText, textTransform: "uppercase", letterSpacing: 0.8, flex: 1 }}>
          Fixes applied from Tracenium{fixes ? ` (${count})` : ""}
        </Typography>
        {revertedCount > 0 ? <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{revertedCount} reverted</Typography> : null}
        {anyInFlight ? <CircularProgress size={14} sx={{ color: BRAND.teal }} /> : null}
        <IconButton size="small" aria-label={expanded ? "Collapse" : "Expand"}>
          {expanded ? <ExpandLessOutlinedIcon fontSize="small" /> : <ExpandMoreOutlinedIcon fontSize="small" />}
        </IconButton>
      </Stack>
      <Collapse in={expanded} timeout="auto">
        <Box sx={{ pt: 1 }}>
          {error ? (
            <Alert severity="error" variant="outlined">{error}</Alert>
          ) : fixes == null ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}><CircularProgress size={20} /></Box>
          ) : count === 0 ? (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
              Tracenium has not changed any setting on this device.
            </Typography>
          ) : (
            <>
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mb: 0.5 }}>
                The last fix per control. If one of them breaks something on this device, revert it here: the previous value is restored and the finding reopens.
              </Typography>
              {fixes.map((f) => (
                <FixRow
                  key={f.resultId}
                  fix={f}
                  canRevert={canRevert}
                  busy={busy}
                  onCheck={(fix) => send(fix, "dry_run")}
                  onRevert={(fix) => setConfirm(fix)}
                />
              ))}
            </>
          )}
        </Box>
      </Collapse>

      <Dialog open={Boolean(confirm)} onClose={() => (busy ? null : setConfirm(null))} maxWidth="sm" fullWidth>
        <DialogTitle>Revert {confirm?.title || confirm?.checkId}?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
            This puts back what the device had before the fix. The control will fail again and its finding reopens.
          </Typography>
          <ChangesTable changes={confirm?.changes} />
          {confirm?.lastCheck?.drift?.length ? (
            <Alert severity="warning" variant="outlined" sx={{ mt: 1.5 }}>
              Someone changed this after the fix: {confirm.lastCheck.drift.map((d) => `${d.target} is ${showValue(d.now)}`).join("; ")}. Reverting overwrites it with the value from before the fix.
            </Alert>
          ) : !confirm?.lastCheck ? (
            <Alert severity="info" variant="outlined" sx={{ mt: 1.5 }}>
              Not checked yet. «Check device» first tells you whether the device is still as the fix left it.
            </Alert>
          ) : null}
          {(confirm?.warnings ?? []).map((w) => (
            <Alert key={w} severity="info" variant="outlined" sx={{ mt: 1 }}>{w}</Alert>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => send(confirm, "apply")}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={14} /> : <UndoOutlinedIcon />}
          >
            Revert fix
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
