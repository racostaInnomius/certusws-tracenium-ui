// src/components/Assessments/ExceptionDialog.jsx
//
// ADR-0022 decisión 5 — una excepción lleva motivo, autor y caducidad, como en
// SCP. Sin fecha no se acepta: una excepción que no caduca es un hallazgo que
// alguien decidió no volver a mirar.

import * as React from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { listFindingExceptions, removeFindingException, setFindingException } from "../../api/assessments";
import { EXCEPTION_STATUS, exceptionHistoryLine } from "./assessmentModel";

function inDays(days) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export default function ExceptionDialog({ open, instanceId, finding, onClose, onSaved }) {
  const [reason, setReason] = React.useState("");
  const [expires, setExpires] = React.useState(inDays(90));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [history, setHistory] = React.useState([]);

  React.useEffect(() => {
    if (!open || !finding) return;
    setReason(finding.exception?.reason || "");
    setExpires(finding.exception?.expiresAt ? String(finding.exception.expiresAt).slice(0, 10) : inDays(90));
    setError(null);
    // La historia no bloquea el diálogo: si no llega, se acepta el riesgo
    // igual y la sección simplemente no aparece.
    let alive = true;
    setHistory([]);
    listFindingExceptions(instanceId, finding.controlId)
      // La VIGENTE se cae de la lista: ya está arriba, en los campos del
      // formulario. Aquí sólo va lo que ya terminó.
      .then((r) => { if (alive) setHistory((Array.isArray(r?.exceptions) ? r.exceptions : []).filter((e) => e?.status !== "active")); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, finding, instanceId]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setFindingException(instanceId, finding.controlId, { reason: reason.trim(), expiresAt: new Date(`${expires}T23:59:59Z`).toISOString() });
      onSaved?.();
    } catch (e) {
      setError(e?.body?.message || e?.body?.error || e?.message || "Could not save the exception.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await removeFindingException(instanceId, finding.controlId);
      onSaved?.();
    } catch (e) {
      setError(e?.body?.message || e?.message || "Could not remove the exception.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Exception · {finding?.controlId}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 2 }}>
          {finding?.title}. The finding stays visible and the next run still verifies it; the exception records who accepted
          the risk, why, and until when.
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={2}
            size="small"
            slotProps={{ htmlInput: { maxLength: 500 } }}
            placeholder="e.g. Entra Connect sync account — access to the sync server is restricted to two admins."
          />
          <TextField
            type="date"
            label="Expires"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: inDays(1), max: inDays(366) } }}
            sx={{ width: 200 }}
          />
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
        {finding?.exception ? (
          <Button onClick={remove} disabled={saving} color="error" sx={{ textTransform: "none", mr: "auto" }}>
            Remove exception
          </Button>
        ) : null}
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || reason.trim().length === 0 || !expires}
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          Save exception
        </Button>
      </DialogActions>
    </Dialog>
  );
}
