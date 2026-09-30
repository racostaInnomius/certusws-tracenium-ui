// src/utils/jobDescribe.js
//
// La lectura para personas de un job: qué pasó (result_json) y qué se pidió
// (payload_json). El panel de Job Detail enseñaba los dos en crudo; esto es lo
// que va encima, y el crudo queda plegado debajo.
//
// ⚠️ LA GRAMÁTICA SALE DE PRODUCCIÓN, NO DE LA IMAGINACIÓN (29-sep). El result
// es casi siempre `{ source, message }` y el `message` NO es JSON, es una
// cadena con forma propia, medida sobre los 4.500 jobs de 60 días:
//
//   software_install:already_installed;deploymentId=47;reason=…;detectBefore=<b64url>
//   patch_install success; installed=2; failed=0; rebootRequired=true
//   update_skipped: latest_already_installed
//   reset_baseline:cleared:amp:browserExtensions
//   facts_enqueued:127
//
// Es decir: una cabeza con el veredicto, pares `clave=valor`, y a veces un
// base64url con JSON dentro. Plegar el crudo sin LEER esa cadena sólo habría
// escondido el problema.
//
// 🔴 EL VEREDICTO SALE DEL MENSAJE, NUNCA DEL `status`. `completed` sólo dice
// que el agente contestó: un `agent_update` completed es «el instalador
// arrancó», no «actualizado»; un `software_install` completed puede ser «ya
// estaba, no se ejecutó nada». Pintar «Success» por el estado repetiría el
// caso AnyDesk con otra cara.
//
// ⚠️ LO QUE NO SE RECONOCE SE ENSEÑA, NO SE ADIVINA. Un veredicto fuera del
// diccionario sale literal y con tono neutro; una clave desconocida sale con
// su nombre. Nada se descarta — mismo principio que `normalizeFailureCause`.

const lower = (v) => String(v ?? "").toLowerCase();

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/** `detectBefore` → "Detect before". Para las claves que no están en LABELS. */
export function humanize(key) {
  const text = String(key ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

/** Milisegundos → texto. El agente mide TODAS las duraciones en ms. */
export function formatDurationMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return String(value ?? "");
  if (n < 1000) return `${Math.round(n)} ms`;
  const s = n / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s - m * 60);
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return String(value ?? "");
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 || v >= 10 ? 0 : 1)} ${units[i]}`;
}

const yesNo = (v) => {
  const t = lower(v);
  if (t === "true" || t === "1") return "Yes";
  if (t === "false" || t === "0") return "No";
  return String(v);
};

const SOURCE_LABELS = { dp: "Distribution Point", origin: "Cloud (origin)", peer: "Peer" };
const sourceLabel = (v) => SOURCE_LABELS[lower(v)] || String(v);

/**
 * `reason=` → texto. Muchas traen el detalle tras `: `
 * (`post_state_mismatch: syscall fchmodat2 does not exist for arch b64…`): el
 * código se traduce y el detalle se deja TAL CUAL — pasarlo por `humanize`
 * lo ponía en minúsculas y le quitaba los guiones bajos a `fchmodat2`.
 */
function reasonText(value) {
  const t = String(value ?? "").trim();
  const sep = t.indexOf(": ");
  const code = sep > 0 ? t.slice(0, sep) : t;
  const detail = sep > 0 ? t.slice(sep + 2).trim() : "";
  const label = REASON_LABELS[lower(code)] || humanize(code);
  return detail ? `${label} — ${detail}` : label;
}

const REASON_LABELS = {
  pre_detect_matched: "The detection rule already matched before installing",
  pre_state_compliant: "The setting already had the expected value",
  pre_detect_absent: "The software was already absent before uninstalling",
  post_detect_still_present: "The software was still detected after the uninstaller ran",
  post_detect_mismatch: "The software was not detected after the installer ran",
  post_state_mismatch: "The setting did not have the expected value after applying",
};

// ---------------------------------------------------------------------------
// Lectura del mensaje
// ---------------------------------------------------------------------------

/**
 * Un valor que es base64url con JSON dentro → el JSON. `null` en otro caso.
 *
 * ⚠️ Decodificar no basta: `vmUuid=564d6d3b-…` también «decodifica» a basura
 * binaria. Sólo cuenta si lo que sale es un objeto o una lista JSON.
 */
export function decodeBlob(value) {
  const text = String(value ?? "").trim();
  // Sin umbral de longitud: el filtro de verdad es que salga un objeto JSON.
  if (text.length < 4 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) return null;
  try {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(decoded);
    return parsed !== null && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Parte un mensaje de ack en cabeza y pares. La cabeza se separa del resto por
 * `;`, y los pares aceptan `;` con o sin espacio (patch_install usa `; `).
 * Un trozo sin `=` no es un par: se guarda en `notes` para no perderlo.
 */
export function parseAckMessage(message) {
  const parts = String(message ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  const head = parts.shift() || "";
  const fields = [];
  const notes = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq > 0) fields.push({ key: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim() });
    else notes.push(part);
  }
  return { head, fields, notes };
}

/**
 * La cabeza → { verdict, rest }. Cuatro formas conviven en producción:
 *
 *   `software_install:success`          → prefijo = tipo, veredicto detrás
 *   `patch_install success`             → igual, separado por espacio
 *   `patch_remediate_batch:done`        → el tipo con `_batch`
 *   `update_skipped: latest_already…`   → el veredicto ES la primera palabra
 */
export function splitHead(head, jobType) {
  const text = String(head ?? "").trim();
  const m = text.match(/^([A-Za-z0-9_]+)(?:\s*:\s*|\s+)?(.*)$/);
  if (!m) return { verdict: text, rest: "", batch: false };
  const [, first, tail] = m;
  const type = lower(jobType);
  if (type && (lower(first) === type || lower(first) === `${type}_batch`)) {
    const inner = tail.match(/^([A-Za-z0-9_]+)(?:\s*:\s*(.*))?$/);
    return {
      verdict: inner ? inner[1] : tail,
      rest: inner?.[2] ?? "",
      batch: lower(first).endsWith("_batch"),
    };
  }
  return { verdict: first, rest: tail.trim(), batch: false };
}

// ---------------------------------------------------------------------------
// Diccionario de veredictos
// ---------------------------------------------------------------------------

// Cada regla recibe los pares ya en un Map y el `rest` de la cabeza, y
// devuelve { tone, headline }. Tonos: success | info | warning | error | neutral.
//
// ⚠️ El orden de las entradas es el de volumen real (agent_update, remediate,
// prefetch, live_query, install, patch_install, patch_scan ≈ 95 % de jobs).
// Un tipo que no está aquí funciona igual con la lectura genérica; sólo pierde
// la frase.
const VERDICTS = {
  agent_update: {
    // 1.676 de 1.900: el ack dice que el instalador ARRANCÓ. Quien confirma la
    // versión es el HELLO del agente al volver (agent-update-reconcile.ts).
    update_started: ({ f }) => ({
      tone: "info",
      headline: `Installer started${f.get("src") ? ` (from ${sourceLabel(f.get("src"))})` : ""} — this ack does not confirm the new version`,
    }),
    update_confirmed: ({ f }) => ({
      tone: "success",
      headline: `Update confirmed — the agent reconnected on ${f.get("version") || "the target version"}`,
    }),
    update_completed: () => ({ tone: "success", headline: "Update completed" }),
    update_skipped: ({ rest }) => ({
      tone: "neutral",
      headline: `Skipped — ${
        {
          latest_already_installed: "the latest version is already installed",
          update_already_in_progress: "another update was already in progress",
          same_version: "the agent is already on this version",
        }[lower(rest)] || humanize(rest) || "no reason given"
      }`,
    }),
  },
  patch_remediate: {
    applied: () => ({ tone: "success", headline: "Fix applied" }),
    applied_reboot_required: () => ({ tone: "warning", headline: "Fix applied — a reboot is required to take effect" }),
    already_compliant: () => ({ tone: "success", headline: "Already compliant — nothing was changed" }),
    dryrun_would_apply: () => ({ tone: "info", headline: "Dry run — the fix WOULD change this setting (nothing was changed)" }),
    dryrun_already_compliant: () => ({ tone: "info", headline: "Dry run — already compliant, the fix would change nothing" }),
    failed: () => ({ tone: "error", headline: "Fix failed" }),
  },
  software_dp_prefetch: {
    success: ({ f }) =>
      yesNo(f.get("cached")) === "Yes"
        ? { tone: "success", headline: "Package was already cached on the Distribution Point" }
        : {
            tone: "success",
            headline: `Package cached on the Distribution Point${f.get("src") ? ` (downloaded from ${sourceLabel(f.get("src"))})` : ""}`,
          },
  },
  live_query: {
    live_query_answered: ({ f }) =>
      lower(f.get("outcome")) === "unsupported"
        ? { tone: "warning", headline: "This device does not support the query" }
        : { tone: "success", headline: "Query answered" },
  },
  // 🔴 UN MISMO job_type PARA INSTALAR Y DESINSTALAR (29-sep). El modo viaja
  // en `payload.mode` y el agente contesta `software_install:<outcome>` en los
  // tres: el desinstalado de AnyDesk (a483ad46) salía como «Installed». Cada
  // veredicto significa otra cosa según el modo, así que se lee con él.
  software_install: {
    success: ({ mode }) => ({ tone: "success", headline: DONE_BY_MODE[mode] || "Installed" }),
    // `already_installed` es «ya estaba en el estado pedido»: en un uninstall
    // quiere decir que YA NO ESTABA (reason=pre_detect_absent).
    already_installed: ({ mode }) =>
      mode === "uninstall"
        ? { tone: "success", headline: "Already absent — the uninstaller was not run" }
        : { tone: "success", headline: "Already installed — the installer was not run" },
    reboot_required: ({ mode }) => ({
      tone: "warning",
      headline: `${DONE_BY_MODE[mode] || "Installed"} — a reboot is required to finish`,
    }),
    failed: ({ mode }) => ({ tone: "error", headline: `${ACTION_BY_MODE[mode] || "Install"} failed` }),
    timed_out: ({ mode }) => ({ tone: "error", headline: `${ACTION_BY_MODE[mode] || "Install"} timed out` }),
    rejected: () => ({ tone: "error", headline: "Rejected by the agent — nothing was run" }),
    signature_invalid: () => ({ tone: "error", headline: "Signature check failed — the package was not run" }),
  },
  patch_install: {
    success: ({ f }) => {
      const n = Number(f.get("installed") || 0);
      const failed = Number(f.get("failed") || 0);
      const reboot = yesNo(f.get("rebootRequired")) === "Yes";
      return {
        tone: failed > 0 || reboot ? "warning" : "success",
        headline:
          `${n} update${n === 1 ? "" : "s"} installed` +
          (failed > 0 ? `, ${failed} failed` : "") +
          (reboot ? " — reboot required" : ""),
      };
    },
    no_updates: () => ({ tone: "neutral", headline: "No updates to install" }),
    failed: ({ f }) => {
      const failed = Number(f.get("failed") || 0);
      const n = Number(f.get("installed") || 0);
      return {
        tone: "error",
        headline:
          (failed ? `${failed} update${failed === 1 ? "" : "s"} failed to install` : "Patch install failed") +
          (n ? `, ${n} installed` : ""),
      };
    },
  },
  patch_scan: {
    // El número detrás es el id de la fila en el outbox del agente: no
    // significa nada para el operador y no se enseña.
    patch_scan_enqueued: () => ({ tone: "success", headline: "Scan collected — results queued for upload" }),
    patch_scan_fresh: ({ rest }) => ({ tone: "neutral", headline: `Skipped — ${cooldownText(rest, "scan")}` }),
  },
  facts_snapshot: {
    facts_enqueued: () => ({ tone: "success", headline: "Snapshot collected — queued for upload" }),
    facts_fresh: ({ rest }) => ({ tone: "neutral", headline: `Skipped — ${cooldownText(rest, "snapshot")}` }),
  },
  reset_baseline: {
    cleared: ({ rest }) => {
      const [ns, scopes] = String(rest || "").split(":");
      return {
        tone: "success",
        headline: `Baseline cleared${ns ? ` — ${ns.toUpperCase()}` : ""}${scopes ? ` (${scopes.split(",").map(humanize).join(", ")})` : ""}`,
      };
    },
  },
  device_reboot: {
    scheduled: ({ f }) => ({
      tone: "info",
      headline: `Reboot scheduled${f.get("rebootInSec") ? ` in ${f.get("rebootInSec")} s` : ""}`,
    }),
  },
  vcenter_snapshot: {
    created: ({ f }) => ({
      tone: "success",
      headline: `Snapshot ${yesNo(f.get("reused")) === "Yes" ? "reused" : "created"}${f.get("snapshotId") ? ` (${f.get("snapshotId")})` : ""}`,
    }),
  },
  vcenter_snapshot_remove: {
    removed: ({ f }) => {
      const removed = Number(f.get("removed") || 0);
      const failed = Number(f.get("failed") || 0);
      return {
        tone: failed > 0 ? "warning" : "success",
        headline: `${removed} snapshot${removed === 1 ? "" : "s"} removed${failed > 0 ? `, ${failed} failed` : ""}`,
      };
    },
  },
  vcenter_verify: {
    ok: () => ({ tone: "success", headline: "vCenter connection verified" }),
  },
  vcenter_credential_provision: {
    stored: ({ f }) => ({
      tone: yesNo(f.get("verified")) === "Yes" ? "success" : "warning",
      headline: yesNo(f.get("verified")) === "Yes" ? "Credential stored and verified" : "Credential stored — NOT verified",
    }),
  },
  ad_discovery: {
    ad_discovery_complete: ({ f }) => ({
      tone: "success",
      headline: `AD discovery complete${f.get("computers") ? ` — ${f.get("computers")} computers` : ""}`,
    }),
  },
  ad_printers: {
    ad_printers_complete: ({ f }) => ({
      tone: "success",
      headline: `Printer discovery complete${f.get("queues") ? ` — ${f.get("queues")} print queues` : ""}`,
    }),
  },
  asp_assess: {
    asp_run_started: () => ({ tone: "info", headline: "Assessment started" }),
    asp_run_complete: ({ f }) => ({
      tone: "success",
      headline: `Assessment complete${f.get("indicators") ? ` — ${f.get("indicators")} indicators` : ""}`,
    }),
  },
};

const DONE_BY_MODE = { install: "Installed", reinstall: "Reinstalled", uninstall: "Uninstalled" };
const ACTION_BY_MODE = { install: "Install", reinstall: "Reinstall", uninstall: "Uninstall" };

// `OK` a secas lo mandan agentes viejos de varios tipos: dice que contestó y
// nada más.
const COMMON_VERDICTS = {
  ok: () => ({ tone: "neutral", headline: "The agent acknowledged the job (no detail reported)" }),
};

// Etiqueta corta de cada veredicto para el resumen de un lote.
const BATCH_LABELS = {
  failed: "failed",
  applied: "applied",
  applied_reboot_required: "applied (reboot required)",
  already_compliant: "already compliant",
  dryrun_would_apply: "would apply",
  dryrun_already_compliant: "already compliant (dry run)",
};

function cooldownText(rest, noun) {
  const m = String(rest || "").match(/cooldown_(\d+)ms/i);
  return m
    ? `the last ${noun} is only ${formatDurationMs(m[1])} old, so the agent reused it`
    : `the last ${noun} is recent, so the agent reused it`;
}

function unknownVerdict(verdict, rest) {
  const text = `${verdict} ${rest}`;
  const tone = /fail|error|denied|invalid|reject/i.test(text) ? "error" : "neutral";
  return { tone, headline: [humanize(verdict), humanize(rest)].filter(Boolean).join(" — ") || "Unrecognised result" };
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const LABELS = {
  deploymentId: "Deployment",
  remediationId: "Remediation",
  checkId: "Handler",
  exit: "Exit code",
  duration: "Duration",
  src: "Downloaded from",
  servedBy: "Served by",
  cached: "Already cached",
  peerCas: "Peer CAs",
  reason: "Reason",
  installed: "Installed",
  failed: "Failed",
  rebootRequired: "Reboot required",
  rebootScheduled: "Reboot scheduled",
  rebootInSec: "Reboot in",
  query: "Query ID",
  outcome: "Outcome",
  run: "Run ID",
  computers: "Computers",
  queues: "Print queues",
  indicators: "Indicators",
  chunks: "Chunks",
  version: "Version",
  by: "Confirmed by",
  confirmedBy: "Confirmed by",
  completedBy: "Completed by",
  fingerprintSha256: "Fingerprint (SHA-256)",
  vmUuid: "VM UUID",
  moref: "VM reference",
  snapshotId: "Snapshot",
  matchedBy: "VM matched by",
  reused: "Reused existing",
  removed: "Removed",
  ids: "Snapshot IDs",
  verified: "Verified",
  keyId: "Key ID",
  keyAlgorithm: "Key algorithm",
  keyStore: "Key store",
};

const VALUE_FORMAT = {
  duration: formatDurationMs,
  src: sourceLabel,
  servedBy: sourceLabel,
  cached: yesNo,
  rebootRequired: yesNo,
  rebootScheduled: yesNo,
  reused: yesNo,
  verified: yesNo,
  rebootInSec: (v) => `${v} s`,
  deploymentId: (v) => `#${v}`,
  remediationId: (v) => `#${v}`,
  reason: reasonText,
  outcome: humanize,
};

// Claves que ya cuenta la cabeza o que son fontanería.
const HIDDEN_KEYS = new Set(["source", "message"]);

function fact(key, value) {
  const fmt = VALUE_FORMAT[key];
  return { key, label: LABELS[key] || humanize(key), value: fmt ? fmt(value) : String(value) };
}

/** Un `writes[i]` del estado de un check → su valor legible. */
function writeValue(w) {
  if (!w) return "—";
  if (w.present === false) return "Not set";
  if (Object.prototype.hasOwnProperty.call(w, "current")) {
    return w.current === null || w.current === undefined ? "Not set" : String(w.current);
  }
  return w.present === true ? "Present" : "—";
}

function expectedValue(expected) {
  const t = String(expected ?? "");
  if (!t) return null;
  if (/\(deleted\)\s*$/i.test(t)) return "Removed";
  const eq = t.lastIndexOf("=");
  return eq >= 0 ? t.slice(eq + 1) : t;
}

/**
 * stateBefore / stateAfter de una remediación → filas «antes → después».
 * Windows trae { key, name, current, expected, matches }; Linux { kind, line,
 * present }. Se casan por posición: el agente escribe las dos listas en el
 * mismo orden, que es el de `params.writes`.
 */
export function describeStateChange(before, after) {
  const b = Array.isArray(before?.state?.writes) ? before.state.writes : [];
  const a = Array.isArray(after?.state?.writes) ? after.state.writes : [];
  const n = Math.max(b.length, a.length);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const w = b[i] || a[i] || {};
    rows.push({
      setting: w.name || w.line || w.key || `Change ${i + 1}`,
      location: w.name ? w.key || null : null,
      before: b[i] ? writeValue(b[i]) : "—",
      after: a[i] ? writeValue(a[i]) : after ? "—" : null,
      expected: expectedValue(w.expected),
      compliant: a[i] ? a[i].matches ?? null : b[i]?.matches ?? null,
    });
  }
  return {
    rows,
    compliantBefore: typeof before?.isCompliant === "boolean" ? before.isCompliant : null,
    compliantAfter: typeof after?.isCompliant === "boolean" ? after.isCompliant : null,
  };
}

function detectionText(d) {
  if (!d || typeof d !== "object") return null;
  if (d.found === false) return "Not found";
  const hit = Array.isArray(d.hits) ? d.hits[0] : null;
  const name = hit?.displayName || d.displayNameLike || "Found";
  const version = d.installedVersion || hit?.displayVersion;
  return version ? `${name} ${version}` : name;
}

const TONE_RANK = { error: 4, warning: 3, info: 2, neutral: 1, success: 0 };
const worstTone = (tones) =>
  tones.reduce((w, t) => ((TONE_RANK[t] ?? 1) > (TONE_RANK[w] ?? 1) ? t : w), "success");

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

function normalizeResult(result) {
  if (result == null) return null;
  if (typeof result === "string") {
    const t = result.trim();
    if (!t || t === "null" || t === "{}") return null;
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return normalizeResult(JSON.parse(t));
      } catch {
        /* no era JSON: es un mensaje suelto */
      }
    }
    return { message: t };
  }
  if (typeof result === "object") return Object.keys(result).length ? result : null;
  return { message: String(result) };
}

/** Un mensaje de ack de un tipo dado → lectura completa. */
function describeMessage(message, jobType, mode = null) {
  const { head, fields, notes } = parseAckMessage(message);
  const { verdict, rest, batch } = splitHead(head, jobType);
  const f = new Map(fields.map(({ key, value }) => [key, value]));

  const out = {
    code: head,
    verdict,
    tone: "neutral",
    headline: "",
    known: false,
    facts: [],
    changes: null,
    detection: [],
    stages: [],
    items: [],
    details: [],
    notes,
  };

  if (batch) {
    const items = decodeBlob(f.get("items"));
    const list = Array.isArray(items) ? items : [];
    out.items = list.map((m) => describeMessage(String(m), jobType, mode));
    // Se agrupa por VEREDICTO, no por frase: `applied` y
    // `applied_reboot_required` empiezan igual y recortando la frase salían
    // como dos grupos «fix applied» indistinguibles.
    //
    // ⚠️ Los grupos van del PEOR tono al mejor: en un lote de 25 con un fallo
    // (69b4aa78, 30-sep), «21 applied, 3 already compliant, 1 failed» enterraba
    // al final lo único que había que mirar.
    const counts = new Map();
    for (const it of out.items) {
      const label = BATCH_LABELS[lower(it.verdict)] || humanize(it.verdict).toLowerCase();
      const g = counts.get(label) || { n: 0, rank: TONE_RANK[it.tone] ?? 1 };
      g.n += 1;
      counts.set(label, g);
    }
    const groups = [...counts.entries()].sort((a, b) => b[1].rank - a[1].rank || b[1].n - a[1].n);
    out.known = true;
    out.tone = out.items.length ? worstTone(out.items.map((i) => i.tone)) : "neutral";
    out.headline =
      `Batch finished — ${list.length} fix${list.length === 1 ? "" : "es"}` +
      (groups.length ? `: ${groups.map(([label, g]) => `${g.n} ${label}`).join(", ")}` : "");
    f.delete("items");
  } else {
    const rule = VERDICTS[lower(jobType)]?.[lower(verdict)] || COMMON_VERDICTS[lower(verdict)];
    const said = rule ? rule({ f, rest, mode }) : unknownVerdict(verdict, rest);
    out.known = Boolean(rule);
    out.tone = said.tone;
    out.headline = said.headline;
  }

  // Los blobs: los que sabemos pintar, pintados; el resto, como detalle
  // plegable. Un base64 que NO decodifica a JSON se queda como dato normal.
  const blobs = new Map();
  for (const [key, value] of f) {
    const parsed = decodeBlob(value);
    if (parsed) blobs.set(key, parsed);
  }
  if (blobs.has("stateBefore") || blobs.has("stateAfter")) {
    out.changes = describeStateChange(blobs.get("stateBefore"), blobs.get("stateAfter"));
  }
  for (const [key, label] of [
    ["detectBefore", "Detected before"],
    ["detectAfter", "Detected after"],
  ]) {
    const text = detectionText(blobs.get(key));
    if (text) out.detection.push({ label, value: text });
    const min = blobs.get(key)?.minVersion;
    if (key === "detectBefore" && min) out.detection.push({ label: "Required version", value: `${min} or later` });
  }
  const report = blobs.get("report");
  if (Array.isArray(report?.stages)) {
    out.stages = report.stages.map((s) => ({
      label: humanize(s.stage),
      ok: s.ok === true,
      warn: s.warn === true,
      detail: s.detail ? String(s.detail) : "",
    }));
  }
  const rendered = new Set(["stateBefore", "stateAfter", "detectBefore", "detectAfter"]);
  if (out.stages.length) rendered.add("report");
  for (const [key, parsed] of blobs) {
    if (!rendered.has(key)) out.details.push({ key, label: LABELS[key] || humanize(key), value: parsed });
  }

  for (const [key, value] of f) {
    if (blobs.has(key) || HIDDEN_KEYS.has(key)) continue;
    // deploymentId=0 lo manda el prefetch cuando no hay despliegue detrás.
    if (key === "deploymentId" && String(value) === "0") continue;
    out.facts.push(fact(key, value));
  }
  return out;
}

// Resultados que llegan como objeto sin `message`.
const OBJECT_HEADLINES = {
  cert_rotate: () => ({ tone: "success", headline: "Certificate rotated" }),
  cdp_csr_generate: (r) =>
    r.csrPem ? { tone: "success", headline: "Certificate signing request generated" } : null,
};

/**
 * result_json → la lectura para el panel, o `null` si no hay resultado (un
 * job en curso o que nunca contestó no debe pintar un bloque vacío).
 */
export function describeJobResult(job) {
  const out = describeResultBody(job) || describeErrorAck(job);
  if (!out) return null;
  // ⚠️ El último ack NO es el final si el job acabó mal después. Pasa en
  // producción: `asp_assess` en `failed` cuyo último mensaje es
  // `asp_run_started`. Sin esto el panel diría «Assessment started» en azul
  // junto a un job fallido.
  const status = lower(job?.status);
  if (LATER_BAD.includes(status) && out.tone !== "error") out.endedAs = status;
  return out;
}

const LATER_BAD = ["failed", "timeout", "cancelled", "expired"];

/**
 * ¿`last_error` es un ack del agente y no un error de texto libre?
 *
 * 🔴 POR QUÉ HACE FALTA (30-sep). Cuando un job FALLA, el agente no manda el
 * resultado en `result_json`: el ack entero va a `last_error`. Un lote de 25
 * remediaciones con UNA fallida (69b4aa78) llegaba como 23 KB de base64 en
 * «Last Error», y «What happened» ni salía — justo en el caso en que más
 * falta leerlo.
 *
 * ⚠️ La regla es ESTRICTA: la cabeza tiene que empezar por el job_type
 * (`software_install:failed…`, `patch_remediate_batch:done…`,
 * `patch_install failed; …`). Un error libre («PrivSvc timeout: …»,
 * «closed_manually_…») no pasa y se sigue enseñando tal cual: leerlo con el
 * diccionario inventaría un veredicto.
 */
export function isAckError(job) {
  const text = String(job?.last_error ?? "").trim();
  const type = lower(job?.job_type);
  if (!text || !type) return false;
  const head = lower(text.split(";")[0]);
  return head === type || head.startsWith(`${type}:`) || head.startsWith(`${type} `) || head.startsWith(`${type}_batch:`);
}

function describeErrorAck(job) {
  if (!isAckError(job)) return null;
  const out = describeMessage(String(job.last_error).trim(), job.job_type, lower(parsePayload(job)?.mode) || null);
  out.fromError = true;
  return out;
}

/**
 * Una línea para la tabla y las listas: lo que se lee del ack si lo hay, el
 * error tal cual si no. Nunca el volcado — también va al `title` de la celda,
 * y un tooltip de 23 KB no es un tooltip.
 */
export function summarizeJobError(job) {
  const text = String(job?.last_error ?? "").trim();
  if (!text) return "";
  if (!isAckError(job)) return text.length > 300 ? `${text.slice(0, 300)}…` : text;
  const d = describeErrorAck(job);
  const failed = d.items.find((it) => it.tone === "error");
  const reason = (failed || d).facts.find((x) => x.key === "reason")?.value;
  return reason ? `${d.headline} · ${reason}` : d.headline;
}

function describeResultBody(job) {
  const result = normalizeResult(job?.result_json);
  if (!result) return null;
  const jobType = job?.job_type;

  if (typeof result.message === "string" && result.message.trim()) {
    const out = describeMessage(result.message, jobType, lower(parsePayload(job)?.mode) || null);
    // Claves extra junto al mensaje (agent_update trae version/confirmedBy
    // repetidos): sólo se añaden las que el mensaje no dijo ya.
    const seen = new Set(out.facts.map((x) => x.label));
    const said = new Set(out.facts.map((x) => x.key));
    for (const [key, value] of Object.entries(result)) {
      if (HIDDEN_KEYS.has(key) || value === null || typeof value === "object") continue;
      // `servedBy` es el mismo dato que el `src=` del mensaje, con otro nombre.
      if (key === "servedBy" && said.has("src")) continue;
      const extra = fact(key, value);
      if (!seen.has(extra.label)) {
        out.facts.push(extra);
        seen.add(extra.label);
      }
    }
    return out;
  }

  const said = OBJECT_HEADLINES[lower(jobType)]?.(result);
  const out = {
    code: null,
    verdict: null,
    tone: said?.tone || "neutral",
    headline: said?.headline || "The agent reported a result",
    known: Boolean(said),
    facts: [],
    changes: null,
    detection: [],
    stages: [],
    items: [],
    details: [],
    notes: [],
  };
  for (const [key, value] of Object.entries(result)) {
    if (HIDDEN_KEYS.has(key) || value === null || value === undefined) continue;
    // Un PEM o cualquier texto largo va a detalle, no a una fila.
    if (typeof value === "object" || (typeof value === "string" && (value.length > 120 || value.includes("\n")))) {
      out.details.push({ key, label: LABELS[key] || humanize(key), value });
    } else {
      out.facts.push(fact(key, value));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

function parsePayload(job) {
  let p = job?.payload_json ?? job?.payload ?? null;
  if (typeof p === "string") {
    try {
      p = JSON.parse(p);
    } catch {
      return null;
    }
  }
  return p && typeof p === "object" && !Array.isArray(p) ? p : null;
}

const MODE_LABELS = { apply: "Apply", dry_run: "Dry run (no changes)", install: "Install", uninstall: "Uninstall" };
const modeLabel = (v) => MODE_LABELS[lower(v)] || humanize(v);

/** Un `params.writes[i]` pedido → una línea. */
export function describeDesiredWrite(w) {
  if (!w || typeof w !== "object") return String(w ?? "");
  if (lower(w.kind) === "registry" || w.keyPath) {
    const path = [w.hive, w.keyPath].filter(Boolean).join("\\");
    if (lower(w.valueType) === "delete") return `Remove ${path}\\${w.valueName}`;
    return `${path}\\${w.valueName} = ${w.value}${w.valueType ? ` (${w.valueType})` : ""}`;
  }
  if (w.line) return `${w.present === false ? "Remove" : "Ensure"} ${humanize(w.kind || "line").toLowerCase()}: ${w.line}`;
  const compact = Object.entries(w)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return compact || JSON.stringify(w);
}

// ⚠️ Las fuentes de un paquete son URLs SAS firmadas: aquí sólo se dice DE
// DÓNDE se baja, nunca la URL.
const sourcesText = (sources) =>
  Array.isArray(sources) && sources.length
    ? sources.map((s) => sourceLabel(s?.tier || "unknown")).join(", then ")
    : null;

const PAYLOADS = {
  software_install: (p) => {
    const pkg = p.packageSnapshot || {};
    return {
      facts: [
        ["Package", [pkg.name, pkg.version].filter(Boolean).join(" ")],
        ["Vendor", pkg.vendor],
        ["Platform", [pkg.platform, pkg.format, pkg.arch && pkg.arch !== "any" ? pkg.arch : null].filter(Boolean).join(" · ")],
        ["Action", p.mode ? modeLabel(p.mode) : null],
        ["Deployment", p.deploymentId ? `#${p.deploymentId}` : null],
        ["Download from", sourcesText(p.sources)],
      ],
    };
  },
  software_dp_prefetch: (p) => ({
    facts: [
      ["Purpose", p.purpose ? humanize(p.purpose) : null],
      ["Agent version", p.agentVersion],
      ["Package", p.packageId ? `#${p.packageId}` : null],
      ["Deployment", p.deploymentId ? `#${p.deploymentId}` : null],
      ["Format", p.format],
      ["Size", p.sizeBytes != null ? formatBytes(p.sizeBytes) : null],
      ["Download from", sourcesText(p.sources)],
    ],
  }),
  patch_install: (p) => ({
    facts: [
      ["Action", p.mode ? modeLabel(p.mode) : null],
      ["Reboot if required", p.rebootIfRequired != null ? yesNo(p.rebootIfRequired) : null],
    ],
    // Una lista vacía se dice tal cual: no sabemos qué instalará el agente.
    list: { label: "Updates", items: Array.isArray(p.kbArticleIds) ? p.kbArticleIds.map(String) : [], empty: "None listed" },
  }),
  patch_remediate: (p) => {
    if (Array.isArray(p.items)) {
      return {
        facts: [["Fixes", String(p.items.length)]],
        list: {
          label: "Checks",
          items: p.items.map((it) => it?.checkSnapshot?.title || it?.checkId || "Unnamed check"),
        },
      };
    }
    const snap = p.checkSnapshot || {};
    const writes = Array.isArray(p.params?.writes) ? p.params.writes : snap.desiredWrites;
    return {
      facts: [
        ["Check", snap.title ? (snap.revertOf ? `Revert: ${snap.title}` : snap.title) : p.checkId],
        ["Severity", snap.severity ? humanize(snap.severity) : null],
        ["Platform", snap.platform ? humanize(snap.platform) : null],
        ["Action", p.mode ? modeLabel(p.mode) : null],
        ["Reverts", snap.revertOf?.remediationId ? `Remediation #${snap.revertOf.remediationId}` : null],
      ],
      list: Array.isArray(writes) && writes.length ? { label: "Changes", items: writes.map(describeDesiredWrite) } : null,
    };
  },
  agent_update: (p) => ({ facts: [["Target version", p.version]] }),
  facts_snapshot: (p) => ({ facts: [["Snapshot", p.factType ? humanize(p.factType) : null]] }),
  live_query: (p) => ({
    facts: [
      ["Probe", p.probe],
      ["Query ID", p.queryId],
      ["Parameters", p.params && Object.keys(p.params).length ? JSON.stringify(p.params) : null],
    ],
  }),
  reset_baseline: (p) => ({
    facts: [
      ["Namespace", p.namespace ? String(p.namespace).toUpperCase() : null],
      ["Scopes", Array.isArray(p.scopes) && p.scopes.length ? p.scopes.map(humanize).join(", ") : "All"],
    ],
  }),
  device_reboot: (p) => ({ facts: [["When", p.when ? humanize(p.when) : null]] }),
  cert_rotate: (p) => ({ facts: [["Reason", p.reason ? humanize(p.reason) : null]] }),
  vcenter_snapshot: (p) => ({
    facts: [
      ["Snapshot name", p.name],
      ["Description", p.description],
      ["Target VM", p.target?.uuid || p.target?.serial],
      ["Deployment", p.deploymentId ? `#${p.deploymentId}` : null],
    ],
  }),
  vcenter_snapshot_remove: (p) => ({
    facts: [["Snapshots", Array.isArray(p.snapshots) ? String(p.snapshots.length) : null]],
  }),
  vcenter_credential_provision: (p) => ({
    facts: [
      ["Reference", p.ref],
      ["Credential", p.envelope ? "Encrypted — not shown" : null],
    ],
  }),
  ad_discovery: (p) => ({ facts: [["Trigger", p.trigger ? humanize(p.trigger) : null], ["Run ID", p.runId]] }),
  ad_printers: (p) => ({ facts: [["Trigger", p.trigger ? humanize(p.trigger) : null], ["Run ID", p.runId]] }),
  asp_assess: (p) => ({
    facts: [
      ["Domain", p.domain],
      ["Catalog", [p.catalogFamily, p.catalogVersion].filter(Boolean).join(" ")],
      ["Time budget", p.budgetSeconds ? formatDurationMs(Number(p.budgetSeconds) * 1000) : null],
      ["Indicators", Array.isArray(p.indicators) ? String(p.indicators.length) : null],
      ["Trigger", p.trigger ? humanize(p.trigger) : null],
    ],
  }),
  cdp_csr_generate: (p) => ({
    facts: [
      ["Subject", typeof p.subject === "string" ? p.subject : p.subject ? JSON.stringify(p.subject) : null],
      ["Key ID", p.keyId],
    ],
    list: Array.isArray(p.dnsNames) && p.dnsNames.length ? { label: "DNS names", items: p.dnsNames.map(String) } : null,
  }),
};

function genericPayload(p) {
  return {
    facts: Object.entries(p)
      .filter(([k, v]) => v !== null && v !== undefined && typeof v !== "object" && !SECRET_KEY.test(k))
      .map(([k, v]) => [humanize(k), typeof v === "string" && /^https?:\/\//i.test(v) ? "(link)" : String(v)]),
  };
}

/**
 * payload_json → { facts: [{label, value}], list: {label, items, empty?} | null }.
 * Siempre devuelve algo: sin payload, `facts` vacío y el panel dice «No
 * parameters».
 */
export function describeJobPayload(job) {
  const p = parsePayload(job);
  if (!p || !Object.keys(p).length) return { facts: [], list: null };
  const rule = PAYLOADS[lower(job?.job_type)];
  let described;
  try {
    described = rule ? rule(p) : genericPayload(p);
  } catch {
    // Un payload con una forma que la regla no esperaba no puede tumbar el
    // panel: cae a la lectura genérica.
    described = genericPayload(p);
  }
  return {
    facts: (described.facts || [])
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
      .map(([label, value]) => ({ label, value: String(value) })),
    list: described.list || null,
  };
}

// ---------------------------------------------------------------------------
// Crudo
// ---------------------------------------------------------------------------

const SECRET_KEY = /^(envelope|password|passwd|secret|token|api_?key|private_?key|credentials?)$/i;

/**
 * Copia para enseñar en crudo con lo sensible tapado.
 *
 * ⚠️ Plegado no es privado: cualquiera con acceso a Jobs lo despliega. Y lo
 * que había dentro, medido: las fuentes de un paquete son URLs SAS con su
 * `sig=` (vivas hasta que caducan) y el provisionado de vCenter lleva la
 * credencial en `envelope`. Cifrada, pero no tiene por qué estar en pantalla.
 * «Copy JSON» copia ESTA versión — lo que va a un ticket de soporte tampoco
 * necesita la firma.
 */
export function redactForDisplay(value) {
  if (typeof value === "string") {
    return value.replace(/([?&]sig=)[^&\s"]+/gi, "$1REDACTED");
  }
  if (Array.isArray(value)) return value.map(redactForDisplay);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY.test(k) && v !== null && v !== undefined ? "[redacted]" : redactForDisplay(v);
    }
    return out;
  }
  return value;
}

/** El crudo, como texto: el JSON (tapado) o el string tal cual si no lo es. */
export function rawJsonText(value) {
  if (value == null) return "";
  if (typeof value === "string") {
    const t = value.trim();
    try {
      return JSON.stringify(redactForDisplay(JSON.parse(t)), null, 2);
    } catch {
      return redactForDisplay(t);
    }
  }
  return JSON.stringify(redactForDisplay(value), null, 2);
}
