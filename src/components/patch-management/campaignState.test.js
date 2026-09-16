// src/components/patch-management/campaignState.test.js

import { describe, it, expect } from "vitest";
import { campaignState, snapshotState, campaignStrip, coverageLine, describePatchError, lastPatchJobCell } from "./campaignState";

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
      byState: { installed: 2, failed: 1, never_ran: 50, awaiting_window: 0, timed_out: 1, not_applied: 1 },
    });
    // «Not applied» primero: es la contradicción que exige mirar.
    expect(chips.map((c) => c.key)).toEqual(["not_applied", "failed", "timed_out", "installed"]);
    expect(chips[0].value).toBe(1);
    // Un backend anterior a 67d27fd todavía manda `patched`: se lee como instalado.
    expect(campaignStrip({ byState: { patched: 2 } }).chips[0].label).toBe("Installed");
  });

  it("⚠️ «nunca parcheado» sale aparte, no como un chip más", () => {
    // Con 50 de 54 ahí, mezclarlo entre los demás lo haría pasar por un
    // resultado de la campaña cuando es justo su ausencia.
    const { chips, neverRan } = campaignStrip({ byState: { never_ran: 50, installed: 2 } });
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

describe("lastPatchJobCell", () => {
  const patch = (over = {}) => ({
    jobId: "j",
    status: "completed",
    startedAt: "2026-09-16T15:02:50Z",
    finishedAt: "2026-09-16T15:03:38Z",
    lastError: null,
    rebootRequested: false,
    rebootRequired: false,
    returnedFromReboot: null,
    requestedCount: 1,
    installedCount: 1,
    stillMissing: [],
    othersPending: 0,
    verifiedAt: "2026-09-16T21:03:37Z",
    ...over,
  });

  it("⭐ sin job de Tracenium es un guion con el porqué, no «Never patched»", () => {
    const c = lastPatchJobCell({ state: "never_ran", patch: null });
    expect(c).toMatchObject({ label: "—", empty: true });
    expect(c.title).toMatch(/managed elsewhere/);
  });

  it("🔴 JPR-MacBookPro: instalado lo mandado y quedan OTROS → lo dice el rótulo", () => {
    const c = lastPatchJobCell({ state: "installed", patch: patch({ othersPending: 2 }) });
    expect(c.label).toBe("Installed · 2 others pending");
    expect(c.title).toMatch(/not part of this job/);
  });

  it("instalado y nada más pendiente: con fecha", () => {
    expect(lastPatchJobCell({ state: "installed", patch: patch() }).label).toBe("Installed · Sep 16");
  });

  it("🔴 lo mandado sigue pendiente tras el escaneo → Not applied, cuántos y cuáles", () => {
    const c = lastPatchJobCell({
      state: "not_applied",
      patch: patch({ requestedCount: 2, stillMissing: ["KB2"], installedCount: 2 }),
    });
    expect(c).toMatchObject({ label: "Not applied · 1 of 2", tone: "critical" });
    expect(c.title).toMatch(/still lists: KB2/);
  });

  it("MarisolCorona: reinicio pendiente, desde cuándo", () => {
    const c = lastPatchJobCell({
      state: "awaiting_reboot",
      patch: patch({ rebootRequired: true, finishedAt: "2026-09-10T15:48:00Z", verifiedAt: null }),
    });
    expect(c).toMatchObject({ label: "Restart needed · since Sep 10", tone: "caution" });
  });

  it("completado sin escaneo posterior: Verifying, no un verde", () => {
    expect(lastPatchJobCell({ state: "verifying", patch: patch({ verifiedAt: null }) })).toMatchObject({
      label: "Verifying",
      tone: "neutral",
    });
  });

  it("🔴 verificando tras un escaneo FALLIDO lo dice: el «0 missing» de al lado no es un éxito", () => {
    const c = lastPatchJobCell({ state: "verifying", patch: patch({ verifiedAt: null, latestScanFailed: true }) });
    expect(c.label).toBe("Verifying");
    expect(c.title).toMatch(/latest scan failed/);
  });

  it("⚠️ un fallo lleva su fecha: el «Timed out» del 14-ago no es de hoy", () => {
    expect(
      lastPatchJobCell({ state: "timed_out", patch: patch({ status: "timeout", finishedAt: "2026-08-14T15:39:00Z" }) }).label
    ).toBe("Timed out · Aug 14");
  });

  it("retenido al entregar: el motivo legible en el tooltip", () => {
    const c = lastPatchJobCell({
      state: "awaiting_window",
      patch: patch({ status: "awaiting_window", finishedAt: null, lastError: "held:maintenance_window_closed" }),
    });
    expect(c.label).toBe("Waiting for window");
    expect(c.title).toMatch(/maintenance window had closed/);
  });

  it("sin fila de campaña, un guion sin tooltip", () => {
    expect(lastPatchJobCell(undefined)).toMatchObject({ label: "—", empty: true, title: "" });
  });
});
