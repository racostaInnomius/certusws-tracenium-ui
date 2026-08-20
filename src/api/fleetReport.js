// src/api/fleetReport.js
//
// Fleet Health Report — cross-domain, single-tenant executive summary.
// Not an MSP feature (doesn't belong under src/msp/): reachable by any
// tenant admin from their own Overview page. Mirrors src/msp/mspApi.js's
// fetchClientReport/downloadClientReport pattern.

import { httpGetJson, httpGetBlob } from "./http";
import { saveBlob } from "../utils/browserState";

const BASE = "/api/v1/fleet-report";

function periodQuery({ from, to } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** Preview JSON — { ok, report }. */
export async function fetchFleetReport({ from, to } = {}, options = {}) {
  return httpGetJson(`${BASE}/${periodQuery({ from, to })}`, { cache: "no-store", ...options });
}

/** Download the report as CSV or PDF (authenticated blob → save). */
export async function downloadFleetReport(fmt, { from, to } = {}) {
  const ext = fmt === "pdf" ? "pdf" : "csv";
  const { blob, filename } = await httpGetBlob(`${BASE}/export.${ext}${periodQuery({ from, to })}`);
  saveBlob(blob, filename || `tracenium-fleet-health.${ext}`);
}
