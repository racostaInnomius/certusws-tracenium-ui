// src/components/AgentSettings/fieldSpecs.js
//
// Every editable setting of Agent Settings, declared once: which form key
// it lives at, how it is edited, its bounds, its copy. SectionFields renders
// a section's specs as compact rows (label · control · inherits/override),
// which is what replaced the stacked cards with paragraphs. Pure, so the
// inherit/override logic and the tests read the same list.
//
// `key` is a path INTO THE FORM (readFormFromPolicy), not into the policy
// document; sections.js maps document paths to sections for the diff.

import {
  CDP_INTERVAL_MAX,
  CDP_INTERVAL_MIN,
  CDP_KEYSTORE_PATHS_MAX,
  CDP_PROBE_TARGETS_MAX,
  CDP_TLS_PORTS_MAX,
  COMPLIANCE_INTERVAL_MAX,
  COMPLIANCE_INTERVAL_MIN,
  INVENTORY_INTERVAL_MAX,
  INVENTORY_INTERVAL_MIN,
  LOCATION_HISTORY_LIMIT_MAX,
  LOCATION_HISTORY_LIMIT_MIN,
  PATCH_INTERVAL_MAX,
  PATCH_INTERVAL_MIN,
  UPDATE_INTERVAL_MAX,
  UPDATE_INTERVAL_MIN,
  invalidPortTokens,
  invalidProbeTargets,
  parsePortList,
  splitPathLines,
  splitTargetLines,
} from "../Policies/policyTransforms";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function isBlank(v) {
  return v === null || v === undefined || v === "";
}

function boundedInterval(min, max) {
  return (v) => {
    if (isBlank(v)) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? null : `Must be between ${min} and ${max} seconds.`;
  };
}

function absolutePaths(max, label) {
  return (v) => {
    const paths = splitPathLines(v);
    if (paths.length > max) return `Too many ${label} (${paths.length}). At most ${max}; the agent drops the remainder.`;
    const relative = paths.filter((p) => !(p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p)));
    if (relative.length > 0) return `Not absolute: ${relative.slice(0, 3).join(", ")}${relative.length > 3 ? "…" : ""}. The agent ignores relative paths.`;
    return null;
  };
}

/** A root that opens the whole disk: "/" or "C:\". Worth saying out loud. */
export function wideOpenRoot(text) {
  for (const line of String(text ?? "").split("\n")) {
    const p = line.trim();
    if (p === "/" || /^[a-zA-Z]:[\\/]?$/.test(p)) return p;
  }
  return null;
}

const INTERVAL_ROW = (key, label, min, max, step, defaultText) => ({
  key,
  label,
  sub: `Blank = backend default (${defaultText}). Range ${min}–${max}.`,
  type: "number",
  min,
  max,
  step,
  unit: "s",
  placeholder: "default",
  validate: boundedInterval(min, max),
});

export const FIELD_SPECS = {
  agent: [
    INTERVAL_ROW("update.intervalSeconds", "Update probe interval", UPDATE_INTERVAL_MIN, UPDATE_INTERVAL_MAX, 300, "6h / 21600 s"),
    {
      key: "features.selfUpdate",
      label: "Self-update",
      sub: "When off, the update probe keeps running (to report available versions) but the install path is suppressed. Use to freeze a fleet on a version while staging a rollout.",
      type: "switch",
      defaultOn: true,
    },
    {
      key: "features.deviceInfoWidget",
      label: "Device info widget",
      sub: "An always-on-top \u201cDevice info\u201d tab at the top-centre of Windows endpoints: user, computer name, IP, serial, with a Copy all button for support tickets. The tray status window and the macOS menubar show the same info regardless.",
      type: "switch",
    },
    {
      key: "features.locationTracking",
      label: "Location tracking",
      sub: "Asks Windows for the endpoint\u2019s position and shows it on the device map. Needs location services on the endpoint; macOS and Linux report nothing for now. Turning it off erases stored coordinates. Coordinates are personal data.",
      type: "switch",
    },
  ],
  amp: [
    INTERVAL_ROW("inventory.intervalSeconds", "Asset collection interval", INVENTORY_INTERVAL_MIN, INVENTORY_INTERVAL_MAX, 60, "6h / 21600 s"),
    {
      key: "inventory.locationHistoryLimit",
      label: "Location history kept per device",
      // ⚠️ Dice las dos cosas que un operador no puede adivinar: que BAJARLO
      // borra, y que existe un tope temporal que este número no levanta. Sin
      // la primera, alguien pasa de 20 a 10 "para ordenar" y pierde diez
      // posiciones por equipo sin vuelta atrás. Sin la segunda, subirlo a 50
      // parece guardar para siempre.
      sub: `Distinct positions per device. Blank = backend default (10). Range ${LOCATION_HISTORY_LIMIT_MIN}–${LOCATION_HISTORY_LIMIT_MAX}; 1 keeps only the current position. Lowering this DELETES the extra positions on each device's next check-in. Positions nobody confirms for 90 days expire regardless, except each device's most recent one.`,
      type: "number",
      min: LOCATION_HISTORY_LIMIT_MIN,
      max: LOCATION_HISTORY_LIMIT_MAX,
      step: 1,
      unit: "positions",
      placeholder: "default",
      validate: (v) => {
        if (v === "" || v === null || v === undefined) return null;
        const n = Number(v);
        if (!Number.isInteger(n) || n < LOCATION_HISTORY_LIMIT_MIN || n > LOCATION_HISTORY_LIMIT_MAX) {
          return `Whole number between ${LOCATION_HISTORY_LIMIT_MIN} and ${LOCATION_HISTORY_LIMIT_MAX}.`;
        }
        return null;
      },
    },
  ],
  scp: [INTERVAL_ROW("compliance.intervalSeconds", "Evaluation interval", COMPLIANCE_INTERVAL_MIN, COMPLIANCE_INTERVAL_MAX, 60, "8h / 28800 s")],
  pmp: [INTERVAL_ROW("patch.intervalSeconds", "Patch scan interval", PATCH_INTERVAL_MIN, PATCH_INTERVAL_MAX, 300, "24h / 86400 s")],
  sdp: [
    {
      key: "sdp.bandwidthLimitKbps",
      label: "Download limit",
      sub: "Per-device cap for package downloads and distribution-point prefetches (curl --limit-rate). Blank = full speed.",
      type: "number",
      min: 1,
      step: 128,
      unit: "KB/s",
      placeholder: "full speed",
    },
  ],
  ai: [
    {
      key: "ai.enabled",
      label: "Enable AI features",
      sub: "Fail-closed: off unless enabled here. Required for the SDP intake pipeline (install-config generation). Every AI call is audited.",
      type: "switch",
    },
    {
      key: "ai.maxCallsPerDay",
      label: "Max AI calls per day",
      sub: "Blank = unlimited. Checked before spend.",
      type: "number",
      min: 1,
      step: 1,
      placeholder: "unlimited",
      visibleWhen: (form) => form?.ai?.enabled === true,
    },
    {
      key: "ai.maxTokensPerDay",
      label: "Max AI tokens per day",
      sub: "Blank = unlimited.",
      type: "number",
      min: 1,
      step: 1000,
      placeholder: "unlimited",
      visibleWhen: (form) => form?.ai?.enabled === true,
    },
  ],
  cdp: [
    {
      key: "cdp.intervalSeconds",
      label: "Scan interval",
      sub: `Blank = agent default (6h). Range ${CDP_INTERVAL_MIN}–${CDP_INTERVAL_MAX}. OS stores and every JVM\u2019s cacerts are discovered automatically; private keys are never read.`,
      type: "number",
      min: CDP_INTERVAL_MIN,
      max: CDP_INTERVAL_MAX,
      step: 300,
      unit: "s",
      placeholder: "default",
      validate: boundedInterval(CDP_INTERVAL_MIN, CDP_INTERVAL_MAX),
    },
    {
      key: "cdp.javaKeystorePaths",
      label: "Application Java keystores",
      sub: "JKS / PKCS12, one absolute path per line. List only application keystores; JVM cacerts are found by the agent. A password-protected PKCS12 is reported as a scan error, not skipped silently.",
      type: "lines",
      mono: true,
      placeholder: "/opt/tomcat/conf/keystore.jks\nC:\\Program Files\\App\\keystore.p12",
      validate: absolutePaths(CDP_KEYSTORE_PATHS_MAX, "paths"),
    },
    {
      key: "cdp.certFilePaths",
      label: "Certificate directories on disk",
      sub: "Where server certificates actually live (nginx, HAProxy, Apache, Postgres read a .pem path, never the OS store). One absolute directory per line. Blank = off: there is no safe default. A file holding a key block is skipped whole.",
      type: "lines",
      mono: true,
      placeholder: "/etc/ssl/certs\n/etc/nginx/ssl\nC:\\inetpub\\certs",
      validate: absolutePaths(CDP_KEYSTORE_PATHS_MAX, "directories"),
    },
    {
      key: "cdp.scanTlsListeners",
      label: "Probe local TLS services",
      sub: "Runs on every device under this policy. Captures the certificate each local service actually serves (which can differ from every store), what the handshake negotiates, and which process serves it. Every probe goes to 127.0.0.1 and closes at the handshake; SMTP, IMAP, POP3, LDAP, PostgreSQL and MySQL get their StartTLS preamble, while SSH, telnet, DNS, MSSQL and Oracle are never probed (SSH host keys are read from disk instead). The same switch also reports the internal TLS services each device connects to, as suggestions for remote probing.",
      type: "switch",
    },
    {
      key: "cdp.tlsListenerPorts",
      label: "Limit local probing to ports",
      sub: `Blank = every listening port the agent finds. Comma-separated, at most ${CDP_TLS_PORTS_MAX}.`,
      type: "text",
      placeholder: "443, 8443, 9443",
      visibleWhen: (form) => form?.cdp?.scanTlsListeners === true,
      validate: (v) => {
        const bad = invalidPortTokens(v ?? "");
        if (bad.length > 0) return `Not valid ports: ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}. Each must be 1–65535.`;
        const n = parsePortList(v ?? "").length;
        return n > CDP_TLS_PORTS_MAX ? `Too many ports (${n}). At most ${CDP_TLS_PORTS_MAX}.` : null;
      },
    },
    {
      // Repaso 2026-09-07: sin `probeHosts`, cada equipo bajo la policy
      // sondeaba cada objetivo. Como con los CA servers: se nombran.
      key: "cdp.probeHosts",
      label: "Remote probes run from",
      sub: "Hostnames of the two or three devices that run the remote probes, one per line (NetBIOS or FQDN); pick devices in the network segments that can reach the targets. Every other device ignores the target list. Empty = nobody probes.",
      type: "lines",
      mono: true,
      placeholder: "MSIG-RADIUS-CA\nprobe01.corp.example",
      validate: (v) => {
        const lines = String(v ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const bad = lines.filter((h) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*$/.test(h) || h.length > 253);
        if (bad.length > 0) return `Not a hostname — ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}`;
        return lines.length > 50 ? "At most 50 devices." : null;
      },
    },
    {
      key: "cdp.probeTargets",
      label: "Remote TLS services to probe",
      sub: "No agent needed on the target: the devices named above connect to each host:port, record the certificate served and what the handshake negotiates, including whether the server accepts a post-quantum key exchange (X25519MLKEM768). One host:port per line; loopback is rejected. Cleartext-first ports (SMTP, IMAP, POP3, LDAP, PostgreSQL, MySQL) get their StartTLS preamble. Suggestions from what devices already connect to are in Crypto Discovery → Settings.",
      type: "lines",
      mono: true,
      placeholder: "lb.corp.example:443\nvcenter.corp.example:443\n10.0.0.12:636",
      validate: (v) => {
        const bad = invalidProbeTargets(v ?? "");
        if (bad.length > 0) return `Not a valid host:port — ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}`;
        const n = splitTargetLines(v ?? "").length;
        return n > CDP_PROBE_TARGETS_MAX ? `At most ${CDP_PROBE_TARGETS_MAX} targets.` : null;
      },
    },
    {
      // Repaso 2026-09-07: era un toggle a nivel de tenant para algo que
      // solo aplica a los servidores con rol de CA. Ahora se nombran.
      key: "cdp.adcsHosts",
      label: "AD CS: certification authority servers",
      sub: "Hostnames of the Windows servers with the Certification Authority role, one per line (NetBIOS or FQDN). Only the agent installed on those servers reads what the CA issued and with which template; every other device ignores this. Empty = off.",
      type: "lines",
      mono: true,
      placeholder: "MSIG-RADIUS-CA\nca02.corp.example",
      validate: (v) => {
        const lines = String(v ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const bad = lines.filter((h) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*$/.test(h) || h.length > 253);
        if (bad.length > 0) return `Not a hostname — ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}`;
        return lines.length > 50 ? "At most 50 CA servers." : null;
      },
    },
  ],
  rcp: [
    {
      key: "features.remoteShell",
      label: "Remote shell",
      code: "rcp.shell",
      sub: "Interactive shell over WebRTC with system privileges. Transcripts are recorded for audit replay.",
      type: "switch",
    },
    {
      key: "features.remoteFile",
      label: "File transfer",
      code: "rcp.file",
      sub: "File browser and bi-directional transfers over a P2P data channel, with path confinement below. Every transfer is audited.",
      type: "switch",
    },
    {
      key: "features.remoteScreen",
      label: "Screen sharing",
      code: "rcp.screen",
      sub: "Live viewer with optional mouse and keyboard control.",
      type: "switch",
    },
    {
      key: "features.remoteRequireConsent",
      label: "Require user consent",
      code: "rcp.consent",
      // ⚠️ Decía "Two doors… before a SESSION opens", y eso era literalmente
      // lo que hacía: preguntaba también antes de una shell o una
      // transferencia. En un servidor virtual no hay nadie que conteste, así
      // que el aviso vencía solo y la sesión moría por `consent_timeout`.
      // Desde el 2026-09-07 solo aplica a la pantalla, que es donde hay una
      // persona delante viendo lo que consiente.
      sub: "Screen sharing only: the person at the device approves before you can see their screen, and again before you take control. Shell and file sessions do not ask — a server has nobody at it; those are governed by approval instead.",
      type: "switch",
      warnWhenOn:
        "Screen sessions on devices whose agent cannot show the prompt are REFUSED, not opened without asking. " +
        "To keep it on for people's computers and off for servers, use “Apply to devices…” on this section with a device group — the override follows the group as its membership changes.",
    },
    {
      key: "features.remoteRecordScreen",
      label: "Record screen sessions",
      sub: "Encrypted on the endpoint, uploaded after the session, kept 3 months, replayable from the session history. The consent prompt says the session is recorded.",
      type: "switch",
      warnWhenOn: "Devices with an older agent IGNORE this and record nothing, silently. Do not treat these recordings as complete evidence until the fleet is up to date.",
    },
    {
      key: "rcpFile.roots",
      label: "Allowed roots",
      sub: "Replaces the agent\u2019s platform defaults entirely (user profiles, temp, app data). One absolute path per line. Blank = defaults.",
      type: "lines",
      mono: true,
      placeholder: "/home\nC:\\Users",
      visibleWhen: (form) => form?.features?.remoteFile === true,
      validate: (v) => {
        const root = wideOpenRoot(v);
        return root ? `A filesystem root (${root}) makes the whole disk reachable except the blocked paths.` : null;
      },
      warnOnly: true,
    },
    {
      key: "rcpFile.denyPaths",
      label: "Additionally blocked paths",
      sub: "Merged with the agent\u2019s built-in blocks (its credential directory, registry hives, /etc secrets). Blocking always beats allowing.",
      type: "lines",
      mono: true,
      placeholder: "/srv/share/secrets",
      visibleWhen: (form) => form?.features?.remoteFile === true,
    },
    {
      key: "rcpFile.denyExtensions",
      label: "Additionally blocked file types",
      sub: "One per line; the leading dot is added if left out.",
      type: "lines",
      mono: true,
      placeholder: ".pem\n.pfx",
      visibleWhen: (form) => form?.features?.remoteFile === true,
    },
    {
      key: "remoteControl.maxUploadBytes",
      label: "Max upload size",
      sub: "Largest file an operator can send to the endpoint in a transfer. Blank = agent default. The agent reads this; until now it was only reachable through the raw JSON editor.",
      type: "number",
      min: 1,
      step: 1048576,
      unit: "bytes",
      placeholder: "agent default",
      visibleWhen: (form) => form?.features?.remoteFile === true,
    },
  ],
};

export const MONO_FONT = MONO;

export function specsFor(sectionId) {
  return FIELD_SPECS[sectionId] || [];
}

export function getFormValue(form, key) {
  const [a, b] = key.split(".");
  const v = form?.[a];
  return b === undefined ? v : v && typeof v === "object" ? v[b] : undefined;
}

export function setFormValue(form, key, value) {
  const [a, b] = key.split(".");
  if (b === undefined) return { ...form, [a]: value };
  return { ...form, [a]: { ...(form?.[a] && typeof form[a] === "object" ? form[a] : {}), [b]: value } };
}

/** How a switch spec reads its stored value (null = "not set" = default). */
export function switchOn(spec, value) {
  return spec.defaultOn ? value !== false : value === true;
}

/** Two form values that mean the same thing to the policy: "" and null are both "unset". */
export function sameFormValue(a, b) {
  const norm = (v) => (v === "" || v === undefined ? null : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** Rows of a section that differ from the tenant (device scope). */
export function overriddenKeys(sectionId, form, compareForm) {
  if (!compareForm) return [];
  return specsFor(sectionId)
    .filter((s) => !sameFormValue(getFormValue(form, s.key), getFormValue(compareForm, s.key)))
    .map((s) => s.key);
}

/** The section's rows set back to what `source` has (Discard / back to inherit for the whole section). */
export function resetSectionTo(sectionId, form, source) {
  let next = form;
  for (const spec of specsFor(sectionId)) next = setFormValue(next, spec.key, getFormValue(source, spec.key));
  return next;
}
