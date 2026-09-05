// src/components/CryptoDiscovery/CertIssuanceDialog.jsx
//
// ADR-0011 fase 3 — emitir e instalar un certificado de HOJA en un
// equipo.
//
// ── Por qué son dos pasos con una espera humana en medio ────────────
//
// Porque Tracenium NO firma. El alcance del ADR es explícito: *podemos
// renovar contra cualquier CA en la que el equipo ya confía; no podemos
// ser nosotros quienes le hagan confiar en una CA nueva*. Así que el
// equipo genera la clave y su CSR, alguien lo lleva a la CA del cliente
// —ADCS, ACME, la que ya sea ancla en ese equipo— y vuelve con el
// certificado. Entre el paso 1 y el 2 pueden pasar minutos o días.
//
// De ahí la pieza de UI que más importa aquí y que no es evidente: el
// **keyId**. La clave privada nunca sale del equipo, así que el keyId es
// lo ÚNICO que ata el certificado firmado a la clave que lo espera.
// Perderlo significa que ese material queda inservible en el endpoint —
// una «clave huérfana» en el vocabulario de la decisión 9.d. Por eso se
// muestra grande, se copia con el CSR, y el paso 2 lo acepta pegado.
//
// ── Lo que la UI tiene que dejar de esconder ────────────────────────
//
// Tres respuestas del backend NO son errores y se pintan como
// información, no como fallo:
//
//   pending_approval  la política del tenant exige visto bueno
//   held_for_window   fuera de la ventana de mantenimiento
//   dispatched        el job va camino del equipo, que puede estar
//                     apagado
//
// Confundir cualquiera de las tres con un error es el fallo que ya se
// cometió con el 202 de Remote Control, que se pintaba como «Failed to
// start session» cuando el gate estaba haciendo justo su trabajo.
//
// Copy en inglés como el resto del portal (revisión UI 2026-09-05).

import * as React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { generateCdpCsr, installCdpCert } from "../../api/cdp";
import { getJob } from "../../api/jobs";
import { TEXT } from "../../theme/brand";

/** El expediente de ADR-0009: sin motivo ni ticket no se sigue. */
function hasCaseFile(reason, ticketRef) {
  return reason.trim().length >= 10 && ticketRef.trim().length >= 3;
}

/**
 * Espera a que el job del CSR termine y devuelve su resultado.
 *
 * ⚠️ Acotado a propósito. El equipo puede estar apagado, y una espera
 * sin fin dejaría el diálogo girando para siempre con el operador
 * mirando. Cuando se agota, el mensaje NO dice «falló»: dice que el job
 * sigue en cola, que es la verdad — el agente lo recogerá al conectar y
 * el CSR estará en el detalle del job.
 */
async function waitForCsr(jobId, { attempts = 20, waitMs = 3000, signal } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) return { state: "cancelled" };
    await new Promise((r) => setTimeout(r, waitMs));
    let job = null;
    try {
      job = (await getJob(jobId))?.job ?? null;
    } catch {
      // Un fallo de red puntual no cancela la espera: el job sigue vivo
      // en el backend haga lo que haga esta pestaña.
      continue;
    }
    if (!job) continue;
    if (job.status === "completed") {
      const r = typeof job.result_json === "string"
        ? JSON.parse(job.result_json || "{}")
        : job.result_json || {};
      return { state: "completed", result: r };
    }
    if (job.status === "failed" || job.status === "timeout") {
      return { state: "failed", error: job.last_error || "the device rejected the request" };
    }
  }
  return { state: "waiting" };
}

const STEPS = ["Request the CSR from the device", "Sign it with your CA", "Install the certificate"];

export default function CertIssuanceDialog({ open, onClose, devices = [], deviceId: initialDeviceId }) {
  const [step, setStep] = React.useState(0);

  // Paso 1
  const [deviceId, setDeviceId] = React.useState(initialDeviceId || "");
  const [cn, setCn] = React.useState("");
  const [org, setOrg] = React.useState("");
  const [ou, setOu] = React.useState("");
  const [dnsNames, setDnsNames] = React.useState("");
  const [eku, setEku] = React.useState("serverAuth");
  const [reason, setReason] = React.useState("");
  const [ticketRef, setTicketRef] = React.useState("");

  // Resultado del paso 1
  const [keyId, setKeyId] = React.useState("");
  const [csrPem, setCsrPem] = React.useState("");

  // Paso 3
  const [certPem, setCertPem] = React.useState("");
  const [chainPem, setChainPem] = React.useState("");
  const [destination, setDestination] = React.useState("");
  const [ignoreWindow, setIgnoreWindow] = React.useState(false);

  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const signal = React.useRef({ aborted: false });

  React.useEffect(() => {
    if (open) {
      signal.current = { aborted: false };
      setMsg(null);
    }
    return () => {
      // Si el diálogo se cierra a mitad de la espera, se corta el sondeo.
      signal.current.aborted = true;
    };
  }, [open]);

  const copy = (text) => {
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      /* sin portapapeles el operador siempre puede seleccionar a mano */
    }
  };

  const subject = [
    cn.trim() && `CN=${cn.trim()}`,
    org.trim() && `O=${org.trim()}`,
    ou.trim() && `OU=${ou.trim()}`
  ]
    .filter(Boolean)
    .join(",");

  const canRequest =
    deviceId && cn.trim().length > 0 && hasCaseFile(reason, ticketRef) && !busy;

  const requestCsr = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await generateCdpCsr({
        deviceId,
        subject,
        dnsNames: dnsNames
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        eku,
        reason: reason.trim(),
        ticketRef: ticketRef.trim()
      });

      if (r?.status === "pending_approval") {
        // ⚠️ Y NO hay clave todavía. La decisión 9.a lo pide así: no se
        // genera material privado hasta que el visto bueno existe, para
        // que la latencia de decisión humana no deje huérfanas.
        setMsg({
          sev: "info",
          title: "Waiting for approval",
          text:
            `${r.message || "the tenant policy requires it"}. ` +
            "No key has been created on the device yet: it is created once approved."
        });
        return;
      }
      if (!r?.ok) {
        setMsg({ sev: "error", text: r?.message || "Couldn't request the CSR" });
        return;
      }

      setKeyId(r.keyId || "");
      setMsg({
        sev: "info",
        text: "Request sent. Waiting for the device to generate the key and return the CSR…"
      });

      const end = await waitForCsr(r.jobId, { signal: signal.current });
      if (end.state === "completed" && end.result?.csrPem) {
        setCsrPem(end.result.csrPem);
        setStep(1);
        setMsg(null);
      } else if (end.state === "failed") {
        setMsg({ sev: "error", text: end.error });
      } else if (end.state === "waiting") {
        setMsg({
          sev: "warning",
          title: "The device hasn't answered yet",
          text:
            `The job is still queued (${r.jobId}). Nothing is lost: the agent picks it up when it connects and ` +
            `the CSR will be in the job detail. Keep the keyId “${r.keyId}”.`
        });
      }
    } catch (e) {
      setMsg({ sev: "error", text: e?.message || "Couldn't request the CSR" });
    } finally {
      setBusy(false);
    }
  };

  const canInstall =
    deviceId &&
    keyId.trim() &&
    certPem.includes("BEGIN CERTIFICATE") &&
    hasCaseFile(reason, ticketRef) &&
    !busy;

  const install = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await installCdpCert({
        deviceId,
        keyId: keyId.trim(),
        certPem,
        chainPems: chainPem.includes("BEGIN CERTIFICATE") ? [chainPem] : [],
        destination: destination.trim() || undefined,
        reason: reason.trim(),
        ticketRef: ticketRef.trim(),
        ignoreWindow
      });

      if (r?.status === "pending_approval") {
        setMsg({
          sev: "info",
          title: "Waiting for approval",
          text: r.message || "the tenant policy requires it"
        });
      } else if (r?.status === "held_for_window") {
        // No es un error: instalar recarga el servicio que usa el
        // certificado, así que espera a la ventana del tenant.
        setMsg({
          sev: "warning",
          title: "Outside the maintenance window",
          text: `${r.message}. Next opening: ${
            r.scheduledAt ? new Date(r.scheduledAt).toLocaleString() : "—"
          }. You can tick “install now” if this is urgent.`
        });
      } else if (r?.ok) {
        setMsg({
          sev: "success",
          title: "Sent to the device",
          text:
            "When it finishes, the agent re-inventories the device's cryptography and the certificate shows up " +
            "in Inventory. If it doesn't show up, it wasn't installed."
        });
      } else {
        setMsg({ sev: "error", text: r?.message || "Couldn't install" });
      }
    } catch (e) {
      setMsg({ sev: "error", text: e?.message || "Couldn't install" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Issue and install a certificate</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
          {STEPS.map((p) => (
            <Step key={p}>
              <StepLabel>{p}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/*
          Se dice desde el principio dónde NO llega esto. Un operador que
          espere que Tracenium firme perderá el tiempo hasta el paso 2.
        */}
        <Alert severity="info" sx={{ mb: 2 }}>
          Tracenium <strong>does not sign</strong>. The device generates the key — which never leaves it — and its
          CSR; you take that to your CA and come back here with the certificate. It is only installed if it{" "}
          <strong>already chains to a CA that device trusts</strong>: the agent checks against its own store and
          rejects anything else.
        </Alert>

        {step === 0 && (
          <Stack spacing={0.5}>
            <TextField
              select fullWidth margin="dense" label="Device"
              value={deviceId} onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <MenuItem key={d.id ?? d} value={d.id ?? d}>
                  {d.name ? `${d.name} · ${d.id}` : (d.id ?? d)}
                </MenuItem>
              ))}
            </TextField>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth margin="dense" label="CN (common name)" required
                value={cn} onChange={(e) => setCn(e.target.value)}
                placeholder="web01.corp.example"
              />
              <TextField
                fullWidth margin="dense" label="O (organization)"
                value={org} onChange={(e) => setOrg(e.target.value)}
              />
              <TextField
                fullWidth margin="dense" label="OU"
                value={ou} onChange={(e) => setOu(e.target.value)}
              />
            </Stack>
            {/*
              Solo CN, O y OU. Es lo que aceptan las tres plataformas, y
              es deliberado: se midió que openssl NO falla ante un
              atributo desconocido —avisa y lo descarta—, así que un
              formulario más permisivo produciría certificados con un
              sujeto distinto del pedido sin que nadie se entere.
            */}
            <Typography variant="caption" sx={{ color: "text.secondary", mb: 1 }}>
              Subject: <code>{subject || "—"}</code>
            </Typography>

            <TextField
              fullWidth margin="dense" label="DNS names (SAN)"
              value={dnsNames} onChange={(e) => setDnsNames(e.target.value)}
              placeholder="web01.corp.example, web01"
              helperText="Comma- or space-separated. Browsers validate against these, not against the CN."
            />
            <TextField
              select fullWidth margin="dense" label="Purpose"
              value={eku} onChange={(e) => setEku(e.target.value)}
            >
              <MenuItem value="serverAuth">TLS server (serverAuth)</MenuItem>
              <MenuItem value="clientAuth">TLS client (clientAuth)</MenuItem>
            </TextField>

            <Divider sx={{ my: 2 }} />
            <TextField
              fullWidth multiline minRows={2} margin="dense" label="Reason" required
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="What this certificate is for"
              helperText="At least 10 characters. Recorded even when no approval is needed."
            />
            <TextField
              fullWidth margin="dense" label="Ticket" required
              value={ticketRef} onChange={(e) => setTicketRef(e.target.value)}
              helperText="At least 3 characters"
            />
          </Stack>
        )}

        {step === 1 && (
          <Stack spacing={2}>
            {/*
              El keyId primero y destacado. Es lo único que ata el
              certificado firmado a la clave que espera en el equipo, y la
              espera puede durar días.
            */}
            <Alert severity="warning">
              <AlertTitle>Keep this identifier</AlertTitle>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={keyId} sx={{ fontFamily: "monospace", fontWeight: 600 }} />
                <Tooltip title="Copy">
                  <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copy(keyId)}>
                    Copy
                  </Button>
                </Tooltip>
              </Stack>
              <Typography variant="body2" sx={{ mt: 1 }}>
                The private key never leaves the device. Without this identifier the signed certificate cannot be
                matched to it and that key becomes unusable.
              </Typography>
            </Alert>

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2">CSR for your CA</Typography>
                <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copy(csrPem)}>
                  Copy CSR
                </Button>
              </Stack>
              <TextField
                fullWidth multiline minRows={8} value={csrPem}
                InputProps={{ readOnly: true, sx: { fontFamily: "monospace", fontSize: TEXT.sm } }}
              />
            </Box>
          </Stack>
        )}

        {step === 2 && (
          <Stack spacing={0.5}>
            <TextField
              fullWidth margin="dense" label="Key identifier (keyId)" required
              value={keyId} onChange={(e) => setKeyId(e.target.value)}
              InputProps={{ sx: { fontFamily: "monospace" } }}
              helperText="The one step 1 gave you. Coming back days later? Paste it here."
            />
            <TextField
              fullWidth multiline minRows={6} margin="dense" label="Signed certificate (PEM)" required
              value={certPem} onChange={(e) => setCertPem(e.target.value)}
              InputProps={{ sx: { fontFamily: "monospace", fontSize: TEXT.sm } }}
              placeholder="-----BEGIN CERTIFICATE-----"
            />
            <TextField
              fullWidth multiline minRows={4} margin="dense" label="Intermediates (PEM)"
              value={chainPem} onChange={(e) => setChainPem(e.target.value)}
              InputProps={{ sx: { fontFamily: "monospace", fontSize: TEXT.sm } }}
              helperText="Without them the agent rejects the install — a service would start with clients failing."
            />
            <TextField
              fullWidth margin="dense" label="Destination"
              value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder="/etc/nginx/ssl/web01.pem"
              helperText={
                "Linux: path of the service's PEM, required. Windows: My or WebHosting. " +
                "macOS: the machine keychain. Never a trust-anchor store — the agent rejects it."
              }
            />
            <Button
              size="small"
              onClick={() => setIgnoreWindow((v) => !v)}
              sx={{ alignSelf: "flex-start", mt: 1 }}
              color={ignoreWindow ? "warning" : "inherit"}
            >
              {ignoreWindow ? "✓ Install now, outside the maintenance window" : "Install now, outside the maintenance window"}
            </Button>
          </Stack>
        )}

        {msg && (
          <Alert severity={msg.sev} sx={{ mt: 2 }}>
            {msg.title && <AlertTitle>{msg.title}</AlertTitle>}
            {msg.text}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
        {step === 0 && (
          <Button variant="contained" disabled={!canRequest} onClick={requestCsr}>
            {busy ? "Waiting for the device…" : "Request CSR"}
          </Button>
        )}
        {step === 1 && (
          <Button variant="contained" onClick={() => setStep(2)}>
            I have the signed certificate
          </Button>
        )}
        {step === 2 && (
          <Button variant="contained" disabled={!canInstall} onClick={install}>
            {busy ? "Sending…" : "Install"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
