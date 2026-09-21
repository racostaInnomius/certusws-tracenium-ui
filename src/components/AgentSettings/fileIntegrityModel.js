// src/components/AgentSettings/fileIntegrityModel.js
//
// ADR-0027 — el bloque `compliance.fileIntegrity` en el formulario de Agent
// Settings: leerlo de la política, validarlo como lo valida el servidor y
// escribirlo de vuelta sin perder nada.
//
// ⚠️ Existe sobre todo por una razón: el formulario RECONSTRUYE `compliance`
// al guardar. Antes de esto sólo conocía el intervalo, así que guardar la
// sección de Security Compliance borraba en silencio los conjuntos que alguien
// hubiera declarado a mano en Advanced.
//
// Mismas reglas que certusws-tracenium/modules/file-integrity/file-integrity-policy.ts:
// si divergen, el servidor rechaza el guardado con el campo exacto — ruidoso,
// no silencioso.

export const FIM_LIMITS = Object.freeze({
  maxSets: 25,
  maxPathChars: 512,
  maxDepth: 8,
  defaultMaxDepth: 4,
  defaultMaxFilesPerDevice: 5000,
  maxFilesPerDeviceCeiling: 20000,
  defaultMaxFileMb: 8,
  maxFileMbCeiling: 64,
});

export const PLATFORM_OPTIONS = [
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
  { value: "any", label: "Any" },
];

export const PURPOSE_OPTIONS = [
  { value: "system", label: "System files" },
  // PCI DSS 10.3.4 habla de los registros de auditoría: sólo un conjunto así
  // lo evidencia en Security Compliance.
  { value: "audit_logs", label: "Audit logs" },
  { value: "application", label: "Application" },
];

/**
 * Conjuntos sugeridos. Puntos de partida razonables para cada sistema, no una
 * lista oficial de nadie: el tenant decide. Lo que cambia a diario (temporales,
 * cachés) queda fuera a propósito — un conjunto ruidoso acaba sin mirarse.
 */
export const SUGGESTED_SETS = [
  { id: "windows-hosts", label: "Hosts file", platform: "windows", purpose: "system", path: "C:\\Windows\\System32\\drivers\\etc", recursive: false },
  { id: "windows-tasks", label: "Scheduled tasks", platform: "windows", purpose: "system", path: "C:\\Windows\\System32\\Tasks", recursive: true, maxDepth: 4 },
  { id: "windows-startup", label: "Startup folder (all users)", platform: "windows", purpose: "system", path: "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp", recursive: false },
  { id: "windows-event-logs", label: "Event logs", platform: "windows", purpose: "audit_logs", path: "C:\\Windows\\System32\\winevt\\Logs", recursive: false },
  { id: "linux-etc", label: "System configuration (/etc)", platform: "linux", purpose: "system", path: "/etc", recursive: true, maxDepth: 3 },
  { id: "linux-audit-logs", label: "Audit logs (/var/log/audit)", platform: "linux", purpose: "audit_logs", path: "/var/log/audit", recursive: false },
  { id: "macos-launchdaemons", label: "Launch daemons", platform: "macos", purpose: "system", path: "/Library/LaunchDaemons", recursive: false },
  { id: "macos-launchagents", label: "Launch agents (all users)", platform: "macos", purpose: "system", path: "/Library/LaunchAgents", recursive: false },
];

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PLATFORMS = new Set(PLATFORM_OPTIONS.map((o) => o.value));
const PURPOSES = new Set(PURPOSE_OPTIONS.map((o) => o.value));

/** Un id estable a partir del nombre visible: `Event logs` → `event-logs`. */
export function slugify(label, taken = new Set()) {
  const base =
    String(label ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || "set";
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/** Absoluta, sin comodines y sin `..`. */
export function pathProblem(raw) {
  const p = String(raw ?? "").trim();
  if (!p) return "Required.";
  if (p.length > FIM_LIMITS.maxPathChars) return `At most ${FIM_LIMITS.maxPathChars} characters.`;
  if (/[*?]/.test(p)) return "No wildcards: declare a folder, and turn on subfolders if you need them.";
  if (p.split(/[\\/]+/).some((seg) => seg === "..")) return "“..” is not allowed.";
  if (!(/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\") || p.startsWith("/"))) {
    return "Must be absolute (C:\\… or /…).";
  }
  return null;
}

/** El bloque de la política → la forma del formulario. null = no hay nada declarado. */
export function readFileIntegrityForm(block) {
  if (!block || typeof block !== "object" || Array.isArray(block)) return null;
  const sets = (Array.isArray(block.sets) ? block.sets : []).map((s) => ({
    id: typeof s?.id === "string" ? s.id : "",
    label: typeof s?.label === "string" ? s.label : "",
    platform: PLATFORMS.has(s?.platform) ? s.platform : "any",
    purpose: PURPOSES.has(s?.purpose) ? s.purpose : "system",
    path: typeof s?.path === "string" ? s.path : "",
    recursive: s?.recursive === true,
    maxDepth: Number.isInteger(s?.maxDepth) ? s.maxDepth : FIM_LIMITS.defaultMaxDepth,
  }));
  return {
    enabled: block.enabled === undefined ? sets.length > 0 : block.enabled === true,
    sets,
    maxFilesPerDevice: Number.isInteger(block.maxFilesPerDevice) ? block.maxFilesPerDevice : null,
    // El formulario habla en MB; la política, en bytes.
    maxFileMb: Number.isInteger(block.maxFileBytes) ? Math.round(block.maxFileBytes / (1024 * 1024)) : null,
  };
}

/** Los problemas del bloque, por campo, con los índices que usa el servidor. */
export function fileIntegrityProblems(form) {
  const problems = [];
  if (!form) return problems;
  const sets = Array.isArray(form.sets) ? form.sets : [];
  if (sets.length > FIM_LIMITS.maxSets) problems.push({ field: "sets", message: `At most ${FIM_LIMITS.maxSets} watched sets.` });
  const seen = new Set();
  sets.forEach((s, i) => {
    if (!ID_RE.test(String(s.id ?? ""))) problems.push({ field: `sets[${i}].id`, message: "Give it a name." });
    else if (seen.has(s.id)) problems.push({ field: `sets[${i}].id`, message: `Two sets are called “${s.id}”.` });
    else seen.add(s.id);
    const pp = pathProblem(s.path);
    if (pp) problems.push({ field: `sets[${i}].path`, message: pp });
    const d = Number(s.maxDepth);
    if (s.recursive && (!Number.isInteger(d) || d < 1 || d > FIM_LIMITS.maxDepth)) {
      problems.push({ field: `sets[${i}].maxDepth`, message: `Between 1 and ${FIM_LIMITS.maxDepth} levels.` });
    }
  });
  const mf = form.maxFilesPerDevice;
  if (mf !== null && mf !== undefined && mf !== "" && (!Number.isInteger(Number(mf)) || Number(mf) < 1 || Number(mf) > FIM_LIMITS.maxFilesPerDeviceCeiling)) {
    problems.push({ field: "maxFilesPerDevice", message: `Between 1 and ${FIM_LIMITS.maxFilesPerDeviceCeiling}.` });
  }
  const mb = form.maxFileMb;
  if (mb !== null && mb !== undefined && mb !== "" && (!Number.isInteger(Number(mb)) || Number(mb) < 1 || Number(mb) > FIM_LIMITS.maxFileMbCeiling)) {
    problems.push({ field: "maxFileMb", message: `Between 1 and ${FIM_LIMITS.maxFileMbCeiling} MB.` });
  }
  return problems;
}

/**
 * La forma del formulario → el bloque de la política. Omite lo que el
 * operador no puso, para que el servidor aplique sus valores por defecto.
 * null = no escribir el bloque.
 */
export function fileIntegrityToPolicy(form) {
  if (!form || typeof form !== "object") return null;
  const block = {
    enabled: form.enabled === true,
    sets: (Array.isArray(form.sets) ? form.sets : []).map((s) => {
      const out = {
        id: String(s.id ?? "").trim().toLowerCase(),
        platform: PLATFORMS.has(s.platform) ? s.platform : "any",
        purpose: PURPOSES.has(s.purpose) ? s.purpose : "system",
        path: String(s.path ?? "").trim(),
        recursive: s.recursive === true,
      };
      if (typeof s.label === "string" && s.label.trim()) out.label = s.label.trim();
      if (s.recursive === true && Number.isInteger(Number(s.maxDepth))) out.maxDepth = Number(s.maxDepth);
      return out;
    }),
  };
  const mf = Number(form.maxFilesPerDevice);
  if (form.maxFilesPerDevice !== null && form.maxFilesPerDevice !== "" && Number.isInteger(mf)) block.maxFilesPerDevice = mf;
  const mb = Number(form.maxFileMb);
  if (form.maxFileMb !== null && form.maxFileMb !== "" && Number.isInteger(mb)) block.maxFileBytes = mb * 1024 * 1024;
  return block;
}
