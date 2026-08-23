// src/components/Overview/PatchCoverageCard.jsx
//
// Donut card that buckets devices by "how recently did they install a
// patch". Uses the `patchSummary` field already returned by
// /api/v1/security/compliance/devices — no new backend endpoint.
//
// Buckets match the thresholds agreed with Security Compliance:
//   ≤30d      → Recent       (green)
//   31–90d    → Aging        (amber)
//   >90d      → Stale        (red)
//   no data   → Unknown      (gray)
//
// The same thresholds drive the `PatchChip` in the device table, so
// the dashboard reads consistently with the drilldown.
//
// Shares its chart/legend chrome with the other two Overview donuts via
// `DonutCard` (FleetComposition.jsx) — that includes the "pending"
// bucket reconciliation against the enrollment roster (`fleetDevices`,
// same number the "Devices" KPI card shows). See that file's header
// comment for why. This card used to render its own copy of the same
// Pie/legend markup; folded into DonutCard so the reconciliation logic
// only exists once.

import { useMemo } from "react";
import { Typography } from "@mui/material";
import { BRAND, ROLE } from "../../theme/brand";
import { DonutCard } from "./FleetComposition";

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

function daysSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function bucketOf(patchSummary) {
  // Aligns with patchRecencyRole in SecurityCompliance.jsx:
  //   <=30d green, 31-90d amber, >90d red, null = red "unknown".
  // Kept identical by intent, not by import, because the two pages
  // hang off different component trees and pulling a shared util out
  // wasn't worth the churn.
  const days = daysSince(patchSummary?.lastInstalledAtUtc);
  if (days == null) return "unknown";
  if (days <= 30) return "recent";
  if (days <= 90) return "aging";
  return "stale";
}

export default function PatchCoverageCard({ result, loading, onNavigate, fleetDevices = null }) {
  const posture = getValue(result);
  const items = Array.isArray(posture?.items) ? posture.items : [];

  const buckets = useMemo(() => {
    const counts = { recent: 0, aging: 0, stale: 0, unknown: 0 };
    for (const row of items) {
      const b = bucketOf(row?.patchSummary);
      counts[b] += 1;
    }
    return counts;
  }, [items]);

  const data = [
    { name: "≤30d",   value: buckets.recent,  color: ROLE.positive },
    { name: "31–90d", value: buckets.aging,   color: ROLE.caution },
    { name: ">90d",   value: buckets.stale,   color: ROLE.critical },
    { name: "Unknown", value: buckets.unknown, color: BRAND.gray }
  ].filter((x) => x.value > 0);

  const scanned = items.length;
  const pendingValue = fleetDevices != null ? Math.max(fleetDevices - scanned, 0) : null;

  const interactive = typeof onNavigate === "function";
  const navigate = () => onNavigate?.("ad");

  return (
    <DonutCard
      title={
        <>
          Patch coverage
          <Typography
            component="span"
            variant="caption"
            sx={{ color: BRAND.gray, ml: 0.75, fontWeight: 500 }}
          >
            (SCP-enabled)
          </Typography>
        </>
      }
      data={data}
      loading={loading}
      // "scanned", not "SCP devices": this counts devices with a
      // completed compliance scan — a device can check in and even
      // finish its inventory scan before SCP runs, so this total can
      // legitimately differ from the other two donuts in this row.
      // Once fleetDevices is known the total reconciles to the full
      // roster and the label follows (see DonutCard's pending handling).
      totalLabel={fleetDevices != null ? "enrolled" : "scanned"}
      fallbackLabel={scanned === 0 ? "No compliance data yet" : "No patch data reported"}
      onCardClick={interactive ? navigate : undefined}
      pendingValue={pendingValue}
      pendingLabel="Not scanned yet"
    />
  );
}
