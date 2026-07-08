// src/components/patch-management/maintenanceWindowTime.js
//
// Pure time conversions shared between the maintenance-window dialog (edits
// start/end times) and the panel (renders the range). Kept out of the component
// files so both can import them without tripping react-refresh.

export function minutesToHHMM(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map((n) => parseInt(n, 10));
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

/** Duration from start→end in minutes, wrapping past midnight. Null if equal. */
export function durationFromTimes(startMin, endMin) {
  if (startMin == null || endMin == null) return null;
  const d = (((endMin - startMin) % 1440) + 1440) % 1440;
  return d === 0 ? null : d;
}
