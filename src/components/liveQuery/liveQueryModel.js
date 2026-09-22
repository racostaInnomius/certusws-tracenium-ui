// src/components/liveQuery/liveQueryModel.js
//
// ADR-0029 F3 — lo que la pestaña Live Query necesita saber de cada sonda:
// qué campos pide, cómo se resume la pregunta, cómo se lee una respuesta.
//
// El catálogo manda en el BACKEND (modules/live-query/live-query-probes.ts) y
// se revalida en el agente. Aquí sólo se pintan formularios y se hace una
// comprobación de cortesía para no mandar lo que seguro se rechaza; el motivo
// que cuenta es el que devuelve el servidor.

export const PROBES = [
  {
    key: "process",
    label: "Running process",
    question: "Is this process running?",
    fields: [{ name: "name", label: "Process name", placeholder: "AnyDesk.exe", help: "The executable name, not a path. On Windows “AnyDesk” means “AnyDesk.exe”." }],
    platforms: "Windows, macOS, Linux",
  },
  {
    key: "service",
    label: "Service",
    question: "What state is this service in?",
    fields: [{ name: "name", label: "Service name", placeholder: "Spooler", help: "The service name (not the display name). Linux: the systemd unit; macOS: the launchd label, e.g. org.cups.cupsd." }],
    platforms: "Windows, macOS, Linux",
  },
  {
    key: "file",
    label: "File",
    question: "Does this file exist, and with what hash?",
    fields: [{ name: "path", label: "Absolute path", placeholder: "C:\\Windows\\System32\\drivers\\etc\\hosts", help: "Absolute path, no wildcards. Size, date and SHA-256 (files up to 8 MB) — never the content." }],
    platforms: "Windows, macOS, Linux (a Windows path does not apply on a Mac, and the other way round)",
  },
  {
    key: "registry",
    label: "Registry value",
    question: "What is this registry value?",
    fields: [
      { name: "key", label: "Key", placeholder: "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", help: "Under HKLM\\ or HKU\\." },
      { name: "value", label: "Value name", placeholder: "EnableLUA", help: "Empty = the key's default value. Values that usually hold credentials (passwords, tokens, secrets) are not read.", optional: true },
    ],
    platforms: "Windows only",
  },
  {
    key: "port",
    label: "Listening port",
    question: "Is anything listening on this TCP port?",
    fields: [{ name: "port", label: "TCP port", placeholder: "3389", help: "1 to 65535. Answers which process is listening." }],
    platforms: "Windows, macOS, Linux",
  },
  {
    key: "logged_on_users",
    label: "Logged-on users",
    question: "Who is logged on right now?",
    fields: [],
    platforms: "Windows, macOS, Linux",
  },
];

export const PROBE_BY_KEY = Object.fromEntries(PROBES.map((p) => [p.key, p]));

export function emptyParams(probeKey) {
  return Object.fromEntries((PROBE_BY_KEY[probeKey]?.fields ?? []).map((f) => [f.name, ""]));
}

/** Comprobación de cortesía; null si parece válido. El servidor decide. */
export function paramsProblem(probeKey, params) {
  const def = PROBE_BY_KEY[probeKey];
  if (!def) return "Choose what to ask.";
  for (const f of def.fields) {
    const v = String(params?.[f.name] ?? "").trim();
    if (!v && !f.optional) return `${f.label} is required.`;
  }
  if (probeKey === "port") {
    const n = Number(params.port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return "Port must be a number from 1 to 65535.";
  }
  if (probeKey === "file") {
    const p = String(params.path).trim();
    if (!/^[a-zA-Z]:\\/.test(p) && !p.startsWith("/")) return "Use an absolute path (C:\\… or /…).";
    if (/[*?]/.test(p)) return "Wildcards are not supported.";
  }
  if ((probeKey === "process" || probeKey === "service") && /[\\/]/.test(String(params.name))) {
    return "Use the name, not a path.";
  }
  return null;
}

/** Lo que se manda: los campos recortados; el puerto como número. */
export function paramsForRequest(probeKey, params) {
  const out = {};
  for (const f of PROBE_BY_KEY[probeKey]?.fields ?? []) out[f.name] = String(params?.[f.name] ?? "").trim();
  if (probeKey === "port") out.port = Number(out.port);
  return out;
}

/** «Running process: AnyDesk.exe» — para la cabecera y el historial. */
export function questionSummary(probeKey, params = {}) {
  const def = PROBE_BY_KEY[probeKey];
  const label = def?.label ?? probeKey;
  switch (probeKey) {
    case "process":
    case "service":
      return `${label}: ${params.name ?? ""}`;
    case "file":
      return `${label}: ${params.path ?? ""}`;
    case "registry":
      return `${label}: ${params.key ?? ""}${params.value ? `\\${params.value}` : " (default)"}`;
    case "port":
      return `${label}: TCP ${params.port ?? ""}`;
    default:
      return label;
  }
}

export function targetSummary(target, groups = []) {
  if (!target || target.scope === "all") return "All devices";
  if (target.scope === "group") return `Group: ${groups.find((g) => Number(g.id) === Number(target.groupId))?.name ?? `#${target.groupId}`}`;
  const n = target.deviceIds?.length ?? 0;
  return n === 1 ? "1 device" : `${n} devices`;
}

/** Una clave de agrupación, legible. */
export function answerKeyLabel(probeKey, key) {
  if (probeKey === "file") {
    if (key === "missing") return "Missing";
    if (key.startsWith("sha256:")) return `Present · SHA-256 ${key.slice(7, 19)}…`;
    return "Present (not hashed)";
  }
  if (probeKey === "registry") return key === "missing" ? "Missing" : key === "" ? "(empty)" : key;
  if (probeKey === "logged_on_users" && key === "nobody") return "Nobody logged on";
  const map = { running: "Running", "not running": "Not running", stopped: "Stopped", other: "Other state", "not installed": "Not installed", listening: "Listening", "not listening": "Not listening" };
  return map[key] ?? key;
}

/** La respuesta de UN equipo, en una línea. */
export function answerSummary(probeKey, answer) {
  if (!answer) return "";
  switch (probeKey) {
    case "process":
      if (!answer.running) return "Not running";
      return `Running · ${answer.count} instance${answer.count === 1 ? "" : "s"}${answer.instances?.[0]?.user ? ` · ${answer.instances.map((i) => i.user).filter(Boolean).slice(0, 2).join(", ")}` : ""}`;
    case "service":
      if (!answer.exists) return "Not installed";
      return [answerKeyLabel("service", answer.state), answer.startMode ? `start: ${answer.startMode}` : null].filter(Boolean).join(" · ");
    case "file":
      if (!answer.exists) return "Missing";
      return [
        answer.sizeBytes != null ? `${answer.sizeBytes.toLocaleString()} bytes` : null,
        answer.sha256 ? `SHA-256 ${answer.sha256.slice(0, 12)}…` : "not hashed",
      ].filter(Boolean).join(" · ");
    case "registry":
      if (!answer.exists) return "Missing";
      return `${answer.type ?? ""} ${answer.data ?? ""}`.trim();
    case "port":
      if (!answer.listening) return "Not listening";
      return ["Listening", answer.process, answer.address ? `on ${answer.address}` : null].filter(Boolean).join(" · ");
    case "logged_on_users":
      return answer.users?.length ? answer.users.join(", ") : "Nobody logged on";
    default:
      return "";
  }
}

/**
 * Los estados, en el orden en que se leen. ⚠️ `offline` y `no_answer` NUNCA
 * se suman a una respuesta: a un equipo apagado no se le preguntó.
 */
export const STATUS_META = [
  { key: "answered", label: "Answered", sev: "low" },
  { key: "pending", label: "Waiting", sev: "none" },
  { key: "no_answer", label: "No answer", sev: "medium" },
  { key: "offline", label: "Offline — not asked", sev: "none" },
  { key: "unsupported", label: "Not applicable", sev: "none" },
  { key: "error", label: "Could not check", sev: "high" },
];
export const STATUS_LABEL = Object.fromEntries(STATUS_META.map((s) => [s.key, s.label]));

/**
 * Por qué un equipo no pudo contestar, en palabras de operador. El backend
 * guarda el motivo en `error` también para `unsupported`:
 *   · agent_update_required:<mínima>:<la suya> — agente sin la consulta en vivo
 *     (22-sep: los 1.1.78 rechazaban el job y salían como «No answer»)
 *   · agent_rejected_job:<mensaje> — el agente rechazó el job por no conocerlo
 *   · null en un móvil — iOS/Android no tienen sondas
 */
export function deviceReason(status, error, platform) {
  const e = String(error ?? "");
  const tooOld = /^agent_update_required:([^:]+):(.*)$/.exec(e);
  if (tooOld) return `Needs agent ${tooOld[1]} or later — this device runs ${tooOld[2] || "an older version"}`;
  if (e.startsWith("agent_rejected_job:")) return "This device's agent does not support live queries yet — update the agent";
  if (status === "unsupported") {
    const p = String(platform ?? "").toLowerCase();
    return p === "ios" || p === "android" ? "Live queries are not available on mobile devices" : e;
  }
  if (status === "error") return e;
  return "";
}
