// src/components/Reports/GrcConnectorPanel.jsx
//
// ADR-0014 E4 — the GRC connector, as the operator sees it:
//
//   API keys   — a machine reader (Vanta, Drata, a script) pulls the
//                evidence-pack JSON from /api/v1/grc/evidence-pack with
//                `Authorization: Bearer trk_…`. The key is shown ONCE.
//   Targets    — where a scheduled run is pushed when it completes:
//                a signed webhook (any GRC / bucket / script) or a Vanta
//                private integration (custom resources, one per criterion).
//
// Nothing here is gated client-side: the backend answers 403 for USER and
// the panel just shows the error.

import * as React from "react";
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import NetworkCheckIcon from "@mui/icons-material/NetworkCheck";
import {
  listApiKeys, createApiKey, revokeApiKey,
  listGrcTargets, createGrcTarget, updateGrcTarget, deleteGrcTarget, testGrcTarget,
  listGrcDeliveries,
} from "../../api/reports";
import { BRAND, TEXT } from "../../theme/brand";
import { useConfirm } from "../common/ConfirmDialog";
import { formatWhen } from "./reportSchedules";
import { targetKindLabel, TARGET_KINDS, describeTarget, deliveryColor } from "./grcConnector";

const apiBase = () => `${(import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "")}/api/v1/grc/evidence-pack`;

function CopyButton({ value, label }) {
  const [done, setDone] = React.useState(false);
  return (
    <Tooltip title={done ? "Copied" : label || "Copy"}>
      <IconButton
        size="small"
        aria-label={label || "Copy"}
        onClick={() => {
          try { navigator.clipboard?.writeText(value); } catch { /* clipboard unavailable */ }
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

export default function GrcConnectorPanel({ onNotify }) {
  const confirm = useConfirm();
  const [keys, setKeys] = React.useState([]);
  const [targets, setTargets] = React.useState([]);
  const [deliveries, setDeliveries] = React.useState([]);
  const [secretsConfigured, setSecretsConfigured] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(null);
  const [keyDialog, setKeyDialog] = React.useState(false);
  const [keyLabel, setKeyLabel] = React.useState("");
  const [revealed, setRevealed] = React.useState(null); // { label, secret }
  const [targetDialog, setTargetDialog] = React.useState(false);
  const [form, setForm] = React.useState({ kind: "webhook", label: "", url: "", secret: "", clientId: "", clientSecret: "", resourceId: "" });
  const [formError, setFormError] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const [k, t] = await Promise.all([listApiKeys(), listGrcTargets()]);
      setKeys(k?.keys || []);
      setTargets(t?.targets || []);
      setSecretsConfigured(t?.secretsConfigured !== false);
      setError("");
    } catch (err) {
      setError(err?.message || "Could not load the GRC connector.");
    }
  }, []);

  // El historial de entregas es ADITIVO: va en su propia llamada y se traga
  // su error. Metido en el Promise.all de arriba, un backend antiguo sin el
  // endpoint —o un fallo pasajero— dejaba la pantalla entera en blanco, sin
  // claves ni destinos, por no poder pintar una lista informativa.
  const loadDeliveries = React.useCallback(async () => {
    try {
      const d = await listGrcDeliveries({ limit: 10 });
      setDeliveries(d?.deliveries || []);
    } catch {
      setDeliveries([]);
    }
  }, []);

  React.useEffect(() => { load(); loadDeliveries(); }, [load, loadDeliveries]);

  const notify = (message, severity = "success") => onNotify?.({ message, severity });

  const handleCreateKey = async () => {
    setBusy("key");
    try {
      const res = await createApiKey({ label: keyLabel.trim() });
      setKeyDialog(false);
      setKeyLabel("");
      setRevealed({ label: res?.key?.label, secret: res?.secret });
      load();
    } catch (err) {
      notify(err?.message || "Could not create the key.", "error");
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async (k) => {
    // ⚠️ La clave no se recupera: sólo se enseña una vez al crearla. Quien la
    // revoque sin querer tiene que emitir otra y repartirla de nuevo, así que
    // el diálogo lo dice en vez de dejarlo implícito.
    const ok = await confirm({
      title: `Revoke “${k.label || `key ${k.id}`}”?`,
      body:
        "Anything using this key stops working immediately.\n\n" +
        "The key cannot be recovered — it was shown once when it was created. " +
        "You would have to issue a new one and distribute it again.",
      confirmText: "Revoke key",
      danger: true,
    });
    if (!ok) return;
    setBusy(`key:${k.id}`);
    try {
      await revokeApiKey(k.id);
      notify("Key revoked.");
      load();
    } catch (err) {
      notify(err?.message || "Could not revoke the key.", "error");
    } finally {
      setBusy(null);
    }
  };

  const handleCreateTarget = async () => {
    setFormError("");
    const input = form.kind === "webhook"
      ? { kind: "webhook", label: form.label, config: { url: form.url }, secret: form.secret }
      : { kind: "vanta", label: form.label, config: { clientId: form.clientId, resourceId: form.resourceId }, secret: form.clientSecret };
    setBusy("target");
    try {
      await createGrcTarget(input);
      setTargetDialog(false);
      setForm({ kind: "webhook", label: "", url: "", secret: "", clientId: "", clientSecret: "", resourceId: "" });
      notify("Target created.");
      load();
    } catch (err) {
      setFormError(err?.message || "Could not create the target.");
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async (t) => {
    setBusy(`target:${t.id}`);
    try {
      const res = await testGrcTarget(t.id);
      if (res?.result?.ok) notify(`"${t.label}" answered OK.`);
      else notify(`"${t.label}" failed: ${res?.result?.error || "unknown error"}`, "error");
    } catch (err) {
      notify(err?.message || "Test failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const handleToggle = async (t) => {
    setBusy(`target:${t.id}`);
    try {
      await updateGrcTarget(t.id, { enabled: !t.enabled });
      load();
    } catch (err) {
      notify(err?.message || "Could not update the target.", "error");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (t) => {
    const ok = await confirm({
      title: `Delete destination “${t.label || `target ${t.id}`}”?`,
      body:
        "Scheduled reports stop being delivered to it. Its secret is destroyed " +
        "with it and cannot be recovered.\n\nPast deliveries stay in the log.",
      confirmText: "Delete destination",
      danger: true,
    });
    if (!ok) return;
    setBusy(`target:${t.id}`);
    try {
      await deleteGrcTarget(t.id);
      notify("Target deleted.");
      load();
    } catch (err) {
      notify(err?.message || "Could not delete the target.", "error");
    } finally {
      setBusy(null);
    }
  };

  // Una entrega guarda el id del destino, no su nombre: el destino puede
  // haberse borrado y la fila sobrevive a propósito (el historial no se
  // reescribe). Cuando el destino sigue existiendo, se enseña su etiqueta.
  const targetLabelById = React.useMemo(
    () => Object.fromEntries(targets.map((t) => [t.id, t.label])),
    [targets]
  );

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const canCreateTarget = form.label.trim() && (form.kind === "webhook" ? form.url.trim() && form.secret.length >= 16 : form.clientId.trim() && form.clientSecret && form.resourceId.trim());

  return (
    <Box>
      {error ? <Typography sx={{ color: BRAND.alert.errorText, fontSize: TEXT.sm, mb: 1 }}>{error}</Typography> : null}

      {/* ── API keys ── */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>API keys (pull)</Typography>
        <Button size="small" onClick={() => setKeyDialog(true)} sx={{ textTransform: "none" }}>New key</Button>
      </Box>
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mb: 1 }}>
        A GRC platform or script reads the evidence-pack JSON with <code>Authorization: Bearer trk_…</code> from <code>{apiBase()}?framework=…&from=YYYY-MM&to=YYYY-MM</code>. Read-only.
      </Typography>
      {keys.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 2 }} data-testid="api-keys-empty">No API keys.</Typography>
      ) : (
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          {keys.map((k) => (
            <Box key={k.id} sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: TEXT.sm }}>
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, minWidth: 160 }}>{k.label}</Typography>
              <Typography sx={{ fontSize: TEXT.sm, fontFamily: "monospace", color: BRAND.gray }}>{k.keyPrefix}…</Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, flex: 1 }}>
                {k.revokedAt ? `revoked ${formatWhen(k.revokedAt)}` : k.lastUsedAt ? `last used ${formatWhen(k.lastUsedAt)}` : "never used"}
              </Typography>
              {k.revokedAt ? <Chip size="small" label="Revoked" variant="outlined" /> : (
                <Tooltip title="Revoke key">
                  <span>
                    <IconButton size="small" aria-label={`Revoke key ${k.label}`} disabled={busy === `key:${k.id}`} onClick={() => handleRevoke(k)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Box>
          ))}
        </Stack>
      )}

      {/* ── Targets ── */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>Push targets</Typography>
        <Tooltip title={secretsConfigured ? "" : "The server has no GRC_SECRETS_KEY configured; targets cannot store credentials."}>
          <span>
            <Button size="small" onClick={() => setTargetDialog(true)} disabled={!secretsConfigured} sx={{ textTransform: "none" }}>New target</Button>
          </span>
        </Tooltip>
      </Box>
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mb: 1 }}>
        Attach a target to a schedule and every completed run is pushed to it: a signed webhook (any platform) or a Vanta private integration.
      </Typography>
      {targets.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }} data-testid="grc-targets-empty">No targets.</Typography>
      ) : (
        <Stack spacing={0.5}>
          {targets.map((t) => (
            <Box key={t.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Chip size="small" label={targetKindLabel(t.kind)} variant="outlined" />
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, minWidth: 160 }}>{t.label}</Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{describeTarget(t)}</Typography>
              {t.lastDeliveryStatus ? (
                <Tooltip title={`Last delivery ${formatWhen(t.lastDeliveryAt)}`}>
                  <Chip size="small" label={t.lastDeliveryStatus} color={deliveryColor(t.lastDeliveryStatus)} variant="outlined" />
                </Tooltip>
              ) : null}
              <Switch size="small" checked={Boolean(t.enabled)} disabled={busy === `target:${t.id}`} onChange={() => handleToggle(t)} inputProps={{ "aria-label": `Enable target ${t.label}` }} />
              <Tooltip title="Test connection">
                <span>
                  <IconButton size="small" aria-label={`Test target ${t.label}`} disabled={busy === `target:${t.id}`} onClick={() => handleTest(t)}>
                    <NetworkCheckIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Delete target">
                <span>
                  <IconButton size="small" aria-label={`Delete target ${t.label}`} disabled={busy === `target:${t.id}`} onClick={() => handleDelete(t)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      )}

      {/* ── Entregas recientes ── */}
      {/*
        El endpoint existía y nadie lo llamaba: `grc_deliveries` se llenaba y
        sólo se podía mirar entrando a la base de datos. Sin esto, "¿llegó el
        informe de este mes?" no tiene respuesta en el portal — y el chip de
        "última entrega" del destino sólo cuenta el último intento, no por qué
        falló ni cuántas veces.
      */}
      <Box sx={{ mt: 2, mb: 0.5 }}>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>Recent deliveries</Typography>
      </Box>
      {deliveries.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }} data-testid="grc-deliveries-empty">
          No deliveries yet. A scheduled run with a target attached pushes here when it completes.
        </Typography>
      ) : (
        <Stack spacing={0.5} data-testid="grc-deliveries">
          {deliveries.map((d) => (
            <Box key={d.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Chip size="small" label={d.status} color={deliveryColor(d.status)} variant="outlined" />
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, minWidth: 160 }}>
                {targetLabelById[d.targetId] || (d.targetId ? `target ${d.targetId}` : "—")}
              </Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, minWidth: 130 }}>{formatWhen(d.startedAt)}</Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, minWidth: 70 }}>
                {d.runId ? `run ${d.runId}` : ""}
              </Typography>
              {/*
                El motivo del fallo va VISIBLE, no en un tooltip: es lo único
                que se puede accionar de una entrega fallida, y un tooltip no
                existe para quien navega con teclado ni se puede copiar.
              */}
              <Typography sx={{ fontSize: TEXT.xs, color: d.error ? BRAND.alert.errorText : BRAND.gray, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.error || (d.httpStatus ? `HTTP ${d.httpStatus}` : "")}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}

      {/* ── New key ── */}
      <Dialog open={keyDialog} onClose={() => setKeyDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>New API key</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" label="Label" placeholder="Vanta reader" value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} sx={{ mt: 1 }} inputProps={{ "aria-label": "Label" }} helperText="Read-only scope: reports:read." />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKeyDialog(false)}>Cancel</Button>
          <Button variant="contained" disabled={!keyLabel.trim() || busy === "key"} onClick={handleCreateKey} sx={{ textTransform: "none" }}>Create key</Button>
        </DialogActions>
      </Dialog>

      {/* ── Reveal once ── */}
      <Dialog open={Boolean(revealed)} onClose={() => setRevealed(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Copy your API key now</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1 }}>
            This is the only time "{revealed?.label}" is shown. Tracenium stores a hash, not the key.
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, border: `1px solid ${BRAND.border}`, borderRadius: 1, fontFamily: "monospace", fontSize: TEXT.sm, wordBreak: "break-all" }}>
            <span data-testid="revealed-key">{revealed?.secret}</span>
            <CopyButton value={revealed?.secret} label="Copy key" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setRevealed(null)} sx={{ textTransform: "none" }}>I copied it</Button>
        </DialogActions>
      </Dialog>

      {/* ── New target ── */}
      <Dialog open={targetDialog} onClose={() => setTargetDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>New push target</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField select size="small" label="Kind" value={form.kind} onChange={setF("kind")} inputProps={{ "aria-label": "Kind" }}>
              {TARGET_KINDS.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Label" value={form.label} onChange={setF("label")} inputProps={{ "aria-label": "Label" }} />
            {form.kind === "webhook" ? (
              <>
                <TextField size="small" label="URL (https)" value={form.url} onChange={setF("url")} inputProps={{ "aria-label": "URL" }} placeholder="https://grc.example.com/tracenium" />
                <TextField size="small" label="Shared secret" type="password" value={form.secret} onChange={setF("secret")} inputProps={{ "aria-label": "Shared secret" }} helperText="At least 16 characters. Used to sign every request (HMAC-SHA256)." />
              </>
            ) : (
              <>
                <TextField size="small" label="Client ID" value={form.clientId} onChange={setF("clientId")} inputProps={{ "aria-label": "Client ID" }} />
                <TextField size="small" label="Client secret" type="password" value={form.clientSecret} onChange={setF("clientSecret")} inputProps={{ "aria-label": "Client secret" }} />
                <TextField size="small" label="Resource ID" value={form.resourceId} onChange={setF("resourceId")} inputProps={{ "aria-label": "Resource ID" }} placeholder="tracenium-soc2" helperText="Private integration in Vanta → Developer Console. One custom resource per criterion is synced." />
              </>
            )}
            {formError ? <Typography sx={{ color: BRAND.alert.errorText, fontSize: TEXT.sm }}>{formError}</Typography> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTargetDialog(false)}>Cancel</Button>
          <Button variant="contained" disabled={!canCreateTarget || busy === "target"} onClick={handleCreateTarget} sx={{ textTransform: "none" }}>Create target</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
