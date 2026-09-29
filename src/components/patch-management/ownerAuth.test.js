import { describe, expect, it } from "vitest";
import { buildNudgePayload, describeOwnerAuthLeftOut, isAgentInstallable, nudgeDateBounds, ownerAuthLeftOut, OWNER_AUTH_REQUIRED } from "./ownerAuth";
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

describe("buildNudgePayload — la fecha límite", () => {
  const now = new Date(2026, 8, 29, 10, 0, 0); // 29-sep 10:00 local
  const item = { hotfixId: "macOS 27.0.1-26A434", title: "macOS 27.0.1" };

  it("⭐ «antes del día X» es ese día a las 18:00 locales", () => {
    const p = buildNudgePayload(item, "2026-10-06", now);
    expect(p).toEqual({
      op: "request",
      kind: "os.update",
      params: { label: "macOS 27.0.1-26A434", title: "macOS 27.0.1" },
      deadlineUtc: new Date(2026, 9, 6, 18, 0, 0).toISOString(),
    });
    // actionId y caducidad los pone el servidor, no el panel.
    expect(p).not.toHaveProperty("actionId");
    expect(p).not.toHaveProperty("expiresUtc");
  });

  it("hoy a las 18:00 todavía vale; ayer o más de 60 días, no", () => {
    expect(buildNudgePayload(item, "2026-09-29", now)).not.toBeNull();
    expect(buildNudgePayload(item, "2026-09-28", now)).toBeNull();
    expect(buildNudgePayload(item, "2026-12-31", now)).toBeNull();
    expect(buildNudgePayload(item, "2026-02-30", now)).toBeNull();
    expect(buildNudgePayload({}, "2026-10-06", now)).toBeNull();
  });

  it("el selector propone una semana y no deja pasar de 60 días", () => {
    expect(nudgeDateBounds(now)).toEqual({ min: "2026-09-30", max: "2026-11-27", def: "2026-10-06" });
  });
});
