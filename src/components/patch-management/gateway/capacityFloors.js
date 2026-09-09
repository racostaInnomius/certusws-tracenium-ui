// src/components/patch-management/gateway/capacityFloors.js
//
// The two datastore floors below which the gateway refuses to snapshot. PURE —
// no React, no network.
//
// These were hardcoded in the agent until 2026-09-09, and the day they mattered
// there was no lever: the gate refused MSIG-RADIUS-CA for "datastore space" on a
// datastore with 18.6% free, and patching those servers stopped. So the numbers
// are now the operator's, and this module's whole job is to make sure the
// operator can see what they just chose before they save it.
//
// Units are in the names — percent and GiB. The bug that started all this was
// two rules wearing one name.

export const FLOOR_DEFAULTS = { minFreePercent: 10, minFreeGiB: 10 };
export const FLOOR_LIMITS = {
  minFreePercent: { min: 0, max: 50 },
  minFreeGiB: { min: 0, max: 4096 },
};

/** Mirror of the control plane's clamp, so the form cannot submit a value it would silently rewrite. */
export function clampFloor(field, value) {
  const { min, max } = FLOOR_LIMITS[field];
  const n = Number(value);
  if (!Number.isFinite(n)) return FLOOR_DEFAULTS[field];
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * What these two numbers will actually do, in a sentence the operator can check
 * against their own datastore.
 *
 * Both floors must hold, so the binding one is whichever is stricter for a given
 * datastore — and that depends on its size, which is exactly why stating only
 * the percentage misleads on a 22 TB store.
 */
export function describeCapacityFloors({ minFreePercent, minFreeGiB } = {}) {
  const pct = clampFloor("minFreePercent", minFreePercent);
  const gib = clampFloor("minFreeGiB", minFreeGiB);

  if (pct === 0 && gib === 0) {
    return {
      severity: "warning",
      text:
        "No capacity check. The gateway will snapshot a datastore however full it is — " +
        "and a snapshot on a datastore with no room left can wedge the VM, which is worse " +
        "than leaving it unpatched.",
    };
  }

  const parts = [];
  if (pct > 0) parts.push(`at least ${pct}% of the datastore free`);
  if (gib > 0) parts.push(`at least ${gib} GiB free`);

  return {
    severity: "info",
    text:
      `A snapshot is refused unless the VM's datastore has ${parts.join(" and ")}. ` +
      (pct > 0 && gib > 0
        ? "Both must hold: the percentage catches a datastore in real trouble, the absolute one catches a small datastore that looks fine by ratio."
        : "Set the other floor to a non-zero value to guard the case this one cannot see.") +
      " Space already promised to thin-provisioned disks is reported, not counted against the floors.",
  };
}

/** The worked example for a given datastore size, so the percentage is not abstract. */
export function floorExample(minFreePercent, capacityTiB) {
  const pct = clampFloor("minFreePercent", minFreePercent);
  if (pct === 0 || !(capacityTiB > 0)) return "";
  return `${pct}% of ${capacityTiB} TiB is ${(capacityTiB * 1024 * (pct / 100)).toFixed(0)} GiB.`;
}
