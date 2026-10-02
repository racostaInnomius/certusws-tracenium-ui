// src/components/DeviceManagement/MdmDeviceActionsPanel.jsx
//
// Acciones sobre un equipo de nuestro MDM (2-oct-2026, backend
// device-actions): pedir su inventario y su lista de apps, bloquearlo,
// reiniciarlo, borrarlo — y lo que respondió a cada orden.
//
// Bloquear, reiniciar y borrar sólo en un equipo de la ORGANIZACIÓN: el perfil
// personal no da derecho a ello (lo decide el backend y aquí se explica). El
// PIN de un Mac lo escoge quien bloquea o borra; Tracenium no lo guarda.

import * as React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";

import { useConfirm } from "../common/ConfirmDialog";
import { BRAND, ROLE } from "../../theme/brand";
import { formatRelative } from "../../utils/format";
import { cancelMdmDeviceCommand, getMdmDeviceActions, requestMdmDeviceAction } from "../../api/mdm";
import { ACTION_UNAVAILABLE, describeDeviceCommand, describeDeviceInformation } from "./mdmModel";
import { Field, FieldGrid, StatusChip } from "./mdmAtoms";

const PIN_RE = /^\d{6}$/;

const DONE = {
  refresh_inventory: (n) => `Asked ${n} for its inventory.`,
  installed_apps: (n) => `Asked ${n} for its list of apps.`,
  lock: (n) => `Lock sent to ${n}.`,
  restart: (n) => `Restart sent to ${n}.`,
  erase: (n) => `Erase sent to ${n}. You can cancel it until the device picks it up.`,
};

export default function MdmDeviceActionsPanel({ udid, name, serialNumber, platform, canConfigure = false, notify }) {
  const confirm = useConfirm();
  const [view, setView] = React.useState(undefined);
  const [busy, setBusy] = React.useState(null);
  const [dialog, setDialog] = React.useState(null);
  const [form, setForm] = React.useState({});
  const [formError, setFormError] = React.useState(null);
  const [showApps, setShowApps] = React.useState(false);
  const isMac = platform === "macos";

  const load = React.useCallback(
    async ({ fresh = false } = {}) => {
      try {
        setView((await getMdmDeviceActions(udid, { fresh })) ?? null);
      } catch {
        setView(null);
      }
    },
    [udid],
  );
  React.useEffect(() => {
    load();
  }, [load]);

  if (view === undefined) return null;
  if (view === null) {
    return (
      <Box aria-label="Device actions">
        <Divider sx={{ borderColor: BRAND.border, mb: 1 }} />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Device actions aren&apos;t available right now.
        </Typography>
      </Box>
    );
  }

  const byAction = Object.fromEntries((view.actions || []).map((a) => [a.action, a]));
  const can = (a) => Boolean(byAction[a]?.available);
  const reasons = [...new Set(["lock", "restart", "erase"].map((a) => byAction[a]?.reason).filter(Boolean))];
  const info = describeDeviceInformation(view.information?.values);

  async function run(action, body = {}) {
    setBusy(action);
    setFormError(null);
    try {
      await requestMdmDeviceAction(udid, action, body);
      notify?.(DONE[action](name), "success");
      setDialog(null);
      setForm({});
      await load({ fresh: true });
    } catch (err) {
      const code = err?.body?.error;
      const msg = err?.body?.message || ACTION_UNAVAILABLE[code] || err?.message || "The action couldn't be sent.";
      if (dialog) setFormError(msg);
      else notify?.(msg, "error");
    } finally {
      setBusy(null);
    }
  }

  async function cancel(cmd, label) {
    const ok = await confirm({
      title: `Cancel “${label}”?`,
      body: "It hasn't reached the device yet. Cancelling it means the device never receives it.",
      confirmText: "Cancel it",
      cancelText: "Keep it",
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelMdmDeviceCommand(udid, cmd.commandUuid);
      notify?.(`${label} cancelled.`, "success");
    } catch (err) {
      notify?.(err?.body?.message || "It couldn't be cancelled — it may have reached the device already.", "error");
    }
    await load({ fresh: true });
  }

  const open = (which) => {
    setForm(which === "restart" ? { mode: "now" } : {});
    setFormError(null);
    setDialog(which);
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pinOk = !isMac || PIN_RE.test(form.pin || "");
  const serialOk = Boolean(serialNumber) && String(form.confirmSerial || "").trim().toUpperCase() === String(serialNumber).toUpperCase();

  const btn = { textTransform: "none", fontWeight: 700 };

  return (
    <Box aria-label="Device actions" sx={{ display: "grid", gap: 1.25 }}>
      <Divider sx={{ borderColor: BRAND.border }} />
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
        Actions
      </Typography>

      {canConfigure ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          <Button variant="outlined" sx={btn} disabled={!can("refresh_inventory") || Boolean(busy)} onClick={() => run("refresh_inventory")}>
            {busy === "refresh_inventory" ? "Asking…" : "Refresh inventory"}
          </Button>
          <Button variant="outlined" sx={btn} disabled={!can("installed_apps") || Boolean(busy)} onClick={() => run("installed_apps")}>
            {busy === "installed_apps" ? "Asking…" : "List installed apps"}
          </Button>
          <Button variant="outlined" sx={btn} disabled={!can("lock") || Boolean(busy)} onClick={() => open("lock")}>
            Lock…
          </Button>
          <Button variant="outlined" sx={btn} disabled={!can("restart") || Boolean(busy)} onClick={() => open("restart")}>
            Restart…
          </Button>
          <Button
            variant="outlined"
            sx={{ ...btn, color: ROLE.critical, borderColor: ROLE.critical }}
            disabled={!can("erase") || Boolean(busy)}
            onClick={() => open("erase")}
          >
            Erase…
          </Button>
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Only tenant admins and owners can run actions on a device.
        </Typography>
      )}
      {reasons.map((r) => (
        <Typography key={r} variant="body2" sx={{ color: "text.secondary" }}>
          {ACTION_UNAVAILABLE[r] || r}
        </Typography>
      ))}

      <Box aria-label="Device information" sx={{ display: "grid", gap: 0.75 }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {view.information
            ? `What the device reported ${formatRelative(view.information.at)}`
            : "Refresh the inventory to see its storage, battery and protections."}
        </Typography>
        {info.length ? (
          <FieldGrid>
            {info.map((r) => (
              <Field key={r.label} label={r.label}>
                {r.value}
              </Field>
            ))}
          </FieldGrid>
        ) : null}
      </Box>

      {view.apps ? (
        <Box aria-label="Installed apps" sx={{ display: "grid", gap: 0.5 }}>
          <Typography variant="body2" sx={{ color: BRAND.dark }}>
            <strong>{view.apps.count}</strong> apps installed · reported {formatRelative(view.apps.at)}{" "}
            <Button size="small" sx={{ textTransform: "none", minWidth: 0, p: 0, ml: 0.5 }} onClick={() => setShowApps((s) => !s)}>
              {showApps ? "Hide" : "Show"}
            </Button>
          </Typography>
          {showApps ? (
            <Box component="ul" sx={{ m: 0, pl: 2.5, maxHeight: 240, overflowY: "auto" }}>
              {view.apps.items.map((a) => (
                <Typography component="li" variant="body2" key={a.identifier || a.name}>
                  {a.name || a.identifier}
                  {a.version ? <Box component="span" sx={{ color: "text.secondary" }}>{` · ${a.version}`}</Box> : null}
                </Typography>
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}

      {view.commands?.length ? (
        <Box aria-label="Recent actions" sx={{ display: "grid", gap: 0.75 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Recent commands
          </Typography>
          {view.commands.map((c) => {
            const x = describeDeviceCommand(c, formatRelative);
            return (
              <Box key={c.commandUuid} sx={{ display: "grid", gap: 0.25 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
                    {x.label}
                  </Typography>
                  <StatusChip status={x.chip} />
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {x.detail}
                  </Typography>
                  {canConfigure && x.cancellable ? (
                    <Button size="small" sx={{ textTransform: "none", minWidth: 0, p: 0 }} onClick={() => cancel(c, x.label)}>
                      Cancel
                    </Button>
                  ) : null}
                </Box>
                {x.error ? (
                  <Typography variant="body2" sx={{ color: BRAND.alert.errorText }}>
                    {x.error}
                  </Typography>
                ) : null}
              </Box>
            );
          })}
        </Box>
      ) : null}

      <Dialog open={dialog === "lock"} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Lock {name}?</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1.5 }}>
          <Typography variant="body2">
            {isMac
              ? "The Mac locks and only opens again with the 6-digit PIN below. Write it down: Tracenium doesn't keep it, and without it the Mac can't be unlocked."
              : "The device locks right away. It opens again with its own passcode."}
          </Typography>
          {isMac ? (
            <TextField
              label="PIN (6 digits)"
              value={form.pin || ""}
              onChange={set("pin")}
              inputProps={{ inputMode: "numeric", maxLength: 6, "aria-label": "PIN" }}
              error={Boolean(form.pin) && !pinOk}
              required
            />
          ) : null}
          <TextField label="Message on the Lock Screen (optional)" value={form.message || ""} onChange={set("message")} inputProps={{ maxLength: 200 }} />
          <TextField label="Phone number on the Lock Screen (optional)" value={form.phoneNumber || ""} onChange={set("phoneNumber")} inputProps={{ maxLength: 30 }} />
          {formError ? <Typography sx={{ color: BRAND.alert.errorText }}>{formError}</Typography> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} sx={btn}>
            Cancel
          </Button>
          <Button
            variant="contained"
            sx={btn}
            disabled={!pinOk || busy === "lock"}
            onClick={() => run("lock", { ...(isMac ? { pin: form.pin } : {}), message: form.message, phoneNumber: form.phoneNumber })}
          >
            {busy === "lock" ? "Sending…" : "Lock device"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === "restart"} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Restart {name}?</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1 }}>
          {isMac ? (
            <RadioGroup value={form.mode || "now"} onChange={set("mode")} aria-label="How to restart">
              <FormControlLabel value="now" control={<Radio />} label="Restart now — unsaved work on the Mac is lost" />
              <FormControlLabel value="notify" control={<Radio />} label="Ask the person to restart when it suits them" />
            </RadioGroup>
          ) : (
            <Typography variant="body2">The device restarts right away.</Typography>
          )}
          {formError ? <Typography sx={{ color: BRAND.alert.errorText }}>{formError}</Typography> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} sx={btn}>
            Cancel
          </Button>
          <Button variant="contained" sx={btn} disabled={busy === "restart"} onClick={() => run("restart", { notifyUser: isMac && form.mode === "notify" })}>
            {busy === "restart" ? "Sending…" : "Restart"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === "erase"} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ color: ROLE.critical }}>Erase {name}?</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1.5 }}>
          <Typography variant="body2">
            Everything on the device is erased and it goes back to the setup screen. This can&apos;t be undone.
            {isMac
              ? " On a Mac with Apple silicon or a T2 chip it uses Erase All Content and Settings; if that can't run, the erase fails instead of wiping the disk."
              : ""}
          </Typography>
          <TextField
            label={`Type the serial number (${serialNumber || "unknown"}) to confirm`}
            value={form.confirmSerial || ""}
            onChange={set("confirmSerial")}
            inputProps={{ "aria-label": "Serial number confirmation" }}
            required
          />
          <TextField label="Why (goes in the audit log)" value={form.reason || ""} onChange={set("reason")} inputProps={{ maxLength: 500 }} required />
          {isMac ? (
            <TextField
              label="PIN (6 digits)"
              helperText="Older Macs ask for it after the erase. Tracenium doesn't keep it."
              value={form.pin || ""}
              onChange={set("pin")}
              inputProps={{ inputMode: "numeric", maxLength: 6, "aria-label": "PIN" }}
              error={Boolean(form.pin) && !pinOk}
              required
            />
          ) : null}
          {formError ? <Typography sx={{ color: BRAND.alert.errorText }}>{formError}</Typography> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} sx={btn}>
            Cancel
          </Button>
          <Button
            variant="contained"
            sx={{ ...btn, bgcolor: ROLE.critical, "&:hover": { bgcolor: ROLE.critical } }}
            disabled={!serialOk || !String(form.reason || "").trim() || !pinOk || busy === "erase"}
            onClick={() => run("erase", { confirmSerial: form.confirmSerial, reason: form.reason, ...(isMac ? { pin: form.pin } : {}) })}
          >
            {busy === "erase" ? "Sending…" : "Erase device"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
