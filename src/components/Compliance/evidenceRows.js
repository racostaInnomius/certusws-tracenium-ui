// src/components/Compliance/evidenceRows.js
//
// Pure helpers behind EvidenceView: flatten the backend evaluator's
// evidence shapes (modules/compliance/evaluator.ts) into rows of
// { path, value, expected, status }. Kept out of the component file so the
// component module only exports components (react-refresh) and so these can
// be unit-tested without rendering.

const REGISTRY_PREFIX = "registry.";

/** `registry.HKLM\SYSTEM\...\Client:Enabled` → `HKLM\SYSTEM\...\Client:Enabled`. */
export function displayPath(path) {
  const p = String(path ?? "");
  return p.startsWith(REGISTRY_PREFIX) ? p.slice(REGISTRY_PREFIX.length) : p;
}

/** Short value for a cell; `undefined` reads as "not reported". */
export function formatValue(v) {
  if (v === undefined) return "not reported";
  if (v === null) return "null";
  if (typeof v === "string") return v.length > 120 ? `${v.slice(0, 117)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const s = v.map(formatValue).join(", ");
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  }
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return String(v);
  }
}

/**
 * What the rule wanted, as one short phrase. Mirrors the evaluator's
 * per-primitive evidence keys; unknown keys yield null (no column).
 */
export function expectationOf(ev) {
  if (!ev || typeof ev !== "object") return null;
  if ("expected" in ev) return `= ${formatValue(ev.expected)}`;
  if ("rejected" in ev) return `≠ ${formatValue(ev.rejected)}`;
  if ("allowed" in ev) return `in {${formatValue(ev.allowed)}}`;
  if ("forbidden" in ev) return `not in {${formatValue(ev.forbidden)}}`;
  if ("minVersion" in ev) return `≥ ${formatValue(ev.minVersion)}`;
  if ("min" in ev && "max" in ev) return `${formatValue(ev.min)} … ${formatValue(ev.max)}`;
  if ("threshold" in ev) return `${ev.inclusive === false ? ">" : "≥"} ${formatValue(ev.threshold)}`;
  if ("pattern" in ev) return `matches ${formatValue(ev.pattern)}`;
  if ("length" in ev) return "empty";
  return null;
}

/**
 * Flatten an evidence object into rows. Each row: { path, value, expected,
 * status? }. Composites contribute one row per sub-check, carrying the
 * sub-check's own status so a failing probe stands out among passing ones.
 * Returns null when the shape is not one we know how to tabulate.
 */
export function evidenceRows(ev, status) {
  if (!ev || typeof ev !== "object") return null;

  if (Array.isArray(ev.sub_evidence)) {
    const rows = [];
    for (const sub of ev.sub_evidence) {
      if (!sub || typeof sub !== "object") continue;
      if (sub.status === "not_applicable" || sub.status === "error") {
        rows.push({ path: null, value: sub.reason ?? sub.error ?? "not reported", expected: null, status: sub.status });
        continue;
      }
      const inner = evidenceRows(sub.evidence, sub.status);
      if (inner) rows.push(...inner);
      else rows.push({ path: null, value: formatValue(sub.evidence), expected: null, status: sub.status });
    }
    return rows;
  }

  if (Array.isArray(ev.paths)) {
    const expected = expectationOf(ev);
    return ev.paths.map((p) => ({
      path: displayPath(p?.path),
      value: formatValue(p?.value),
      expected,
      status,
    }));
  }

  if (typeof ev.path === "string") {
    const value =
      "observed" in ev ? ev.observed
      : "value" in ev ? ev.value
      : "length" in ev ? `${ev.length} item(s)${Array.isArray(ev.sample) && ev.sample.length ? `: ${formatValue(ev.sample)}` : ""}`
      : undefined;
    return [{ path: displayPath(ev.path), value: formatValue(value), expected: expectationOf(ev), status }];
  }

  return null;
}

