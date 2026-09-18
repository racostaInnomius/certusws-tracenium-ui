// src/components/patch-management/cveRange.js
//
// How to word a catalog entry's affected versions. PURE — no React.
//
// ⚠️ «* → ∞» was a lie by symbol: it reads as «every version is affected» when
// what it means is «we have no version data». Since 17-sep the sync also stores
// CVEs that NVD has published but not yet analyzed (no CPEs at all, so no
// versions) — CVE-2026-40058 was the one that surfaced it — and those entries
// are exactly the ones that showed that «∞».
//
// The detection side already agrees with this wording: an entry with no
// comparable bound is `not_evaluable` («catalog_has_no_version_range»), never
// vulnerable. See cve-detect.ts in the backend.

/** `{ label, unknown }` — `unknown: true` when there is nothing to judge with. */
export function affectedRangeLabel(entry) {
  const exact = Array.isArray(entry?.affectedVersions)
    ? entry.affectedVersions.map((v) => String(v).trim()).filter(Boolean)
    : [];
  if (exact.length > 0) {
    const head = exact.slice(0, 3).join(", ");
    return { label: exact.length > 3 ? `${head} +${exact.length - 3} more` : head, unknown: false };
  }

  const lo = String(entry?.introducedVersion ?? "").trim();
  const hi = String(entry?.fixedVersion ?? "").trim();
  if (!lo && !hi) return { label: "No version data", unknown: true };
  return { label: `${lo || "*"} → ${hi || "∞"}`, unknown: false };
}

/** Why an entry without versions is still worth having in the catalog. */
export const NO_VERSION_DATA_HINT =
  "NVD has published this CVE but not yet the affected versions, so installs cannot be judged by version — they count as not evaluable, never as vulnerable. The next sync fills this in.";
