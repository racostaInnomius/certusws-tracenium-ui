// src/components/Reports/reportParams.js
//
// Pure helpers behind ReportParamsDialog (validation + month defaults),
// kept out of the component file so it only exports components.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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
    if (p.required && (v === undefined || v === null || v === "")) errors[p.name] = "Required";
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
 * Preselección: la única opción, o SOC 2 si está — la razón por la que
 * existe el pack. Si no, nada: que la persona elija.
 */
export function defaultFrameworkOption(options) {
  if (!Array.isArray(options) || options.length === 0) return "";
  if (options.length === 1) return options[0].framework;
  const soc2 = options.find((o) => /^soc2/i.test(String(o.framework)));
  return soc2?.framework || "";
}
