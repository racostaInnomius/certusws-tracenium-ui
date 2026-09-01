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
function expedienteValido(reason, ticketRef) {
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
async function esperarCsr(jobId, { intentos = 20, esperaMs = 3000, señal } = {}) {
  for (let i = 0; i < intentos; i++) {
    if (señal?.abortado) return { estado: "cancelado" };
    await new Promise((r) => setTimeout(r, esperaMs));
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
      return { estado: "completed", result: r };
    }
    if (job.status === "failed" || job.status === "timeout") {
      return { estado: "failed", error: job.last_error || "el equipo rechazó la petición" };
    }
  }
  return { estado: "esperando" };
}

const PASOS = ["Pedir el CSR al equipo", "Firmar en tu CA", "Instalar el certificado"];

export default function CertIssuanceDialog({ open, onClose, devices = [], deviceId: deviceIdInicial }) {
  const [paso, setPaso] = React.useState(0);

  // Paso 1
  const [deviceId, setDeviceId] = React.useState(deviceIdInicial || "");
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
  const señal = React.useRef({ abortado: false });

  React.useEffect(() => {
    if (open) {
      señal.current = { abortado: false };
      setMsg(null);
    }
    return () => {
      // Si el diálogo se cierra a mitad de la espera, se corta el sondeo.
      señal.current.abortado = true;
    };
  }, [open]);

  const copiar = (texto) => {
    try {
      navigator.clipboard?.writeText(texto);
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

  const puedePedir =
    deviceId && cn.trim().length > 0 && expedienteValido(reason, ticketRef) && !busy;

  const pedirCsr = async () => {
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
          titulo: "Pendiente de visto bueno",
          text:
            `${r.message || "la política del tenant lo exige"}. ` +
            "Todavía no se ha creado ninguna clave en el equipo: se creará cuando se apruebe."
        });
        return;
      }
      if (!r?.ok) {
        setMsg({ sev: "error", text: r?.message || "No se pudo pedir el CSR" });
        return;
      }

      setKeyId(r.keyId || "");
      setMsg({
        sev: "info",
        text: "Petición enviada. Esperando a que el equipo genere la clave y devuelva el CSR…"
      });

      const fin = await esperarCsr(r.jobId, { señal: señal.current });
      if (fin.estado === "completed" && fin.result?.csrPem) {
        setCsrPem(fin.result.csrPem);
        setPaso(1);
        setMsg(null);
      } else if (fin.estado === "failed") {
        setMsg({ sev: "error", text: fin.error });
      } else if (fin.estado === "esperando") {
        setMsg({
          sev: "warning",
          titulo: "El equipo aún no responde",
          text:
            `El job sigue en cola (${r.jobId}). No se ha perdido nada: el agente lo recogerá ` +
            `al conectar y el CSR quedará en el detalle del job. Guarda el keyId «${r.keyId}».`
        });
      }
    } catch (e) {
      setMsg({ sev: "error", text: e?.message || "No se pudo pedir el CSR" });
    } finally {
      setBusy(false);
    }
  };

  const puedeInstalar =
    deviceId &&
    keyId.trim() &&
    certPem.includes("BEGIN CERTIFICATE") &&
    expedienteValido(reason, ticketRef) &&
    !busy;

  const instalar = async () => {
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
          titulo: "Pendiente de visto bueno",
          text: r.message || "la política del tenant lo exige"
        });
      } else if (r?.status === "held_for_window") {
        // No es un error: instalar recarga el servicio que usa el
        // certificado, así que espera a la ventana del tenant.
        setMsg({
          sev: "warning",
          titulo: "Fuera de la ventana de mantenimiento",
          text: `${r.message}. Próxima apertura: ${
            r.scheduledAt ? new Date(r.scheduledAt).toLocaleString() : "—"
          }. Puedes marcar «instalar ahora» si es una urgencia.`
        });
      } else if (r?.ok) {
        setMsg({
          sev: "success",
          titulo: "Enviado al equipo",
          text:
            "Al terminar, el agente vuelve a inventariar la criptografía del equipo y el " +
            "certificado aparecerá en la pestaña de certificados. Si no aparece, no se instaló."
        });
      } else {
        setMsg({ sev: "error", text: r?.message || "No se pudo instalar" });
      }
    } catch (e) {
      setMsg({ sev: "error", text: e?.message || "No se pudo instalar" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Emitir e instalar un certificado</DialogTitle>
      <DialogContent>
        <Stepper activeStep={paso} sx={{ mb: 3, mt: 1 }}>
          {PASOS.map((p) => (
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
          Tracenium <strong>no firma</strong>. El equipo genera la clave —que nunca sale de
          él— y su CSR; tú lo llevas a tu CA y vuelves aquí con el certificado. Solo se
          instala si <strong>ya encadena a una CA en la que ese equipo confía</strong>: el
          agente lo comprueba contra su propio almacén y rechaza lo demás.
        </Alert>

        {paso === 0 && (
          <Stack spacing={0.5}>
            <TextField
              select fullWidth margin="dense" label="Equipo"
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
                fullWidth margin="dense" label="CN (nombre común)" required
                value={cn} onChange={(e) => setCn(e.target.value)}
                placeholder="web01.corp.example"
              />
              <TextField
                fullWidth margin="dense" label="O (organización)"
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
              Sujeto: <code>{subject || "—"}</code>
            </Typography>

            <TextField
              fullWidth margin="dense" label="Nombres DNS (SAN)"
              value={dnsNames} onChange={(e) => setDnsNames(e.target.value)}
              placeholder="web01.corp.example, web01"
              helperText="Separados por comas o espacios. Los navegadores validan contra esto, no contra el CN."
            />
            <TextField
              select fullWidth margin="dense" label="Uso"
              value={eku} onChange={(e) => setEku(e.target.value)}
            >
              <MenuItem value="serverAuth">Servidor TLS (serverAuth)</MenuItem>
              <MenuItem value="clientAuth">Cliente TLS (clientAuth)</MenuItem>
            </TextField>

            <Divider sx={{ my: 2 }} />
            <TextField
              fullWidth multiline minRows={2} margin="dense" label="Motivo" required
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Para qué es este certificado"
              helperText="Mínimo 10 caracteres. Queda registrado aunque no haga falta visto bueno."
            />
            <TextField
              fullWidth margin="dense" label="Ticket" required
              value={ticketRef} onChange={(e) => setTicketRef(e.target.value)}
            />
          </Stack>
        )}

        {paso === 1 && (
          <Stack spacing={2}>
            {/*
              El keyId primero y destacado. Es lo único que ata el
              certificado firmado a la clave que espera en el equipo, y la
              espera puede durar días.
            */}
            <Alert severity="warning">
              <AlertTitle>Guarda este identificador</AlertTitle>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={keyId} sx={{ fontFamily: "monospace", fontWeight: 600 }} />
                <Tooltip title="Copiar">
                  <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copiar(keyId)}>
                    Copiar
                  </Button>
                </Tooltip>
              </Stack>
              <Typography variant="body2" sx={{ mt: 1 }}>
                La clave privada no sale del equipo. Sin este identificador el certificado
                firmado no se puede asociar a ella y esa clave queda inservible.
              </Typography>
            </Alert>

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2">CSR para tu CA</Typography>
                <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copiar(csrPem)}>
                  Copiar CSR
                </Button>
              </Stack>
              <TextField
                fullWidth multiline minRows={8} value={csrPem}
                InputProps={{ readOnly: true, sx: { fontFamily: "monospace", fontSize: TEXT.sm } }}
              />
            </Box>
          </Stack>
        )}

        {paso === 2 && (
          <Stack spacing={0.5}>
            <TextField
              fullWidth margin="dense" label="Identificador de clave (keyId)" required
              value={keyId} onChange={(e) => setKeyId(e.target.value)}
              InputProps={{ sx: { fontFamily: "monospace" } }}
              helperText="El que te dio el paso 1. Si vuelves días después, pégalo aquí."
            />
            <TextField
              fullWidth multiline minRows={6} margin="dense" label="Certificado firmado (PEM)" required
              value={certPem} onChange={(e) => setCertPem(e.target.value)}
              InputProps={{ sx: { fontFamily: "monospace", fontSize: TEXT.sm } }}
              placeholder="-----BEGIN CERTIFICATE-----"
            />
            <TextField
              fullWidth multiline minRows={4} margin="dense" label="Intermedias (PEM)"
              value={chainPem} onChange={(e) => setChainPem(e.target.value)}
              InputProps={{ sx: { fontFamily: "monospace", fontSize: TEXT.sm } }}
              helperText="Sin ellas el agente rechaza la instalación, y un servicio arrancaría con clientes fallando."
            />
            <TextField
              fullWidth margin="dense" label="Destino"
              value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder="/etc/nginx/ssl/web01.pem"
              helperText={
                "Linux: ruta del PEM del servicio, y es obligatoria. Windows: My o WebHosting. " +
                "macOS: el llavero de la máquina. Nunca un almacén de anclas — el agente lo rechaza."
              }
            />
            <Button
              size="small"
              onClick={() => setIgnoreWindow((v) => !v)}
              sx={{ alignSelf: "flex-start", mt: 1 }}
              color={ignoreWindow ? "warning" : "inherit"}
            >
              {ignoreWindow ? "✓ Instalar ahora, fuera de ventana" : "Instalar ahora, fuera de ventana"}
            </Button>
          </Stack>
        )}

        {msg && (
          <Alert severity={msg.sev} sx={{ mt: 2 }}>
            {msg.titulo && <AlertTitle>{msg.titulo}</AlertTitle>}
            {msg.text}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cerrar</Button>
        {paso === 0 && (
          <Button variant="contained" disabled={!puedePedir} onClick={pedirCsr}>
            {busy ? "Esperando al equipo…" : "Pedir CSR"}
          </Button>
        )}
        {paso === 1 && (
          <Button variant="contained" onClick={() => setPaso(2)}>
            Ya tengo el certificado firmado
          </Button>
        )}
        {paso === 2 && (
          <Button variant="contained" disabled={!puedeInstalar} onClick={instalar}>
            {busy ? "Enviando…" : "Instalar"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
