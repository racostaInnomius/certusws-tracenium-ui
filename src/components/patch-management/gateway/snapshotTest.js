// src/components/patch-management/gateway/snapshotTest.js
//
// Presentation for the snapshot round-trip test. PURE — no React, no network.
//
// A test is one VM: correlate it in vCenter, take a snapshot, remove it. The
// row that comes back from the control plane is a `snapshot_results` record
// with purpose=test; this turns it into three steps the operator can read,
// and turns a refusal code into the next thing to do.

/** Where a test stands. `passed` means vCenter confirmed the snapshot is gone again. */
export function snapshotTestStage(row) {
  if (!row) return "idle";
  if (row.cleanedAt || row.outcome === "cleaned") return "passed";
  if (row.outcome === "created") return "cleaning";
  if (row.outcome === "pending") return "running";
  return "failed";
}

export function isSnapshotTestSettled(row) {
  const stage = snapshotTestStage(row);
  return stage === "passed" || stage === "failed";
}

const REASON_HINT = {
  not_correlated: "vCenter has no VM whose BIOS UUID or serial matches what the agent reports. Check the VM's SMBIOS UUID against config.uuid in vCenter.",
  rejected: "vCenter refused. The reason names it — credentials, privileges, TLS pin or datastore capacity.",
  failed: "The snapshot task ran and failed in vCenter.",
  timed_out: "The gateway did not answer in time. Is the host online and can it reach vCenter?",
};

/**
 * The three steps, each ok | failed | pending | skipped, with a detail line.
 * Read top to bottom: the first failed step is where the operator looks.
 */
export function snapshotTestSteps(row) {
  const stage = snapshotTestStage(row);
  const pending = (label) => ({ label, status: "pending", detail: "" });
  const skipped = (label) => ({ label, status: "skipped", detail: "" });

  if (stage === "idle" || stage === "running") {
    return [pending("Correlate the VM"), pending("Create the snapshot"), pending("Remove the snapshot")];
  }

  const correlated = Boolean(row.vmMoref);
  const correlate = correlated
    ? { label: "Correlate the VM", status: "ok", detail: `${row.vmMoref}${row.matchedBy ? ` — matched by ${describeMatch(row.matchedBy)}` : ""}` }
    : { label: "Correlate the VM", status: "failed", detail: row.reason || REASON_HINT.not_correlated };

  if (stage === "failed") {
    if (!correlated) return [correlate, skipped("Create the snapshot"), skipped("Remove the snapshot")];
    return [
      correlate,
      { label: "Create the snapshot", status: "failed", detail: row.reason || REASON_HINT[row.outcome] || row.outcome },
      skipped("Remove the snapshot"),
    ];
  }

  const create = {
    label: "Create the snapshot",
    status: "ok",
    detail: `${row.snapshotMoref || "snapshot"}${formatDuration(row) ? ` in ${formatDuration(row)}` : ""}`,
  };
  if (stage === "cleaning") {
    return [correlate, create, { label: "Remove the snapshot", status: "pending", detail: "Removal queued on the gateway" }];
  }
  return [
    correlate,
    create,
    { label: "Remove the snapshot", status: "ok", detail: row.cleanedAt ? `Confirmed gone ${new Date(row.cleanedAt).toLocaleString()}` : "Confirmed gone" },
  ];
}

export function describeSnapshotTest(row) {
  switch (snapshotTestStage(row)) {
    case "passed":
      return { label: "Passed", color: "success", hint: "Correlated, snapshotted and removed. This VM can be protected before a patch." };
    case "cleaning":
      return { label: "Removing", color: "info", hint: "The snapshot exists; the gateway is removing it." };
    case "running":
      return { label: "Running", color: "info", hint: "Waiting for the gateway to report back." };
    case "failed":
      return {
        label: row.outcome === "not_correlated" ? "Not correlated" : "Failed",
        color: "error",
        hint: row.reason || REASON_HINT[row.outcome] || "The test did not complete.",
      };
    default:
      return { label: "—", color: "default", hint: "" };
  }
}

export function describeMatch(matchedBy) {
  switch (matchedBy) {
    case "uuid_raw":
      return "BIOS UUID";
    case "uuid_swapped":
      return "BIOS UUID (byte-swapped)";
    case "serial_smbios":
      return "VMware serial";
    default:
      return matchedBy || "unknown key";
  }
}

export function formatDuration(row) {
  if (!row?.startedAt || !row?.finishedAt) return "";
  const ms = new Date(row.finishedAt).getTime() - new Date(row.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/** What to tell the operator when the control plane refuses to start a test. */
export function describeSnapshotTestStartError(body, fallback = "Could not start the snapshot test.") {
  switch (body?.error) {
    case "gateway_credential_missing":
      return { title: "No vCenter credential yet", body: "Set the credential and run Test connection first." };
    case "gateway_not_verified":
      return { title: "Gateway not verified", body: "Run Test connection and fix what it reports before testing a snapshot." };
    case "gateway_cannot_snapshot_itself":
      return { title: "That is the gateway host", body: "A gateway never snapshots the VM it runs on. Pick another virtual machine." };
    case "target_unknown":
      return { title: "No inventory for this device", body: "The agent has not reported hardware inventory yet." };
    case "target_not_virtual":
      return { title: "Not a virtual machine", body: "This device reports itself as physical; there is no VM to snapshot." };
    case "target_has_no_identifiers":
      return { title: "Nothing to correlate on", body: "This VM reports neither a BIOS UUID nor a serial, so vCenter cannot be asked for it." };
    default:
      return { title: fallback, body: body?.message || "" };
  }
}
