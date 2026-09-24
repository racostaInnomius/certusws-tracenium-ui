// src/components/patch-management/bulkInstallOutcome.js
//
// What to tell the operator after a bulk install. PURE — no React, no network.
//
// "Dispatched to 12 devices" was true when a patch_install went out the instant
// it was created. It no longer does: a patch now passes the maintenance-window
// and vCenter-snapshot gates first, so some of those 12 are waiting for their
// window, some are waiting for a snapshot, and some were refused outright
// because their gateway is unhealthy. Reporting all of them as dispatched would
// replace one false promise with another — and it is the same promise the
// notice above the button already makes ("N of M devices will be snapshotted in
// vCenter first"), so it has to agree with it.

const HOLD_LABEL = {
  awaiting_window: "waiting for a maintenance window",
  awaiting_snapshot: "waiting for a vCenter snapshot",
};

/** Devices that are actually on their way to an agent right now. */
export function goingOutNow(dispatched = []) {
  return dispatched.filter((d) => !d.status || d.status === "pending");
}

/**
 * One sentence covering all four outcomes, and the severity to show it with.
 * A refusal is never folded into a success: `blocked` devices are not being
 * patched, and the operator has to know which.
 */
export function summarizeBulkInstall(res, filterLabel = "") {
  const dispatched = Array.isArray(res?.dispatched) ? res.dispatched : [];
  const skipped = Array.isArray(res?.skipped) ? res.skipped : [];

  const now = goingOutNow(dispatched);
  const holds = { awaiting_window: 0, awaiting_snapshot: 0 };
  for (const d of dispatched) {
    if (d.status in holds) holds[d.status] += 1;
  }

  if (dispatched.length === 0 && skipped.length === 0) {
    return {
      severity: "info",
      message: filterLabel
        ? `No devices matched the ${filterLabel.toLowerCase()} filter`
        : "No devices matched",
    };
  }

  const parts = [];
  if (now.length > 0) parts.push(`${now.length} ${plural(now.length, "device")} being patched now`);
  for (const [status, count] of Object.entries(holds)) {
    if (count > 0) parts.push(`${count} ${HOLD_LABEL[status]}`);
  }
  if (skipped.length > 0) parts.push(`${skipped.length} skipped`);

  return {
    // Nothing actually going out is not a success, even when the reason is a
    // benign one like a closed window — the operator pressed a button and no
    // machine is being patched.
    severity: now.length > 0 ? "success" : "info",
    message: capitalize(parts.join(" · ")),
  };
}

/** Why each device was left out, grouped so one gateway failure reads as one line. */
export function groupSkipReasons(skipped = []) {
  const byReason = new Map();
  for (const s of skipped) {
    const reason = s?.reason || "unknown";
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  return [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function plural(n, word) {
  return n === 1 ? word : `${word}s`;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * What the restart toggle promises, in the operator's terms.
 *
 * Both branches have to be equally explicit. "Devices stay up" sounds like the
 * safe option and is the one that leaves a fleet permanently pending-reboot, so
 * the off state has to say that out loud rather than saying nothing.
 */
export function describeRebootChoice(enabled) {
  return enabled
    ? "Each device restarts about a minute after its patch finishes — including devices where only some patches installed, because what did install is not applied until the restart. Devices that installed nothing are left alone."
    : "Devices stay up. A Windows patch is not applied until the machine restarts, so they will report as pending reboot until someone restarts them.";
}

/**
 * Cuánto conservar el punto de retorno, elegido al lanzar el parche (P1,
 * 23-sep-2026). Sólo aplica a las VMs detrás de un Infrastructure Gateway:
 * es su snapshot de vCenter lo que se conserva.
 *
 * El backend guarda la elección en la fila del snapshot. Sin ella usa la
 * retención del gateway (24 h por defecto), que para un servidor con estado
 * —QuickBooks, un FTP, un controlador de dominio— se acaba antes de que nadie
 * haya usado la aplicación de verdad.
 */
export const VALIDATION_HOLD_HOURS = 72;

/**
 * El campo que viaja con el envío, o `undefined` si no se pidió nada: así un
 * backend anterior no recibe un campo que no conoce y lo pasaría al agente.
 */
export function snapshotHoldField(keepUntilValidated) {
  return keepUntilValidated ? { snapshotHold: "until_validated" } : {};
}

export function describeSnapshotHold(keepUntilValidated) {
  return keepUntilValidated
    ? `The snapshot stays until you release it as validated, for up to ${VALIDATION_HOLD_HOURS} h after it is taken (less if the gateway's limit is lower). You are warned before it is removed. A failed patch or a server waiting for its restart is kept for a decision either way.`
    : "The snapshot follows the gateway's retention and is removed automatically once the patch has gone fine. You can still extend it from Rollback points.";
}
