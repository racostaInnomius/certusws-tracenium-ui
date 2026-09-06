// src/components/Reports/EmailReportDialog.jsx
//
// Recipients = tenant members (checkbox list, resolved server-side by
// id — never a client-typed email for a member) plus an optional
// free-text field for people outside the tenant. Per ADR-0007's
// direction (person-based recipients over free text) the member list
// is the primary path; the text field is only the escape hatch, reusing
// the same parse/validate helpers RuleNotifyEditor.jsx already uses for
// its own free-text recipients.

import * as React from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useEffectiveTenantId } from "../../hooks/useEffectiveTenantId";
import { listTenantMembers } from "../../api/tenants";
import { emailReport } from "../../api/reports";
import { parseRecipients, validateRecipients, MAX_RECIPIENTS } from "../Alerts/notifyHelpers";
import { BRAND } from "../../theme/brand";

export default function EmailReportDialog({ open, onClose, reportType, onResult, params }) {
  // ⚠️ El tenant EFECTIVO, no el del token. En una sesión de MSP con un
  // cliente abierto, `auth.tenantId` es el del operador: la lista de
  // miembros salía vacía y no se podía ni enviar ni programar para el
  // cliente que se está mirando.
  const tenantId = useEffectiveTenantId();

  const [members, setMembers] = React.useState([]);
  const [loadingMembers, setLoadingMembers] = React.useState(false);
  const [checkedIds, setCheckedIds] = React.useState([]);
  const [externalText, setExternalText] = React.useState("");
  const [format, setFormat] = React.useState(reportType?.formats?.[0] || "");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open || !reportType) return;
    setFormat(reportType.formats?.[0] || "");
    setCheckedIds([]);
    setExternalText("");
    setError("");
    setLoadingMembers(true);
    listTenantMembers(tenantId)
      .then((res) => setMembers((res?.items || []).filter((m) => m.isActive && m.email)))
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));
  }, [open, reportType, tenantId]);

  if (!reportType) return null;

  const toggleMember = (id) => {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const externalEmails = parseRecipients(externalText);
  const externalCheck = validateRecipients(externalEmails);
  const hasRecipients = checkedIds.length > 0 || externalEmails.length > 0;

  const handleSend = async () => {
    if (!externalCheck.ok) {
      setError(
        externalCheck.invalid.length
          ? `Not a valid email: ${externalCheck.invalid[0]}`
          // El tope, no cuántos hay: "max 23" con 23 escritos no dice nada.
          : `Too many external recipients (max ${MAX_RECIPIENTS}).`
      );
      return;
    }
    setSending(true);
    setError("");
    try {
      const result = await emailReport(reportType.key, {
        format,
        memberIds: checkedIds,
        externalEmails: externalCheck.unique,
        params
      });
      onResult?.(result);
      onClose();
    } catch (err) {
      setError(err?.message || "Could not send the email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={sending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Email "{reportType.label}"</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            select
            label="Format"
            size="small"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {(reportType.formats || []).map((f) => (
              <MenuItem key={f} value={f}>
                {f.toUpperCase()}
              </MenuItem>
            ))}
          </TextField>

          <Box>
            <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700 }}>
              TENANT MEMBERS
            </Typography>
            {loadingMembers ? (
              <Typography variant="body2" sx={{ color: BRAND.gray, mt: 0.5 }}>
                Loading…
              </Typography>
            ) : members.length === 0 ? (
              <Typography variant="body2" sx={{ color: BRAND.gray, mt: 0.5 }}>
                No active members with an email on this tenant.
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 180, overflowY: "auto" }}>
                {members.map((m) => (
                  <FormControlLabel
                    key={m.id}
                    sx={{ display: "flex", ml: 0 }}
                    control={
                      <Checkbox
                        size="small"
                        checked={checkedIds.includes(m.id)}
                        onChange={() => toggleMember(m.id)}
                      />
                    }
                    label={
                      <Typography variant="body2">
                        {m.email} <Typography component="span" variant="caption" sx={{ color: BRAND.gray }}>({m.role})</Typography>
                      </Typography>
                    }
                  />
                ))}
              </Box>
            )}
          </Box>

          <TextField
            label="External emails (optional)"
            placeholder="auditor@example.com, another@example.com"
            size="small"
            multiline
            minRows={2}
            value={externalText}
            onChange={(e) => setExternalText(e.target.value)}
            helperText="Comma or newline separated — for people outside this tenant."
          />

          {error && (
            <Typography variant="body2" sx={{ color: "error.main" }}>
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={sending || !format || !hasRecipients}
        >
          {sending ? "Sending…" : "Send"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
