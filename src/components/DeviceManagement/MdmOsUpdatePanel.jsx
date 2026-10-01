// src/components/DeviceManagement/MdmOsUpdatePanel.jsx
//
// Forzar una actualización del sistema por DDM, en el cajón de un equipo MDM
// (30-sep, backend os-update.service.ts).
//
// Qué hace el equipo: descarga la versión, avisa a la persona, y si no la ha
// instalado a la hora indicada —hora LOCAL del equipo— la instala y reinicia.
// En Apple silicon la autoriza el Bootstrap Token, sin contraseña. Requiere un
// Mac supervisado (un enrolamiento por perfil en macOS 11+ lo es).
//
// Mirar lo puede cualquiera con acceso a MDM; programar o cancelar, sólo
// ADMIN/OWNER (el servidor lo exige; aquí sólo se deshabilita).
//
// La versión se ELIGE de lo que el escaneo del agente encontró en ese Mac
// (`detected`); escribirla a mano queda para un Mac sin agente, con aviso.

import * as React from "react";
import { Alert, Box, Button, Divider, MenuItem, TextField, Typography } from "@mui/material";

import { useConfirm } from "../common/ConfirmDialog";
import { BRAND } from "../../theme/brand";
import { formatRelative } from "../../utils/format";
import { cancelMdmOsUpdate, getMdmOsUpdate, scheduleMdmOsUpdate } from "../../api/mdm";
import {
  buildOsUpdateRequest,
  describeOsUpdateFailure,
  detectedOsUpdates,
  detectedUpdateKey,
  detectedUpdateLabel,
  formatDeviceLocalDateTime,
  manualVersionNote,
  osUpdateInstallState,
} from "./mdmModel";
import { Field, FieldGrid, StatusChip } from "./mdmAtoms";

const buttonSx = { textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } };

function localDay(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function MdmOsUpdatePanel({ udid, canConfigure, notify }) {
  const confirm = useConfirm();
  const [view, setView] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [form, setForm] = React.useState({ version: "", build: "", date: localDay(2), time: "18:00" });
  const [formError, setFormError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [choice, setChoice] = React.useState("");
  const [typing, setTyping] = React.useState(false);

  const detected = view?.detected;
  const updates = detectedOsUpdates(detected);
  const manual = updates.length === 0 || typing;
  const detectedKeys = updates.map(detectedUpdateKey).join(",");

  // Una sola candidata va elegida; con varias (26.7.1 o 27.0.1), que se elija.
  // Una elección que el escaneo ya no trae se olvida.
  React.useEffect(() => {
    const keys = detectedKeys ? detectedKeys.split(",") : [];
    setChoice((c) => (keys.includes(c) ? c : keys.length === 1 ? keys[0] : ""));
  }, [detectedKeys]);

  const load = React.useCallback(async ({ fresh = false } = {}) => {
    try {
      setView(await getMdmOsUpdate(udid, { fresh }));
      setLoadError(null);
    } catch (err) {
      setLoadError(err?.body?.message || err?.message || "Could not load the OS update status.");
    }
  }, [udid]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function schedule() {
    setFormError(null);
    const picked = manual ? null : updates.find((u) => detectedUpdateKey(u) === choice);
    if (!manual && !picked) {
      setFormError("Choose the update to force.");
      return;
    }
    const built = buildOsUpdateRequest(picked ? { ...form, version: picked.version, build: picked.build } : form);
    if (built.error) {
      setFormError(built.error);
      return;
    }
    const ok = await confirm({
      title: `Force ${built.body.targetOSVersion} on this device?`,
      body:
        `If the user hasn't installed it by ${formatDeviceLocalDateTime(built.body.targetLocalDateTime)} (the device's local time), ` +
        "the device installs it and restarts on its own.\n\n" +
        "Until Apple push is set up, the device picks this up on its next check-in, within about 4 hours.",
      confirmText: "Schedule update",
    });
    if (!ok) return;
    setBusy(true);
    try {
      setView(await scheduleMdmOsUpdate(udid, built.body));
      notify?.("OS update scheduled. The device picks it up on its next check-in.", "success");
    } catch (err) {
      setFormError(err?.body?.message || err?.message || "Could not schedule the update.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    const ok = await confirm({
      title: "Cancel the forced update?",
      body: "The device stops enforcing it on its next check-in. An update it already downloaded stays available to the user.",
      confirmText: "Cancel update",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await cancelMdmOsUpdate(udid);
      notify?.("Forced update cancelled.", "success");
      await load({ fresh: true });
    } catch (err) {
      notify?.(err?.body?.message || err?.message || "Could not cancel the update.", "error");
    } finally {
      setBusy(false);
    }
  }

  const device = view?.device;
  const scheduled = view?.scheduled;
  // La orden ya se cumplió: el equipo informa esa versión (backend: scheduled.status).
  const done = scheduled?.status === "installed";
  // La versión mínima de la política macOS, no una orden de este Mac: se
  // cambia en Policies, no se cancela aquí (1-oct, ddm-policy).
  const fromPolicy = scheduled?.source === "policy";
  const state = osUpdateInstallState(device?.installState);
  const pending = device?.pendingVersion?.["os-version"];
  const failure = describeOsUpdateFailure(device?.failureReason);
  const scannedWhen = detected?.scannedAt ? formatRelative(detected.scannedAt) : null;
  const manualNote = manual ? manualVersionNote(detected, { chosen: updates.length > 0, when: scannedWhen }) : null;

  return (
    <Box aria-label="OS update" sx={{ display: "grid", gap: 1.5 }}>
      <Divider sx={{ borderColor: BRAND.border }} />
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
        OS update
      </Typography>
      {loadError ? <Alert severity="error" sx={{ borderRadius: 2 }}>{loadError}</Alert> : null}

      <FieldGrid>
        <Field label="Reported by the device">
          <StatusChip status={state} />
        </Field>
        {pending ? <Field label="Pending">{pending}</Field> : null}
        {device?.reportedAt ? <Field label="Last report">{formatRelative(device.reportedAt)}</Field> : null}
      </FieldGrid>
      {failure ? (
        <Typography variant="body2" sx={{ color: BRAND.alert.errorText, fontWeight: 600 }}>{failure}</Typography>
      ) : null}

      {done ? (
        <Typography variant="body2" sx={{ color: BRAND.dark }}>
          <strong>{scheduled.targetOSVersion}</strong>
          {scheduled.targetBuildVersion ? ` (${scheduled.targetBuildVersion})` : ""} is installed — the forced update
          {" "}is done{device?.reportedAt ? `; the device reported it ${formatRelative(device.reportedAt)}` : ""}.
        </Typography>
      ) : null}

      {scheduled && !done ? (
        <Box sx={{ display: "grid", gap: 1 }}>
          <Typography variant="body2" sx={{ color: BRAND.dark }}>
            <strong>{scheduled.targetOSVersion}</strong>
            {scheduled.targetBuildVersion ? ` (${scheduled.targetBuildVersion})` : ""}
            {fromPolicy ? " is the macOS policy's minimum, required by " : " is forced by "}
            <strong>{formatDeviceLocalDateTime(scheduled.targetLocalDateTime)}</strong>, device time
            {fromPolicy ? ". Change it in Policies › macOS › Software updates." : "."}
          </Typography>
          {canConfigure && !fromPolicy ? (
            <Box>
              <Button variant="outlined" color="error" onClick={cancel} disabled={busy} sx={{ textTransform: "none", fontWeight: 700 }}>
                Cancel update
              </Button>
            </Box>
          ) : null}
        </Box>
      ) : null}

      {canConfigure ? (
        <Box component="form" noValidate onSubmit={(e) => { e.preventDefault(); schedule(); }} sx={{ display: "grid", gap: 1.25 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {scheduled && !done
              ? fromPolicy
                ? "Force a different update on this Mac — it takes the place of the policy's minimum until it's installed or cancelled:"
                : "Schedule a different update:"
              : "Force an update. The device downloads it, reminds the user and, if it's still not installed at that time, installs it and restarts. On Apple silicon it needs no password."}
          </Typography>
          {manual ? null : (
            <TextField select size="small" label="Update" value={choice} disabled={busy}
              onChange={(e) => setChoice(e.target.value)}
              helperText={`From the Tracenium agent's scan of this Mac${scannedWhen ? `, ${scannedWhen}` : ""}.`}>
              {updates.map((u) => (
                <MenuItem key={detectedUpdateKey(u)} value={detectedUpdateKey(u)}>{detectedUpdateLabel(u)}</MenuItem>
              ))}
            </TextField>
          )}
          {manualNote ? (
            <Typography variant="body2" sx={{ color: BRAND.alert.warningText }}>{manualNote}</Typography>
          ) : null}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
            {manual ? (
              <>
                <TextField size="small" label="Version" placeholder="27.0.1" value={form.version}
                  onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} disabled={busy} />
                <TextField size="small" label="Build (optional)" placeholder="26A434" value={form.build}
                  onChange={(e) => setForm((f) => ({ ...f, build: e.target.value }))} disabled={busy} />
              </>
            ) : null}
            <TextField size="small" type="date" label="Install by" InputLabelProps={{ shrink: true }} value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} disabled={busy} />
            <TextField size="small" type="time" label="Device time" InputLabelProps={{ shrink: true }} value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} disabled={busy} />
          </Box>
          {formError ? (
            <Typography role="alert" variant="body2" sx={{ color: BRAND.alert.errorText, fontWeight: 600 }}>{formError}</Typography>
          ) : null}
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Button type="submit" variant="contained" disabled={busy} sx={buttonSx}>
              {busy ? "Scheduling…" : "Schedule update"}
            </Button>
            {updates.length > 0 ? (
              <Button variant="text" disabled={busy} onClick={() => { setTyping((t) => !t); setFormError(null); }}
                sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
                {typing ? "Pick a detected update" : "Enter a version manually"}
              </Button>
            ) : null}
          </Box>
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Only tenant admins and owners can force an OS update.
        </Typography>
      )}
    </Box>
  );
}
