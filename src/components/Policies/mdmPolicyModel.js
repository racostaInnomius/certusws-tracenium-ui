// src/components/Policies/mdmPolicyModel.js
//
// Modelo puro de la pestaña Policies de MDM / MAM (rediseño 1-oct-2026).
//
// Las tres políticas —macOS, iPhone & iPad y la app (MAM)— son tres dominios
// del MISMO documento del tenant, cada uno con su guardado. Aquí vive lo que
// la pestaña necesita saber de cada una sin montar nada: qué hay puesto, qué
// cambió sin guardar, qué valor no vale, qué llega de verdad al equipo y qué
// se enseña al buscar o filtrar.

import { MAM_BOOL_KEYS, MAM_IDLE_MAX, MAM_IDLE_MIN, managedAppFormToPolicy } from "./policyTransforms";

export const POLICY_KINDS = ["macos", "ios", "app"];

/** Lee un valor del bloque de política por su ruta con puntos. */
export function readByPath(block, key) {
  const parts = String(key).split(".").slice(1); // quita el prefijo de plataforma
  let node = block;
  for (const p of parts) {
    if (node === null || node === undefined || typeof node !== "object") return undefined;
    node = node[p];
  }
  return node;
}

/**
 * Escribe (o borra) un valor por ruta, devolviendo un bloque NUEVO.
 * `undefined` elimina la clave y poda los objetos que queden vacíos — así
 * el documento guardado solo contiene lo que el operador configuró de
 * verdad, sin objetos vacíos que el consumidor tenga que interpretar.
 */
export function writeByPath(block, key, value) {
  const parts = String(key).split(".").slice(1);
  const clone = structuredClone(block ?? {});

  const walk = (node, idx) => {
    const p = parts[idx];
    if (idx === parts.length - 1) {
      if (value === undefined) delete node[p];
      else node[p] = value;
      return;
    }
    if (node[p] === null || typeof node[p] !== "object") node[p] = {};
    walk(node[p], idx + 1);
    if (Object.keys(node[p]).length === 0) delete node[p];
  };

  walk(clone, 0);
  return clone;
}

/**
 * JSON con las claves ordenadas. Quitar un ajuste y volver a ponerlo lo
 * movía al final del objeto, y la comparación con `JSON.stringify` daba
 * «Unsaved changes» con los mismos valores.
 */
export function stableStringify(value) {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export const sameValue = (a, b) => stableStringify(a) === stableStringify(b);

export const isSet = (value) => value !== undefined && value !== null && value !== "";

// Etiquetas de los grupos que salen de la clave (`macos.<grupo>.<ajuste>`).
// Un grupo nuevo del catálogo sin entrada aquí se lee igual («menuBar» →
// «Menu bar»); antes salía la clave en mayúsculas: «PASSWORDPOLICY».
const GROUP_LABELS = {
  desktop: "Desktop",
  screen: "Screen saver & lock",
  apps: "Apps",
  softwareUpdate: "Software updates",
  sharing: "Sharing",
  privacy: "Privacy & analytics",
  intelligence: "Apple Intelligence",
  siri: "Siri",
  icloud: "iCloud",
  terminal: "Terminal",
  menuBar: "Menu bar",
  loginWindow: "Login window",
  passwordPolicy: "Passwords",
  passcode: "Passcode",
  safari: "Safari",
  general: "General",
};

export function groupLabel(name) {
  if (GROUP_LABELS[name]) return GROUP_LABELS[name];
  const words = String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "General";
}

/** «Safari: show the full website address» bajo Safari → «Show the full website address». */
export function settingLabel(setting, group) {
  const label = String(setting?.label || setting?.key || "");
  const prefix = `${groupLabel(group)}: `;
  if (label.length > prefix.length && label.toLowerCase().startsWith(prefix.toLowerCase())) {
    const rest = label.slice(prefix.length);
    return rest[0].toUpperCase() + rest.slice(1);
  }
  return label;
}

/** Unidad del valor, por el nombre de la clave. */
export function unitFor(setting) {
  const key = String(setting?.key || "");
  if (/Seconds$/.test(key)) return "sec";
  if (/Days$/.test(key)) return "days";
  return null;
}

/** El rango de un entero, para el texto de ayuda: «60–3600». */
export function rangeText(spec) {
  if (spec?.min === undefined && spec?.max === undefined) return null;
  if (spec.max === undefined) return `${spec.min} or more`;
  if (spec.min === undefined) return `${spec.max} or less`;
  return `${spec.min}–${spec.max}`;
}

/** Por qué un valor no vale, o null. Un valor así no se puede guardar. */
export function settingIssue(setting, value) {
  const spec = setting?.spec || {};
  if (!isSet(value)) return null;
  if (spec.kind === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) return "Enter a whole number";
    if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) {
      return `Must be ${rangeText(spec)}`;
    }
  }
  if (spec.kind === "string" && spec.maxLength && String(value).length > spec.maxLength) {
    return `${spec.maxLength} characters at most`;
  }
  if (spec.kind === "string" && spec.pattern && !new RegExp(spec.pattern).test(String(value))) {
    return spec.patternHint || "Not a valid value";
  }
  if (spec.kind === "localDateTime" && !isLocalDateTime(value)) return "Pick a date and time";
  return null;
}

/** `yyyy-mm-ddThh:mm:ss` sin zona y que sea una fecha de verdad (como el backend). */
export function isLocalDateTime(value) {
  const m = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[4] < 24 && +m[5] < 60 && +m[6] < 60;
}

/**
 * Ajustes que sólo valen juntos (`requires` del catálogo: la versión mínima y
 * su fecha límite). En la fila del que FALTA: «Needed with “…”». PURO.
 */
export function pairingIssue(setting, block, settingsByKey) {
  if (isSet(readByPath(block, setting.key))) return null;
  for (const other of settingsByKey.values()) {
    if (other.requires === setting.key && isSet(readByPath(block, other.key))) {
      return `Needed with “${other.label || other.key}”`;
    }
  }
  return null;
}

/**
 * Qué llega de verdad al equipo (backend `profileDeliveryOf`, 1-oct):
 *   - "sent":    el perfil de la organización lo escribe.
 *   - "partial": un booleano que sólo se escribe con uno de sus valores.
 *   - "saved":   nada lo entrega; queda en la política y ya.
 *   - "unknown": un backend anterior que no lo dice — no se afirma nada.
 */
export function deliveryOf(setting) {
  if (!setting || !("delivery" in setting)) return { state: "unknown" };
  const d = setting.delivery;
  if (!d) return { state: "saved" };
  if (Array.isArray(d.values) && d.values.length) return { state: "partial", values: d.values, by: d.by };
  // `by`: "profile" (el perfil de la organización) o "ddm" (una declaración).
  return { state: "sent", by: d.by };
}

/** Si ESTE valor llega al equipo. «Not set» siempre «llega»: no escribe nada. */
export function valueIsDelivered(setting, value) {
  if (!isSet(value)) return true;
  const d = deliveryOf(setting);
  if (d.state === "saved") return false;
  if (d.state === "partial") return d.values.includes(value);
  return true;
}

/** Cifras de una política MDM contra el catálogo de su plataforma. */
export function platformStats(groups, block, loadedBlock) {
  let total = 0;
  let configured = 0;
  const changed = [];
  const issues = [];
  const notDelivered = [];
  const byKey = new Map((groups || []).flatMap((g) => g.items.map((s) => [s.key, s])));
  for (const g of groups || []) {
    for (const s of g.items) {
      total += 1;
      const value = readByPath(block, s.key);
      if (isSet(value)) configured += 1;
      if (!sameValue(value, readByPath(loadedBlock, s.key))) changed.push(s.key);
      const issue = settingIssue(s, value) || pairingIssue(s, block, byKey);
      if (issue) issues.push({ key: s.key, label: settingLabel(s, g.name), issue });
      if (!valueIsDelivered(s, value)) notDelivered.push(s.key);
    }
  }
  return { total, configured, changed, issues, notDelivered };
}

/**
 * Los grupos que se enseñan con la búsqueda y el filtro. «Configured» deja
 * también lo que se acaba de cambiar: un ajuste que se pone en «Not set» no
 * desaparece de debajo del cursor hasta guardar.
 */
export function filterGroups(groups, { block, loadedBlock, query = "", onlyConfigured = false } = {}) {
  const q = String(query).trim().toLowerCase();
  return (groups || [])
    .map((g) => ({
      ...g,
      items: g.items.filter((s) => {
        if (onlyConfigured && !isSet(readByPath(block, s.key)) && !isSet(readByPath(loadedBlock, s.key))) return false;
        if (!q) return true;
        return [s.label, s.description, s.key, groupLabel(g.name)].some((t) => String(t || "").toLowerCase().includes(q));
      }),
    }))
    .filter((g) => g.items.length > 0);
}

// ── MAM ──────────────────────────────────────────────────────────────

export const MAM_TOTAL = MAM_BOOL_KEYS.length + 2;

/** Por qué un valor de la app no vale, o null. */
export function mamIssues(form) {
  const out = [];
  const idle = form?.idleTimeoutSeconds;
  if (isSet(idle)) {
    const n = Number(idle);
    if (!Number.isInteger(n) || n < MAM_IDLE_MIN || n > MAM_IDLE_MAX) {
      // Sin esto, `managedAppFormToPolicy` lo tiraba en silencio al guardar.
      out.push({ key: "idleTimeoutSeconds", label: "Idle timeout", issue: `Must be ${MAM_IDLE_MIN}–${MAM_IDLE_MAX}` });
    }
  }
  return out;
}

export function mamStats(form, loadedForm) {
  const keys = [...MAM_BOOL_KEYS, "idleTimeoutSeconds", "minimumAppVersion"];
  const norm = (k, v) => (k === "minimumAppVersion" ? String(v ?? "").trim() : v ?? null);
  const changed = keys.filter((k) => !sameValue(norm(k, form?.[k]), norm(k, loadedForm?.[k])));
  const configured = Object.keys(managedAppFormToPolicy(form || {}) || {}).length;
  return { total: MAM_TOTAL, configured, changed, issues: mamIssues(form) };
}

// ── Recarga tras guardar ─────────────────────────────────────────────

/**
 * Guardar UNA política recarga el documento entero, y antes eso borraba sin
 * avisar lo que estuviera a medio editar en las otras dos. Ahora se conserva
 * lo editado de cada política de `keep` si en el servidor sigue igual que
 * cuando se cargó; si cambió (lo guardó otra persona), manda el servidor y la
 * política sale en `replaced` para decirlo.
 */
export function keepEditsAfterReload({ server, loaded, current, keep = [] }) {
  const values = { ...server };
  const replaced = [];
  for (const kind of keep) {
    if (!(kind in server)) continue;
    if (loaded && sameValue(server[kind], loaded[kind])) values[kind] = current[kind];
    else replaced.push(kind);
  }
  return { values, replaced };
}

export const POLICY_NAMES = { macos: "macOS", ios: "iPhone & iPad", app: "app (MAM)" };

/**
 * A quién llega cada política hoy, para su tarjeta: la diferencia que la
 * pantalla anterior escondía en un párrafo (macOS se entrega, iPhone & iPad
 * sólo se guarda, la app la aplica ella misma).
 */
export function policyReach(kind, { macCount = 0, appCount = 0 } = {}) {
  const s = (n) => (n === 1 ? "" : "s");
  if (kind === "macos") {
    return {
      tone: macCount ? "positive" : "muted",
      label: "Sent by MDM",
      detail: macCount ? `Reaches ${macCount} Mac${s(macCount)} enrolled in MDM` : "No Macs enrolled in MDM yet",
    };
  }
  if (kind === "ios") return { tone: "caution", label: "Not sent yet", detail: "Saved in the policy only" };
  return {
    tone: appCount ? "positive" : "muted",
    label: "Applied by the app",
    detail: appCount ? `${appCount} device${s(appCount)} with the app` : "No devices with the app yet",
  };
}

/** Si una política tiene cambios sin guardar (no depende del catálogo). */
export function policyDirty(kind, edits, baseline) {
  if (!baseline) return false;
  if (kind === "app") return mamStats(edits?.app, baseline.app).changed.length > 0;
  return !sameValue(edits?.[kind] || {}, baseline[kind] || {});
}
