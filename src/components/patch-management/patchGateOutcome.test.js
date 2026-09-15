// src/components/patch-management/patchGateOutcome.test.js

import { describe, it, expect } from "vitest";
import {
  describeGateOutcome,
  describeBlockedError,
  summarizeGatedBatch,
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

describe("summarizeGatedBatch", () => {
  it("resume un lote por estado, con el bloqueado como aviso", () => {
    const out = summarizeGatedBatch({
      created: {
        jobs: [{ status: "pending" }, { status: "awaiting_window" }, { status: "awaiting_window" }, { status: "awaiting_snapshot" }],
        blocked: [{ deviceId: "x", reason: "no_gateway" }],
      },
    });
    expect(out.severity).toBe("warning");
    expect(out.message).toBe(
      "Patch install: 1 queued · 2 held until the maintenance window · 1 waiting for a snapshot · 1 blocked"
    );
  });

  it("forma del despacho por grupo (sin `created`)", () => {
    expect(summarizeGatedBatch({ jobs: [{ status: "awaiting_window" }], blocked: [] })).toMatchObject({ severity: "info" });
  });

  it("⚠️ una respuesta de otro tipo de job devuelve null: el llamador usa su mensaje", () => {
    expect(summarizeGatedBatch({ created: { count: 3, batchId: "b", jobs: [{ jobId: "a" }] } })).toBeNull();
    expect(summarizeGatedBatch({ jobId: "a", status: "queued" })).toBeNull();
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
