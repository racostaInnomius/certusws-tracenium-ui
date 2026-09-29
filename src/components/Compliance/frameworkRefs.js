// src/components/Compliance/frameworkRefs.js
//
// What a framework chip says and where it goes. One module, because the chip
// existed twice (finding card, catalog) and both had the same two defects
// (walkthrough 25-sep #8):
//
//   · The label fell back to the RAW id for anything that was not CIS, CSF,
//     NIST or STIG — chips read `iso_27001_2022 A.8.8`, `pci_dss_v4_0_1 8.3.1`.
//   · The link was the catalog's `reference_url`, which for 20 of 21
//     frameworks is ONE generic page for every control (all 3,300 CIS
//     mappings → cisecurity.org/cis-benchmarks). Even NIST 800-53 was mixed:
//     `SC-7(5)` pointed at SC-7, or at the whole publication. Measured on the
//     control DB, 29-sep.
//
// The rule now: where the standard's text is public and addressable per
// control (NIST 800-53, NIST CSF 2.0, the HIPAA Security Rule), the link is
// built from the control id and opens THAT control. Where it is not — CIS
// (registration), ISO 27001 (paid), PCI DSS and SOC 2 (licensed documents),
// DISA STIGs (downloads) — the link opens the standard's own page (CIS: the
// right product), and the chip says so instead of implying a precision it
// does not have.

const FAMILIES = [
  { prefix: "cis_", short: "CIS", name: "CIS Benchmarks" },
  { prefix: "nist_csf", short: "CSF", name: "NIST CSF" },
  { prefix: "nist_800_53", short: "NIST", name: "NIST SP 800-53" },
  { prefix: "stig_", short: "STIG", name: "DISA STIG" },
  { prefix: "iso_27001", short: "ISO 27001", name: "ISO/IEC 27001" },
  { prefix: "pci_dss", short: "PCI DSS", name: "PCI DSS" },
  { prefix: "soc2", short: "SOC 2", name: "SOC 2" },
  { prefix: "hipaa", short: "HIPAA", name: "HIPAA Security Rule" },
];

// "some_new_fw_v1" → "SOME NEW FW V1"-ish, never the raw snake_case id.
function prettify(id) {
  return String(id || "")
    .replace(/_/g, " ")
    .replace(/\b(cis|nist|pci|iso|soc2|hipaa|csf|stig|dss)\b/gi, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function familyOf(framework) {
  const f = String(framework || "");
  return FAMILIES.find((x) => f.startsWith(x.prefix)) || null;
}

/** Short family label for chips and filters: "CIS", "ISO 27001", "PCI DSS". */
export function frameworkShortLabel(framework) {
  return familyOf(framework)?.short ?? prettify(framework);
}

// Tokens of a benchmark id as their vendors write them.
const TOKEN_LABELS = {
  windows: "Windows", server: "Server", ubuntu: "Ubuntu", macos: "macOS", chrome: "Chrome", edge: "Edge",
  firefox: "Firefox", linux: "Linux", rhel: "RHEL", debian: "Debian", security: "Security", rule: "Rule", tsc: "TSC",
};

/**
 * One benchmark / standard, readable: "cis_ubuntu_22_v3.0.0" → "CIS Ubuntu 22 v3.0.0",
 * "stig_edge_v2r5" → "STIG Edge v2r5", "iso_27001_2022" → "ISO 27001 2022".
 * CIS and STIG are families of many benchmarks, and "CIS 5.1.19" alone does not
 * say whether it is the Ubuntu 22 or the Ubuntu 24 one.
 */
export function frameworkLongLabel(framework) {
  const f = String(framework || "");
  const fam = familyOf(f);
  if (!fam) return prettify(f);
  const rest = f.slice(fam.prefix.length).replace(/^_+/, "");
  const words = rest
    .split("_")
    .filter(Boolean)
    .map((w) => TOKEN_LABELS[w.toLowerCase()] ?? w);
  // nist_csf_2.0 → "CSF 2.0"; pci_dss_v4_0_1 → "PCI DSS v4 0 1" reads badly: join version digits.
  const text = words.join(" ").replace(/\bv(\d+) (\d+) (\d+)\b/, "v$1.$2.$3");
  // Las dos que se nombran por su número, no por su familia corta.
  if (fam.short === "NIST") return text ? `NIST 800-53 ${text}` : "NIST 800-53";
  if (fam.short === "ISO 27001") return text ? `ISO 27001:${text}` : "ISO 27001";
  return text ? `${fam.short} ${text}` : fam.short;
}

/** The standard's name, for the "opens …" hint. */
export function frameworkName(framework) {
  return familyOf(framework)?.name ?? prettify(framework);
}

// CIS benchmarks are grouped by product on cisecurity.org; the benchmark
// itself sits behind a free registration, per control there is nothing.
function cisProductPage(framework) {
  const f = String(framework);
  if (f.startsWith("cis_windows_server")) return "https://www.cisecurity.org/benchmark/microsoft_windows_server";
  if (f.startsWith("cis_windows")) return "https://www.cisecurity.org/benchmark/microsoft_windows_desktop";
  if (f.startsWith("cis_macos")) return "https://www.cisecurity.org/benchmark/apple_os";
  if (f.startsWith("cis_ubuntu")) return "https://www.cisecurity.org/benchmark/ubuntu_linux";
  return null;
}

// "SC-7(5)" → sc/sc-7/sc-7-5/ ; "AC-11" → ac/ac-11/
function nist80053Url(controlId) {
  const m = /^([A-Z]{2})-(\d+)(?:\s*\((\d+)\))?$/i.exec(String(controlId || "").trim());
  if (!m) return null;
  const fam = m[1].toLowerCase();
  const base = `${fam}-${Number(m[2])}`;
  const path = m[3] ? `${fam}/${base}/${base}-${Number(m[3])}` : `${fam}/${base}`;
  return `https://csf.tools/reference/nist-sp-800-53/r5/${path}/`;
}

// "DE.CM-01" → de/de-cm/de-cm-01/
function nistCsf2Url(controlId) {
  const m = /^([A-Z]{2})\.([A-Z]{2})-(\d{2})$/i.exec(String(controlId || "").trim());
  if (!m) return null;
  const fn = m[1].toLowerCase();
  const cat = `${fn}-${m[2].toLowerCase()}`;
  return `https://csf.tools/reference/nist-cybersecurity-framework/v2-0/${fn}/${cat}/${cat}-${m[3]}/`;
}

// "164.308(a)(1)(ii)(D)" → eCFR section 164.308, anchored at the paragraph.
function hipaaUrl(controlId) {
  const m = /^(164\.\d+)((?:\([0-9a-zA-Z]+\))*)$/.exec(String(controlId || "").trim());
  if (!m) return null;
  const section = `https://www.ecfr.gov/current/title-45/section-${m[1]}`;
  return m[2] ? `${section}#p-${m[1]}${m[2]}` : section;
}

/**
 * Where a control's chip should go.
 *
 * @returns {{ url: string, precise: boolean } | null} `precise` = the page is
 *   that control; false = the standard's page (the chip says so). null = no
 *   link at all (no stored URL and nothing derivable).
 */
export function controlReference(framework, controlId, storedUrl = null) {
  const f = String(framework || "");
  const derived = f.startsWith("nist_800_53")
    ? nist80053Url(controlId)
    : f.startsWith("nist_csf_2")
    ? nistCsf2Url(controlId)
    : f.startsWith("hipaa")
    ? hipaaUrl(controlId)
    : null;
  if (derived) return { url: derived, precise: true };
  const product = f.startsWith("cis_") ? cisProductPage(f) : null;
  const url = product || storedUrl || null;
  return url ? { url, precise: false } : null;
}

/** The chip's tooltip: the control title plus, when not precise, what the link really opens. */
export function controlReferenceHint(framework, controlTitle, ref) {
  const lines = [];
  if (controlTitle) lines.push(controlTitle);
  if (ref && !ref.precise) {
    lines.push(`Opens the ${frameworkName(framework)} page, not this control: there is no public link per control.`);
  }
  return lines.join("\n");
}
