// src/components/patch-management/scanFailure.test.js

import { describe, it, expect } from "vitest";
import { explainScanFailure } from "./scanFailure";

describe("explainScanFailure", () => {
  it("🔴 MSIG-FILESHARE (17-sep): the raw note becomes a cause and an action, without the CLIXML noise", () => {
    const f = explainScanFailure("Windows Update scan exceeded 150s. stderr_tail: #< CLIXML\r\n");
    expect(f.title).toBe("Windows Update scan timed out");
    expect(f.cause).toMatch(/within 150 seconds/);
    expect(f.cause).toMatch(/after a restart/);
    expect(f.action).toMatch(/Run scan now/);
    expect(JSON.stringify(f)).not.toMatch(/CLIXML|stderr_tail/);
  });

  it("waiting behind another check names the check and says Windows Update is fine", () => {
    const f = explainScanFailure(
      "PrivSvc timeout: patch.scan did not answer within 240000ms (waited 354827ms for the IPC slow lane behind security.compliance)"
    );
    expect(f.title).toBe("Scan waited behind another check");
    expect(f.cause).toMatch(/security\.compliance/);
    expect(f.action).toMatch(/Nothing is wrong with Windows Update/);
  });

  it("a bare PrivSvc timeout and a dead privileged service are told apart", () => {
    expect(explainScanFailure("PrivSvc timeout: patch.scan did not answer within 240000ms").title).toBe("Agent did not answer in time");
    expect(explainScanFailure("PrivSvc connection closed (pmp_1788929663761)").title).toBe("Agent privileged service unavailable");
    expect(explainScanFailure("connect ENOENT \\\\.\\pipe\\tracenium.privsvc.v1").title).toBe("Agent privileged service unavailable");
  });

  it("stale or never-synced catalogues point at the update server", () => {
    expect(explainScanFailure("Windows Update last synced 12 days ago; cached catalogue is stale, so a count of 0 is not evidence the machine is patched.").title).toBe(
      "Update catalogue out of date"
    );
    expect(explainScanFailure("Windows Update has no record of a successful sync, so the cached catalogue cannot be trusted").title).toBe(
      "Update catalogue never synced"
    );
  });

  it("⚠️ an unknown note is still shown — never hidden behind a generic label", () => {
    const f = explainScanFailure("Something new the agent says");
    expect(f).toMatchObject({ title: "Scan failed", cause: "Something new the agent says" });
  });

  it("no note → null", () => {
    expect(explainScanFailure(null)).toBeNull();
    expect(explainScanFailure("   ")).toBeNull();
  });
});
