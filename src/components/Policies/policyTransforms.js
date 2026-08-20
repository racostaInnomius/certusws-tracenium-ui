// src/components/Policies/policyTransforms.js
//
// Pure form ⇄ policy transform layer + policy-domain catalogs, extracted from
// the Policies god-component. No React, no I/O. readFormFromPolicy() folds a
// stored policyJson (v1 top-level or v2 agent.* shapes) into the flat form the
// PolicyForm renders; formToPolicy() serializes it back, emitting only fields
// the operator actually set (omit-empty discipline). The SECURITY_* and MAM_*
// catalogs declare each capability's control shape so the form and the
// transforms stay in lockstep with the agent-side schema.

export const INVENTORY_INTERVAL_MIN = 60;       // 1m   — AMP scans can be tight
export const INVENTORY_INTERVAL_MAX = 86400;    // 24h
export const COMPLIANCE_INTERVAL_MIN = 300;     // 5m
export const COMPLIANCE_INTERVAL_MAX = 86400;   // 24h
export const PATCH_INTERVAL_MIN = 300;          // 5m
export const PATCH_INTERVAL_MAX = 604800;       // 7d
export const UPDATE_INTERVAL_MIN = 60;          // 1m   — but useful range is hourly
export const UPDATE_INTERVAL_MAX = 86400;       // 24h  — beyond this disable the
                                          //         module instead of cranking it
// CDP: a full certificate-store scan is not cheap (OS stores + every JVM
// cacerts), and certificates move on a scale of days — sub-15-minute
// cadence buys nothing. Mirrors the backend validator + agent bounds.
export const CDP_INTERVAL_MIN = 900;            // 15m
export const CDP_INTERVAL_MAX = 86400;          // 24h
export const CDP_KEYSTORE_PATHS_MAX = 50;
export const CDP_TLS_PORTS_MAX = 64;

// ── Form ⇄ policy mapping. The form tracks plugin toggles plus the
//    compliance collection interval; modules are derived from plugins
//    (see formToPolicy). Required plugins are clamped to true regardless
//    of the incoming policy.
// Reads either the v1 top-level path or the v2 `agent.schedules.*`
// path. v2 wins on conflict. Pair function with writeIntervalToPolicy
// below; together they let the form stay schema-agnostic.
export function pickInterval(policy, key) {
  const v2 = policy?.agent?.schedules?.[key]?.intervalSeconds;
  if (v2 !== undefined && v2 !== null) return Number(v2);
  const v1 = policy?.[key]?.intervalSeconds;
  if (v1 !== undefined && v1 !== null) return Number(v1);
  return NaN;
}

export function pickFeature(policy, key) {
  const v2 = policy?.agent?.features?.[key];
  if (v2 !== undefined) return Boolean(v2);
  const v1 = policy?.features?.[key];
  if (v1 !== undefined) return Boolean(v1);
  return null; // unset
}

/**
 * Turn a newline-separated textarea into a clean path array.
 *
 * Operators paste these lists, so blank lines and stray whitespace are the
 * norm rather than the exception. Trailing separators are stripped too:
 * "C:\Users\" and "C:\Users" are the same root, but only one of them
 * matches what the agent compares against.
 */
export function splitPathLines(text) {
  if (typeof text !== "string") return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.length > 1 ? line.replace(/[\\/]+$/, "") : line));
}

/**
 * Parse the TLS listener port list. Accepts commas, spaces or newlines
 * because operators paste from all three, and drops anything that is not
 * a TCP port — the backend validator names the bad entries, so this only
 * has to agree with it about what "valid" means.
 */
export function parsePortList(text) {
  if (Array.isArray(text)) text = text.join(",");
  if (typeof text !== "string") return [];
  const out = [];
  for (const token of text.split(/[\s,]+/)) {
    if (!token) continue;
    const port = Number(token);
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    if (out.includes(port)) continue;
    out.push(port);
  }
  return out;
}

/** Tokens that are not valid TCP ports, for authoring feedback. */
export function invalidPortTokens(text) {
  if (typeof text !== "string") return [];
  return text.split(/[\s,]+/).filter((token) => {
    if (!token) return false;
    const port = Number(token);
    return !Number.isInteger(port) || port < 1 || port > 65535;
  });
}

// ── Security Policy schema mirror (Sprint 2 of Policy v2) ─────────
// Stays in sync with src/core/policy-runtime.ts:SecurityPolicy in the
// agent + the validator in modules/policies/policies.service.ts. The
// form structure is flat: one entry per capability, each with a
// `mode` and capability-specific scalar fields.
export const SECURITY_MODES = [
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
export const SECURITY_CAPABILITIES = [
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
  {
    key: "gatekeeper",
    label: "Gatekeeper",
    description: "Require Gatekeeper to be enabled so only signed, notarized software runs. Remediated with spctl; no reboot.",
    osTags: ["macOS"],
    enforcer: true,
    fields: [
      { key: "required", label: "Required to be enabled", type: "boolean",
        default: true, trueLabel: "Require", falseLabel: "Allow disabled" },
    ],
  },
  {
    key: "remoteLogin",
    label: "Remote Login (SSH)",
    description: "Turn off the macOS Remote Login service. Remediated with systemsetup; no reboot.",
    osTags: ["macOS"],
    enforcer: true,
    fields: [
      { key: "disabled", label: "Remote Login disabled", type: "boolean",
        default: true, trueLabel: "Disable", falseLabel: "Allow" },
    ],
  },
  // Read-only on macOS: the agent reports drift accurately but cannot
  // remediate — SIP needs the Recovery OS, FileVault needs interactive
  // user auth. enforcer:false makes the card render "auto coming soon",
  // and the backend rejects mode=auto outright with an explanation.
  {
    key: "sip",
    label: "System Integrity Protection",
    description: "Report whether SIP is enabled. Cannot be remediated remotely — enabling SIP requires booting into the Recovery OS.",
    osTags: ["macOS"],
    enforcer: false,
    fields: [
      { key: "required", label: "Required to be enabled", type: "boolean",
        default: true, trueLabel: "Require", falseLabel: "Allow disabled" },
    ],
  },
  {
    key: "filevault",
    label: "FileVault encryption",
    description: "Report whether FileVault is on. Cannot be remediated remotely — enabling it prompts the user for their password and a Recovery Key.",
    osTags: ["macOS"],
    enforcer: false,
    fields: [
      { key: "required", label: "Required to be enabled", type: "boolean",
        default: true, trueLabel: "Require", falseLabel: "Allow disabled" },
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

export function readSecurityFromPolicy(policy) {
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

export function securityFormToPolicy(securityForm) {
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

// ── MAM managed-app policy (mobile clients) ─────────────────────────
// Authors policyJson.mam, consumed by T-iOS + T-Android. Booleans are
// tri-state: null = "no opinion" (leave the app default), true/false =
// explicit. idleTimeoutSeconds / minimumAppVersion use "" for unset,
// mirroring the AI/SDP number fields. Reads either `mam` (canonical) or
// the iOS alias `managedApp`.
export const MAM_BOOL_KEYS = [
  "requireUserAuth",
  "allowOfflineMode",
  "requireAppPIN",
  "requireBiometrics",
  "wipeAppData",
  // Phase 2 of device geolocation. The ONLY switch that makes a managed mobile
  // client collect coordinates; fail-closed, so a tenant that never touches it
  // never produces location data. Desktop is unaffected — its position is
  // derived server-side from the subnet and involves no endpoint permission.
  "locationTracking",
];
export const MAM_IDLE_MIN = 15;
export const MAM_IDLE_MAX = 86400;

export function readManagedAppFromPolicy(policy) {
  const mam = policy?.mam ?? policy?.managedApp ?? null;
  const m = mam && typeof mam === "object" ? mam : {};
  const boolOrNull = (v) => (typeof v === "boolean" ? v : null);
  const out = {};
  for (const k of MAM_BOOL_KEYS) out[k] = boolOrNull(m[k]);
  out.idleTimeoutSeconds = Number(m.idleTimeoutSeconds) > 0 ? Number(m.idleTimeoutSeconds) : "";
  out.minimumAppVersion = typeof m.minimumAppVersion === "string" ? m.minimumAppVersion : "";
  return out;
}

export function managedAppFormToPolicy(mamForm) {
  if (!mamForm || typeof mamForm !== "object") return null;
  const out = {};
  for (const k of MAM_BOOL_KEYS) {
    if (typeof mamForm[k] === "boolean") out[k] = mamForm[k];
  }
  const idle = Number(mamForm.idleTimeoutSeconds);
  if (Number.isFinite(idle) && idle >= MAM_IDLE_MIN && idle <= MAM_IDLE_MAX) {
    out.idleTimeoutSeconds = idle;
  }
  if (typeof mamForm.minimumAppVersion === "string" && mamForm.minimumAppVersion.trim()) {
    out.minimumAppVersion = mamForm.minimumAppVersion.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Render metadata for the MAM tri-state booleans (order = card order).
export const MAM_BOOL_FIELDS = [
  { key: "requireUserAuth", label: "Require user auth", hint: "Gate the app behind device authentication.", onLabel: "Require", offLabel: "Don't require" },
  { key: "requireAppPIN", label: "Require app PIN", hint: "Prompt for an app passcode to open.", onLabel: "Require", offLabel: "Don't require" },
  { key: "requireBiometrics", label: "Require biometrics", hint: "Face ID / fingerprint to open the app.", onLabel: "Require", offLabel: "Don't require" },
  { key: "allowOfflineMode", label: "Allow offline use", hint: "Let the app run without reaching the server.", onLabel: "Allow", offLabel: "Block" },
  { key: "wipeAppData", label: "Selective wipe", hint: "Clears app data + enrolled identity on next check-in.", onLabel: "Wipe", offLabel: "Keep" },
  {
    key: "locationTracking",
    label: "Location tracking",
    // Say plainly what enabling this does: it is personal data, and the
    // operator should not discover that from a support ticket.
    // Turning it off deletes what was collected — an operator who is not told
    // that would reasonably expect the history to survive the switch.
    hint: "Reports the device's GPS position for recovery. The user is prompted by the OS and can refuse. Turning this off erases the coordinates already stored.",
    onLabel: "Track",
    offLabel: "Don't track",
  },
];

export function readFormFromPolicy(policy, catalog = []) {
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
      catalog.map((p) => [
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
      // Remote Control Plugin (RCP) capability gates. Each enables the
      // matching `rcp.*` capability the agent advertises in Hello once
      // it has the M3 plugin code (agent 1.1.19+). Off by default so
      // legacy agents and tenants opt in explicitly.
      remoteShell:  pickFeature(policy, "remoteShell"),   // rcp.shell  (M1)
      remoteFile:   pickFeature(policy, "remoteFile"),    // rcp.file   (M2.S1)
      remoteScreen: pickFeature(policy, "remoteScreen"),  // rcp.screen (M3.S1)
      remoteRequireConsent: pickFeature(policy, "remoteRequireConsent"), // user-attended approval
      // Device Info flyout (support widget) — the always-visible
      // top-center tab on Windows endpoints. Off by default; the
      // Device Info tab inside the tray status window is NOT gated by
      // this. Requires agent 1.1.24+; older agents ignore the flag.
      deviceInfoWidget: pickFeature(policy, "deviceInfoWidget"),
      // Endpoint positioning (agent 1.1.30+). Separate from
      // mam.locationTracking, which governs the mobile clients: phones and
      // laptops are different populations and consent for one is not consent
      // for the other. Off by default, and the backend re-checks it before
      // storing any coordinate.
      locationTracking: pickFeature(policy, "locationTracking"),
    },
    // rcp.file confinement (policyJson.rcp.file). Edited as newline-separated
    // text because operators paste path lists; converted to/from arrays at
    // the policy boundary. Empty ⇒ the key is omitted and the agent applies
    // its own platform defaults, which are already the secure posture.
    rcpFile: {
      roots: (policy?.rcp?.file?.roots ?? []).join("\n"),
      denyPaths: (policy?.rcp?.file?.denyPaths ?? []).join("\n"),
      denyExtensions: (policy?.rcp?.file?.denyExtensions ?? []).join("\n"),
    },
    // Security Policy v2 — separate sub-form so the security cards
    // can be a sibling section. Stored back into policy.security on
    // formToPolicy. Empty policies result in the empty default
    // shape (no capabilities configured).
    security: readSecurityFromPolicy(policy),
    // MAM managed-app policy for mobile clients (policyJson.mam). Sibling
    // sub-form like `security`; written back by managedAppFormToPolicy.
    managedApp: readManagedAppFromPolicy(policy),
    // AI Intelligence (aip) — entitlement + per-day quota. The backend
    // (ai-policy.ts) gates AI calls on `ai.enabled` (or the 'aip' plugin)
    // and enforces ai.maxCallsPerDay / ai.maxTokensPerDay. Blank limit =
    // unlimited. We surface the numbers as "" (unset) vs a value.
    ai: {
      enabled: policy?.ai?.enabled === true,
      maxCallsPerDay:
        Number(policy?.ai?.maxCallsPerDay) > 0 ? Number(policy.ai.maxCallsPerDay) : "",
      maxTokensPerDay:
        Number(policy?.ai?.maxTokensPerDay) > 0 ? Number(policy.ai.maxTokensPerDay) : "",
    },
    // SDP distribution (Phase D) — per-device download bandwidth cap in
    // Kbps, applied by the agent's downloader (curl --limit-rate). Blank =
    // full speed.
    sdp: {
      bandwidthLimitKbps:
        Number(policy?.sdp?.bandwidthLimitKbps) > 0 ? Number(policy.sdp.bandwidthLimitKbps) : "",
    },
    // CDP (Crypto Discovery) — scan cadence plus the application Java
    // keystores to inventory on top of the JVM cacerts the agent finds by
    // itself. Paths are edited as newline-separated text (same rationale
    // as rcpFile: operators paste lists) and converted at the policy
    // boundary.
    cdp: {
      intervalSeconds:
        Number(policy?.cdp?.intervalSeconds) > 0 ? Number(policy.cdp.intervalSeconds) : "",
      javaKeystorePaths: (policy?.cdp?.javaKeystorePaths ?? []).join("\n"),
      // Explicitly `=== true`: the probe is opt-in, so anything that is
      // not a stored `true` must render as off. Mirrors the agent's own
      // getCdpScanTlsListeners().
      scanTlsListeners: policy?.cdp?.scanTlsListeners === true,
      tlsListenerPorts: (policy?.cdp?.tlsListenerPorts ?? []).join(", "),
    },
  };
}

export function formToPolicy(form, catalog = []) {
  const pluginsEnabled = catalog
    .filter((p) => p.required || form.plugins[p.key])
    .map((p) => p.key);

  // Derive modules from plugins that imply one (e.g. scp → compliance).
  const modules = {};
  catalog.forEach((p) => {
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
  const features = {};
  if (form?.features?.selfUpdate !== null && form?.features?.selfUpdate !== undefined) {
    features.selfUpdate = Boolean(form.features.selfUpdate);
  }
  // Device Info flyout — no plugin gate: the widget lives in the tray
  // app, not in a plugin, so it applies to any device this policy hits.
  if (form?.features?.locationTracking !== null && form?.features?.locationTracking !== undefined) {
    features.locationTracking = Boolean(form.features.locationTracking);
  }
  if (form?.features?.deviceInfoWidget !== null && form?.features?.deviceInfoWidget !== undefined) {
    features.deviceInfoWidget = Boolean(form.features.deviceInfoWidget);
  }
  // RCP flags are dropped when the rcp plugin is disabled in Plugin
  // Control — same omit-when-plugin-off pattern as the compliance and
  // patch intervals above. Without this gate, stale `remoteShell: true`
  // values would persist in the policy and cause the agent to re-
  // advertise rcp.shell the next time someone re-enables the plugin,
  // even if the operator explicitly cleared the toggle months earlier.
  if (modules.remoteControl === true) {
    if (form?.features?.remoteShell !== null && form?.features?.remoteShell !== undefined) {
      features.remoteShell = Boolean(form.features.remoteShell);
    }
    if (form?.features?.remoteFile !== null && form?.features?.remoteFile !== undefined) {
      features.remoteFile = Boolean(form.features.remoteFile);
    }
    if (form?.features?.remoteScreen !== null && form?.features?.remoteScreen !== undefined) {
      features.remoteScreen = Boolean(form.features.remoteScreen);
    }
    if (form?.features?.remoteRequireConsent !== null && form?.features?.remoteRequireConsent !== undefined) {
      features.remoteRequireConsent = Boolean(form.features.remoteRequireConsent);
    }
  }
  if (Object.keys(features).length > 0) {
    policy.features = features;
  }

  // ── rcp.file confinement ────────────────────────────────────────
  // Same omit-when-plugin-off rule as the RCP feature flags above, and
  // the same omit-when-empty rule as the rest of formToPolicy: an absent
  // key means "no opinion", which the agent reads as "use my platform
  // defaults". That is deliberately NOT the same as an empty array, which
  // would mean "no roots at all" — so we never emit one.
  if (modules.remoteControl === true) {
    const rcpFile = {};
    const roots = splitPathLines(form?.rcpFile?.roots);
    const denyPaths = splitPathLines(form?.rcpFile?.denyPaths);
    // Extensiones: el backend exige el punto delantero, asi que lo ponemos
    // nosotros si el operador escribio "pem" en vez de ".pem". Escribir la
    // extension sin punto es el error natural, y rechazarlo por eso seria
    // pedanteria — el agente cae en un silencio total si no valida.
    const denyExtensions = splitPathLines(form?.rcpFile?.denyExtensions)
      .map((e) => e.toLowerCase())
      .map((e) => (e.startsWith(".") ? e : `.${e}`))
      .filter((e) => e.length > 1);
    if (roots.length > 0) rcpFile.roots = roots;
    if (denyPaths.length > 0) rcpFile.denyPaths = denyPaths;
    if (denyExtensions.length > 0) rcpFile.denyExtensions = denyExtensions;
    if (Object.keys(rcpFile).length > 0) {
      policy.rcp = { ...(policy.rcp || {}), file: rcpFile };
    }
  }

  // ── CDP (Crypto Discovery) ──────────────────────────────────────
  // Gated on the plugin being enabled, and omit-when-empty like the
  // rest: no key at all means "agent defaults" (6h cadence, JVM cacerts
  // only). An empty array would be a different, useless statement.
  if (pluginsEnabled.includes("cdp")) {
    const cdp = {};
    const interval = Number(form?.cdp?.intervalSeconds);
    if (Number.isInteger(interval) && interval >= CDP_INTERVAL_MIN && interval <= CDP_INTERVAL_MAX) {
      cdp.intervalSeconds = interval;
    }
    const keystores = splitPathLines(form?.cdp?.javaKeystorePaths);
    if (keystores.length > 0) cdp.javaKeystorePaths = keystores;

    // Written only when ON. `false` is the agent's default, so persisting
    // it would add a key that changes nothing — and omit-when-empty is the
    // rule everywhere else in this function.
    if (form?.cdp?.scanTlsListeners === true) {
      cdp.scanTlsListeners = true;
      // Ports narrow the scan; they mean nothing with the probe off, so
      // they ride inside the same branch rather than becoming an orphan
      // setting an operator could believe is doing something.
      const ports = parsePortList(form?.cdp?.tlsListenerPorts);
      if (ports.length > 0) cdp.tlsListenerPorts = ports;
    }

    if (Object.keys(cdp).length > 0) policy.cdp = cdp;
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

  // ── MAM managed-app block (mobile clients) ──────────────────────
  // Written as `policy.mam` (the canonical key both apps read). Omitted
  // entirely when the operator configured nothing, same as the rest.
  const mamBlock = managedAppFormToPolicy(form.managedApp || {});
  if (mamBlock) {
    policy.mam = mamBlock;
  }

  // ── AI Intelligence (aip) quota block ───────────────────────────
  // Emit `ai` only for fields the operator set. `enabled` unlocks AI
  // (fail-closed default); the two limits are positive-int caps, blank =
  // unlimited. Same omit-empty discipline as the rest of formToPolicy.
  const ai = {};
  if (form?.ai?.enabled === true) ai.enabled = true;
  const maxCalls = Number(form?.ai?.maxCallsPerDay);
  if (Number.isInteger(maxCalls) && maxCalls > 0) ai.maxCallsPerDay = maxCalls;
  const maxTokens = Number(form?.ai?.maxTokensPerDay);
  if (Number.isInteger(maxTokens) && maxTokens > 0) ai.maxTokensPerDay = maxTokens;
  if (Object.keys(ai).length > 0) {
    policy.ai = ai;
  }

  // ── SDP distribution (Phase D) ──────────────────────────────────
  // Per-device bandwidth cap for SDP downloads. Omit-empty: blank = no
  // `sdp` block = full speed.
  const bw = Number(form?.sdp?.bandwidthLimitKbps);
  if (Number.isInteger(bw) && bw > 0) {
    policy.sdp = { bandwidthLimitKbps: bw };
  }

  return policy;
}

export function isEmptyPolicy(policy) {
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
export function extractPolicyEnvelope(response) {
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
