import { describe, expect, it } from "vitest";
import { describeOwnerAuthLeftOut, isAgentInstallable, ownerAuthLeftOut, OWNER_AUTH_REQUIRED } from "./ownerAuth";
import { pendingKbIds } from "./patchGateOutcome";

describe("ownerAuth", () => {
  it("🔴 «Install all» no lleva la de macOS en Apple silicon", () => {
    const items = [
      { hotfixId: "Safari27.0TahoeAuto-27.0", installBlockedReason: null },
      { hotfixId: "macOS 27.0.1-26A434", installBlockedReason: OWNER_AUTH_REQUIRED },
    ];
    expect(pendingKbIds(items)).toEqual(["Safari27.0TahoeAuto-27.0"]);
    expect(items.map(isAgentInstallable)).toEqual([true, false]);
  });

  it("un backend viejo (sin el campo) se trata como instalable", () => {
    expect(isAgentInstallable({ hotfixId: "KB1" })).toBe(true);
  });

  it("cuenta lo dejado fuera en la flota: apartadas y equipos enteros", () => {
    const leftOut = ownerAuthLeftOut({
      plan: [
        { agentId: "air", ownerAuthExcluded: ["macOS Tahoe 26.7.1-25G241"] },
        { agentId: "pc", ownerAuthExcluded: [] },
        { agentId: "old-backend" },
      ],
      skipped: [
        { agentId: "jpr", reason: OWNER_AUTH_REQUIRED },
        { agentId: "x", reason: "no_matching_patches" },
      ],
    });
    expect(leftOut).toEqual({ macs: 2, updates: 2 });
    expect(describeOwnerAuthLeftOut(leftOut)).toMatch(/^macOS updates on 2 Apple silicon Macs are left out/);
  });

  it("nada dejado fuera → sin frase", () => {
    expect(describeOwnerAuthLeftOut(ownerAuthLeftOut({ plan: [], skipped: [] }))).toBeNull();
    expect(describeOwnerAuthLeftOut(ownerAuthLeftOut(undefined))).toBeNull();
  });
});
