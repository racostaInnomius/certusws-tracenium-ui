export function readSearchParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function getSearchParam(key, fallback = "") {
  const params = readSearchParams();
  const value = params.get(key);
  return value == null ? fallback : value;
}

export function updateSearchParams(updates) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);

  Object.entries(updates || {}).forEach(([key, value]) => {
    const normalized = value == null ? "" : String(value);
    if (!normalized.trim()) {
      url.searchParams.delete(key);
      return;
    }

    url.searchParams.set(key, normalized);
  });

  window.history.replaceState({}, "", url);
}

export function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  if (typeof window === "undefined") return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// Save an already-fetched Blob (e.g. an authenticated PDF pulled via
// httpGetBlob) under `filename`. Mirrors downloadTextFile's anchor trick.
export function saveBlob(blob, filename) {
  if (typeof window === "undefined" || !blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function toCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  const escapeValue = (value) => {
    if (value == null) return "";
    const normalized =
      typeof value === "object" ? JSON.stringify(value) : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeValue(row?.[header])).join(",")),
  ];

  return lines.join("\n");
}
