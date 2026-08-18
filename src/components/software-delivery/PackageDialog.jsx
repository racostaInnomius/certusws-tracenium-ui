// src/components/software-delivery/PackageDialog.jsx
//
// Create / edit a software package (catalog row). The form is split
// across two visual sections:
//   * Identity         — name, vendor, version, platform, arch, format
//   * Distribution     — downloadPath, sha256, size, install args,
//                        expected exit codes, signing/reboot flags
//   * Detection        — DetectionRuleEditor
// Plus description + isActive at the bottom.
//
// The dialog is dumb (no API calls). The parent does the create/
// update via api/softwareDelivery and surfaces errors via `notify`.

import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Stack,
  Box,
  Switch,
  FormControlLabel,
  Typography,
  Divider,
} from "@mui/material";
import { BRAND } from "../../theme/brand";
import DetectionRuleEditor from "./DetectionRuleEditor";

const PLATFORM_OPTIONS = ["windows", "macos", "linux"];
const ARCH_OPTIONS = ["x64", "arm64", "x86", "any"];
const FORMAT_OPTIONS_BY_PLATFORM = {
  windows: ["msi", "exe"],
  macos: ["pkg", "dmg"],
  linux: ["deb", "rpm", "tar.gz"],
};

const SHA256_RE = /^[0-9a-f]{64}$/i;

function defaultsForCreate() {
  return {
    name: "",
    vendor: "",
    version: "",
    platform: "windows",
    arch: "x64",
    format: "msi",
    downloadPath: "",
    sha256: "",
    sizeBytes: "",
    silentInstallArgs: "/qn /norestart",
    expectedExitCodesRaw: "0, 3010",
    requiresReboot: false,
    signingRequired: false,
    description: "",
    isActive: true,
    selfServiceEnabled: false,
    detectionRule: null,
  };
}

function fromExisting(item) {
  return {
    name: item.name ?? "",
    vendor: item.vendor ?? "",
    version: item.version ?? "",
    platform: item.platform ?? "windows",
    arch: item.arch ?? "x64",
    format: item.format ?? "msi",
    downloadPath: item.downloadPath ?? "",
    sha256: item.sha256 ?? "",
    sizeBytes: item.sizeBytes == null ? "" : String(item.sizeBytes),
    silentInstallArgs: item.silentInstallArgs ?? "",
    expectedExitCodesRaw: Array.isArray(item.expectedExitCodes)
      ? item.expectedExitCodes.join(", ")
      : "0, 3010",
    requiresReboot: Boolean(item.requiresReboot),
    signingRequired: Boolean(item.signingRequired),
    description: item.description ?? "",
    isActive: item.isActive !== false,
    selfServiceEnabled: Boolean(item.selfServiceEnabled),
    detectionRule: item.detectionRule ?? null,
  };
}

function parseExitCodes(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && Number.isInteger(n));
}

export default function PackageDialog({
  open,
  mode,            // "create" | "edit" | "approve"
  item,            // existing dto when editing; the AI-proposal item when approving
  banner,          // optional node rendered at the top (used for the intake verdict)
  submitting,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = React.useState(defaultsForCreate);
  const [error, setError] = React.useState(null);

  // Reset whenever the dialog opens. Both "edit" and "approve" pre-fill from
  // `item` — approve passes an item synthesised from the AI proposal.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm((mode === "edit" || mode === "approve") && item ? fromExisting(item) : defaultsForCreate());
  }, [open, mode, item]);

  // When platform changes, snap to a sensible format default for
  // that OS family. Without this you can end up with format=msi on
  // a macOS package, which the backend rejects but only at submit
  // time — UX is nicer if we steer the operator earlier.
  const handlePlatformChange = (platform) => {
    const formats = FORMAT_OPTIONS_BY_PLATFORM[platform] || [];
    const nextFormat = formats.includes(form.format) ? form.format : formats[0] || "";
    setForm((p) => ({ ...p, platform, format: nextFormat }));
  };

  const update = (patch) => setForm((p) => ({ ...p, ...patch }));

  const validate = () => {
    if (!form.name.trim()) return "Name is required";
    if (!form.version.trim()) return "Version is required";
    const dp = form.downloadPath.trim();
    if (!dp) {
      // In approve mode a blank download path is allowed: the backend mints a
      // signed URL over the uploaded blob. In create/edit it's required.
      if (mode !== "approve") return "Download path is required";
    } else if (!/^https:\/\//i.test(dp)) {
      return "Download path must be an https URL";
    }
    if (!SHA256_RE.test(form.sha256.trim())) {
      return "sha256 must be a 64-char hex string";
    }
    const exitCodes = parseExitCodes(form.expectedExitCodesRaw);
    if (exitCodes.length === 0) {
      return "Expected exit codes must be at least one integer (typical: '0, 3010')";
    }
    if (form.sizeBytes !== "" && form.sizeBytes !== null) {
      const n = Number(form.sizeBytes);
      if (!Number.isInteger(n) || n < 0) {
        return "Size (bytes) must be a non-negative integer";
      }
    }
    return null;
  };

  const handleSubmit = () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    const payload = {
      name: form.name.trim(),
      vendor: form.vendor.trim() || null,
      version: form.version.trim(),
      platform: form.platform,
      arch: form.arch,
      format: form.format,
      downloadPath: form.downloadPath.trim(),
      sha256: form.sha256.trim().toLowerCase(),
      sizeBytes: form.sizeBytes === "" ? null : Number(form.sizeBytes),
      silentInstallArgs: form.silentInstallArgs.trim() || null,
      expectedExitCodes: parseExitCodes(form.expectedExitCodesRaw),
      requiresReboot: form.requiresReboot,
      signingRequired: form.signingRequired,
      description: form.description.trim() || null,
      isActive: form.isActive,
      selfServiceEnabled: form.selfServiceEnabled,
      detectionRule: form.detectionRule, // already normalized by editor
    };
    onSubmit?.(payload);
  };

  const formats = FORMAT_OPTIONS_BY_PLATFORM[form.platform] || [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        {mode === "edit"
          ? "Edit Software Package"
          : mode === "approve"
          ? "Review AI Proposal"
          : "Add Software Package"}
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {banner ? <Box>{banner}</Box> : null}

          {/* ── Identity ──────────────────────────────────────── */}
          <Box>
            <Typography
              variant="caption"
              sx={{
                color: BRAND.gray,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Identity
            </Typography>
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr", mt: 1 }}>
              <TextField
                size="small"
                label="Name"
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                required
              />
              <TextField
                size="small"
                label="Vendor (optional)"
                value={form.vendor}
                onChange={(e) => update({ vendor: e.target.value })}
              />
              <TextField
                size="small"
                label="Version"
                placeholder="1.2.3"
                value={form.version}
                onChange={(e) => update({ version: e.target.value })}
                required
              />
              <TextField
                select
                size="small"
                label="Platform"
                value={form.platform}
                onChange={(e) => handlePlatformChange(e.target.value)}
              >
                {PLATFORM_OPTIONS.map((p) => (
                  <MenuItem key={p} value={p}>{p}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Arch"
                value={form.arch}
                onChange={(e) => update({ arch: e.target.value })}
              >
                {ARCH_OPTIONS.map((a) => (
                  <MenuItem key={a} value={a}>{a}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Format"
                value={form.format}
                onChange={(e) => update({ format: e.target.value })}
              >
                {formats.map((f) => (
                  <MenuItem key={f} value={f}>{f}</MenuItem>
                ))}
              </TextField>
            </Box>
          </Box>

          <Divider sx={{ borderColor: BRAND.border }} />

          {/* ── Distribution ──────────────────────────────────── */}
          <Box>
            <Typography
              variant="caption"
              sx={{
                color: BRAND.gray,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Distribution
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <TextField
                size="small"
                label={mode === "approve" ? "Download URL (optional)" : "Download URL (https)"}
                placeholder="https://blob.tracenium.com/foo-1.2.3.msi"
                value={form.downloadPath}
                onChange={(e) => update({ downloadPath: e.target.value })}
                required={mode !== "approve"}
                helperText={
                  mode === "approve"
                    ? "Leave blank to serve the uploaded file — a signed URL is generated on approve."
                    : undefined
                }
              />
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "2fr 1fr" }}>
                <TextField
                  size="small"
                  label="sha256 (64 hex chars)"
                  value={form.sha256}
                  onChange={(e) => update({ sha256: e.target.value })}
                  required
                  inputProps={{ style: { fontFamily: "monospace", fontSize: 12 } }}
                />
                <TextField
                  size="small"
                  label="Size (bytes, optional)"
                  type="number"
                  value={form.sizeBytes}
                  onChange={(e) => update({ sizeBytes: e.target.value })}
                />
              </Box>
              <TextField
                size="small"
                label="Silent install args"
                placeholder={
                  form.format === "msi" ? "/qn /norestart"
                  : form.format === "exe" ? "/S"
                  : ""
                }
                value={form.silentInstallArgs}
                onChange={(e) => update({ silentInstallArgs: e.target.value })}
                helperText={
                  form.format === "exe"
                    ? "Required for exe (vendor-specific silent flag — without this the installer hangs invisible under LocalSystem)"
                    : "Optional. For MSI defaults to /qn /norestart if blank"
                }
              />
              <TextField
                size="small"
                label="Expected exit codes (comma-separated)"
                value={form.expectedExitCodesRaw}
                onChange={(e) => update({ expectedExitCodesRaw: e.target.value })}
                helperText="Default: 0 (success), 3010 (success + reboot required, msiexec convention)"
              />
              <Box sx={{ display: "flex", gap: 3 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.requiresReboot}
                      onChange={(e) => update({ requiresReboot: e.target.checked })}
                    />
                  }
                  label="Requires reboot"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.signingRequired}
                      onChange={(e) => update({ signingRequired: e.target.checked })}
                    />
                  }
                  label="Signing required"
                />
              </Box>
            </Stack>
          </Box>

          <Divider sx={{ borderColor: BRAND.border }} />

          {/* ── Detection ─────────────────────────────────────── */}
          <Box>
            <Typography
              variant="caption"
              sx={{
                color: BRAND.gray,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Detection
            </Typography>
            <Box sx={{ mt: 1 }}>
              <DetectionRuleEditor
                value={form.detectionRule}
                onChange={(rule) => update({ detectionRule: rule })}
              />
            </Box>
          </Box>

          <Divider sx={{ borderColor: BRAND.border }} />

          {/* ── Misc ──────────────────────────────────────────── */}
          <Stack spacing={1.5}>
            <TextField
              size="small"
              label="Description (optional)"
              multiline
              minRows={2}
              maxRows={4}
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.isActive}
                  onChange={(e) => update({ isActive: e.target.checked })}
                />
              }
              label="Active (deployable)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.selfServiceEnabled}
                  onChange={(e) => update({ selfServiceEnabled: e.target.checked })}
                />
              }
              label="Self-service (offered in the Tracenium tray for users to install themselves)"
            />
          </Stack>

          {error ? (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: BRAND.alert?.errorSoft,
                color: BRAND.alert?.error,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {error}
            </Box>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none", color: BRAND.gray }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          variant="contained"
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          {submitting
            ? "Saving…"
            : mode === "edit"
            ? "Save changes"
            : mode === "approve"
            ? "Approve & add to catalog"
            : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
