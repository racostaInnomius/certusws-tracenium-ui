// src/api/reports.js
//
// Client for ADR-0008 Fase F1a's /api/v1/reports/* — the registry
// wrapping the 5 existing report generators behind one gated catalog.

import { httpGetJson, httpGetBlob } from "./http";
import { saveBlob } from "../utils/browserState";

const BASE = "/api/v1/reports";

export async function getReportTypes() {
  return httpGetJson(`${BASE}/types`);
}

export async function getReportRuns({ limit } = {}) {
  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  return httpGetJson(`${BASE}/runs${qs}`);
}

// Every format — including json (CBOM) — goes through httpGetBlob +
// saveBlob, never a raw <a href>: an anchor navigation can't carry the
// X-Tenant-Id header an MSP operator's drilled-in session needs, so the
// export would silently reflect the wrong tenant (the exact incident
// ADR-0008 documents for the compliance PDF export). Same pattern as
// src/api/compliance.js's downloadFindingsCsv/Pdf.
export async function runReport(key, format) {
  const { blob, filename } = await httpGetBlob(
    `${BASE}/${encodeURIComponent(key)}/run?format=${encodeURIComponent(format)}`
  );
  saveBlob(blob, filename || `${key}.${format}`);
}
