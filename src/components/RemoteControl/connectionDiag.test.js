// connectionDiag — lo que vio el navegador cuando una sesión se rompió.
//
// SNOC04, 1-oct-2026: «retries exhausted» a los 6 minutos y en la base de
// datos sólo `operator_disconnected`. Ni el agente ni el visor dejaron rastro.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConnectionDiag } from "./connectionDiag";

class FakeTarget {
  constructor() { this.l = {}; }
  addEventListener(t, cb) { (this.l[t] ||= []).push(cb); }
  removeEventListener(t, cb) { this.l[t] = (this.l[t] || []).filter((x) => x !== cb); }
  fire(t, e) { for (const cb of this.l[t] || []) cb(e); }
}

function fakePc() {
  const pc = new FakeTarget();
  pc.iceConnectionState = "new";
  pc.connectionState = "new";
  pc.getStats = async () => {
    const m = new Map();
    m.set("T", { type: "transport", selectedCandidatePairId: "P" });
    m.set("P", { type: "candidate-pair", localCandidateId: "L", remoteCandidateId: "R",
      currentRoundTripTime: 0.051, bytesReceived: 1000, bytesSent: 200 });
    m.set("L", { candidateType: "srflx", protocol: "udp" });
    m.set("R", { candidateType: "srflx" });
    return m;
  };
  return pc;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("createConnectionDiag", () => {
  it("⭐ anota ICE, la conexión y cómo se cerró el WebSocket", async () => {
    const post = vi.fn(async () => ({ ok: true }));
    const d = createConnectionDiag({ sessionId: "s1", post, delays: [0] });
    const pc = fakePc();
    const ws = new FakeTarget();
    d.watchPc(pc);
    d.watchWs(ws);

    pc.iceConnectionState = "connected"; pc.fire("iceconnectionstatechange");
    pc.iceConnectionState = "disconnected"; pc.fire("iceconnectionstatechange");
    d.note("restart", null, 1);
    ws.fire("close", { code: 1006, reason: "" });

    await d.report("connection_lost");
    const [url, payload] = post.mock.calls[0];
    expect(url).toBe("/api/v1/remote-control/sessions/s1/client-diag");
    expect(payload.kind).toBe("connection_lost");
    expect(payload.timeline.map((e) => `${e.ev}:${e.s ?? e.n ?? ""}`))
      .toEqual(["ice:connected", "ice:disconnected", "restart:1", "ws_close:1006", "report:connection_lost"]);
    // 1006 = se cortó la red; 1000 = alguien lo cerró. Es la primera pregunta.
    expect(payload.wsCloseCode).toBe(1006);
    expect(payload.route).toBe("srflx/udp → srflx");
    expect(Math.round(payload.rttMs)).toBe(51);
  });

  it("lo cuenta también en la consola, que es lo que mira quien tiene el visor delante", async () => {
    const d = createConnectionDiag({ sessionId: "s1", post: vi.fn(async () => ({})), delays: [0] });
    await d.report("ice_failed");
    expect(console.warn).toHaveBeenCalledWith("[rcp] la sesión se rompió", "s1", expect.objectContaining({ kind: "ice_failed" }));
  });

  it("UNA vez por sesión, aunque fallen varias cosas a la vez", async () => {
    const post = vi.fn(async () => ({}));
    const d = createConnectionDiag({ sessionId: "s1", post, delays: [0] });
    await d.report("connection_lost");
    await d.report("signaling_closed");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("⭐ reintenta si falla la red — que es justo cuando hace falta", async () => {
    const post = vi.fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockRejectedValueOnce(Object.assign(new Error("bad gateway"), { status: 502 }))
      .mockResolvedValueOnce({ ok: true });
    const d = createConnectionDiag({ sessionId: "s1", post, delays: [0, 0, 0, 0] });
    await d.report("connection_lost");
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("no reintenta un 4xx: el backend lo rechazó de verdad", async () => {
    const post = vi.fn().mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
    const d = createConnectionDiag({ sessionId: "s1", post, delays: [0, 0, 0] });
    await d.report("connection_lost");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("nunca lanza: un diagnóstico roto no puede tapar el error real", async () => {
    const d = createConnectionDiag({ sessionId: "s1", post: vi.fn().mockRejectedValue(new Error("x")), delays: [0, 0] });
    await expect(d.report("connection_lost")).resolves.toBeUndefined();
  });

  it("la línea de tiempo tiene tope y conserva lo más reciente", () => {
    const d = createConnectionDiag({ sessionId: "s1", post: vi.fn(), delays: [0] });
    for (let i = 0; i < 100; i++) d.note("tick", null, i);
    expect(d.timeline).toHaveLength(60);
    expect(d.timeline.at(-1).n).toBe(99);
  });

  it("dispose suelta los oyentes", () => {
    const d = createConnectionDiag({ sessionId: "s1", post: vi.fn(), delays: [0] });
    const pc = fakePc();
    d.watchPc(pc);
    d.dispose();
    pc.iceConnectionState = "failed"; pc.fire("iceconnectionstatechange");
    expect(d.timeline).toHaveLength(0);
  });
});
