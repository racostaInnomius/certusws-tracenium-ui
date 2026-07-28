// src/components/software-delivery/DeployWizardDialog.jsx
//
// SDP — Phase 1-H. Two-step deploy wizard for fanning a catalog
// package out to a target.
//
// Steps:
//   1. Target — pick an Asset Group (filtered by package platform when
//              possible) OR enter a manual list of device IDs.
//   2. Review — package summary, target summary, fire button.
//
// Why only two steps: the package is already chosen (the wizard is opened
// from a row's "Deploy" button, so packageId is known). The operator picks a
// mode (install / reinstall / uninstall) on the Target step; scheduling is a
// separate future concern.

import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Box,
  TextField,
  MenuItem,
  Chip,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Radio,
  RadioGroup,
  FormControlLabel,
  Alert,
  CircularProgress,
} from "@mui/material";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import { BRAND } from "../../theme/brand";
import { listAssetGroups } from "../../api/assetGroups";
import { listFrom } from "../../api/shape";

const STEPS = ["Target", "Review"];

// Detection-rule types that carry a removable identity the agent can uninstall
// by (MSI ProductCode / app bundle / pkg receipt / dpkg / rpm). file_exists and
// command_exit are presence probes with nothing to remove.
const REMOVABLE_RULE_TYPES = new Set([
  "registry_uninstall",
  "bundle_version",
  "pkg_receipt",
  "dpkg_installed",
  "rpm_installed",
]);

// A package is uninstallable when its detection rule yields a removable
// identity, or it ships explicit silent uninstall args (Windows EXE path).
function canUninstall(pkg) {
  if (!pkg) return false;
  if (pkg.silentUninstallArgs && String(pkg.silentUninstallArgs).trim()) return true;
  return Boolean(pkg.detectionRule && REMOVABLE_RULE_TYPES.has(pkg.detectionRule.type));
}

const MODE_LABELS = { install: "Install", reinstall: "Reinstall", uninstall: "Uninstall" };

// Phase C — ring rollout presets. "fast" = single 100% wave (no rollout body);
// "conservative" = 1% canary → 10% early → 100% broad with success gates.
const CONSERVATIVE_ROLLOUT = {
  rings: [
    { percent: 1, minSuccessRate: 0.9, soakMinutes: 30 },
    { percent: 10, minSuccessRate: 0.9, soakMinutes: 60 },
    { percent: 100 },
  ],
};

export default function DeployWizardDialog({
  open,
  pkg,           // SoftwarePackageDto (the row the operator clicked Deploy on)
  onClose,
  onConfirm,     // async (deployBody) → handled by parent
  notify,
}) {
  const [activeStep, setActiveStep] = React.useState(0);

  // ── Deployment mode ───────────────────────────────────────────
  const [mode, setMode] = React.useState("install");
  const uninstallable = React.useMemo(() => canUninstall(pkg), [pkg]);

  // ── Rollout preset (Phase C) ──────────────────────────────────
  const [rolloutPreset, setRolloutPreset] = React.useState("fast");

  // ── Target state ──────────────────────────────────────────────
  const [targetMode, setTargetMode] = React.useState("asset_group");
  const [groupCatalog, setGroupCatalog] = React.useState([]);
  const [groupId, setGroupId] = React.useState("");
  const [deviceIdsRaw, setDeviceIdsRaw] = React.useState("");

  const [submitting, setSubmitting] = React.useState(false);

  // Reset whenever the dialog opens
  React.useEffect(() => {
    if (!open) return;
    setActiveStep(0);
    setMode("install");
    setRolloutPreset("fast");
    setTargetMode("asset_group");
    setGroupId("");
    setDeviceIdsRaw("");
    setSubmitting(false);
  }, [open]);

  // Lazy-load asset groups
  React.useEffect(() => {
    if (!open) return;
    listAssetGroups()
      .then((res) => {
        const items = listFrom(res, { context: "deployWizardTargets" });
        setGroupCatalog(items);
      })
      .catch((err) => {
        notify?.("error", err?.body?.message || err?.message || "Failed to load asset groups");
        setGroupCatalog([]);
      });
  }, [open, notify]);

  const selectedGroup = React.useMemo(
    () => groupCatalog.find((g) => String(g.id) === String(groupId)) || null,
    [groupCatalog, groupId]
  );

  const parsedDeviceIds = React.useMemo(() => {
    return deviceIdsRaw
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [deviceIdsRaw]);

  // Validation per step
  const canAdvanceFromTarget = React.useMemo(() => {
    if (targetMode === "asset_group") return Boolean(groupId);
    return parsedDeviceIds.length > 0;
  }, [targetMode, groupId, parsedDeviceIds.length]);

  const canFire = React.useMemo(() => {
    if (submitting) return false;
    if (targetMode === "asset_group") return Boolean(groupId);
    return parsedDeviceIds.length > 0;
  }, [submitting, targetMode, groupId, parsedDeviceIds.length]);

  const handleFire = async () => {
    if (!canFire) return;
    setSubmitting(true);
    try {
      const rollout = rolloutPreset === "conservative" ? { rollout: CONSERVATIVE_ROLLOUT } : {};
      const body =
        targetMode === "asset_group"
          ? { mode, assetGroupId: Number(groupId), ...rollout }
          : { mode, deviceIds: parsedDeviceIds, ...rollout };
      await onConfirm?.(body);
      // Parent closes the dialog on success
    } catch (err) {
      // Surface error inline so the operator can adjust without losing
      // the wizard state.
      notify?.(
        "error",
        err?.body?.message || err?.body?.error || err?.message || "Deploy failed"
      );
      setSubmitting(false);
    }
  };

  if (!pkg) return null;

  const platformMatchesGroups =
    targetMode === "asset_group" && selectedGroup
      ? `Note: backend evaluates membership at dispatch time. Devices in this group whose platform/arch don't match (${pkg.platform}/${pkg.arch}) will be rejected per-device with reason platform_mismatch.`
      : null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        Deploy {pkg.name} v{pkg.version}
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {activeStep === 0 ? (
          <Stack spacing={2}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: `1px solid ${BRAND.border}`,
                bgcolor: BRAND.surfaceMuted,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip
                  size="small"
                  label={`${pkg.platform} / ${pkg.arch}`}
                  sx={{ fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
                />
                <Chip
                  size="small"
                  label={pkg.format.toUpperCase()}
                  sx={{ fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
                />
                {pkg.requiresReboot ? (
                  <Chip
                    size="small"
                    label="reboot required"
                    sx={{
                      fontWeight: 700,
                      bgcolor: BRAND.alert?.warningSoft,
                      color: BRAND.alert?.warning,
                    }}
                  />
                ) : null}
                <Typography sx={{ fontSize: 12, color: BRAND.gray, ml: 1 }}>
                  {pkg.detectionRule
                    ? `Detection: ${pkg.detectionRule.type}`
                    : "No detection rule (will install on every dispatch)"}
                </Typography>
              </Stack>
            </Box>

            <TextField
              select
              size="small"
              fullWidth
              label="Mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              helperText={
                mode === "uninstall"
                  ? "Removes the package from targeted devices that have it installed."
                  : mode === "reinstall"
                  ? "Re-runs the installer even on devices already up to date."
                  : "Installs on devices that don't already have the package."
              }
            >
              <MenuItem value="install">{MODE_LABELS.install}</MenuItem>
              <MenuItem value="reinstall">{MODE_LABELS.reinstall}</MenuItem>
              <MenuItem value="uninstall" disabled={!uninstallable}>
                {MODE_LABELS.uninstall}
                {!uninstallable ? " — needs an uninstall identity or args" : ""}
              </MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              fullWidth
              label="Rollout"
              value={rolloutPreset}
              onChange={(e) => setRolloutPreset(e.target.value)}
              helperText={
                rolloutPreset === "conservative"
                  ? "Rings: 1% canary (90% success, 30m soak) → 10% (90%, 60m) → 100%. Auto-halts on a failed gate."
                  : "Everything dispatches in a single wave."
              }
            >
              <MenuItem value="fast">Fast — single wave</MenuItem>
              <MenuItem value="conservative">Conservative — canary rings</MenuItem>
            </TextField>

            <RadioGroup
              row
              value={targetMode}
              onChange={(e) => setTargetMode(e.target.value)}
            >
              <FormControlLabel
                value="asset_group"
                control={<Radio />}
                label="Asset group"
              />
              <FormControlLabel
                value="device_list"
                control={<Radio />}
                label="Manual device list"
              />
            </RadioGroup>

            {targetMode === "asset_group" ? (
              <TextField
                select
                size="small"
                fullWidth
                label="Asset group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                helperText={
                  groupCatalog.length === 0
                    ? "No asset groups available — create one from the Asset Groups page or use a manual device list"
                    : "Membership is evaluated at dispatch time (dynamic groups re-query criteria)."
                }
              >
                {groupCatalog.map((g) => (
                  <MenuItem key={g.id} value={String(g.id)}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{g.name}</Typography>
                      <Typography sx={{ fontSize: 11, color: BRAND.gray }}>
                        {g.kind === "dynamic" ? "dyn" : "static"}
                        {Number.isFinite(g.memberCount) ? ` · ${g.memberCount}` : ""}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                size="small"
                fullWidth
                label="Device IDs"
                multiline
                minRows={3}
                maxRows={8}
                value={deviceIdsRaw}
                onChange={(e) => setDeviceIdsRaw(e.target.value)}
                placeholder={"agent-001\nagent-002\nagent-003"}
                helperText={
                  parsedDeviceIds.length > 0
                    ? `${parsedDeviceIds.length} device(s) — split by whitespace, comma, semicolon or newline`
                    : "Paste one or more device IDs (whitespace / comma / newline separated)"
                }
              />
            )}

            {platformMatchesGroups ? (
              <Alert
                severity="info"
                sx={{
                  bgcolor: BRAND.alert?.infoSoft,
                  color: BRAND.dark,
                  "& .MuiAlert-icon": { color: BRAND.teal },
                }}
              >
                {platformMatchesGroups}
              </Alert>
            ) : null}
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Typography
                variant="caption"
                sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}
              >
                Package
              </Typography>
              <Box sx={{ p: 1.5, mt: 0.5, borderRadius: 1, border: `1px solid ${BRAND.border}` }}>
                <Typography sx={{ fontWeight: 700, color: BRAND.dark }}>
                  {pkg.name} <span style={{ color: BRAND.gray, fontWeight: 500 }}>v{pkg.version}</span>
                </Typography>
                <Typography sx={{ fontSize: 12, color: BRAND.gray, mt: 0.5 }}>
                  {pkg.platform} / {pkg.arch} / {pkg.format.toUpperCase()}
                  {pkg.sizeBytes ? ` · ${formatBytes(pkg.sizeBytes)}` : ""}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: BRAND.gray,
                    mt: 0.5,
                    wordBreak: "break-all",
                  }}
                >
                  sha256 {pkg.sha256?.slice(0, 16)}…{pkg.sha256?.slice(-8)}
                </Typography>
              </Box>
            </Box>

            <Box>
              <Typography
                variant="caption"
                sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}
              >
                Target
              </Typography>
              <Box sx={{ p: 1.5, mt: 0.5, borderRadius: 1, border: `1px solid ${BRAND.border}` }}>
                {targetMode === "asset_group" ? (
                  <>
                    <Typography sx={{ fontWeight: 700, color: BRAND.dark }}>
                      Asset group: {selectedGroup?.name || groupId}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: BRAND.gray, mt: 0.5 }}>
                      {selectedGroup?.kind === "dynamic"
                        ? "Dynamic — backend re-evaluates criteria at dispatch."
                        : "Static — current member list will be used."}
                      {Number.isFinite(selectedGroup?.memberCount)
                        ? ` ~${selectedGroup.memberCount} device(s) at last evaluation.`
                        : ""}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Typography sx={{ fontWeight: 700, color: BRAND.dark }}>
                      Device list ({parsedDeviceIds.length})
                    </Typography>
                    <Box sx={{ mt: 0.75, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {parsedDeviceIds.slice(0, 30).map((id) => (
                        <Chip
                          key={id}
                          size="small"
                          label={id}
                          sx={{
                            fontFamily: "monospace",
                            fontSize: 11,
                            bgcolor: BRAND.tealSoft,
                            color: BRAND.tealText,
                          }}
                        />
                      ))}
                      {parsedDeviceIds.length > 30 ? (
                        <Chip
                          size="small"
                          label={`+ ${parsedDeviceIds.length - 30} more`}
                          sx={{ bgcolor: BRAND.darkSoft, color: BRAND.dark }}
                        />
                      ) : null}
                    </Box>
                  </>
                )}
              </Box>
            </Box>

            <Alert
              severity="warning"
              sx={{
                bgcolor: BRAND.alert?.warningSoft,
                color: BRAND.dark,
                "& .MuiAlert-icon": { color: BRAND.alert?.warning },
              }}
            >
              <Typography sx={{ fontSize: 13 }}>
                Firing will create one <strong>{MODE_LABELS[mode].toLowerCase()}</strong> job per device.
                {pkg.detectionRule
                  ? mode === "uninstall"
                    ? " Detection will skip devices that don't have the package."
                    : mode === "reinstall"
                    ? " Detection is bypassed — the installer re-runs on every device."
                    : " Detection will skip devices that already have the package."
                  : " No detection rule — the action runs on every device."}
                {" "}Per-device cap is 1000 — split larger groups.
              </Typography>
            </Alert>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={onClose}
          disabled={submitting}
          sx={{ textTransform: "none", color: BRAND.gray }}
        >
          Cancel
        </Button>
        {activeStep > 0 ? (
          <Button
            onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
            disabled={submitting}
            sx={{ textTransform: "none" }}
          >
            Back
          </Button>
        ) : null}
        {activeStep < STEPS.length - 1 ? (
          <Button
            onClick={() => setActiveStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canAdvanceFromTarget}
            variant="contained"
            sx={{
              textTransform: "none",
              fontWeight: 700,
              bgcolor: BRAND.teal,
              "&:hover": { bgcolor: BRAND.tealHover },
            }}
          >
            Next
          </Button>
        ) : (
          <Button
            onClick={handleFire}
            disabled={!canFire}
            variant="contained"
            startIcon={
              submitting ? (
                <CircularProgress size={14} sx={{ color: "#fff" }} />
              ) : (
                <RocketLaunchOutlinedIcon />
              )
            }
            sx={{
              textTransform: "none",
              fontWeight: 700,
              bgcolor: BRAND.teal,
              "&:hover": { bgcolor: BRAND.tealHover },
            }}
          >
            {submitting ? "Dispatching…" : MODE_LABELS[mode]}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
