// src/components/patch-management/restartRequest.test.js

import { describe, it, expect } from "vitest";
import { RESTART_WHEN, buildRestartPayload, canConfirmRestart, describeRestartOutcome } from "./restartRequest";
import { describeBlockedError } from "./patchGateOutcome";

describe("buildRestartPayload", () => {
  it("⚠️ `when` siempre escrito, y cualquier cosa que no sea «now» es la ventana", () => {
    expect(buildRestartPayload({ when: "now" })).toEqual({ when: "now" });
    expect(buildRestartPayload({ when: "maintenance_window" })).toEqual({ when: "maintenance_window" });
    expect(buildRestartPayload({})).toEqual({ when: "maintenance_window" });
    expect(buildRestartPayload({ when: "NOW" })).toEqual({ when: "maintenance_window" });
  });
  it("motivo recortado y opcional", () => {
    expect(buildRestartPayload({ when: "now", reason: "  KB5122882  " })).toEqual({ when: "now", reason: "KB5122882" });
    expect(buildRestartPayload({ when: "now", reason: "x".repeat(300) }).reason).toHaveLength(200);
  });
});

describe("canConfirmRestart", () => {
  it("la ventana se confirma sin más", () => {
    expect(canConfirmRestart({ when: RESTART_WHEN.WINDOW, typedName: "", deviceName: "MSIG-DOMAIN" })).toBe(true);
  });
  it("🔴 «now» exige escribir el nombre del equipo (sin distinguir mayúsculas ni espacios)", () => {
    expect(canConfirmRestart({ when: RESTART_WHEN.NOW, typedName: "", deviceName: "MSIG-DOMAIN" })).toBe(false);
    expect(canConfirmRestart({ when: RESTART_WHEN.NOW, typedName: "MSIG-DOMAIN01", deviceName: "MSIG-DOMAIN" })).toBe(false);
    expect(canConfirmRestart({ when: RESTART_WHEN.NOW, typedName: " msig-domain ", deviceName: "MSIG-DOMAIN" })).toBe(true);
  });
  it("sin nombre de equipo no se puede confirmar «now»", () => {
    expect(canConfirmRestart({ when: RESTART_WHEN.NOW, typedName: "", deviceName: "" })).toBe(false);
  });
});

describe("describeRestartOutcome", () => {
  it("retenido: lo dice, con la apertura", () => {
    const out = describeRestartOutcome({ status: "awaiting_window", gate: { status: "awaiting_window", opensAt: "2026-09-18T03:00:00.000Z" } });
    expect(out.held).toBe(true);
    expect(out.message).toMatch(/^Restart held until the maintenance window opens \(/);
  });
  it("sale: aviso de que reinicia en un minuto", () => {
    expect(describeRestartOutcome({ status: "queued", gate: { status: "pending" } })).toMatchObject({ held: false, severity: "success" });
  });
  it("un 409 del reinicio se explica igual que el de parches", () => {
    expect(
      describeBlockedError({ status: 409, body: { error: "device_reboot_blocked", reason: "maintenance_windows_unavailable" } })
    ).toBe("Not dispatched — maintenance windows unavailable");
  });
});
