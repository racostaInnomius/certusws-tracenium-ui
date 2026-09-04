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

