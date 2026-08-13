// src/hooks/useComplianceBands.js
//
// Sprint 2 item 1 — the read side of the tenant's score bands.
//
// Fetches the effective compliance settings once per session (SWR
// cache, shared key across every consumer on the page) and returns
// normalized {goodMin, warningMin}. Fail-soft BY DESIGN: while
// loading, on error, or for viewers the endpoint rejects, callers get
// DEFAULT_BANDS — the exact scale the UI hardcoded before this hook
// existed, so nothing ever regresses to unstyled.

import { getComplianceSettings } from "../api/compliance";
import { DEFAULT_BANDS, normalizeBands } from "../theme/scoreBands";
import { useCachedFetch } from "./useCachedFetch";

export function useComplianceBands() {
  const { data } = useCachedFetch(
    "complianceBands:v1",
    async () => {
      const res = await getComplianceSettings().catch(() => null);
      return res?.effective ?? null;
    },
    {
      staleMs: 5 * 60_000,
      storageMaxAgeMs: 30 * 60_000,
      revalidateOnMount: "stale",
    }
  );
  return data ? normalizeBands(data) : DEFAULT_BANDS;
}
