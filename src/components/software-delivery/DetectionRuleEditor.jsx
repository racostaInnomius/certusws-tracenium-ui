// src/components/software-delivery/DetectionRuleEditor.jsx
//
// Polymorphic editor for SDP DetectionRule. Renders a type dropdown
// + the fields that apply to the chosen type. Emits a normalized
// rule object on change (or null when the operator picks "None").
//
// Rule shapes (mirror of backend types):
//   { type: "registry_uninstall", displayNameLike, minVersion? }   Windows
//   { type: "bundle_version",     bundleId,        minVersion? }   macOS
//   { type: "pkg_receipt",        pkgId,           minVersion? }   macOS
//   { type: "file_exists",        path }                            cross
//   { type: "command_exit",       cmd, args?, stdoutMatches? }      cross
//
// "None" is a valid choice — backend treats null as "no detection
// rule, install always". The UI surfaces this as a blank state with a
// hint that idempotency is the operator's responsibility.

import * as React from "react";
import {
  TextField,
  MenuItem,
  Stack,
  Typography,
  Alert,
} from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

const RULE_TYPES = [
  { value: "",                    label: "None (always install)" },
  { value: "registry_uninstall",  label: "Registry uninstall (Windows)" },
  { value: "bundle_version",      label: "Bundle version (macOS)" },
  { value: "pkg_receipt",         label: "PKG receipt (macOS)" },
  { value: "file_exists",         label: "File exists (cross)" },
  { value: "command_exit",        label: "Command exit (cross)" },
];

function emptyRule(type) {
  switch (type) {
    case "registry_uninstall":
      return { type, displayNameLike: "", minVersion: "" };
    case "bundle_version":
      return { type, bundleId: "", minVersion: "" };
    case "pkg_receipt":
      return { type, pkgId: "", minVersion: "" };
    case "file_exists":
      return { type, path: "" };
    case "command_exit":
      return { type, cmd: "", args: [], stdoutMatches: "" };
    default:
      return null;
  }
}

// Normalize the rule shape that goes on the wire — strip empty
// optional fields so the backend doesn't re-validate something we
// didn't set, and split args input ("a, b, c") to array.
function normalize(rule) {
  if (!rule || !rule.type) return null;
  const out = { type: rule.type };
  switch (rule.type) {
    case "registry_uninstall": {
      out.displayNameLike = String(rule.displayNameLike || "").trim();
      const minV = String(rule.minVersion || "").trim();
      if (minV) out.minVersion = minV;
      break;
    }
    case "bundle_version": {
      out.bundleId = String(rule.bundleId || "").trim();
      const minV = String(rule.minVersion || "").trim();
      if (minV) out.minVersion = minV;
      break;
    }
    case "pkg_receipt": {
      out.pkgId = String(rule.pkgId || "").trim();
      const minV = String(rule.minVersion || "").trim();
      if (minV) out.minVersion = minV;
      break;
    }
    case "file_exists":
      out.path = String(rule.path || "").trim();
      break;
    case "command_exit": {
      out.cmd = String(rule.cmd || "").trim();
      const argsRaw = Array.isArray(rule.args)
        ? rule.args
        : String(rule.argsRaw || "").split(",");
      const args = argsRaw.map((a) => String(a).trim()).filter(Boolean);
      if (args.length > 0) out.args = args;
      const sm = String(rule.stdoutMatches || "").trim();
      if (sm) out.stdoutMatches = sm;
      break;
    }
    default:
      return null;
  }
  return out;
}

export default function DetectionRuleEditor({ value, onChange }) {
  // Internal "draft" mirrors the rule + helper fields (e.g. argsRaw)
  // that aren't part of the wire shape but help editing UX.
  const [draft, setDraft] = React.useState(() => {
    if (!value) return { type: "" };
    const seed = { ...value };
    if (Array.isArray(seed.args)) {
      seed.argsRaw = seed.args.join(", ");
    }
    return seed;
  });

  // Push normalized rule upstream whenever the draft changes.
  React.useEffect(() => {
    onChange?.(normalize(draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const handleTypeChange = (newType) => {
    if (!newType) {
      setDraft({ type: "" });
      return;
    }
    setDraft(emptyRule(newType));
  };

  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <Stack spacing={1.5}>
      <TextField
        select
        size="small"
        fullWidth
        label="Detection rule"
        value={draft.type || ""}
        onChange={(e) => handleTypeChange(e.target.value)}
        helperText="How the agent decides whether the package is already installed. Skip with 'None' if you don't have a reliable signal."
      >
        {RULE_TYPES.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      {draft.type === "registry_uninstall" && (
        <Stack spacing={1.5}>
          <TextField
            size="small"
            fullWidth
            label="Display name pattern"
            placeholder="Foo Application%"
            value={draft.displayNameLike || ""}
            onChange={(e) => update({ displayNameLike: e.target.value })}
            helperText="SQL-ILIKE style: % = any sequence, _ = any single char. Anchored automatically."
          />
          <TextField
            size="small"
            fullWidth
            label="Minimum version (optional)"
            placeholder="1.2.3"
            value={draft.minVersion || ""}
            onChange={(e) => update({ minVersion: e.target.value })}
            helperText="If set, agent counts as 'already installed' only when DisplayVersion ≥ this. Leave blank to match any version."
          />
        </Stack>
      )}

      {draft.type === "bundle_version" && (
        <Stack spacing={1.5}>
          <TextField
            size="small"
            fullWidth
            label="Bundle identifier"
            placeholder="com.example.foo"
            value={draft.bundleId || ""}
            onChange={(e) => update({ bundleId: e.target.value })}
            helperText="CFBundleIdentifier of the .app bundle in /Applications."
          />
          <TextField
            size="small"
            fullWidth
            label="Minimum version (optional)"
            placeholder="1.2.3"
            value={draft.minVersion || ""}
            onChange={(e) => update({ minVersion: e.target.value })}
          />
        </Stack>
      )}

      {draft.type === "pkg_receipt" && (
        <Stack spacing={1.5}>
          <TextField
            size="small"
            fullWidth
            label="Package receipt id"
            placeholder="com.example.foo.installer"
            value={draft.pkgId || ""}
            onChange={(e) => update({ pkgId: e.target.value })}
            helperText="The receipt id you'd query with `pkgutil --pkg-info`."
          />
          <TextField
            size="small"
            fullWidth
            label="Minimum version (optional)"
            placeholder="1.2.3"
            value={draft.minVersion || ""}
            onChange={(e) => update({ minVersion: e.target.value })}
          />
        </Stack>
      )}

      {draft.type === "file_exists" && (
        <TextField
          size="small"
          fullWidth
          label="Absolute path"
          placeholder="C:\\Program Files\\Foo\\foo.exe"
          value={draft.path || ""}
          onChange={(e) => update({ path: e.target.value })}
          helperText="Path is checked verbatim. Use the device's native path separator."
        />
      )}

      {draft.type === "command_exit" && (
        <Stack spacing={1.5}>
          <TextField
            size="small"
            fullWidth
            label="Command (absolute path)"
            placeholder="/usr/local/bin/foo"
            value={draft.cmd || ""}
            onChange={(e) => update({ cmd: e.target.value })}
          />
          <TextField
            size="small"
            fullWidth
            label="Arguments (comma-separated, optional)"
            placeholder="--version"
            value={draft.argsRaw ?? (Array.isArray(draft.args) ? draft.args.join(", ") : "")}
            onChange={(e) => update({ argsRaw: e.target.value })}
          />
          <TextField
            size="small"
            fullWidth
            label="Stdout regex (optional)"
            placeholder="^1\\.2\\."
            value={draft.stdoutMatches || ""}
            onChange={(e) => update({ stdoutMatches: e.target.value })}
            helperText="If set, exit must be 0 AND stdout must match this regex. Bad regex fails closed (won't match)."
          />
        </Stack>
      )}

      {!draft.type && (
        <Alert
          severity="info"
          sx={{
            bgcolor: BRAND.alert?.infoSoft || BRAND.tealSoft,
            color: BRAND.dark,
            "& .MuiAlert-icon": { color: BRAND.teal },
          }}
        >
          <Typography sx={{ fontSize: TEXT.md }}>
            Without a detection rule the installer will run on every deployment, even on devices that already have the package. The package's own installer should be idempotent for this to be safe.
          </Typography>
        </Alert>
      )}
    </Stack>
  );
}
