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


// ── «No aplica» porque el check es de otra versión del SO ──────────────
//
// El backend (evaluator.ts → otherOsVersionResult, commit 261493a0) marca
// not_applicable un check escrito para otra versión del SO cuando el equipo
// tiene su propio benchmark: ~7.900 hallazgos en prod al desplegarlo. Trae
// `reason: "benchmark_for_other_os_version"` —un código— más los campos para
// explicarlo. Pintar el código tal cual dejaba al operador con
// «benchmark_for_other_os_version» en cursiva en cada uno de ellos.

const OS_NAMES = { macos: "macOS", ubuntu: "Ubuntu", windows: "Windows" };

/**
 * Id de framework → nombre corto con versión:
 * `cis_ubuntu_24_v2.0.0` → «CIS Ubuntu 24.04», `cis_windows_server_2022_v5.1.0`
 * → «CIS Windows Server 2022», `stig_macos_14` → «STIG macOS 14». Lo que no
 * encaja se devuelve tal cual: un id es feo, pero no miente.
 */
export function benchmarkLabel(id) {
  const raw = String(id ?? "");
  const m = raw.match(/^(cis|stig)_(macos|ubuntu|windows)_((?:server_)?\d+)(?:_v[\d.]+)?$/i);
  if (!m) return raw;
  const [, pub, os, ver] = m;
  const server = /^server_/i.test(ver);
  const num = ver.replace(/^server_/i, "");
  const version = os.toLowerCase() === "ubuntu" ? `${num}.04` : num;
  return `${pub.toUpperCase()} ${OS_NAMES[os.toLowerCase()]}${server ? " Server" : ""} ${version}`;
}

/**
 * El texto de un «no evaluado / no aplica». Para el de otra versión del SO se
 * arma con los campos estructurados; si no vienen, `detail` (la frase del
 * backend); y si tampoco, `reason` como siempre.
 */
export function notApplicableText(ev) {
  if (!ev || typeof ev !== "object") return "";
  if (ev.reason === "benchmark_for_other_os_version") {
    const written = Array.isArray(ev.checkBenchmarks) ? ev.checkBenchmarks.map(benchmarkLabel).filter(Boolean) : [];
    const own = ev.ownBenchmark ? benchmarkLabel(ev.ownBenchmark) : "";
    if (written.length && own) {
      return ev.ownIsFallback
        ? `Not applicable: written for ${written.join(", ")}. This device is measured by ${own}, the newest benchmark published for its OS (there is none yet for its version).`
        : `Not applicable: written for ${written.join(", ")}. This device is measured by its own benchmark, ${own}.`;
    }
    if (typeof ev.detail === "string" && ev.detail.trim()) return ev.detail;
    return "Not applicable: this check was written for another version of the operating system.";
  }
  return typeof ev.reason === "string" ? ev.reason : "";
}
