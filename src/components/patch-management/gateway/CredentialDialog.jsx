// src/components/patch-management/gateway/CredentialDialog.jsx
//
// Captures the vCenter service-account credential and seals it IN THIS BROWSER
// against the gateway's certificate before anything leaves the page.
//
// Two things this dialog must never do:
//   1. Put the password in any request body, log, or component state that
//      outlives the submit. It goes straight into sealCredential().
//   2. Submit before the admin has confirmed the certificate fingerprint.
//
// ⚠️ Esa confirmación NO es, por sí sola, defensa contra un control plane
// comprometido, aunque este archivo lo dijera. Es el modelo de SSH, y el modelo
// de SSH necesita que haya dónde comparar: en la práctica casi nadie va al
// servidor del gateway a mirar la huella, así que la casilla se marca porque
// hay que marcarla.
//
// Lo que la vuelve real es ADR-0013 (F): la huella se FIJA en la primera
// provisión, y a partir de ahí es el sistema —no la memoria de una persona— el
// que nota si cambia. Cuando cambia, este diálogo enseña las dos y exige una
// confirmación aparte. La comprobación que manda vive en el servidor; esto
// existe para que la persona tenga con qué decidir.

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
import {
  describeSealTarget,
  canSubmitCredential,
  describeProvisionError,
  isAwaitingDevice,
} from "./sealTargetNotice";
import { TEXT } from "../../../theme/brand";

export default function CredentialDialog({ open, gateway, onClose, onDone, notify }) {
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [certInfo, setCertInfo] = React.useState(null);
  const [loadError, setLoadError] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  // Deliberadamente separada de `confirmed`: una dice «esta huella es la del
  // equipo» y la otra «sé que cambió respecto a la anterior». Reutilizar la
  // primera convertiría un clic ya rutinario en la aprobación de algo que
  // nadie miró.
  const [confirmedChange, setConfirmedChange] = React.useState(false);
  const [awaitingDevice, setAwaitingDevice] = React.useState(false);
  const [error, setError] = React.useState("");
  const [errorDetail, setErrorDetail] = React.useState(null);

  React.useEffect(() => {
    if (!open || !gateway) return;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setCertInfo(null);
    setConfirmed(false);
    setConfirmedChange(false);
    setAwaitingDevice(false);
    setUsername("");
    setPassword("");
    setError("");
    setErrorDetail(null);
    // These endpoints return the entity itself, with no `{ ok, data }`
    // envelope; http.js throws on any non-2xx, so a resolved value is the
    // success case. Checking `res.ok` treated every success as a failure.
    getGatewayPublicKey(gateway.id)
      .then((data) => {
        if (cancelled) return;
        setCertInfo(data);
      })
      .catch((err) => {
        if (cancelled) return;
        // «Todavía no ha aparecido» es un estado legítimo y frecuente —se
        // designa el gateway con la máquina apagada— y no una avería.
        // Pintarlo en rojo manda a alguien a buscar un problema que no existe.
        setAwaitingDevice(isAwaitingDevice(err));
        setLoadError(
          err?.body?.message ||
            "Could not fetch the gateway certificate. The gateway must connect at least once before a credential can be sealed for it."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, gateway]);

  const submit = async () => {
    setError("");
    setErrorDetail(null);
    setSubmitting(true);
    try {
      // Seal first. If this throws, nothing has left the browser.
      const envelope = await sealCredential({ username, password }, certInfo.certPem);
      // Drop the plaintext from component state the moment it is sealed.
      setPassword("");
      await provisionGatewayCredential(gateway.id, envelope, {
        // Solo viaja cuando de verdad hubo un cambio que alguien aprobó. El
        // servidor lo exige, así que mandarlo siempre desarmaría su propia
        // comprobación desde el cliente.
        confirmFingerprintChange: notice?.requiresChangeConfirmation ? confirmedChange : undefined,
      });
      notify?.("success", "Credential sealed and sent. The gateway will verify it and report back — watch the health column.");
      onDone?.();
      onClose?.();
    } catch (e) {
      // Three failures distintos aterrizan aquí: el sellado en el navegador, un
      // rechazo genérico del control plane, y —el que importa— que el
      // certificado haya cambiado ENTRE abrir el diálogo y enviar. Ese último
      // trae las dos huellas en el cuerpo justamente para poder enseñarlas.
      const detail = describeProvisionError(e?.body);
      setErrorDetail(detail);
      setError(
        detail ? "" : e?.body?.message || e?.message || "Could not seal the credential."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const notice = describeSealTarget(certInfo);
  const canSubmit = canSubmitCredential({
    certInfo,
    username,
    password,
    confirmedIdentity: confirmed,
    confirmedChange,
    submitting,
  });

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>vCenter credential — {gateway?.name}</DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={28} />
          </Stack>
        )}

        {!loading && loadError && (
          <Alert severity={awaitingDevice ? "info" : "warning"}>
            {awaitingDevice && <AlertTitle>Waiting for the gateway host</AlertTitle>}
            {loadError}
          </Alert>
        )}

        {!loading && certInfo && (
          <Stack spacing={2.5}>
            {notice && (
              <Alert severity={notice.tone}>
                <AlertTitle>{notice.title}</AlertTitle>
                {notice.body}
                {notice.pinned && (
                  <Box sx={{ mt: 1.5, fontFamily: "monospace", fontSize: TEXT.xs }}>
                    <Box sx={{ color: "text.secondary" }}>Previously approved</Box>
                    <Box sx={{ wordBreak: "break-all" }}>{formatFingerprint(notice.pinned)}</Box>
                    <Box sx={{ color: "text.secondary", mt: 1 }}>Presented now</Box>
                    <Box sx={{ wordBreak: "break-all" }}>{formatFingerprint(notice.current)}</Box>
                  </Box>
                )}
                {notice.requiresChangeConfirmation && (
                  <FormControlLabel
                    sx={{ mt: 1 }}
                    control={
                      <Checkbox
                        checked={confirmedChange}
                        onChange={(e) => setConfirmedChange(e.target.checked)}
                      />
                    }
                    label="I have verified this change with the host administrator"
                  />
                )}
              </Alert>
            )}

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
                Compare it with the fingerprint the gateway host reports for itself.
                If they differ, stop — something is impersonating the gateway.
              </Typography>
              {/*
                ADR-0013 (A). Decir DÓNDE mirar es lo que convierte esta casilla
                en una comprobación de verdad: hasta ahora pedía comparar contra
                algo que el equipo no enseñaba en ninguna parte, así que se
                marcaba por trámite. Y el fichero se nombra primero porque un
                gateway de vCenter suele ser un servidor sin escritorio, donde
                la bandeja no existe.
              */}
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                On the gateway host: <code>tray-status.json</code> in the agent data
                directory, under <code>gateway.credentialKeyFingerprint</code> — or the
                agent log line “vCenter credential key fingerprint”. On a desktop it is
                also in the Tracenium tray, under Device info.
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

            {errorDetail && (
              <Alert severity={errorDetail.tone}>
                <AlertTitle>{errorDetail.title}</AlertTitle>
                {errorDetail.body}
                {errorDetail.pinned && (
                  <Box sx={{ mt: 1.5, fontFamily: "monospace", fontSize: TEXT.xs }}>
                    <Box sx={{ color: "text.secondary" }}>Previously approved</Box>
                    <Box sx={{ wordBreak: "break-all" }}>{formatFingerprint(errorDetail.pinned)}</Box>
                    <Box sx={{ color: "text.secondary", mt: 1 }}>Presented now</Box>
                    <Box sx={{ wordBreak: "break-all" }}>{formatFingerprint(errorDetail.current)}</Box>
                  </Box>
                )}
              </Alert>
            )}

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
