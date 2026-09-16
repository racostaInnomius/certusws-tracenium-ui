// src/components/patch-management/campaignState.test.js

import { describe, it, expect } from "vitest";
import { campaignState, snapshotState, campaignStrip, coverageLine, describePatchError } from "./campaignState";

describe("campaignState", () => {
  it("⭐ «esperando ventana» y «esperando snapshot» no se colapsan", () => {
    // Son dos motivos distintos de la misma espera, y el operador actúa
    // distinto en cada uno.
    expect(campaignState("awaiting_window").label).toBe("Waiting for window");
    expect(campaignState("awaiting_snapshot").label).toBe("Waiting for snapshot");
  });

  it("un estado que la UI no conoce cae en «Unknown», no en «Patched»", () => {
    expect(campaignState("teletransportado").label).toBe("Unknown state");
    expect(campaignState(undefined).tone).toBe("caution");
  });
});

describe("snapshotState", () => {
  it("⭐ sin snapshot, tres casos distintos: N/A, None yet y «no se sabe»", () => {
    // Un PC no pasa por gateway: N/A, no una carencia.
    expect(snapshotState(null, false)).toMatchObject({ label: "N/A", tone: "muted" });
    expect(snapshotState(null, false).title).toMatch(/Not a VM behind an Infrastructure Gateway/);
    // Una VM con gateway que aún no ha tenido parche con puerta.
    expect(snapshotState(null, true)).toMatchObject({ label: "None yet", tone: "muted" });
    // El backend no lo dice (o no se pudo calcular): no se inventa ni N/A.
    expect(snapshotState(null, null).label).toBe("—");
    expect(snapshotState(null).label).toBe("—");
  });

  it("si hay snapshot manda el snapshot, diga lo que diga `applies`", () => {
    expect(snapshotState({ outcome: "created", onDatastore: true }, false).label).toBe("Held");
  });

  it("un rechazo lleva el detalle, que es lo accionable", () => {
    const s = snapshotState({
      outcome: "rejected",
      reason: "insufficient_capacity",
      reasonDetail: "4.06 TB libres de 21.83 TB (18%), umbral 20%",
    });
    expect(s.label).toBe("Rejected");
    expect(s.title).toContain("21.83 TB");
  });

  it("retenido y retirado se distinguen: uno ocupa disco y el otro no", () => {
    expect(snapshotState({ outcome: "created", onDatastore: true }).label).toBe("Held");
    expect(snapshotState({ outcome: "cleaned", onDatastore: false, removedAt: "2026-09-12T03:00:00Z" }).label).toBe(
      "Removed"
    );
  });
});

describe("campaignStrip", () => {
  it("sólo enseña lo que existe, y lo accionable primero", () => {
    const { chips } = campaignStrip({
      byState: { patched: 2, failed: 1, never_ran: 50, awaiting_window: 0, timed_out: 1 },
    });
    expect(chips.map((c) => c.key)).toEqual(["failed", "timed_out", "patched"]);
    expect(chips[0].value).toBe(1);
  });

  it("⚠️ «nunca parcheado» sale aparte, no como un chip más", () => {
    // Con 50 de 54 ahí, mezclarlo entre los demás lo haría pasar por un
    // resultado de la campaña cuando es justo su ausencia.
    const { chips, neverRan } = campaignStrip({ byState: { never_ran: 50, patched: 2 } });
    expect(neverRan).toBe(50);
    expect(chips.map((c) => c.key)).not.toContain("never_ran");
  });

  it("sin datos no inventa una fila de ceros", () => {
    expect(campaignStrip(undefined).chips).toEqual([]);
  });
});

describe("coverageLine", () => {
  it("cuenta los equipos que han recibido algún parche, sobre los enrolados", () => {
    const c = coverageLine({ enrolled: 54, reporting: 53 }, { byState: { never_ran: 50 } });
    expect(c).toEqual({ enrolled: 54, withJob: 4, reporting: 53 });
  });
});

describe("describePatchError", () => {
  it("🔴 el PC retenido al entregar no enseña el código crudo", () => {
    // El backend (6e282df) devuelve a awaiting_window un patch_install que iba a
    // salir con la ventana cerrada y deja este código en last_error.
    const text = describePatchError("held:maintenance_window_closed");
    expect(text).not.toMatch(/held:|_/);
    expect(text).toMatch(/next window opens/);
  });

  it("los demás códigos de las puertas también se leen", () => {
    for (const code of ["maintenance_window_closed_after_snapshot", "deferred:window_check_unavailable", "snapshot_no_response"]) {
      expect(describePatchError(code)).not.toBe(code);
    }
  });

  it("⚠️ un error del agente pasa TAL CUAL: reescribirlo escondería el diagnóstico", () => {
    expect(describePatchError("WUA install failed: 0x80240022")).toBe("WUA install failed: 0x80240022");
  });

  it("sin error, null", () => {
    expect(describePatchError(null)).toBeNull();
    expect(describePatchError("")).toBeNull();
  });
});
