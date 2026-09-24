// src/components/Assessments/ExceptionDialog.jsx
//
// ADR-0022 decisión 5 — una excepción lleva motivo, dueño del riesgo, autor y
// caducidad, como en SCP. Sin fecha no se acepta: una excepción que no caduca
// es un hallazgo que alguien decidió no volver a mirar.
//
// ⚠️ Y lleva DOS personas. Pedirla no concede nada: el hallazgo sigue contando
// como fallo y el score no se mueve hasta que otro OWNER/ADMIN la aprueba. Por
// eso este diálogo tiene tres caras —pedir, decidir y la vigente— en vez de un
// único formulario de «guardar».

import * as React from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { decideFindingException, listFindingExceptions, removeFindingException, requestFindingException } from "../../api/assessments";
import { EXCEPTION_STATUS, exceptionGate, exceptionHistoryLine, pendingRequestLine } from "./assessmentModel";

function inDays(days) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const MIN_REASON = 20;

export default function ExceptionDialog({ open, instanceId, finding, viewer, onClose, onSaved }) {
  const [reason, setReason] = React.useState("");
  const [riskOwner, setRiskOwner] = React.useState("");
  const [expires, setExpires] = React.useState(inDays(90));
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [history, setHistory] = React.useState([]);

  const gate = React.useMemo(() => exceptionGate(finding, viewer), [finding, viewer]);
  const pendingMode = gate.mode === "pending";

  React.useEffect(() => {
    if (!open || !finding) return;
    const src = gate.pending || gate.active || null;
    setReason(src?.reason || "");
    setRiskOwner(src?.riskOwner || "");
    setExpires(src?.expiresAt ? String(src.expiresAt).slice(0, 10) : inDays(90));
    setNote("");
    setError(null);
    // La historia no bloquea el diálogo: si no llega, se puede pedir o decidir
    // igual y la sección simplemente no aparece.
    let alive = true;
    setHistory([]);
    listFindingExceptions(instanceId, finding.controlId)
      // Lo que está EN CURSO (pendiente o vigente) se lee arriba; aquí abajo
      // sólo va lo que ya terminó.
      .then((r) => {
        if (alive) setHistory((Array.isArray(r?.exceptions) ? r.exceptions : []).filter((e) => e?.status !== "active" && e?.status !== "pending"));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, finding, instanceId, gate.pending, gate.active]);

  async function run(fn) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      onSaved?.();
    } catch (e) {
      setError(e?.body?.message || e?.body?.error || e?.message || "Could not save the exception.");
    } finally {
      setSaving(false);
    }
  }

  const request = () =>
    run(() => requestFindingException(instanceId, finding.controlId, {
      reason: reason.trim(),
      riskOwner: riskOwner.trim(),
      expiresAt: new Date(`${expires}T23:59:59Z`).toISOString(),
    }));
  const decide = (decision) => run(() => decideFindingException(instanceId, finding.controlId, { decision, note: note.trim() || undefined }));
  const remove = () => run(() => removeFindingException(instanceId, finding.controlId));

  const canSubmit = !saving && reason.trim().length >= MIN_REASON && riskOwner.trim().length > 0 && !!expires;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Exception · {finding?.controlId}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 2 }}>
          {finding?.title}. The finding stays visible and the next run still verifies it; the exception records who accepted
          the risk, why, and until when. It takes effect only once a second owner or admin approves it.
        </Typography>

        {pendingMode ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700 }}>Waiting for approval</Typography>
            <Typography sx={{ fontSize: TEXT.sm }}>{gate.pending.reason}</Typography>
            <Typography sx={{ fontSize: TEXT.xs, mt: 0.5 }}>{pendingRequestLine(gate.pending)}</Typography>
            <Typography sx={{ fontSize: TEXT.xs, mt: 0.5, fontWeight: 700 }}>
              Until it is approved this finding still counts as a failure and the score does not move.
            </Typography>
          </Alert>
        ) : null}
        {pendingMode && gate.blockedReason ? (
          <Alert severity="warning" sx={{ mb: 2 }}>{gate.blockedReason}</Alert>
        ) : null}

        <Stack spacing={2}>
          <TextField
            label={pendingMode ? "Reason (as requested)" : "Reason"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={2}
            size="small"
            disabled={pendingMode}
            helperText={pendingMode ? " " : `At least ${MIN_REASON} characters — this is what an auditor reads.`}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            placeholder="e.g. Entra Connect sync account — access to the sync server is restricted to two admins."
          />
          <TextField
            label="Risk owner"
            value={riskOwner}
            onChange={(e) => setRiskOwner(e.target.value)}
            size="small"
            disabled={pendingMode}
            helperText={pendingMode ? " " : "The person who owns this accepted risk."}
            placeholder="ciso@example.com"
          />
          <TextField
            type="date"
            label="Expires"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            size="small"
            disabled={pendingMode}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: inDays(1), max: inDays(366) } }}
            sx={{ width: 200 }}
          />
          {pendingMode && gate.canDecide ? (
            <TextField
              label="Decision note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              size="small"
              placeholder="Optional — why you approved or rejected it."
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          ) : null}
        </Stack>

        {history.length > 0 ? (
          <Box sx={{ mt: 3 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.4, mb: 1 }}>
              Previously accepted
            </Typography>
            <Stack spacing={1.25}>
              {history.map((e, i) => {
                const st = EXCEPTION_STATUS[e.status] || EXCEPTION_STATUS.expired;
                return (
                  <Stack key={`${e.createdAt}-${i}`} direction="row" spacing={1} alignItems="flex-start">
                    <Chip
                      size="small"
                      label={st.label}
                      sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, flexShrink: 0 }}
                      color={st.tone === "caution" ? "warning" : "default"}
                      variant={st.tone === "caution" ? "filled" : "outlined"}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: TEXT.sm }}>{e.reason}</Typography>
                      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{exceptionHistoryLine(e)}</Typography>
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          </Box>
        ) : null}
        {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}
      </DialogContent>
      <DialogActions>
        {pendingMode && gate.canCancel ? (
          <Button onClick={remove} disabled={saving} color="error" sx={{ textTransform: "none", mr: "auto" }}>
            Cancel request
          </Button>
        ) : null}
        {!pendingMode && gate.active ? (
          <Button onClick={remove} disabled={saving} color="error" sx={{ textTransform: "none", mr: "auto" }}>
            Remove exception
          </Button>
        ) : null}
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>
          Close
        </Button>
        {pendingMode ? (
          gate.canDecide ? (
            <>
              <Button onClick={() => decide("reject")} disabled={saving} color="error" variant="outlined" sx={{ textTransform: "none", fontWeight: 700 }}>
                Reject
              </Button>
              <Button
                onClick={() => decide("approve")}
                disabled={saving}
                variant="contained"
                sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
              >
                Approve
              </Button>
            </>
          ) : null
        ) : (
          <Button
            variant="contained"
            onClick={request}
            disabled={!canSubmit}
            sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            {gate.active ? "Request replacement" : "Request exception"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
