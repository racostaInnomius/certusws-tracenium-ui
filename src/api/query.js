// src/api/query.js
//
// Canonical query-string builder for the API clients. This exact logic was
// copy-pasted (in two cosmetic variants) into 12 of the api/*.js modules;
// this is the single source.
//
// Appends every param whose value is not null/undefined/blank, coerced to a
// string. Returns "?a=1&b=2" or "" when nothing qualifies.

export function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      query.append(key, String(value));
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}
