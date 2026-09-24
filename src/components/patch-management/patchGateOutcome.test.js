// src/components/patch-management/patchGateOutcome.test.js

import { describe, it, expect } from "vitest";
import {
  describeGateOutcome,
  describeBlockedError,
  pendingKbIds,
  formatOpensAt,
} from "./patchGateOutcome";

describe("describeGateOutcome", () => {
  it("🔴 MSIG-DOMAIN fuera de ventana: dice que está RETENIDO y hasta cuándo", () => {
    // Decir «Queued» aquí haría creer que el parche va saliendo.
    const out = describeGateOutcome({
      status: "awaiting_window",
      gate: { status: "awaiting_window", opensAt: "2026-09-16T03:00:00.000Z" },
    });
    expect(out.held).toBe(true);
    expect(out.severity).toBe("info");
    expect(out.message).toMatch(/^Held until the maintenance window opens \(/);
  });

  it("esperando snapshot", () => {
    expect(describeGateOutcome({ status: "awaiting_snapshot", gate: { status: "awaiting_snapshot" } })).toMatchObject({
      held: true,
      message: "Waiting for a pre-patch snapshot before installing",
    });
  });

  it("en ventana y sin snapshot que esperar: en cola", () => {
    expect(describeGateOutcome({ status: "queued", gate: { status: "pending" } })).toMatchObject({ held: false, severity: "success" });
    // Un backend anterior sin `gate`: se lee como antes.
    expect(describeGateOutcome({ status: "queued" }).held).toBe(false);
  });

  it("sin fecha de apertura no inventa una", () => {
    expect(describeGateOutcome({ gate: { status: "awaiting_window", opensAt: null } }).message).toBe(
      "Held until the next maintenance window opens"
    );
  });
});

describe("describeBlockedError", () => {
  it("un 409 de la puerta trae su motivo legible", () => {
    expect(
      describeBlockedError({ status: 409, body: { error: "patch_install_blocked", reason: "snapshot_required_but_unavailable" } })
    ).toBe("Not dispatched — snapshot required but unavailable");
  });

  it("otros errores no se disfrazan de bloqueo", () => {
    expect(describeBlockedError({ status: 409, body: { error: "otra_cosa" } })).toBeNull();
    expect(describeBlockedError({ status: 500 })).toBeNull();
    expect(describeBlockedError(new Error("x"))).toBeNull();
  });
});

describe("pendingKbIds", () => {
  it("⚠️ «Install all» manda la lista EXPLÍCITA, nunca vacía", () => {
    // Una lista vacía significa «instala todo» y el backend la rechaza.
    expect(pendingKbIds([{ hotfixId: "KB1" }, { hotfixId: "KB2" }, { hotfixId: "KB1" }, { hotfixId: "" }, { hotfixId: null }, {}])).toEqual([
      "KB1",
      "KB2",
    ]);
    expect(pendingKbIds(undefined)).toEqual([]);
  });
});

describe("formatOpensAt", () => {
  it("fecha inválida o ausente → null", () => {
    expect(formatOpensAt(null)).toBeNull();
    expect(formatOpensAt("no-es-fecha")).toBeNull();
    expect(formatOpensAt("2026-09-16T03:00:00.000Z")).toMatch(/^\w{3} \d{2}:\d{2}$/);
  });
});
