// src/components/Compliance/ExceptionRequestDialog.jsx
//
// P1-7 — pedir una excepción para uno o varios hallazgos. Reconocer, aceptar
// el riesgo o "won't fix" ya no son un clic: llevan justificación, un dueño
// del riesgo (miembro activo del tenant) y una caducidad de como mucho 12
// meses, y los aprueba otro OWNER/ADMIN. Mientras está pendiente el hallazgo
// sigue contando como fallo — el diálogo lo dice antes de enviar.

import * as React from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { listTenantMembers } from "../../api/tenants";
import { useEffectiveTenantId } from "../../hooks/useEffectiveTenantId";
import { BRAND, TEXT } from "../../theme/brand";
import {
  EXCEPTION_KIND_META,
  EXCEPTION_MAX_DAYS,
  EXCEPTION_MIN_JUSTIFICATION,
  dateInputValue,
  expiryIsoFromDateInput,
} from "./complianceHelpers";

export default function ExceptionRequestDialog({ open, count = 1, findingTitle = null, onSubmit, onCancel }) {
  const tenantId = useEffectiveTenantId();
  const [kind, setKind] = React.useState("risk_accepted");
  const [justification, setJustification] = React.useState("");
  const [riskOwner, setRiskOwner] = React.useState("");
  const [expiry, setExpiry] = React.useState(() => dateInputValue(EXCEPTION_MAX_DAYS));
  const [members, setMembers] = React.useState([]);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setKind("risk_accepted");
    setJustification("");
    setRiskOwner("");
    setExpiry(dateInputValue(EXCEPTION_MAX_DAYS));
    setSubmitting(false);
    if (!tenantId) return;
    let cancelled = false;
    listTenantMembers(tenantId)
      .then((r) => {
        if (!cancelled) setMembers((r?.items || []).filter((m) => m.isActive && m.email));
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId]);

  const trimmed = justification.trim();
  const justificationOk = trimmed.length >= EXCEPTION_MIN_JUSTIFICATION;
  const expiresAt = expiryIsoFromDateInput(expiry);
  const minDate = dateInputValue(1);
  const maxDate = dateInputValue(EXCEPTION_MAX_DAYS);
  const expiryOk = Boolean(expiresAt) && expiry >= minDate && expiry <= maxDate;
  const canSubmit = justificationOk && Boolean(riskOwner) && expiryOk && !submitting;

  async function submit() {
    setSubmitting(true);
    try {
      await onSubmit({ kind, justification: trimmed, riskOwner, expiresAt });
    } finally {
      setSubmitting(false);
    }
  }

  const target = count > 1 ? `${count} selected findings` : findingTitle ? `“${findingTitle}”` : "this finding";

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Request an exception</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 2 }}>
          For {target}. Another owner or administrator of this tenant has to approve it.
          {count > 1 ? " Each finding gets its own request." : ""}
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Until it is approved nothing changes: the finding keeps counting as failed.
        </Alert>
        <Stack spacing={2}>
          <RadioGroup value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(EXCEPTION_KIND_META).map(([value, meta]) => (
              <FormControlLabel
                key={value}
                value={value}
                control={<Radio size="small" />}
                label={
                  <span>
                    <Typography component="span" sx={{ fontSize: TEXT.sm, fontWeight: 700 }}>{meta.label}</Typography>
                    <Typography component="span" sx={{ fontSize: TEXT.sm, color: BRAND.gray }}> — {meta.description}</Typography>
                  </span>
                }
              />
            ))}
          </RadioGroup>
          <TextField
            label="Justification"
            required
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            error={justification.length > 0 && !justificationOk}
            helperText={
              justificationOk
                ? "Recorded in the finding history and in the evidence pack."
                : `At least ${EXCEPTION_MIN_JUSTIFICATION} characters: why, and what mitigates the risk meanwhile.`
            }
          />
          <FormControl fullWidth required>
            <InputLabel id="exception-risk-owner">Risk owner</InputLabel>
            <Select
              labelId="exception-risk-owner"
              label="Risk owner"
              value={riskOwner}
              onChange={(e) => setRiskOwner(e.target.value)}
            >
              {members.map((m) => (
                <MenuItem key={m.email} value={m.email.toLowerCase()}>
                  {m.email}
                </MenuItem>
              ))}
            </Select>
            {members.length === 0 ? (
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.5 }}>
                No active members with an email on this tenant.
              </Typography>
            ) : null}
          </FormControl>
          <TextField
            label="Expires on"
            type="date"
            required
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            inputProps={{ min: minDate, max: maxDate }}
            InputLabelProps={{ shrink: true }}
            error={!expiryOk}
            helperText="At most 12 months. When it expires the exception stops applying and has to be requested again."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={!canSubmit} onClick={submit}>
          Request approval
        </Button>
      </DialogActions>
    </Dialog>
  );
}
