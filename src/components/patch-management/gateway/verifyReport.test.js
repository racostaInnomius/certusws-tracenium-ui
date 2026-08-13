import { describe, it, expect } from "vitest";
import {
  toStageRows,
  healthPresentation,
  credentialPresentation,
  remediationFor,
  STAGES,
} from "./verifyReport";

const NOW = Date.parse("2026-07-08T12:00:00.000Z");
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();

describe("toStageRows — a stopped ladder must not accuse the wrong rung", () => {
  it("renders every rung in ladder order", () => {
    expect(toStageRows({ stages: [] }).map((r) => r.stage)).toEqual(STAGES);
  });

  it("marks rungs AFTER a failure as skipped, not failed", () => {
    // A red cross on "Privileges" because the ladder stopped at authentication
    // would send the operator chasing a permissions problem that isn't there.
    const rows = toStageRows({
      stages: [
        { stage: "reachability", ok: true, detail: "313 ms" },
        { stage: "tls_pin", ok: true },
        { stage: "authentication", ok: false, error: "InvalidLogin" },
      ],
    });
    const byStage = Object.fromEntries(rows.map((r) => [r.stage, r.status]));
    expect(byStage.authentication).toBe("failed");
    expect(byStage.privileges).toBe("skipped");
    expect(byStage.scope).toBe("skipped");
  });

  it("marks rungs before any result as pending", () => {
    const rows = toStageRows({ stages: [{ stage: "reachability", ok: true }] });
    expect(rows.find((r) => r.stage === "authentication").status).toBe("pending");
  });

  it("surfaces a warn distinctly from a pass", () => {
    const rows = toStageRows({ stages: [{ stage: "tls_pin", ok: true, warn: true, detail: "no pin" }] });
    expect(rows.find((r) => r.stage === "tls_pin").status).toBe("warn");
  });

  it("carries the per-privilege breakdown through", () => {
    const privileges = [
      { priv: "VirtualMachine.State.CreateSnapshot", supported: true, granted: true },
      { priv: "VirtualMachine.State.RemoveSnapshot", supported: true, granted: false },
    ];
    const rows = toStageRows({ stages: [{ stage: "privileges", ok: false, privileges }] });
    expect(rows.find((r) => r.stage === "privileges").privileges).toEqual(privileges);
  });

  it("handles a missing report without throwing", () => {
    expect(toStageRows(null).every((r) => r.status === "pending")).toBe(true);
  });
});

describe("healthPresentation — a stale pass is not a pass", () => {
  it("shows verified when the check is recent", () => {
    const p = healthPresentation({ health: "verified", lastVerifiedAt: hoursAgo(2) }, NOW);
    expect(p.label).toBe("Verified");
    expect(p.color).toBe("success");
  });

  it("downgrades a verified-but-old check to Stale", () => {
    // A credential that worked yesterday can be locked or expired today; a green
    // tick would be a lie the operator only discovers on patch night.
    const p = healthPresentation({ health: "verified", lastVerifiedAt: hoursAgo(30) }, NOW);
    expect(p.label).toBe("Stale");
    expect(p.color).toBe("warning");
    expect(p.hint).toMatch(/30h ago/);
  });

  it("treats a verified gateway with no timestamp as stale, not healthy", () => {
    expect(healthPresentation({ health: "verified" }, NOW).label).toBe("Stale");
  });

  it("shows the remediation as the hint on failure", () => {
    const p = healthPresentation(
      { health: "failed", lastVerifyClassify: "insufficient_privileges", lastVerifiedAt: hoursAgo(1) },
      NOW
    );
    expect(p.color).toBe("error");
    expect(p.hint).toMatch(/snapshot privileges/i);
  });

  it("prompts a test when never verified", () => {
    expect(healthPresentation({}, NOW).hint).toMatch(/Test connection/i);
  });
});

describe("credentialPresentation", () => {
  it("distinguishes every lifecycle state", () => {
    expect(credentialPresentation("delivered").label).toMatch(/Stored/);
    expect(credentialPresentation("sealed_pending").label).toMatch(/awaiting/i);
    expect(credentialPresentation("stale_envelope").label).toMatch(/Re-enter/i);
    expect(credentialPresentation("failed").color).toBe("error");
    expect(credentialPresentation("not_configured").label).toMatch(/Not configured/);
    expect(credentialPresentation(undefined).label).toMatch(/Not configured/);
  });
});

describe("remediationFor — every failure names a next step", () => {
  it("gives distinct, actionable copy for the two most common mistakes", () => {
    // These are the errors the owner called out: a typo, and a service account
    // without the right role. They must never read the same.
    const typo = remediationFor("bad_credentials");
    const privs = remediationFor("insufficient_privileges");
    expect(typo).not.toBe(privs);
    expect(typo).toMatch(/Re-enter/i);
    expect(typo).toMatch(/locks accounts/i);
    expect(privs).toMatch(/propagation/i);
  });

  it("covers every classification the gateway can emit", () => {
    for (const c of [
      "network",
      "tls_pin_mismatch",
      "bad_credentials",
      "password_expired",
      "account_locked",
      "insufficient_privileges",
      "empty_scope",
      "no_credential",
      "stale_envelope",
      "not_a_gateway",
    ]) {
      expect(remediationFor(c)).not.toBe(remediationFor("unknown"));
    }
  });

  it("falls back to something useful for an unrecognised class", () => {
    expect(remediationFor("something_new_from_a_future_agent")).toMatch(/Unexpected/);
  });
});
