// src/hooks/useComplianceBands.js
//
// Sprint 2 item 1 — the read side of the tenant's score bands.
//
// Fetches the effective compliance settings once per session (SWR cache,
// shared key across every consumer on the page) and returns normalized
// {goodMin, warningMin}.
//
// ── Fail-soft, and why it nearly cost us the whole feature ────────────
//
// Falling back to DEFAULT_BANDS is deliberate: they are the exact scale
// the UI hardcoded before this hook existed, so a slow or failed settings
// read never leaves scores unstyled.
//
// But a fallback that is both silent AND plausible hides its own bugs.
// This hook read `res.effective` for its entire life, while the endpoint
// returns `{ ok, settings: { effective, overrides, systemDefaults } }` —
// one level deeper. So `data` was always null and every consumer always
// got DEFAULT_BANDS. The tenant's configured bands never reached a single
// score chip, and nobody noticed, because a wrong-but-reasonable colour
// looks exactly like a right one. An error would have been visible; a
// plausible default was not.
//
// (Inert when found — `tenant_compliance_settings` had zero rows, so
// every tenant resolved to system defaults anyway. It would have become a
// silent divergence the first time someone used the settings panel: the
// panel showing new thresholds while every score kept the old colours.)
//
// The shape is pinned by test now. The other guard is below: a genuine
// failure warns, so the next wiring bug cannot pass for "no data".
//
// A previous version of this comment claimed the endpoint rejects
// viewers. It does not — GET /compliance/settings carries no role gate,
// only oidc + tenant resolution. That justification was stale and is why
// the silence looked reasonable for so long.

import { getComplianceSettings } from "../api/compliance";
import { DEFAULT_BANDS, normalizeBands } from "../theme/scoreBands";
import { useCachedFetch } from "./useCachedFetch";

/**
 * Pull the effective band settings out of the API envelope.
 *
 * Exported for the test that pins it against the real response shape —
 * the mismatch this function encodes was invisible for a whole release,
 * so it is worth asserting rather than eyeballing.
 */
export function readEffectiveBands(response) {
  return response?.settings?.effective ?? null;
}

export function useComplianceBands() {
  const { data } = useCachedFetch(
    "complianceBands:v1",
    async () => {
      let res;
      try {
        res = await getComplianceSettings();
      } catch (err) {
        // Still fail-soft — colours must not disappear — but no longer
        // indistinguishable from "this tenant has no overrides".
        console.warn(
          "[complianceBands] settings read failed; falling back to default " +
            "score bands, so colours may not match this tenant's thresholds:",
          err?.message || err
        );
        return null;
      }
      return readEffectiveBands(res);
    },
    {
      staleMs: 5 * 60_000,
      storageMaxAgeMs: 30 * 60_000,
      revalidateOnMount: "stale",
    }
  );
  return data ? normalizeBands(data) : DEFAULT_BANDS;
}
