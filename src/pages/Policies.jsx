import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Snackbar,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";

import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import BrandSnackbar from "../components/common/BrandSnackbar";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";

import { useAuthContext } from "../auth/AuthContext";
import { useConfirm } from "../components/common/ConfirmDialog";
import {
  deleteDevicePolicy,
  getDevicePolicy,
  getDevicePolicyStatus,
  getEffectivePolicy,
  getTenantPolicy,
  listTenantPolicyStatus,
  pushDevicePolicy,
  pushTenantPolicy,
  saveDevicePolicy,
  saveTenantPolicy,
} from "../api/policies";
import { listKnownDevices } from "../api/jobs";
import { getPluginCoverageSummary } from "../api/overview";
import PluginCoverageStrip from "../components/Overview/PluginCoverageStrip";
import OnlineDot from "../components/common/OnlineDot";

import { BRAND, DATAGRID_SX } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { PLUGIN_CATALOG } from "../constants/plugins";

// Plugin catalog now lives in src/constants/plugins.js so the new
// Plugin Control page and this page render the same metadata. Aliased
// to PLUGIN_DESCRIPTORS locally because that's the name the rest of
// this file already uses; renaming everywhere would balloon this diff
// without changing behavior.
const PLUGIN_DESCRIPTORS = PLUGIN_CATALOG;

// Interval bounds — mirror the server-side validator
// (modules/policies/policies.service.ts) AND the agent's
// policy-runtime.ts. The agent silently reverts out-of-range values
// to its hardcoded default, so we clamp here too to fail fast at
// authoring time instead of letting the operator save a number that
// the agent will quietly ignore.
//
// Sprint 1 of Policy v2 added inventory + update bounds — they were
// previously hardcoded on the agent and not editable from the UI at
// all.
const INVENTORY_INTERVAL_MIN = 60;       // 1m   — AMP scans can be tight
const INVENTORY_INTERVAL_MAX = 86400;    // 24h
const COMPLIANCE_INTERVAL_MIN = 300;     // 5m
const COMPLIANCE_INTERVAL_MAX = 86400;   // 24h
const PATCH_INTERVAL_MIN = 300;          // 5m
const PATCH_INTERVAL_MAX = 604800;       // 7d
const UPDATE_INTERVAL_MIN = 60;          // 1m   — but useful range is hourly
const UPDATE_INTERVAL_MAX = 86400;       // 24h  — beyond this disable the
                                          //         module instead of cranking it

// ── Form ⇄ policy mapping. The form tracks plugin toggles plus the
//    compliance collection interval; modules are derived from plugins
//    (see formToPolicy). Required plugins are clamped to true regardless
//    of the incoming policy.
// Reads either the v1 top-level path or the v2 `agent.schedules.*`
// path. v2 wins on conflict. Pair function with writeIntervalToPolicy
// below; together they let the form stay schema-agnostic.
function pickInterval(policy, key) {
  const v2 = policy?.agent?.schedules?.[key]?.intervalSeconds;
  if (v2 !== undefined && v2 !== null) return Number(v2);
  const v1 = policy?.[key]?.intervalSeconds;
  if (v1 !== undefined && v1 !== null) return Number(v1);
  return NaN;
}

function pickFeature(policy, key) {
  const v2 = policy?.agent?.features?.[key];
  if (v2 !== undefined) return Boolean(v2);
  const v1 = policy?.features?.[key];
  if (v1 !== undefined) return Boolean(v1);
  return null; // unset
}

// ── Security Policy schema mirror (Sprint 2 of Policy v2) ─────────
// Stays in sync with src/core/policy-runtime.ts:SecurityPolicy in the
// agent + the validator in modules/policies/policies.service.ts. The
// form structure is flat: one entry per capability, each with a
// `mode` and capability-specific scalar fields.
const SECURITY_MODES = [
  { value: "off",          label: "Off",          tone: "muted",
    description: "No reads, no remediation. The capability is not evaluated." },
  { value: "report-only",  label: "Report only",  tone: "info",
    description: "Detect drift and surface in the dashboard. Never modify the device." },
  { value: "auto",         label: "Auto-remediate", tone: "warn",
    description: "Detect drift AND apply the remediation immediately. Use after vetting in report-only." },
];

// Catalog of every security capability the UI knows about. Each
// entry declares its desired-state field shape so the form can
// render the right control (boolean → switch, enum → radio, etc.).
//
// `enforcer: true`  → agent has a working pmp.remediate handler.
//                     Mode "auto" actually does something.
// `enforcer: false` → policy is stored but agent doesn't enforce
//                     yet. UI grays the mode selector at "auto" and
//                     marks the card "report-only available, auto
//                     coming in a later release".
const SECURITY_CAPABILITIES = [
  {
    key: "firewall",
    label: "Host firewall",
    description: "Ensure the host's local firewall is enabled. ufw on Debian/Ubuntu, firewalld on RHEL family, Windows Defender Firewall on Windows.",
    osTags: ["Linux", "Windows"],
    enforcer: true,
    fields: [
      { key: "required", label: "Required to be enabled", type: "boolean", default: true },
    ],
  },
  {
    key: "ssh",
    label: "SSH hardening",
    description: "Enforce sshd configuration. Writes drop-in under /etc/ssh/sshd_config.d/ and reloads sshd. Linux only — the SCP collector doesn't extract sshd config on Windows even when OpenSSH Server is installed.",
    osTags: ["Linux"],
    enforcer: true,
    fields: [
      { key: "permitRootLogin", label: "PermitRootLogin", type: "enum",
        options: [
          { value: "no", label: "no (recommended)" },
          { value: "yes", label: "yes (insecure)" },
        ], default: "no" },
      { key: "passwordAuthentication", label: "PasswordAuthentication", type: "boolean",
        default: false, trueLabel: "yes (allow)", falseLabel: "no (key-only, recommended)" },
      { key: "weakKexDisabled", label: "Disable weak SSH KEX algorithms", type: "boolean",
        default: true, trueLabel: "Disable", falseLabel: "Allow" },
    ],
  },
  {
    key: "tls",
    label: "TLS legacy controls (SCHANNEL)",
    description: "Disable TLS 1.0 / 1.1 and weak SCHANNEL ciphers. Writes HKLM\\SYSTEM\\...\\SCHANNEL registry entries; requires a reboot to fully apply (LSA reload).",
    osTags: ["Windows"],
    enforcer: true,
    fields: [
      { key: "legacyDisabled", label: "Disable TLS 1.0 / 1.1", type: "boolean",
        default: true, trueLabel: "Disable", falseLabel: "Allow" },
      { key: "weakCiphersDisabled", label: "Disable weak ciphers (RC4, 3DES, DES, NULL)", type: "boolean",
        default: true, trueLabel: "Disable", falseLabel: "Allow" },
    ],
  },
  {
    key: "smb",
    label: "SMB protocol controls",
    description: "Disable SMBv1. Registry edit + PowerShell feature unload; full removal requires a reboot.",
    osTags: ["Windows"],
    enforcer: true,
    fields: [
      { key: "smbv1Disabled", label: "Disable SMBv1", type: "boolean",
        default: true, trueLabel: "Disable", falseLabel: "Allow" },
    ],
  },

  // ── Placeholders below: policy is persisted but the agent has no
  //    enforcer yet. The UI lets the operator pick `mode` and the
  //    desired state, but `auto` is effectively the same as
  //    `report-only` until the corresponding privsvc handler ships.
  {
    key: "passwordPolicy",
    label: "Password policy",
    description: "Maximum password age and hash algorithm (read from /etc/login.defs on Linux, local security policy on Windows). Collector exists; auto-remediation in a later release.",
    osTags: ["Linux"],
    enforcer: false,
    fields: [
      { key: "passMaxDaysMax", label: "Max password age (days)", type: "number",
        min: 1, max: 99999, default: 365 },
      { key: "encryptMethod", label: "Hash algorithm", type: "enum",
        options: [
          { value: "SHA512", label: "SHA512" },
          { value: "YESCRYPT", label: "YESCRYPT" },
        ], default: "SHA512" },
    ],
  },
  {
    key: "bitlocker",
    label: "BitLocker (Windows)",
    description: "Ensure system drive is encrypted with BitLocker. Collector reports current status; auto-remediation in a later release.",
    osTags: ["Windows"],
    enforcer: false,
    fields: [
      { key: "required", label: "Required on system drive", type: "boolean", default: true },
    ],
  },
  {
    key: "usb",
    label: "USB control",
    description: "Block or allow USB devices by VID:PID. Greenfield — no collector or enforcer yet; setting here parks the desired state for a future release.",
    osTags: ["Windows", "Linux"],
    enforcer: false,
    fields: [
      // Skipped in MVP UI — list fields require a richer editor we
      // don't have on this page yet. Operators with strong USB
      // policy needs can use the Advanced JSON editor below.
    ],
  },
  {
    key: "shares",
    label: "Network shares",
    description: "Block SMB shares granting Everyone:FullControl. Collector exists; auto-remediation in a later release.",
    osTags: ["Windows"],
    enforcer: false,
    fields: [
      { key: "denyEveryoneFullControl", label: "Deny Everyone:FullControl", type: "boolean",
        default: true, trueLabel: "Deny", falseLabel: "Allow" },
    ],
  },
];

function readSecurityFromPolicy(policy) {
  const security = policy?.security ?? null;
  if (!security || typeof security !== "object") {
    return {
      defaultMode: "report-only",
      capabilities: {},
    };
  }
  const capabilities = {};
  for (const cap of SECURITY_CAPABILITIES) {
    const block = security[cap.key];
    if (!block || typeof block !== "object") {
      capabilities[cap.key] = { mode: null, values: {} };
      continue;
    }
    const values = {};
    for (const field of cap.fields) {
      if (block[field.key] !== undefined) values[field.key] = block[field.key];
    }
    capabilities[cap.key] = {
      mode: block.mode ?? null,
      values,
    };
  }
  return {
    defaultMode: security.defaultMode || "report-only",
    capabilities,
  };
}

function securityFormToPolicy(securityForm) {
  // Only emit fields the operator actually configured. An empty
  // capability object would still convey "this capability is in the
  // policy" — which would override the backend default in confusing
  // ways. Skip empty entries entirely.
  const out = {};
  if (securityForm.defaultMode && securityForm.defaultMode !== "report-only") {
    out.defaultMode = securityForm.defaultMode;
  }
  for (const cap of SECURITY_CAPABILITIES) {
    const entry = securityForm.capabilities?.[cap.key];
    if (!entry) continue;
    const hasValues = Object.keys(entry.values || {}).length > 0;
    const hasMode = entry.mode !== null && entry.mode !== undefined;
    if (!hasValues && !hasMode) continue;

    const block = {};
    if (hasMode) block.mode = entry.mode;
    Object.assign(block, entry.values || {});
    out[cap.key] = block;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function readFormFromPolicy(policy) {
  const enabled = Array.isArray(policy?.plugins?.enabled)
    ? policy.plugins.enabled
    : Array.isArray(policy?.agent?.plugins?.enabled)
    ? policy.agent.plugins.enabled
    : [];

  const inventoryNum = pickInterval(policy, "inventory");
  const complianceNum = pickInterval(policy, "compliance");
  const patchNum = pickInterval(policy, "patch");
  const updateNum = pickInterval(policy, "update");

  return {
    plugins: Object.fromEntries(
      PLUGIN_DESCRIPTORS.map((p) => [
        p.key,
        p.required ? true : enabled.includes(p.key),
      ])
    ),
    // Plugin-specific settings live under their own sub-key so adding
    // another plugin's options later (e.g. `patch: {...}`) stays
    // additive without restructuring the form shape.
    inventory: {
      intervalSeconds:
        Number.isFinite(inventoryNum) && inventoryNum > 0 ? inventoryNum : null,
    },
    compliance: {
      intervalSeconds:
        Number.isFinite(complianceNum) && complianceNum > 0 ? complianceNum : null,
    },
    patch: {
      intervalSeconds:
        Number.isFinite(patchNum) && patchNum > 0 ? patchNum : null,
    },
    update: {
      intervalSeconds:
        Number.isFinite(updateNum) && updateNum > 0 ? updateNum : null,
    },
    features: {
      // selfUpdate defaults to true on the agent if unset, but for the
      // form we surface `null` (unset) so the operator can distinguish
      // "I haven't touched this" from "I explicitly turned it off".
      selfUpdate: pickFeature(policy, "selfUpdate"),
      // remoteShell is a placeholder for the future RCP (remote
      // control plugin). The form reads + writes the flag but the UI
      // renders it as "coming soon" — not editable yet.
      remoteShell: pickFeature(policy, "remoteShell"),
    },
    // Security Policy v2 — separate sub-form so the security cards
    // can be a sibling section. Stored back into policy.security on
    // formToPolicy. Empty policies result in the empty default
    // shape (no capabilities configured).
    security: readSecurityFromPolicy(policy),
  };
}

function formToPolicy(form) {
  const pluginsEnabled = PLUGIN_DESCRIPTORS
    .filter((p) => p.required || form.plugins[p.key])
    .map((p) => p.key);

  // Derive modules from plugins that imply one (e.g. scp → compliance).
  const modules = {};
  PLUGIN_DESCRIPTORS.forEach((p) => {
    if (p.impliesModule && pluginsEnabled.includes(p.key)) {
      modules[p.impliesModule] = true;
    }
  });

  const policy = {
    modules,
    plugins: { enabled: pluginsEnabled },
  };

  // Helper: emit a `{<key>: {intervalSeconds: N}}` block on the
  // policy only when the operator entered a value within range. Same
  // omit-vs-include logic as before — empty fields mean "use the
  // backend default", and we represent that by leaving the key off
  // entirely rather than serializing an empty object that the agent
  // would still treat as "no value".
  function maybeAddInterval(key, raw, min, max, gateEnabled) {
    if (!gateEnabled) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max) return;
    policy[key] = { intervalSeconds: n };
  }

  // Inventory rides the AMP module — emitted when AMP is enabled.
  // AMP is a required plugin so this is effectively always on, but
  // keeping the gate explicit makes the intent legible.
  maybeAddInterval(
    "inventory",
    form?.inventory?.intervalSeconds,
    INVENTORY_INTERVAL_MIN,
    INVENTORY_INTERVAL_MAX,
    pluginsEnabled.includes("amp")
  );

  maybeAddInterval(
    "compliance",
    form?.compliance?.intervalSeconds,
    COMPLIANCE_INTERVAL_MIN,
    COMPLIANCE_INTERVAL_MAX,
    modules.compliance === true
  );

  maybeAddInterval(
    "patch",
    form?.patch?.intervalSeconds,
    PATCH_INTERVAL_MIN,
    PATCH_INTERVAL_MAX,
    modules.patch === true
  );

  // Update interval is gated by the update module — but the module
  // is on by default (modules.update=true at the agent level even
  // without explicit policy). We emit when the operator set a value;
  // the agent default (6h) takes over otherwise.
  maybeAddInterval(
    "update",
    form?.update?.intervalSeconds,
    UPDATE_INTERVAL_MIN,
    UPDATE_INTERVAL_MAX,
    true
  );

  // ── Feature toggles ──────────────────────────────────────────────
  // Only emit fields the operator explicitly changed (null = unset).
  // remoteShell is wire-accepted but UI-disabled until RCP ships.
  const features = {};
  if (form?.features?.selfUpdate !== null && form?.features?.selfUpdate !== undefined) {
    features.selfUpdate = Boolean(form.features.selfUpdate);
  }
  if (form?.features?.remoteShell !== null && form?.features?.remoteShell !== undefined) {
    features.remoteShell = Boolean(form.features.remoteShell);
  }
  if (Object.keys(features).length > 0) {
    policy.features = features;
  }

  // ── Security policy block (Sprint 2 of Policy v2) ───────────────
  // Same omit-empty rule as the rest of formToPolicy. If the operator
  // configured anything in the Security section, securityFormToPolicy
  // returns a non-null object that becomes `policy.security`.
  // Otherwise the key is omitted so the policy stays minimal.
  const securityBlock = securityFormToPolicy(form.security || {});
  if (securityBlock) {
    policy.security = securityBlock;
  }

  return policy;
}

function isEmptyPolicy(policy) {
  if (!policy) return true;
  if (typeof policy !== "object") return true;
  const keys = Object.keys(policy);
  return keys.length === 0;
}

/**
 * Normalize the assorted response shapes the policies API returns into
 * a single envelope. Backend today wraps the DB row as:
 *   { ok: true, policy: { policy_version, policy_hash, policy_json, updated_at } }
 * but we want to support older / alternate shapes too without hunting
 * through every call site — any reader should treat the result of this
 * helper as the source of truth.
 *
 * Returns:
 *   {
 *     raw: <the policy content object (modules/plugins/compliance/...)
 *           or null if there's no override set>,
 *     version, hash, updatedAt
 *   }
 */
function extractPolicyEnvelope(response) {
  if (!response || typeof response !== "object") {
    return { raw: null, version: null, hash: null, updatedAt: null };
  }

  // Walk past the { ok, policy } wrapper. If the caller already passed
  // the row or the policy content itself, `row` stays the same value.
  const row = response?.policy ?? response;

  // `row` could be a DB record (snake_case + a policy_json field) or
  // the policy content directly. Detect by the telltale `policy_json`
  // key.
  let rawContent = null;
  let version = null;
  let hash = null;
  let updatedAt = null;

  if (row && typeof row === "object") {
    if ("policy_json" in row || "policyJson" in row) {
      rawContent = row.policy_json ?? row.policyJson ?? null;
      version = row.policy_version ?? row.policyVersion ?? null;
      hash = row.policy_hash ?? row.policyHash ?? null;
      updatedAt = row.updated_at ?? row.updatedAt ?? null;
    } else {
      // Plain policy content (caller already unwrapped).
      rawContent = row;
      version = row.version ?? null;
      hash = row.hash ?? null;
      updatedAt = row.updatedAt ?? row.updated_at ?? null;
    }
  }

  return {
    raw: rawContent,
    version: version != null ? String(version) : null,
    hash: hash != null ? String(hash) : null,
    updatedAt
  };
}

function formatJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

// Compact relative time formatter — "Now" / "5m ago" / "2h ago" / "3d ago".
//
// Used in tabular columns where space is tight and the operator wants to
// scan-read freshness, not parse exact timestamps. Pair with
// `formatDate(value)` as a tooltip when context warrants the absolute
// reading. Returns "—" for null/invalid input so the cell renders
// consistently with other helpers.
function formatRelativeTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "Now"; // future timestamp (clock skew) — round to now
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "Now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortHash(hash) {
  if (!hash) return "—";
  const s = String(hash);
  return s.length > 14 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s;
}

function renderAckChip(status, reasonText) {
  if (status === 0) {
    return (
      <Chip
        label="ACK OK"
        size="small"
        icon={<CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
        sx={{
          bgcolor: BRAND.tealSoft,
          color: BRAND.tealText,
          fontWeight: 700,
          border: `1px solid ${BRAND.teal}55`,
          "& .MuiChip-icon": { color: BRAND.tealText },
        }}
      />
    );
  }
  if (status == null) {
    return (
      <Chip
        label={reasonText || "Pending"}
        size="small"
        icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: 14 }} />}
        sx={{
          bgcolor: BRAND.darkSoft,
          color: BRAND.dark,
          fontWeight: 700,
          border: `1px solid ${BRAND.border}`,
          "& .MuiChip-icon": { color: BRAND.dark },
        }}
      />
    );
  }
  return (
    <Chip
      label={`ACK ERR ${status}`}
      size="small"
      icon={<ErrorOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
      sx={{
        bgcolor: BRAND.alert.errorSoft,
        color: BRAND.alert.error,
        fontWeight: 700,
        border: `1px solid ${BRAND.alert.error}55`,
        "& .MuiChip-icon": { color: BRAND.alert.error },
      }}
    />
  );
}

function renderSourceChip(source) {
  const val = String(source || "").toLowerCase();
  if (val === "device") {
    return (
      <Chip
        label="Device override"
        size="small"
        sx={{
          bgcolor: BRAND.cyanSoft,
          color: BRAND.dark,
          fontWeight: 700,
          border: `1px solid ${BRAND.cyan}88`,
        }}
      />
    );
  }
  if (val === "tenant") {
    return (
      <Chip
        label="Tenant"
        size="small"
        sx={{
          bgcolor: BRAND.tealSoft,
          color: BRAND.tealText,
          fontWeight: 700,
          border: `1px solid ${BRAND.teal}55`,
        }}
      />
    );
  }
  return (
    <Chip
      label={source || "—"}
      size="small"
      sx={{ bgcolor: BRAND.darkSoft, color: BRAND.dark, fontWeight: 700 }}
    />
  );
}

// ── Shared UI pieces ────────────────────────────────────────────────────

function SummaryCard({ title, value, hint, icon, accent = BRAND.teal, tint = BRAND.tealSoft }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        minHeight: 96,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        alignItems: "center",
        gap: 1.75,
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          bgcolor: tint,
          color: accent,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 26, fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {hint ? (
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.25 }}>
            {hint}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
      <Typography
        sx={{
          fontSize: 12,
          color: "text.secondary",
          fontWeight: 600,
          minWidth: 96,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 13,
          color: BRAND.dark,
          fontFamily: mono ? "monospace" : "inherit",
          wordBreak: "break-all",
          flex: 1,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function JsonBlock({ value, maxHeight = 260 }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        bgcolor: BRAND.dark,
        color: "#e2e8f0",
        borderColor: BRAND.dark,
        overflow: "auto",
        maxHeight,
        fontFamily: "monospace",
        fontSize: 12,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {formatJson(value)}
    </Paper>
  );
}

// ── PolicyForm — collection intervals + collapsible advanced JSON.
//
// Plugin enable/disable used to live here as a row of switches. It
// moved to the new Plugin Control page so this surface is now strictly
// about HOW enabled plugins behave, not WHICH plugins are on. The form
// still tracks `form.plugins` internally because the conditional
// schedule panels (Compliance / Patch) check it to decide whether to
// render — that state is populated read-only from the loaded policy by
// `readFormFromPolicy()` and only mutates if the operator drops into
// the advanced JSON editor (power-user mode).

function PolicyForm({ form, onChange, jsonDraft, setJsonDraft, jsonError, setJsonError, readOnly = false }) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const handleJsonChange = (e) => {
    const value = e.target.value;
    setJsonDraft(value);
    try {
      const parsed = JSON.parse(value);
      setJsonError(null);
      onChange(readFormFromPolicy(parsed));
    } catch (err) {
      setJsonError(String(err?.message || err));
    }
  };

  // Build a quick reference list of which plugins are enabled in the
  // currently-loaded policy. We render it as a chip strip at the top of
  // the form so the operator can see at a glance what configuration
  // panels apply ("compliance shows because SCP is on") without having
  // to bounce to Plugin Control to check.
  const enabledPluginsSummary = PLUGIN_DESCRIPTORS.filter(
    (p) => p.required || Boolean(form.plugins?.[p.key])
  );

  return (
    <Box>
      <Box
        sx={{
          mb: 2,
          p: 1.5,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 2,
          bgcolor: BRAND.surfaceMuted,
        }}
      >
        <Typography
          variant="overline"
          sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.2 }}
        >
          Currently enabled plugins
        </Typography>
        <Box sx={{ mt: 0.5, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {enabledPluginsSummary.length === 0 ? (
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              No plugins enabled.
            </Typography>
          ) : (
            enabledPluginsSummary.map((p) => (
              <Chip
                key={p.key}
                label={`${p.label} · ${p.title}`}
                size="small"
                sx={{
                  bgcolor: BRAND.tealSoft,
                  color: BRAND.tealText,
                  fontWeight: 700,
                  border: `1px solid ${BRAND.teal}55`,
                }}
              />
            ))
          )}
        </Box>
        <Typography variant="caption" sx={{ color: BRAND.gray, mt: 0.75, display: "block" }}>
          Toggle plugins on or off in <strong>Plugin Control</strong>. The settings
          below apply to plugins that are currently enabled.
        </Typography>
      </Box>

      {/* Inventory schedule (AMP) — Sprint 1 of Policy v2 surfaces the
          previously-invisible inventory interval. AMP is a required
          plugin, so this card always renders. The agent's AMP collector
          rides the unified `inventory` schedule. */}
      {(() => {
        const rawValue = form?.inventory?.intervalSeconds;
        const displayValue =
          rawValue === null || rawValue === undefined || rawValue === ""
            ? ""
            : String(rawValue);
        const numeric = Number(rawValue);
        const outOfRange =
          rawValue !== null &&
          rawValue !== undefined &&
          rawValue !== "" &&
          (!Number.isFinite(numeric) ||
            numeric < INVENTORY_INTERVAL_MIN ||
            numeric > INVENTORY_INTERVAL_MAX);
        return (
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 2,
              bgcolor: BRAND.surfaceMuted,
            }}
          >
            <Typography
              variant="overline"
              sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.2 }}
            >
              Inventory schedule (AMP)
            </Typography>
            <TextField
              label="Asset collection interval (seconds)"
              type="number"
              size="small"
              fullWidth
              value={displayValue}
              onChange={(e) => {
                const raw = e.target.value;
                const next = raw === "" ? null : Number(raw);
                onChange({
                  ...form,
                  inventory: { ...(form.inventory || {}), intervalSeconds: next },
                });
              }}
              disabled={readOnly}
              inputProps={{
                min: INVENTORY_INTERVAL_MIN,
                max: INVENTORY_INTERVAL_MAX,
                step: 60,
              }}
              error={outOfRange}
              helperText={
                outOfRange
                  ? `Must be between ${INVENTORY_INTERVAL_MIN} and ${INVENTORY_INTERVAL_MAX} seconds`
                  : "Blank = use backend default (6h / 21600s). Range 60–86400."
              }
              sx={{ mt: 1, bgcolor: "#ffffff", borderRadius: 1 }}
            />
          </Box>
        );
      })()}

      {/* Compliance schedule — only surfaces when a plugin that implies
          the compliance module is active (today: SCP). A dedicated card
          below keeps this additive: the day we add more compliance-scoped
          settings (retention, skip-on-battery, etc.) they drop in here
          without restructuring the form. */}
      {(() => {
        const complianceActive = PLUGIN_DESCRIPTORS.some(
          (p) => p.impliesModule === "compliance" && form.plugins[p.key]
        );
        if (!complianceActive) return null;
        const rawValue = form?.compliance?.intervalSeconds;
        // Empty string (not null) so the TextField shows as unset rather
        // than forcing a 0 that would then fail validation.
        const displayValue =
          rawValue === null || rawValue === undefined || rawValue === ""
            ? ""
            : String(rawValue);
        const numeric = Number(rawValue);
        const outOfRange =
          rawValue !== null &&
          rawValue !== undefined &&
          rawValue !== "" &&
          (!Number.isFinite(numeric) ||
            numeric < COMPLIANCE_INTERVAL_MIN ||
            numeric > COMPLIANCE_INTERVAL_MAX);
        return (
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 2,
              bgcolor: BRAND.tealSoft,
            }}
          >
            <Typography
              variant="overline"
              sx={{ color: BRAND.tealText, fontWeight: 800, letterSpacing: 1.2 }}
            >
              Compliance schedule
            </Typography>
            <TextField
              label="Collection interval (seconds)"
              type="number"
              size="small"
              fullWidth
              value={displayValue}
              onChange={(e) => {
                const raw = e.target.value;
                // Empty field → null so formToPolicy omits the compliance
                // block entirely (backend default 8h takes over).
                const next = raw === "" ? null : Number(raw);
                onChange({
                  ...form,
                  compliance: { ...(form.compliance || {}), intervalSeconds: next },
                });
              }}
              disabled={readOnly}
              inputProps={{
                min: COMPLIANCE_INTERVAL_MIN,
                max: COMPLIANCE_INTERVAL_MAX,
                step: 60,
              }}
              error={outOfRange}
              helperText={
                outOfRange
                  ? `Must be between ${COMPLIANCE_INTERVAL_MIN} and ${COMPLIANCE_INTERVAL_MAX} seconds`
                  : "Blank = use backend default (8h / 28800s). Range 300–86400."
              }
              sx={{ mt: 1, bgcolor: "#ffffff", borderRadius: 1 }}
            />
          </Box>
        );
      })()}

      {(() => {
        const patchActive = PLUGIN_DESCRIPTORS.some(
          (p) => p.impliesModule === "patch" && form.plugins[p.key]
        );
        if (!patchActive) return null;
        const rawValue = form?.patch?.intervalSeconds;
        const displayValue =
          rawValue === null || rawValue === undefined || rawValue === ""
            ? ""
            : String(rawValue);
        const numeric = Number(rawValue);
        const outOfRange =
          rawValue !== null &&
          rawValue !== undefined &&
          rawValue !== "" &&
          (!Number.isFinite(numeric) ||
            numeric < PATCH_INTERVAL_MIN ||
            numeric > PATCH_INTERVAL_MAX);
        return (
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 2,
              bgcolor: BRAND.cyanSoft,
            }}
          >
            <Typography
              variant="overline"
              sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.2 }}
            >
              Patch schedule
            </Typography>
            <TextField
              label="Patch scan interval (seconds)"
              type="number"
              size="small"
              fullWidth
              value={displayValue}
              onChange={(e) => {
                const raw = e.target.value;
                const next = raw === "" ? null : Number(raw);
                onChange({
                  ...form,
                  patch: { ...(form.patch || {}), intervalSeconds: next },
                });
              }}
              disabled={readOnly}
              inputProps={{
                min: PATCH_INTERVAL_MIN,
                max: PATCH_INTERVAL_MAX,
                step: 300,
              }}
              error={outOfRange}
              helperText={
                outOfRange
                  ? `Must be between ${PATCH_INTERVAL_MIN} and ${PATCH_INTERVAL_MAX} seconds`
                  : "Blank = use backend default (24h / 86400s). Range 300–604800."
              }
              sx={{ mt: 1, bgcolor: "#ffffff", borderRadius: 1 }}
            />
          </Box>
        );
      })()}

      {/* Update schedule — controls how often the agent probes the
          backend for a newer release. Previously hardcoded to 6h in
          the agent's scheduler.ts; Sprint 1 of Policy v2 made it
          editable. The actual install path is gated separately by
          features.selfUpdate below. */}
      {(() => {
        const rawValue = form?.update?.intervalSeconds;
        const displayValue =
          rawValue === null || rawValue === undefined || rawValue === ""
            ? ""
            : String(rawValue);
        const numeric = Number(rawValue);
        const outOfRange =
          rawValue !== null &&
          rawValue !== undefined &&
          rawValue !== "" &&
          (!Number.isFinite(numeric) ||
            numeric < UPDATE_INTERVAL_MIN ||
            numeric > UPDATE_INTERVAL_MAX);
        return (
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 2,
              bgcolor: BRAND.surfaceMuted,
            }}
          >
            <Typography
              variant="overline"
              sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.2 }}
            >
              Agent update schedule
            </Typography>
            <TextField
              label="Update probe interval (seconds)"
              type="number"
              size="small"
              fullWidth
              value={displayValue}
              onChange={(e) => {
                const raw = e.target.value;
                const next = raw === "" ? null : Number(raw);
                onChange({
                  ...form,
                  update: { ...(form.update || {}), intervalSeconds: next },
                });
              }}
              disabled={readOnly}
              inputProps={{
                min: UPDATE_INTERVAL_MIN,
                max: UPDATE_INTERVAL_MAX,
                step: 300,
              }}
              error={outOfRange}
              helperText={
                outOfRange
                  ? `Must be between ${UPDATE_INTERVAL_MIN} and ${UPDATE_INTERVAL_MAX} seconds`
                  : "Blank = use backend default (6h / 21600s). Set higher to slow down auto-update; disable entirely via Self-update toggle below."
              }
              sx={{ mt: 1, bgcolor: "#ffffff", borderRadius: 1 }}
            />
          </Box>
        );
      })()}

      {/* Feature toggles — Sprint 1 of Policy v2 surfaces selfUpdate and
          a placeholder for remoteShell (gated to the future RCP plugin).
          Previously these only existed in the agent's policy default and
          could only be flipped via the advanced JSON editor. */}
      <Box
        sx={{
          mt: 2,
          p: 1.5,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 2,
          bgcolor: BRAND.surfaceMuted,
        }}
      >
        <Typography
          variant="overline"
          sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.2 }}
        >
          Features
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={form?.features?.selfUpdate !== false}
                onChange={(e) =>
                  onChange({
                    ...form,
                    features: {
                      ...(form.features || {}),
                      selfUpdate: e.target.checked,
                    },
                  })
                }
                disabled={readOnly}
              />
            }
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Self-update
                </Typography>
                <Typography variant="caption" sx={{ color: BRAND.gray }}>
                  When off, the agent's update probe keeps running (to report
                  available versions) but the install path is suppressed. Use
                  to freeze a fleet on a specific agent version while
                  staging a rollout.
                </Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", mx: 0 }}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={Boolean(form?.features?.remoteShell)}
                disabled
              />
            }
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.gray }}>
                  Remote shell <Chip label="coming soon" size="small" sx={{ ml: 0.5, height: 18, fontSize: 10 }} />
                </Typography>
                <Typography variant="caption" sx={{ color: BRAND.gray }}>
                  Will be governed by the Remote Control Plugin (RCP). Toggle
                  not editable until the plugin ships.
                </Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", mx: 0, mt: 0.5 }}
          />
        </Box>
      </Box>

      {/* ── Security Policy section (Sprint 2 of Policy v2) ───────
          Sits below the Agent Policy fields. One card per capability;
          functional ones (firewall, ssh, tls, smb) have working agent
          enforcement, placeholder ones store the desired state but
          enforcement comes in a later release. */}
      <Box
        sx={{
          mt: 4,
          p: 1.5,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 2,
          bgcolor: BRAND.surfaceMuted,
        }}
      >
        <Typography
          variant="overline"
          sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.2 }}
        >
          Security policy
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
          Declarative posture rules. Each capability has a <strong>mode</strong>:
          {" "}<em>Off</em> (skip), <em>Report only</em> (detect drift, never modify), or
          {" "}<em>Auto-remediate</em> (fix drift on the device). Default mode is
          {" "}<em>Report only</em>. Functional capabilities are enforced by the agent
          on every compliance pass; placeholders below are stored but not yet enforced.
        </Typography>

        {SECURITY_CAPABILITIES.map((cap) => {
          const entry = form.security?.capabilities?.[cap.key] || { mode: null, values: {} };
          const onModeChange = (newMode) => {
            onChange({
              ...form,
              security: {
                ...(form.security || {}),
                capabilities: {
                  ...(form.security?.capabilities || {}),
                  [cap.key]: {
                    ...entry,
                    mode: newMode,
                  },
                },
              },
            });
          };
          const onValueChange = (fieldKey, newValue) => {
            const nextValues = { ...(entry.values || {}) };
            if (newValue === null || newValue === undefined || newValue === "") {
              delete nextValues[fieldKey];
            } else {
              nextValues[fieldKey] = newValue;
            }
            onChange({
              ...form,
              security: {
                ...(form.security || {}),
                capabilities: {
                  ...(form.security?.capabilities || {}),
                  [cap.key]: {
                    ...entry,
                    values: nextValues,
                  },
                },
              },
            });
          };

          return (
            <Box
              key={cap.key}
              sx={{
                mt: 1.5,
                p: 1.25,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 1.5,
                bgcolor: "#ffffff",
                opacity: cap.enforcer ? 1 : 0.85,
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark }}>
                      {cap.label}
                    </Typography>
                    {cap.osTags.map((t) => (
                      <Chip key={t} label={t} size="small" sx={{ height: 18, fontSize: 10, bgcolor: BRAND.tealSoft, color: BRAND.tealText }} />
                    ))}
                    {!cap.enforcer && (
                      <Chip
                        label="auto coming soon"
                        size="small"
                        sx={{ height: 18, fontSize: 10, bgcolor: BRAND.surfaceMuted, color: BRAND.gray }}
                      />
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 0.5 }}>
                    {cap.description}
                  </Typography>
                </Box>

                <TextField
                  select
                  size="small"
                  label="Mode"
                  value={entry.mode ?? ""}
                  onChange={(e) => onModeChange(e.target.value || null)}
                  disabled={readOnly}
                  sx={{ minWidth: 150 }}
                  helperText={entry.mode == null ? "Inherits default" : ""}
                >
                  <MenuItem value="">(inherit default)</MenuItem>
                  {SECURITY_MODES.map((m) => (
                    <MenuItem
                      key={m.value}
                      value={m.value}
                      disabled={!cap.enforcer && m.value === "auto"}
                    >
                      {m.label}
                      {!cap.enforcer && m.value === "auto" ? " (coming soon)" : ""}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              {/* Capability-specific fields. Each field renders to a
                  control matching its declared type — boolean → switch,
                  enum → select, number → numeric TextField. */}
              {cap.fields.length > 0 && (
                <Box sx={{ mt: 1.25, display: "flex", flexDirection: "column", gap: 0.75 }}>
                  {cap.fields.map((field) => {
                    const current = entry.values?.[field.key];
                    if (field.type === "boolean") {
                      const checked = typeof current === "boolean" ? current : field.default;
                      return (
                        <FormControlLabel
                          key={field.key}
                          control={
                            <Switch
                              size="small"
                              checked={checked}
                              onChange={(e) => onValueChange(field.key, e.target.checked)}
                              disabled={readOnly}
                            />
                          }
                          label={
                            <Typography variant="body2">
                              {field.label}:{" "}
                              <strong>
                                {checked ? (field.trueLabel || "Yes") : (field.falseLabel || "No")}
                              </strong>
                            </Typography>
                          }
                          sx={{ mx: 0 }}
                        />
                      );
                    }
                    if (field.type === "enum") {
                      const value = current ?? field.default;
                      return (
                        <TextField
                          key={field.key}
                          select
                          size="small"
                          label={field.label}
                          value={value}
                          onChange={(e) => onValueChange(field.key, e.target.value)}
                          disabled={readOnly}
                          sx={{ maxWidth: 320 }}
                        >
                          {field.options.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      );
                    }
                    if (field.type === "number") {
                      const value =
                        current === undefined || current === null ? "" : String(current);
                      return (
                        <TextField
                          key={field.key}
                          type="number"
                          size="small"
                          label={field.label}
                          value={value}
                          onChange={(e) => {
                            const raw = e.target.value;
                            onValueChange(field.key, raw === "" ? null : Number(raw));
                          }}
                          disabled={readOnly}
                          inputProps={{ min: field.min, max: field.max }}
                          sx={{ maxWidth: 320 }}
                        />
                      );
                    }
                    return null;
                  })}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box sx={{ mt: 2 }}>
        <Button
          size="small"
          onClick={() => setAdvancedOpen((v) => !v)}
          startIcon={<CodeOutlinedIcon />}
          endIcon={advancedOpen ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />}
          sx={{ textTransform: "none", color: BRAND.dark, fontWeight: 600 }}
        >
          {advancedOpen ? "Hide JSON editor" : "Advanced: edit raw JSON"}
        </Button>
        <Collapse in={advancedOpen} unmountOnExit>
          <TextField
            multiline
            minRows={10}
            fullWidth
            value={jsonDraft}
            onChange={handleJsonChange}
            disabled={readOnly}
            error={Boolean(jsonError)}
            helperText={jsonError || "Preserves unknown keys. Saved value replaces the policy on the server."}
            sx={{
              mt: 1,
              "& .MuiInputBase-root": {
                fontFamily: "monospace",
                fontSize: 12.5,
                bgcolor: "#ffffff",
              },
            }}
          />
        </Collapse>
      </Box>
    </Box>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export default function Policies() {
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();
  const confirm = useConfirm();

  const tenantId = auth?.tenantId;
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [tab, setTab] = React.useState("tenant");

  // Shared
  const [devices, setDevices] = React.useState([]); // [{deviceId, hostname, connected, agentVersion}]
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });

  // Tenant state
  const [tenantPolicy, setTenantPolicy] = React.useState(null);
  const [tenantForm, setTenantForm] = React.useState(readFormFromPolicy({}));
  const [tenantJsonDraft, setTenantJsonDraft] = React.useState("{}");
  const [tenantJsonError, setTenantJsonError] = React.useState(null);
  const [tenantStatus, setTenantStatus] = React.useState([]);
  const [tenantLoading, setTenantLoading] = React.useState(true);
  const [tenantSaving, setTenantSaving] = React.useState(false);
  const [tenantPushing, setTenantPushing] = React.useState(false);
  // Plugin coverage real-state — distinto de policy ack: lee de
  // agent_payload->agent->capabilities (último facts publish del agent),
  // representando el runtime efectivo no la promesa contractual del ack.
  // Operadores necesitan esto en la página Policies para distinguir
  // "device confirmó la policy" vs "plugin realmente corriendo".
  const [pluginCoverageResult, setPluginCoverageResult] = React.useState(null);

  // Device state
  const [selectedDeviceId, setSelectedDeviceId] = React.useState("");
  const [devicePolicy, setDevicePolicy] = React.useState(null); // raw override or null
  const [deviceForm, setDeviceForm] = React.useState(readFormFromPolicy({}));
  const [deviceJsonDraft, setDeviceJsonDraft] = React.useState("{}");
  const [deviceJsonError, setDeviceJsonError] = React.useState(null);
  const [effective, setEffective] = React.useState(null);
  const [deviceStatus, setDeviceStatus] = React.useState(null);
  const [deviceLoading, setDeviceLoading] = React.useState(false);
  const [deviceSaving, setDeviceSaving] = React.useState(false);
  const [devicePushing, setDevicePushing] = React.useState(false);
  const [deviceDeleting, setDeviceDeleting] = React.useState(false);

  const showSnack = React.useCallback((message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  // ── Load tenant policy + status + device list ──────────────────────────
  const loadTenant = React.useCallback(async () => {
    if (!canManage || !tenantId) return;
    try {
      setTenantLoading(true);
      // Plugin coverage usa allSettled porque PluginCoverageStrip lee
      // `result.status === "fulfilled"` y `result.value` — formato
      // estándar de Promise.allSettled. Se carga en paralelo con el
      // resto (no bloquea la página si está lento o falla).
      const [policyRes, statusRes, devicesRes, coverageSettled] = await Promise.all([
        getTenantPolicy(tenantId).catch(() => null),
        listTenantPolicyStatus(tenantId).catch(() => ({ items: [] })),
        listKnownDevices().catch(() => ({ items: [] })),
        Promise.allSettled([getPluginCoverageSummary()]).then((arr) => arr[0]),
      ]);
      setPluginCoverageResult(coverageSettled);

      // Normalize the response envelope once and feed the form+JSON
      // editor from the extracted policy content. Without this the form
      // was reading `.plugins` off the DB row (which has no such key)
      // and all plugin toggles rendered as off.
      const tenantEnv = extractPolicyEnvelope(policyRes);
      const policy = tenantEnv.raw ?? {};
      setTenantPolicy(policyRes ?? null);
      setTenantForm(readFormFromPolicy(policy));
      setTenantJsonDraft(formatJson(policy));
      setTenantJsonError(null);

      const statusItems = Array.isArray(statusRes?.items) ? statusRes.items : [];
      setTenantStatus(statusItems);

      const deviceItems = Array.isArray(devicesRes?.items) ? devicesRes.items : [];
      const normalized = deviceItems
        .map((d) => ({
          deviceId: String(d?.deviceId || "").trim(),
          hostname: String(d?.hostname || "").trim() || String(d?.deviceId || "").trim(),
          connected: d?.connected === true,
          agentVersion: d?.agentVersion ?? null,
        }))
        .filter((d) => d.deviceId);
      setDevices(normalized);
      setSelectedDeviceId((current) => {
        if (current && normalized.some((d) => d.deviceId === current)) return current;
        return normalized[0]?.deviceId || "";
      });
    } catch (e) {
      console.error(e);
      showSnack("Failed to load tenant policy", "error");
    } finally {
      setTenantLoading(false);
    }
  }, [canManage, tenantId, showSnack]);

  // ── Load device override + effective + status ──────────────────────────
  const loadDevice = React.useCallback(async (deviceId) => {
    if (!canManage || !deviceId) {
      setDevicePolicy(null);
      setEffective(null);
      setDeviceStatus(null);
      return;
    }
    try {
      setDeviceLoading(true);
      const [overrideRes, effectiveRes, statusRes] = await Promise.all([
        getDevicePolicy(deviceId).catch(() => null),
        getEffectivePolicy(deviceId).catch(() => null),
        getDevicePolicyStatus(deviceId).catch(() => null),
      ]);

      // See extractPolicyEnvelope for why we normalize: backend returns
      // `{ ok, policy: { policy_version, policy_hash, policy_json } }`
      // and directly passing that to readFormFromPolicy left the form
      // empty. The helper produces a `.raw` that is always the policy
      // content (modules/plugins/compliance) or null if no override.
      const overrideEnv = extractPolicyEnvelope(overrideRes);
      const overridePolicy = overrideEnv.raw;
      setDevicePolicy(overrideRes ?? null);
      setDeviceForm(readFormFromPolicy(overridePolicy || {}));
      setDeviceJsonDraft(formatJson(overridePolicy || {}));
      setDeviceJsonError(null);
      // Effective policy is wrapped as `{ ok, policy: {source, policyJson, ...} }`.
      // Unwrap to the inner object so downstream code can read
      // `effective.source`, `effective.policyJson`, `effective.policyVersion`
      // directly without worrying about the envelope.
      setEffective(effectiveRes?.policy ?? effectiveRes ?? null);
      // Same dance for status: `{ ok, status: {...} }`. Without this
      // unwrap `deviceStatus.last_ack_status` was always undefined and
      // the Sync panel chip stayed stuck on "Pending" regardless of
      // what the DB actually had.
      setDeviceStatus(statusRes?.status ?? statusRes ?? null);
    } catch (e) {
      console.error(e);
      showSnack("Failed to load device policy", "error");
    } finally {
      setDeviceLoading(false);
    }
  }, [canManage, showSnack]);

  React.useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  React.useEffect(() => {
    loadDevice(selectedDeviceId);
  }, [selectedDeviceId, loadDevice]);

  const refreshAll = React.useCallback(() => {
    loadTenant();
    if (selectedDeviceId) loadDevice(selectedDeviceId);
  }, [loadTenant, loadDevice, selectedDeviceId]);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refreshAll, "policiesAutoRefresh");

  // ── Actions ────────────────────────────────────────────────────────────
  const handleSaveTenant = async () => {
    if (!canManage || !tenantId) return;
    if (tenantJsonError) {
      showSnack("Fix JSON errors before saving", "error");
      return;
    }
    try {
      setTenantSaving(true);
      const policy = formToPolicy(tenantForm);
      // Opt-locking: send the version we loaded the policy at as
      // If-Match. If Plugin Control (or another operator) wrote in the
      // meantime, backend returns 409 and we surface a non-blocking
      // notice + reload so the user can re-apply on top of fresh state.
      const expectedVersion = extractPolicyEnvelope(tenantPolicy).version;
      await saveTenantPolicy(tenantId, policy, { expectedVersion });
      showSnack("Tenant policy saved", "success");
      await loadTenant();
    } catch (e) {
      if (e?.status === 409) {
        console.warn("[policies] tenant save rejected: stale policy", e?.body);
        showSnack(
          "Policy was modified by someone else. Reloaded — review your changes and save again.",
          "warning"
        );
        await loadTenant();
      } else {
        console.error(e);
        showSnack("Failed to save tenant policy", "error");
      }
    } finally {
      setTenantSaving(false);
    }
  };

  const handlePushTenant = async () => {
    if (!canManage || !tenantId) return;
    const ok = await confirm({
      title: "Push tenant policy?",
      body:
        "This will broadcast the current tenant policy to every device.\n\n" +
        "Any pre-existing device-level overrides will be reset — devices with " +
        "custom policies will receive the tenant policy instead.",
      confirmText: "Push to all devices",
      danger: true,
    });
    if (!ok) return;
    try {
      setTenantPushing(true);
      const res = await pushTenantPolicy(tenantId);
      // Backend retorna: { targeted, connected, sent, failed, clearedOverrides }
      // Mostramos los counters útiles para el operador. El número de
      // devices entregados de inmediato (`sent`) puede ser menor que
      // `targeted` cuando hay devices conectados a una instancia gRPC
      // distinta de la REST que recibió el push — esos los cosecha la
      // heartbeat reconciliation en sus próximos heartbeats.
      const targeted = res?.targeted ?? 0;
      const sent = res?.sent ?? 0;
      const cleared = res?.clearedOverrides ?? 0;
      const parts = [`${targeted} targeted`, `${sent} delivered immediately`];
      if (cleared > 0) {
        parts.push(`${cleared} device override${cleared === 1 ? "" : "s"} reset`);
      }
      showSnack(`Tenant policy push: ${parts.join(" · ")}`, "success");
      await loadTenant();
    } catch (e) {
      console.error(e);
      showSnack("Failed to push tenant policy", "error");
    } finally {
      setTenantPushing(false);
    }
  };

  const handleSaveDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    if (deviceJsonError) {
      showSnack("Fix JSON errors before saving", "error");
      return;
    }
    try {
      setDeviceSaving(true);
      const policy = formToPolicy(deviceForm);
      // Same opt-locking rationale as tenant save above. `devicePolicy`
      // can be null when there's no override yet — extractPolicyEnvelope
      // returns version=null in that case, which becomes "no If-Match
      // header sent" (legacy last-writer-wins for first writes).
      const expectedVersion = extractPolicyEnvelope(devicePolicy).version;
      await saveDevicePolicy(selectedDeviceId, policy, { expectedVersion });
      showSnack("Device override saved", "success");
      await loadDevice(selectedDeviceId);
    } catch (e) {
      if (e?.status === 409) {
        console.warn("[policies] device save rejected: stale policy", e?.body);
        showSnack(
          "Device override was modified by someone else. Reloaded — review your changes and save again.",
          "warning"
        );
        await loadDevice(selectedDeviceId);
      } else {
        console.error(e);
        showSnack("Failed to save device override", "error");
      }
    } finally {
      setDeviceSaving(false);
    }
  };

  // Ref that always reflects the currently-selected device id. Used by
  // the post-push poll to detect when the user has navigated to a
  // different device mid-poll — in that case we simply stop updating
  // state so the new device's panel isn't contaminated with stale data
  // from the one we were polling.
  const selectedDeviceIdRef = React.useRef(selectedDeviceId);
  React.useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  const [devicePolling, setDevicePolling] = React.useState(false);

  /**
   * Poll the device's policy-status endpoint every 3s for up to 30s,
   * stopping as soon as `last_ack_at` advances past the timestamp we
   * captured before the push. This replaces the old "one-shot refresh"
   * behavior that left the Sync panel showing a stale ACK whenever the
   * agent took more than a second to process the policy.
   *
   * Fire-and-forget: callers don't await; the UI re-renders on each
   * setDeviceStatus update. If the user switches to another device
   * before the poll finishes we abandon silently.
   */
  const pollForDeviceAck = React.useCallback(
    async (deviceId, priorAckAt) => {
      const started = Date.now();
      const MAX_MS = 30_000;
      const POLL_MS = 3_000;
      setDevicePolling(true);
      try {
        while (Date.now() - started < MAX_MS) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          // User navigated away — don't touch state for a device that
          // isn't on screen anymore.
          if (selectedDeviceIdRef.current !== deviceId) return;

          const res = await getDevicePolicyStatus(deviceId).catch(() => null);
          // And check again — a slow request could have straddled a
          // device switch.
          if (selectedDeviceIdRef.current !== deviceId) return;

          if (res) {
            setDeviceStatus(res);
            const nextAckAt = res?.last_ack_at ?? null;
            if (nextAckAt && nextAckAt !== priorAckAt) {
              if (res.last_ack_status === 0) {
                showSnack("Agent acknowledged policy (ACK OK)", "success");
              } else {
                showSnack(
                  `Agent rejected policy (ACK ${res.last_ack_status}${
                    res.last_ack_message ? ": " + res.last_ack_message : ""
                  })`,
                  "warning"
                );
              }
              return;
            }
          }
        }
        // Timed out. Don't swallow — surface so the operator knows the
        // agent hasn't reported back. Common causes: device offline,
        // gRPC bridge down on the agent, or the agent is mid-restart.
        if (selectedDeviceIdRef.current === deviceId) {
          showSnack(
            "No ACK from agent in 30s — device may be offline or disconnected from gRPC",
            "warning"
          );
        }
      } finally {
        setDevicePolling(false);
      }
    },
    [showSnack]
  );

  const handlePushDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    // Snapshot the current ACK timestamp before we push. The poll uses
    // this as the "prior" baseline so it can tell a fresh ACK apart
    // from the previous one still displayed on screen.
    const priorAckAt = deviceStatus?.last_ack_at ?? null;
    try {
      setDevicePushing(true);
      await pushDevicePolicy(selectedDeviceId);
      showSnack("Policy dispatched to device", "success");
      await loadDevice(selectedDeviceId);
      // Fire-and-forget. The push button releases immediately; the poll
      // runs in the background and updates the Sync panel as it gets
      // fresh status payloads.
      pollForDeviceAck(selectedDeviceId, priorAckAt);
    } catch (e) {
      console.error(e);
      showSnack("Failed to push device policy", "error");
    } finally {
      setDevicePushing(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    const ok = await confirm({
      title: "Remove device override?",
      body: "The device will fall back to the tenant-level policy on its next sync.",
      confirmText: "Remove override",
      danger: true,
    });
    if (!ok) return;
    try {
      setDeviceDeleting(true);
      await deleteDevicePolicy(selectedDeviceId);
      showSnack("Device override removed", "success");
      await loadDevice(selectedDeviceId);
    } catch (e) {
      console.error(e);
      showSnack("Failed to remove device override", "error");
    } finally {
      setDeviceDeleting(false);
    }
  };

  const handleSwitchToDevice = (deviceId) => {
    setSelectedDeviceId(deviceId);
    setTab("device");
  };

  // ── Derived summary ────────────────────────────────────────────────────
  const deviceMap = React.useMemo(
    () => new Map(devices.map((d) => [d.deviceId, d])),
    [devices]
  );

  const summary = React.useMemo(() => {
    const total = tenantStatus.length;
    const acked = tenantStatus.filter((s) => s.last_ack_status === 0).length;
    const pending = tenantStatus.filter(
      (s) => s.last_ack_status == null && s.last_sent_policy_version
    ).length;
    const errors = tenantStatus.filter(
      (s) => s.last_ack_status != null && s.last_ack_status !== 0
    ).length;
    return { total, acked, pending, errors };
  }, [tenantStatus]);

  // Unified envelope extraction — the backend wraps DB rows as
  // `{ ok, policy: { policy_version, policy_hash, policy_json, updated_at } }`
  // and we want the UI to read version/hash/updatedAt regardless of
  // which shape layer we landed in.
  const tenantEnv = extractPolicyEnvelope(tenantPolicy);
  const tenantVersion = tenantEnv.version ?? "—";
  const tenantHash = tenantEnv.hash;
  const tenantUpdatedAt = tenantEnv.updatedAt;

  const deviceEnv = extractPolicyEnvelope(devicePolicy);
  const deviceVersion = deviceEnv.version;
  const deviceHash = deviceEnv.hash;
  const deviceUpdatedAt = deviceEnv.updatedAt;

  // Effective policy comes from /devices/:id/effective-policy which
  // does its own shape dance; we pick policy_json → policyJson → policy
  // (last one is a legacy API that nested the content one level).
  const effectivePolicyJson =
    effective?.policy_json ?? effective?.policyJson ?? effective?.policy ?? {};
  const effectiveSource = effective?.source;
  const effectiveVersion = effective?.policy_version ?? effective?.policyVersion;

  // hasOverride is a pure "is there anything saved?" binary. Use the
  // extracted content (what the user actually authored) — not the row
  // wrapper, which always has policy_* columns even when empty.
  const hasOverride = !isEmptyPolicy(deviceEnv.raw);

  // ── Rollout table columns ──────────────────────────────────────────────
  //
  // Liveness columns (Online + Last seen) van junto al Device para que
  // el operador interprete el ack a la derecha en su contexto correcto:
  //   * online + ack reciente  → policy aplicada y viva (alta confianza)
  //   * online + ack viejo     → policy estable, no requiere re-ack
  //   * offline + ack reciente → aplicada antes de offline (media)
  //   * offline + ack antiguo  → estado real desconocido (baja)
  // Sin estas columnas, un ack OK podía interpretarse erróneamente como
  // "device aplicó y sigue corriendo el plugin", aunque el device esté
  // offline desde hace días o nunca recibió un policy_applied real.
  const statusColumns = [
    {
      field: "device_id",
      headerName: "Device",
      minWidth: 200,
      flex: 1,
      valueGetter: (_v, row) => deviceMap.get(row.device_id)?.hostname || row.device_id,
    },
    {
      field: "is_connected",
      headerName: "Online",
      minWidth: 75,
      flex: 0.25,
      sortable: true,
      renderCell: (params) => {
        const online = params.row?.is_connected === true;
        const lastSeen = params.row?.last_heartbeat;
        // Tooltip enriquecido con last seen para evitar dos hovers
        // separados — el operador ve el dot y al pasar el mouse
        // entiende exactamente qué tan reciente es esa señal.
        const tooltip = online
          ? lastSeen
            ? `Online · last heartbeat ${formatRelativeTime(lastSeen)}`
            : "Online — active session"
          : lastSeen
            ? `Offline · last seen ${formatRelativeTime(lastSeen)}`
            : "Offline · never seen";
        return <OnlineDot online={online} title={tooltip} />;
      },
    },
    {
      field: "last_heartbeat",
      headerName: "Last seen",
      minWidth: 110,
      flex: 0.4,
      // Render relative para scan-rapido, tooltip absoluto para
      // precision cuando el operador necesita correlacionar con logs.
      renderCell: (params) => {
        const value = params.value;
        if (!value) return <Typography variant="caption" sx={{ color: "text.secondary" }}>Never</Typography>;
        return (
          <Tooltip title={formatDate(value)} arrow>
            <Typography variant="caption">{formatRelativeTime(value)}</Typography>
          </Tooltip>
        );
      },
    },
    {
      field: "desired_policy_source",
      headerName: "Source",
      minWidth: 140,
      flex: 0.5,
      renderCell: (params) => renderSourceChip(params.value),
    },
    {
      field: "desired_policy_version",
      headerName: "Desired",
      minWidth: 110,
      flex: 0.4,
      valueGetter: (_v, row) => row.desired_policy_version || "—",
    },
    {
      field: "last_sent_policy_version",
      headerName: "Sent",
      minWidth: 110,
      flex: 0.4,
      valueGetter: (_v, row) => row.last_sent_policy_version || "—",
    },
    {
      field: "last_ack_status",
      headerName: "ACK",
      minWidth: 130,
      flex: 0.5,
      renderCell: (params) => renderAckChip(params.row.last_ack_status, null),
    },
    {
      field: "last_ack_at",
      headerName: "ACK At",
      minWidth: 140,
      flex: 0.5,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "last_ack_message",
      headerName: "Message",
      minWidth: 220,
      flex: 1,
      valueGetter: (_v, row) => row.last_ack_message || "—",
    },
  ];

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      // En móvil priorizamos: Device + Online + ACK status. Ocultamos
      // detalles que requieren precisión (versions, timestamps,
      // mensajes) — el operador puede tap en una row para ver el
      // device override panel con el detalle completo.
      return {
        last_ack_at: false,
        last_ack_message: false,
        desired_policy_version: false,
        last_heartbeat: false,
        last_sent_policy_version: false,
      };
    }
    return {};
  }, [isSmDown]);

  if (!canManage) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          Policy management is restricted to active tenant admins and owners.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      {/* Header */}
      <PageHeader
        title="Policies"
        subtitle="Configure plugin behavior — collection intervals and runtime flags. Enable plugins themselves under Plugin Control."
        icon={<PolicyOutlinedIcon />}
        actions={
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={setRefreshSeconds}
            onRefresh={refreshAll}
            loading={tenantLoading}
          />
        }
      />

      {/* Summary cards — intentionally complementary, not mutually
          exclusive: a device can show up in both `Devices tracked` and
          `ACK OK`. Tracked is total; the other three are a breakdown
          of that total by last-ACK state. Hints below each value
          spell this out so the numbers don't look double-counted. */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="Devices tracked"
              value={summary.total}
              hint="total with policy rollout state"
              icon={<AssignmentOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.darkSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="ACK OK"
              value={summary.acked}
              hint={
                summary.total > 0
                  ? `${summary.acked} / ${summary.total} applied`
                  : "no rollouts yet"
              }
              icon={<CheckCircleOutlineOutlinedIcon />}
              accent={BRAND.tealText}
              tint={BRAND.tealSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="Pending ACK"
              value={summary.pending}
              hint="sent, awaiting agent reply"
              icon={<HourglassEmptyOutlinedIcon />}
              accent="#8b5418"
              tint="rgba(199,121,43,0.14)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="ACK errors"
              value={summary.errors}
              hint="agent rejected or failed to apply"
              icon={<ErrorOutlineOutlinedIcon />}
              accent={BRAND.alert.error}
              tint={BRAND.alert.errorSoft}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Tabs */}
      <SectionPaper
        variant="panel"
        sx={{ p: 0, overflow: "hidden", mb: 2 }}
      >
        <Tabs
          value={tab}
          onChange={(_e, next) => setTab(next)}
          sx={{
            borderBottom: `1px solid ${BRAND.border}`,
            bgcolor: BRAND.darkSoft,
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 700,
              color: BRAND.dark,
              minHeight: 48,
              outline: "none",
              "&:focus, &:focus-visible": {
                outline: "none",
                boxShadow: "none",
              },
              "&.Mui-focusVisible": {
                backgroundColor: BRAND.cyanSoft,
              },
            },
            "& .Mui-selected": { color: `${BRAND.teal} !important` },
            "& .MuiTabs-indicator": { backgroundColor: BRAND.teal, height: 3 },
          }}
        >
          <Tab value="tenant" label="Tenant Policy" icon={<TuneOutlinedIcon />} iconPosition="start" sx={{ gap: 0.75 }} />
          <Tab value="device" label="Device Overrides" icon={<AccountTreeOutlinedIcon />} iconPosition="start" sx={{ gap: 0.75 }} />
        </Tabs>

        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {tab === "tenant" ? (
            <TenantTab
              tenantForm={tenantForm}
              setTenantForm={setTenantForm}
              tenantJsonDraft={tenantJsonDraft}
              setTenantJsonDraft={setTenantJsonDraft}
              tenantJsonError={tenantJsonError}
              setTenantJsonError={setTenantJsonError}
              tenantVersion={tenantVersion}
              tenantHash={tenantHash}
              tenantUpdatedAt={tenantUpdatedAt}
              tenantSaving={tenantSaving}
              tenantPushing={tenantPushing}
              onSave={handleSaveTenant}
              onPush={handlePushTenant}
              tenantStatus={tenantStatus}
              statusColumns={statusColumns}
              columnVisibilityModel={columnVisibilityModel}
              onRowClick={(row) => handleSwitchToDevice(row.device_id)}
              loading={tenantLoading}
              pluginCoverageResult={pluginCoverageResult}
            />
          ) : (
            <DeviceTab
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              setSelectedDeviceId={setSelectedDeviceId}
              deviceMap={deviceMap}
              hasOverride={hasOverride}
              deviceForm={deviceForm}
              setDeviceForm={setDeviceForm}
              deviceJsonDraft={deviceJsonDraft}
              setDeviceJsonDraft={setDeviceJsonDraft}
              deviceJsonError={deviceJsonError}
              setDeviceJsonError={setDeviceJsonError}
              deviceVersion={deviceVersion}
              deviceHash={deviceHash}
              deviceUpdatedAt={deviceUpdatedAt}
              effectivePolicyJson={effectivePolicyJson}
              effectiveSource={effectiveSource}
              effectiveVersion={effectiveVersion}
              deviceStatus={deviceStatus}
              deviceSaving={deviceSaving}
              devicePushing={devicePushing}
              devicePolling={devicePolling}
              deviceDeleting={deviceDeleting}
              loading={deviceLoading}
              onSave={handleSaveDevice}
              onPush={handlePushDevice}
              onDelete={handleDeleteDevice}
            />
          )}
        </Box>
      </SectionPaper>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}

// ── Tenant tab ──────────────────────────────────────────────────────────

function TenantTab(props) {
  const {
    tenantForm, setTenantForm,
    tenantJsonDraft, setTenantJsonDraft,
    tenantJsonError, setTenantJsonError,
    tenantVersion, tenantHash, tenantUpdatedAt,
    tenantSaving, tenantPushing, onSave, onPush,
    tenantStatus, statusColumns, columnVisibilityModel, onRowClick,
    loading,
    pluginCoverageResult,
  } = props;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 5 }}>
        <SectionPaper
          variant="panel"
          sx={{ minWidth: 0 }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
              Tenant policy
            </Typography>
          </Box>

          <Box sx={{ display: "grid", gap: 0.5, mb: 2 }}>
            <DetailRow label="Version" value={tenantVersion} mono />
            <DetailRow label="Hash" value={shortHash(tenantHash)} mono />
            <DetailRow label="Updated" value={formatDate(tenantUpdatedAt)} />
          </Box>

          <Divider sx={{ borderColor: BRAND.border, mb: 2 }} />

          <PolicyForm
            form={tenantForm}
            onChange={setTenantForm}
            jsonDraft={tenantJsonDraft}
            setJsonDraft={setTenantJsonDraft}
            jsonError={tenantJsonError}
            setJsonError={setTenantJsonError}
          />

          <Box sx={{ mt: 2.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              startIcon={<SaveOutlinedIcon />}
              onClick={onSave}
              disabled={tenantSaving || Boolean(tenantJsonError)}
              sx={{
                bgcolor: BRAND.teal,
                color: "#fff",
                fontWeight: 700,
                textTransform: "none",
                "&:hover": { bgcolor: BRAND.tealHover },
              }}
            >
              {tenantSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<SendOutlinedIcon />}
              onClick={onPush}
              disabled={tenantPushing}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderColor: BRAND.teal,
                color: BRAND.teal,
                "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
              }}
            >
              {tenantPushing ? "Pushing…" : "Push to all"}
            </Button>
          </Box>
        </SectionPaper>
      </Grid>

      <Grid size={{ xs: 12, lg: 7 }}>
        {/*
          Plugin coverage real — qué plugins están EFECTIVAMENTE corriendo
          en runtime según el último facts publish de cada agent. Distinto
          de "ack OK" en la tabla de Rollout status abajo: el ack confirma
          que el agent recibió y procesó la policy en su momento, pero un
          ack viejo en un device offline o un runtime desincronizado
          (bug de la saga PMP) no garantiza que el plugin esté activo
          ahora. Esta strip lo refleja desde agent.capabilities.
        */}
        <Box sx={{ mb: 2 }}>
          <PluginCoverageStrip result={pluginCoverageResult} loading={loading} />
        </Box>

        <SectionPaper
          variant="panel"
          sx={{ minWidth: 0, overflow: "hidden" }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5, flexWrap: "wrap", gap: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
              Rollout status
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {tenantStatus.length} devices tracked · click a row to edit override
            </Typography>
          </Box>

          <Box sx={{ width: "100%", overflowX: "auto" }}>
            <DataGrid
              autoHeight
              disableRowSelectionOnClick
              rows={tenantStatus}
              columns={statusColumns}
              loading={loading}
              getRowId={(row) => row.device_id}
              onRowClick={(params) => onRowClick?.(params.row)}
              columnVisibilityModel={columnVisibilityModel}
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
              sx={DATAGRID_SX}
            />
          </Box>
        </SectionPaper>
      </Grid>
    </Grid>
  );
}

// ── Device tab ──────────────────────────────────────────────────────────

function DeviceTab(props) {
  const {
    devices, selectedDeviceId, setSelectedDeviceId, deviceMap,
    hasOverride,
    deviceForm, setDeviceForm,
    deviceJsonDraft, setDeviceJsonDraft,
    deviceJsonError, setDeviceJsonError,
    deviceVersion, deviceHash, deviceUpdatedAt,
    effectivePolicyJson, effectiveSource, effectiveVersion,
    deviceStatus,
    deviceSaving, devicePushing, devicePolling, deviceDeleting, loading,
    onSave, onPush, onDelete,
  } = props;

  const selectedDevice = selectedDeviceId ? deviceMap.get(selectedDeviceId) : null;

  return (
    <Box>
      {/* Device selector */}
      <Box sx={{ mb: 2 }}>
        <TextField
          select
          label="Device"
          size="small"
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
          fullWidth
          helperText={
            selectedDevice
              ? `${selectedDevice.connected ? "Connected" : "Offline"} · agent ${selectedDevice.agentVersion || "unknown"}`
              : `${devices.length} devices known`
          }
        >
          {devices.length === 0 ? (
            <MenuItem value="">No devices available</MenuItem>
          ) : (
            devices.map((d) => (
              <MenuItem key={d.deviceId} value={d.deviceId}>
                {d.hostname}
                {d.hostname !== d.deviceId ? ` · ${d.deviceId}` : ""}
                {d.connected ? " · online" : " · offline"}
              </MenuItem>
            ))
          )}
        </TextField>
      </Box>

      {!selectedDeviceId ? (
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            borderRadius: 2,
            borderColor: BRAND.border,
            borderStyle: "dashed",
            bgcolor: BRAND.darkSoft,
            textAlign: "center",
            color: "text.secondary",
          }}
        >
          <InfoOutlinedIcon sx={{ fontSize: 32, color: BRAND.gray, mb: 1 }} />
          <Typography variant="body2">Select a device to inspect and edit its override.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {/* Override editor */}
          <Grid size={{ xs: 12, lg: 6 }}>
            <SectionPaper
              variant="panel"
              sx={{ minWidth: 0 }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
                  Device override
                </Typography>
                {hasOverride ? (
                  <Chip
                    label="Override active"
                    size="small"
                    sx={{
                      bgcolor: BRAND.cyanSoft,
                      color: BRAND.dark,
                      fontWeight: 700,
                      border: `1px solid ${BRAND.cyan}88`,
                    }}
                  />
                ) : (
                  <Chip
                    label="No override"
                    size="small"
                    sx={{
                      bgcolor: BRAND.darkSoft,
                      color: BRAND.dark,
                      fontWeight: 700,
                      border: `1px solid ${BRAND.border}`,
                    }}
                  />
                )}
              </Box>

              <Box sx={{ display: "grid", gap: 0.5, mb: 2 }}>
                <DetailRow label="Version" value={deviceVersion || "—"} mono />
                <DetailRow label="Hash" value={shortHash(deviceHash)} mono />
                <DetailRow label="Updated" value={formatDate(deviceUpdatedAt)} />
              </Box>

              <Divider sx={{ borderColor: BRAND.border, mb: 2 }} />

              <PolicyForm
                form={deviceForm}
                onChange={setDeviceForm}
                jsonDraft={deviceJsonDraft}
                setJsonDraft={setDeviceJsonDraft}
                jsonError={deviceJsonError}
                setJsonError={setDeviceJsonError}
              />

              <Box sx={{ mt: 2.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  startIcon={<SaveOutlinedIcon />}
                  onClick={onSave}
                  disabled={deviceSaving || Boolean(deviceJsonError) || loading}
                  sx={{
                    bgcolor: BRAND.teal,
                    color: "#fff",
                    fontWeight: 700,
                    textTransform: "none",
                    "&:hover": { bgcolor: BRAND.tealHover },
                  }}
                >
                  {deviceSaving ? "Saving…" : hasOverride ? "Update override" : "Create override"}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SendOutlinedIcon />}
                  onClick={onPush}
                  disabled={devicePushing || loading}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    borderColor: BRAND.teal,
                    color: BRAND.teal,
                    "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
                  }}
                >
                  {devicePushing ? "Pushing…" : "Push"}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineOutlinedIcon />}
                  onClick={onDelete}
                  disabled={deviceDeleting || !hasOverride || loading}
                  sx={{ textTransform: "none", fontWeight: 700 }}
                >
                  {deviceDeleting ? "Removing…" : "Remove override"}
                </Button>
              </Box>
            </SectionPaper>
          </Grid>

          {/* Effective + status */}
          <Grid size={{ xs: 12, lg: 6 }}>
            <SectionPaper
              variant="panel"
              sx={{ minWidth: 0, mb: 2 }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
                  Effective policy
                </Typography>
                {renderSourceChip(effectiveSource)}
              </Box>
              <Box sx={{ display: "grid", gap: 0.5, mb: 1 }}>
                <DetailRow label="Version" value={effectiveVersion || "—"} mono />
              </Box>
              <JsonBlock value={effectivePolicyJson} maxHeight={220} />
            </SectionPaper>

            <SectionPaper
              variant="panel"
              sx={{ minWidth: 0 }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
                  Sync status
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {/* Lightweight live indicator while the post-push poll
                      runs. Fades in for up to 30 s; once ACK arrives or
                      the window elapses, the chip shows the real result. */}
                  {devicePolling && (
                    <Chip
                      label="Waiting for ACK…"
                      size="small"
                      icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: 14 }} />}
                      sx={{
                        bgcolor: BRAND.cyanSoft,
                        color: BRAND.tealText,
                        fontWeight: 700,
                        border: `1px solid ${BRAND.teal}55`,
                        animation: "pulse 1.5s ease-in-out infinite",
                        "@keyframes pulse": {
                          "0%, 100%": { opacity: 1 },
                          "50%": { opacity: 0.5 },
                        },
                        "& .MuiChip-icon": { color: BRAND.tealText },
                      }}
                    />
                  )}
                  {deviceStatus ? renderAckChip(deviceStatus.last_ack_status, null) : null}
                </Box>
              </Box>
              {deviceStatus ? (
                <Box sx={{ display: "grid", gap: 0.5 }}>
                  <DetailRow label="Desired" value={deviceStatus.desired_policy_version || "—"} mono />
                  <DetailRow label="Source" value={deviceStatus.desired_policy_source || "—"} />
                  <DetailRow label="Last sent" value={deviceStatus.last_sent_policy_version || "—"} mono />
                  <DetailRow label="Sent at" value={formatDate(deviceStatus.last_sent_at)} />
                  <DetailRow label="ACK version" value={deviceStatus.last_ack_policy_version || "—"} mono />
                  <DetailRow label="ACK at" value={formatDate(deviceStatus.last_ack_at)} />
                  <DetailRow label="Message" value={deviceStatus.last_ack_message || "—"} />
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No sync activity recorded yet for this device.
                </Typography>
              )}
            </SectionPaper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
