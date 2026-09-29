// src/components/Reports/reportParams.js
//
// Pure helpers behind ReportParamsDialog (validation + month defaults),
// kept out of the component file so it only exports components.

import { captureStatusMeta, deviceCapturedAt } from "../AssetsDashboard/evidenceView";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Las clases de parámetro que esta pantalla SABE pintar.
 *
 * ⚠️ Existe porque el diálogo caía a un campo de mes para cualquier clase que
 * no reconociera: un tipo nuevo con un parámetro nuevo no fallaba, mandaba un
 * `YYYY-MM` donde el servidor esperaba otra cosa — y el informe salía con un
 * alcance que nadie pidió. Ahora una clase desconocida se dice en voz alta.
 * El catálogo del backend tiene un test que comprueba esta misma lista.
 */
export const KNOWN_PARAM_KINDS = Object.freeze(["framework", "month", "asset_group", "evidence_capture"]);

export function isKnownParamKind(kind) {
  return KNOWN_PARAM_KINDS.includes(String(kind));
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
export function previousMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

/** Pure: which params are missing or malformed. */
export function validateParams(params, values) {
  const errors = {};
  for (const p of params || []) {
    const v = values[p.name];
    // ⚠️ Una clase que esta pantalla no sabe pintar BLOQUEA la generación, sea
    // obligatoria o no: generar sin ella produce un informe con otro alcance
    // que el pedido, y eso no se distingue del correcto al mirarlo.
    if (!isKnownParamKind(p.kind)) errors[p.name] = "This portal cannot ask for this yet — update the dashboard.";
    else if (p.required && (v === undefined || v === null || v === "")) errors[p.name] = "Required";
    else if (p.kind === "month" && v && !MONTH_RE.test(String(v))) errors[p.name] = "Use YYYY-MM";
  }
  const from = params.find((p) => p.name === "from");
  const to = params.find((p) => p.name === "to");
  if (from && to && values.from && values.to && !errors.from && !errors.to && values.to < values.from) {
    errors.to = "Must not be before 'from'";
  }
  return errors;
}


/**
 * Lo que enseña el selector de framework de un informe: una entrada por
 * FAMILIA cuando el backend las manda ("CIS Benchmarks" una vez, no un
 * benchmark por SO — el pack de evidencia acepta `family:cis`), y la lista
 * plana de frameworks con un backend anterior. Misma forma en los dos
 * casos: `{ framework, shortName }`, para que los selectores no cambien.
 */
export function frameworkOptionsFrom(res) {
  const families = Array.isArray(res?.families) ? res.families : [];
  if (families.length > 0) {
    return families
      .filter((f) => f && f.key)
      .map((f) => ({
        framework: f.key,
        shortName: Array.isArray(f.frameworks) && f.frameworks.length > 1 ? `${f.label} (${f.frameworks.length} benchmarks)` : f.label || f.key,
      }));
  }
  return Array.isArray(res?.frameworks) ? res.frameworks : [];
}

/**
 * Una captura de evidencia, en una línea que se pueda elegir (ADR-0032 D9).
 *
 * Tres datos, en este orden: QUÉ EQUIPO —por su nombre, que es lo que alguien
 * recuerda de un incidente—, CUÁNDO en la hora del equipo con su desfase, y en
 * qué estado quedó el paquete. La hora es la del equipo y no la de quien mira
 * por la misma razón que en la ficha: el caso que originó todo esto tenía el
 * servidor en UTC-5 y a quien reportó en UTC-6, y esa hora de diferencia
 * colocaba el reporte antes o después de la última actividad registrada.
 *
 * Una captura `expired` o `failed` TAMBIÉN se lista: su informe dice que el
 * equipo no contestó, y esa es una conclusión legítima que alguien puede
 * necesitar por escrito.
 */
export function captureOptionLabel(capture) {
  const quien = capture?.hostname || capture?.deviceId || "Unknown device";
  const en = deviceCapturedAt(capture);
  const cuando = en.text
    ? en.offset ? `${en.text} (${en.offset})` : en.text
    : capture?.createdAt ? `requested ${formatCaptureWhen(capture.createdAt)}` : null;
  const estado = capture?.status ? captureStatusMeta(capture.status).label : null;
  return [quien, cuando, estado].filter(Boolean).join(" · ");
}

function formatCaptureWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Preselección: la única opción, o SOC 2 si está — la razón por la que
 * existe el pack. Si no, nada: que la persona elija.
 */
export function defaultFrameworkOption(options) {
  if (!Array.isArray(options) || options.length === 0) return "";
  if (options.length === 1) return options[0].framework;
  const soc2 = options.find((o) => /^soc2/i.test(String(o.framework)));
  return soc2?.framework || "";
}
