// src/components/AssetsDashboard/deviceVisuals.js
//
// Lo que la ficha de un equipo decide ANTES de pintar: qué pestañas hay y en
// qué orden, y de qué color va cada medidor. Puro, para poder probarlo sin
// montar la ficha.

/**
 * Pestañas de la ficha. Agent va primero —es lo que se abre— y el resto por
 * orden alfabético, como la barra de Asset Management.
 *
 * El `value` es lo que guarda el estado y lo que usan los enlaces que abren la
 * ficha en una pestaña concreta; el orden es sólo de presentación.
 */
export const DEVICE_DETAIL_TABS = [
  { value: "agent", label: "Agent" },
  { value: "activity", label: "Activity" },
  { value: "experience", label: "Experience" },
  { value: "hardware", label: "Hardware" },
  { value: "location", label: "Location" },
  { value: "printers", label: "Printers" },
  { value: "software", label: "Software" },
];

/**
 * Mismo umbral que la lista "Disk almost full" de Hardware Inventory
 * (`DISK_WARN_PCT` en el backend, hardware-fleet.ts). Si la ficha pintara en
 * ámbar a partir de otro número, un equipo saldría "bien" aquí y en la lista
 * de atención allí.
 */
export const DISK_WARN_PCT = 85;
export const DISK_CRITICAL_PCT = 95;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Tono del medidor de disco. `muted` cuando no hay medida: null no es 0, y
 * pintar un disco "vacío y sano" porque no llegó el dato sería mentir.
 */
export function diskTone(pct) {
  const n = finite(pct);
  if (n === null) return "muted";
  if (n >= DISK_CRITICAL_PCT) return "critical";
  if (n >= DISK_WARN_PCT) return "caution";
  return "positive";
}

/** La batería va al revés que el disco: lo malo es que BAJE. */
export function batteryTone(pct) {
  const n = finite(pct);
  if (n === null) return "muted";
  if (n <= 15) return "critical";
  if (n <= 30) return "caution";
  return "positive";
}

/** Porcentaje acotado a 0–100 para la barra, o null si no hay medida. */
export function meterValue(pct) {
  const n = finite(pct);
  if (n === null) return null;
  return Math.min(100, Math.max(0, n));
}

/** Espacio libre en bytes, o null si falta alguno de los dos extremos. */
export function freeBytes(total, used) {
  const t = finite(total);
  const u = finite(used);
  if (t === null || u === null || t <= 0 || u < 0) return null;
  return Math.max(0, t - u);
}

/**
 * Tono de la versión del agente frente a la última publicada, con el mismo
 * cubo que usa la tabla de equipos (`bucketOfVersion`). Sin última versión
 * conocida no se opina: `muted`, no "al día".
 */
export function versionTone(bucket) {
  if (bucket === "current") return "positive";
  if (bucket === "one_behind") return "caution";
  if (bucket === "older") return "critical";
  return "muted";
}

/** Tono del ciclo de vida del SO, a partir del que ya calcula getOsLifecycle. */
export function lifecycleTone(tone) {
  if (tone === "critical") return "critical";
  if (tone === "warning") return "caution";
  if (tone === "positive") return "positive";
  return "muted";
}
