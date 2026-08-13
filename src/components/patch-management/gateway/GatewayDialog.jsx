// src/components/patch-management/gateway/GatewayDialog.jsx
//
// Register or edit an Infrastructure Gateway: which host brokers to vCenter,
// where vCenter is, and how snapshots behave.
//
// The certificate thumbprint is REQUIRED, not optional. vCenter certificates
// are self-signed by the internal VMCA, so chain validation can never
// authenticate the server we are about to hand a vSphere credential to — the
// pin is the only trust anchor (ADR-0001, Inc 0).

import React from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

const DEFAULTS = {
  name: "",
  deviceId: "",
  vcenterUrl: "https://",
  vcenterPort: 443,
  tlsThumbprintSha256: "",
  credentialRef: "vcenter/default",
  folders: "",
  quiesce: true,
  memory: false,
  retentionHours: 24,
  maxConcurrent: 5,
  perVmTimeoutSec: 900,
};

const isSha256 = (v) => /^[0-9a-f]{64}$/.test(String(v || "").replace(/[:\s-]/g, "").toLowerCase());

export default function GatewayDialog({ open, gateway, devices = [], onClose, onSave }) {
  const editing = Boolean(gateway);
  const [form, setForm] = React.useState(DEFAULTS);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      gateway
        ? {
            ...DEFAULTS,
            name: gateway.name ?? "",
            deviceId: gateway.deviceId ?? "",
            vcenterUrl: gateway.vcenterUrl ?? "https://",
            vcenterPort: gateway.vcenterPort ?? 443,
            tlsThumbprintSha256: gateway.tlsThumbprintSha256 ?? "",
            credentialRef: gateway.credentialRef ?? "vcenter/default",
            folders: (gateway.scope?.folders ?? []).join("\n"),
            quiesce: gateway.snapshot?.quiesce !== false,
            memory: gateway.snapshot?.memory === true,
            retentionHours: gateway.snapshot?.retentionHours ?? 24,
            maxConcurrent: gateway.snapshot?.maxConcurrent ?? 5,
            perVmTimeoutSec: gateway.snapshot?.perVmTimeoutSec ?? 900,
          }
        : DEFAULTS
    );
  }, [open, gateway]);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Give the gateway a name.");
    if (!editing && !form.deviceId) return setError("Choose the host that will act as gateway.");
    if (!/^https:\/\/.+/.test(form.vcenterUrl)) {
      return setError("The vCenter URL must start with https:// — a vSphere credential must never cross a plaintext hop.");
    }
    if (!isSha256(form.tlsThumbprintSha256)) {
      return setError(
        "A SHA-256 certificate thumbprint is required (64 hex characters). vCenter certificates are self-signed, so the pin is the only way to verify the server."
      );
    }

    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        deviceId: form.deviceId,
        vcenterUrl: form.vcenterUrl.trim().replace(/\/+$/, ""),
        vcenterPort: Number(form.vcenterPort) || 443,
        tlsThumbprintSha256: form.tlsThumbprintSha256,
        credentialRef: form.credentialRef.trim() || "vcenter/default",
        scope: {
          folders: form.folders
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        snapshot: {
          quiesce: form.quiesce,
          memory: form.memory,
          retentionHours: Number(form.retentionHours) || 24,
          maxConcurrent: Number(form.maxConcurrent) || 5,
          perVmTimeoutSec: Number(form.perVmTimeoutSec) || 900,
        },
      });
      onClose?.();
    } catch (e) {
      setError(e?.message || "Could not save the gateway.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{editing ? `Edit ${gateway.name}` : "Register Infrastructure Gateway"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Alert severity="info">
            One host per site brokers snapshot requests to vCenter. It needs network
            access to vCenter — it does not need to be a VM itself, and it never
            snapshots itself.
          </Alert>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Name" value={form.name} onChange={set("name")} fullWidth />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Gateway host"
                value={form.deviceId}
                onChange={set("deviceId")}
                fullWidth
                disabled={editing}
                helperText={editing ? "The host cannot be changed — remove and re-register." : ""}
              >
                {devices.map((d) => (
                  <MenuItem key={d.deviceId ?? d.agentId} value={d.deviceId ?? d.agentId}>
                    {d.hostname || d.host || d.deviceId || d.agentId}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          <Divider textAlign="left">
            <Typography variant="caption">vCenter</Typography>
          </Divider>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField label="vCenter URL" value={form.vcenterUrl} onChange={set("vcenterUrl")} fullWidth />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField label="Port" type="number" value={form.vcenterPort} onChange={set("vcenterPort")} fullWidth />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Certificate thumbprint (SHA-256)"
                value={form.tlsThumbprintSha256}
                onChange={set("tlsThumbprintSha256")}
                fullWidth
                placeholder="62:A2:0A:E2:…"
                helperText="Required. Read it from vCenter's certificate — it is the only thing that authenticates the server."
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Inventory folders (one per line, optional)"
                value={form.folders}
                onChange={set("folders")}
                fullWidth
                multiline
                minRows={2}
                placeholder="/DC1/vm/Production"
                helperText="Leave empty to use the whole inventory the account can see."
              />
            </Grid>
          </Grid>

          <Divider textAlign="left">
            <Typography variant="caption">Snapshots</Typography>
          </Divider>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={<Switch checked={form.quiesce} onChange={set("quiesce")} />}
                label="Quiesce guest filesystem (VSS)"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={<Switch checked={form.memory} onChange={set("memory")} />}
                label="Include guest memory"
              />
            </Grid>
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">
                Memory snapshots are large and slow, and add nothing for rolling back a
                patch. Quiesce gives an application-consistent disk state on Windows.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Retention (hours)"
                type="number"
                value={form.retentionHours}
                onChange={set("retentionHours")}
                fullWidth
                helperText="After a successful patch"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Max concurrent"
                type="number"
                value={form.maxConcurrent}
                onChange={set("maxConcurrent")}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Per-VM timeout (s)"
                type="number"
                value={form.perVmTimeoutSec}
                onChange={set("perVmTimeoutSec")}
                fullWidth
              />
            </Grid>
          </Grid>

          <Alert severity="warning">
            A snapshot from a <strong>failed</strong> patch is never deleted on a timer —
            it is the rollback point. Retention only applies once the patch succeeded.
          </Alert>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={saving}>
          {editing ? "Save" : "Register"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
