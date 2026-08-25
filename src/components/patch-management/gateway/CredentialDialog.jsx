// src/components/patch-management/gateway/CredentialDialog.jsx
//
// Captures the vCenter service-account credential and seals it IN THIS BROWSER
// against the gateway's certificate before anything leaves the page.
//
// Two things this dialog must never do:
//   1. Put the password in any request body, log, or component state that
//      outlives the submit. It goes straight into sealCredential().
//   2. Submit before the admin has confirmed the certificate fingerprint. That
//      confirmation is the only defence against a compromised control plane
//      handing us its own public key — the SSH host-key model (ADR-0001 C).

import React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { getGatewayPublicKey, provisionGatewayCredential } from "../../../api/patchManagement";
import { sealCredential, formatFingerprint } from "./sealCredential";
import { TEXT } from "../../../theme/brand";

export default function CredentialDialog({ open, gateway, onClose, onDone, notify }) {
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [certInfo, setCertInfo] = React.useState(null);
  const [loadError, setLoadError] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open || !gateway) return;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setCertInfo(null);
    setConfirmed(false);
    setUsername("");
    setPassword("");
    setError("");
    getGatewayPublicKey(gateway.id)
      .then((res) => {
        if (cancelled) return;
        if (!res?.ok) {
          setLoadError(
            res?.data?.message ||
              "Could not fetch the gateway certificate. The gateway must connect at least once before a credential can be sealed for it."
          );
          return;
        }
        setCertInfo(res.data);
      })
      .catch(() => !cancelled && setLoadError("Could not fetch the gateway certificate."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, gateway]);

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      // Seal first. If this throws, nothing has left the browser.
      const envelope = await sealCredential({ username, password }, certInfo.certPem);
      // Drop the plaintext from component state the moment it is sealed.
      setPassword("");
      const res = await provisionGatewayCredential(gateway.id, envelope);
      if (!res?.ok) {
        setError(res?.data?.message || "The control plane rejected the sealed credential.");
        return;
      }
      notify?.("success", "Credential sealed and sent. The gateway will verify it and report back — watch the health column.");
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || "Could not seal the credential.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(certInfo && username && password && confirmed && !submitting);

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>vCenter credential — {gateway?.name}</DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={28} />
          </Stack>
        )}

        {!loading && loadError && <Alert severity="warning">{loadError}</Alert>}

        {!loading && certInfo && (
          <Stack spacing={2.5}>
            <Alert severity="info">
              <AlertTitle>This password never reaches Tracenium's servers</AlertTitle>
              It is encrypted here, in your browser, with a key only this gateway can
              open. The control plane relays a sealed blob it has no key for.
            </Alert>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Confirm the gateway's identity
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Compare this fingerprint with the one shown on the gateway host
                itself. If they differ, stop — something is impersonating the gateway.
              </Typography>
              <Box
                sx={{
                  fontFamily: "monospace",
                  fontSize: TEXT.sm,
                  p: 1.25,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  wordBreak: "break-all",
                }}
              >
                {formatFingerprint(certInfo.certFingerprintSha256)}
              </Box>
              <FormControlLabel
                sx={{ mt: 1 }}
                control={
                  <Checkbox
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                }
                label="This fingerprint matches the gateway host"
              />
            </Box>

            <TextField
              label="vSphere username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="svc-tracenium@vsphere.local"
              fullWidth
              autoComplete="off"
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              autoComplete="new-password"
            />

            <Alert severity="warning">
              Use a service account with only the snapshot privileges
              (<code>VirtualMachine.State.CreateSnapshot / RemoveSnapshot / RevertToSnapshot</code>).
              A wrong password is reported back rather than retried — vSphere locks
              accounts after repeated failures.
            </Alert>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {submitting ? "Sealing…" : "Seal and send"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
