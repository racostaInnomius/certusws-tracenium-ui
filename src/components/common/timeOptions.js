// src/components/common/timeOptions.js
//
// La lista de horas de BrandTimeField. PURO — sin React.
//
// ⚠️ POR QUÉ EXISTE (21-sep). Los campos de hora eran `<input type="time">`
// nativos, y el desplegable que abren lo dibuja el NAVEGADOR: azul por defecto,
// sin forma de cambiarlo. `accent-color` no le llega —según MDN sólo aplica a
// checkbox, radio, range y progress— y ningún selector CSS alcanza esa ventana.
// La única manera de que lleve la marca es no usar el control nativo.
//
// El valor sigue siendo «HH:MM» en 24 h, el mismo contrato que tenía el input
// nativo, así que quien lo usa no cambia. Lo que se ENSEÑA sigue el formato del
// navegador («10:00 PM» o «22:00»), igual que hacía el nativo.

/** «HH:MM» → minutos desde medianoche, o null si no es una hora. */
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function toHHMM(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Cómo se lee una hora, en el formato del navegador (o de `locale`). */
export function formatTimeLabel(hhmm, locale) {
  const min = toMinutes(hhmm);
  if (min == null) return String(hhmm ?? "");
  const d = new Date(Date.UTC(2000, 0, 1, Math.floor(min / 60), min % 60));
  try {
    // Dos dígitos en la hora, como el nativo («02:00 p.m.», «00:30»).
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d);
  } catch {
    return toHHMM(min);
  }
}

/**
 * `[{ value: "HH:MM", label }]` cada `stepMinutes`, de 00:00 a 23:45.
 *
 * `extra` —la hora ya guardada— entra siempre, en su sitio, aunque no caiga en
 * un paso: editar una ventana de las 22:10 no puede convertirla en 22:00 sin
 * que nadie lo haya pedido (la misma regla que el selector de zona horaria).
 */
export function buildTimeOptions({ stepMinutes = 15, extra, locale } = {}) {
  const step = Number.isInteger(stepMinutes) && stepMinutes > 0 && stepMinutes <= 60 ? stepMinutes : 15;
  const set = new Set();
  for (let m = 0; m < 1440; m += step) set.add(m);
  const extraMin = toMinutes(extra);
  if (extraMin != null) set.add(extraMin);
  return Array.from(set)
    .sort((a, b) => a - b)
    .map((m) => {
      const value = toHHMM(m);
      return { value, label: formatTimeLabel(value, locale) };
    });
}

/** El valor normalizado a «HH:MM» (acepta «9:05»), o "" si no es una hora. */
export function normalizeTime(hhmm) {
  const m = toMinutes(hhmm);
  return m == null ? "" : toHHMM(m);
}
