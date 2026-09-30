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

import * as React from "react";
import { Alert, Box, Button, Divider, TextField, Typography } from "@mui/material";

import { useConfirm } from "../common/ConfirmDialog";
import { BRAND } from "../../theme/brand";
import { formatRelative } from "../../utils/format";
import { cancelMdmOsUpdate, getMdmOsUpdate, scheduleMdmOsUpdate } from "../../api/mdm";
import { buildOsUpdateRequest, formatDeviceLocalDateTime, osUpdateInstallState } from "./mdmModel";
import { Field, StatusChip } from "./mdmAtoms";

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
    const built = buildOsUpdateRequest(form);
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
  const state = osUpdateInstallState(device?.installState);
  const pending = device?.pendingVersion?.["os-version"];

  return (
    <Box aria-label="OS update" sx={{ display: "grid", gap: 1.5 }}>
      <Divider sx={{ borderColor: BRAND.border }} />
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
        OS update
      </Typography>
      {loadError ? <Alert severity="error" sx={{ borderRadius: 2 }}>{loadError}</Alert> : null}

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <Field label="Reported by the device">
          <StatusChip status={state} />
        </Field>
        {pending ? <Field label="Pending">{pending}</Field> : null}
        {device?.reportedAt ? <Field label="Last report">{formatRelative(device.reportedAt)}</Field> : null}
      </Box>
      {device?.failureReason ? (
        <Typography variant="body2" sx={{ color: BRAND.alert.errorText, fontWeight: 600 }}>
          {typeof device.failureReason === "object" ? JSON.stringify(device.failureReason) : String(device.failureReason)}
        </Typography>
      ) : null}

      {scheduled ? (
        <Box sx={{ display: "grid", gap: 1 }}>
          <Typography variant="body2" sx={{ color: BRAND.dark }}>
            <strong>{scheduled.targetOSVersion}</strong>
            {scheduled.targetBuildVersion ? ` (${scheduled.targetBuildVersion})` : ""} is forced by{" "}
            <strong>{formatDeviceLocalDateTime(scheduled.targetLocalDateTime)}</strong>, device time.
          </Typography>
          {canConfigure ? (
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
            {scheduled ? "Schedule a different update:" : "Force an update. The device downloads it, reminds the user and, if it's still not installed at that time, installs it and restarts. On Apple silicon it needs no password."}
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
            <TextField size="small" label="Version" placeholder="27.0.1" value={form.version}
              onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} disabled={busy} />
            <TextField size="small" label="Build (optional)" placeholder="26A434" value={form.build}
              onChange={(e) => setForm((f) => ({ ...f, build: e.target.value }))} disabled={busy} />
            <TextField size="small" type="date" label="Install by" InputLabelProps={{ shrink: true }} value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} disabled={busy} />
            <TextField size="small" type="time" label="Device time" InputLabelProps={{ shrink: true }} value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} disabled={busy} />
          </Box>
          {formError ? (
            <Typography role="alert" variant="body2" sx={{ color: BRAND.alert.errorText, fontWeight: 600 }}>{formError}</Typography>
          ) : null}
          <Box>
            <Button type="submit" variant="contained" disabled={busy} sx={buttonSx}>
              {busy ? "Scheduling…" : "Schedule update"}
            </Button>
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
