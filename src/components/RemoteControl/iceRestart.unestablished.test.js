// src/components/RemoteControl/iceRestart.unestablished.test.js
//
// ⚠️ Reiniciar ICE en una conexión que NUNCA conectó.
//
// De dónde viene (T111, 2026-09-24): el gestor de ficheros no abría contra
// MSIG-DOMAIN mientras otros dos servidores sí. Lo que leyó el operador:
//
//     «The connection dropped and could not be rebuilt.»
//     «The network changed mid-session…»
//     «WebRTC connection lost — retries exhausted.»
//
// Las tres frases dicen que había sesión y se cayó. No la hubo: ICE nunca
// encontró camino. La cadena que lo produce:
//
//   1. ICE va directo a `failed` sin haber pasado por `connected`.
//   2. Este helper pide un ICE RESTART igualmente.
//   3. El agente ve credenciales nuevas y, como una shell o unos ficheros no
//      se pueden reconstruir sin tirar el PTY o la transferencia, cierra con
//      `ice_restart_unsupported` — «la red cambió a mitad de sesión».
//   4. El operador se va a buscar un cambio de red que nunca ocurrió.
//
// Y la auditoría lo remataba enseñando `connected` un segundo antes, porque
// ese evento se escribe cuando el agente MANDA SU ANSWER, no cuando hay
// camino (`markSessionActive`, signaling-relay.ts).
//
// Lo que se fija aquí: sin conexión previa no se reinicia nada, se cierra con
// `ice_failed` —cuyo texto manda mirar el cortafuegos— y el aviso se manda por
// el socket para que el motivo llegue a la auditoría aunque el panel muera.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { attachIceRestart } from "./iceRestart";

class FakePeer {
  constructor() {
    this.iceConnectionState = "new";
    this.signalingState = "stable";
    this._cbs = [];
    this.offers = [];
  }
  addEventListener(_t, cb) { this._cbs.push(cb); }
  removeEventListener(_t, cb) { this._cbs = this._cbs.filter((x) => x !== cb); }
  async createOffer(opts) { this.offers.push(opts); return { type: "offer", sdp: "v=0" }; }
  async setLocalDescription() {}
  /** Mueve ICE y avisa, como hace el navegador. */
  go(state) {
    this.iceConnectionState = state;
    for (const cb of [...this._cbs]) cb({});
  }
}

class FakeWs {
  constructor() { this.readyState = 1; this.sent = []; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
}
FakeWs.OPEN = 1;

// El `WebSocket` de jsdom es de sólo lectura, y no hace falta tocarlo: el
// helper sólo lee `WebSocket.OPEN`, que vale 1 igual que en el doble.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function attach(over = {}) {
  const pc = new FakePeer();
  const ws = new FakeWs();
  const onUnestablished = vi.fn();
  const onFinalFailure = vi.fn();
  const onRestartAttempt = vi.fn();
  const detach = attachIceRestart({
    pc, ws, sessionId: "sess-1",
    onUnestablished, onFinalFailure, onRestartAttempt,
    ...over
  });
  return { pc, ws, onUnestablished, onFinalFailure, onRestartAttempt, detach };
}

const cierres = (ws) => ws.sent.filter((m) => m.type === "close");

describe("⚠️ ICE que falla SIN haber conectado nunca", () => {
  it("no pide un reinicio: no hay nada que reiniciar", async () => {
    const { pc, onRestartAttempt } = attach();
    pc.go("failed");
    await vi.runAllTimersAsync();

    expect(pc.offers).toEqual([]);          // ni una oferta con iceRestart
    expect(onRestartAttempt).not.toHaveBeenCalled();
  });

  it("cierra con `ice_failed`, que es lo que pasó", async () => {
    // El motivo importa: `ice_restart_unsupported` manda al operador a buscar
    // un cambio de red; `ice_failed` le manda a mirar el cortafuegos.
    const { pc, ws } = attach();
    pc.go("failed");
    await vi.runAllTimersAsync();

    expect(cierres(ws)).toEqual([
      { type: "close", sessionId: "sess-1", reason: "ice_failed" }
    ]);
  });

  it("avisa al panel por su propio camino", async () => {
    const { pc, onUnestablished, onFinalFailure } = attach();
    pc.go("failed");
    await vi.runAllTimersAsync();

    expect(onUnestablished).toHaveBeenCalledTimes(1);
    expect(onFinalFailure).not.toHaveBeenCalled();
  });

  it("sin `onUnestablished` cae en `onFinalFailure`: nunca un silencio", async () => {
    const { pc, onFinalFailure } = attach({ onUnestablished: undefined });
    pc.go("failed");
    await vi.runAllTimersAsync();
    expect(onFinalFailure).toHaveBeenCalledTimes(1);
  });

  it("también por el camino lento de `disconnected`", async () => {
    // La gracia de 4 s existe para los parpadeos de una conexión VIVA. Si no
    // llegó a haberla, al vencer el plazo sigue sin haber nada que reiniciar.
    const { pc, ws, onUnestablished } = attach();
    pc.go("disconnected");
    await vi.advanceTimersByTimeAsync(4100);

    expect(pc.offers).toEqual([]);
    expect(onUnestablished).toHaveBeenCalledTimes(1);
    expect(cierres(ws)).toHaveLength(1);
  });
});

describe("una conexión que SÍ existió se sigue recuperando", () => {
  it("tras conectar, un `failed` pide el reinicio de siempre", async () => {
    // El arreglo no puede llevarse por delante la recuperación real: el
    // roaming de wifi y el NAT que caduca son el caso para el que existe.
    const { pc, ws, onRestartAttempt, onUnestablished } = attach();
    pc.go("connected");
    pc.go("failed");
    await vi.runAllTimersAsync();

    expect(onRestartAttempt).toHaveBeenCalledWith(1);
    expect(pc.offers).toEqual([{ iceRestart: true }]);
    expect(onUnestablished).not.toHaveBeenCalled();
    expect(cierres(ws)).toEqual([]);        // no se cierra: se está recuperando
  });

  it("haber conectado una vez vale para siempre", async () => {
    // Un corte largo pasa por `disconnected` muchas veces; lo que decide no es
    // el estado de ahora sino si alguna vez hubo camino.
    const { pc, onRestartAttempt } = attach();
    pc.go("connected");
    pc.go("disconnected");
    await vi.advanceTimersByTimeAsync(4100);
    expect(onRestartAttempt).toHaveBeenCalledTimes(1);
  });

  it("agota los reintentos y entonces sí avisa de caída", async () => {
    const { pc, onFinalFailure, onUnestablished } = attach({ maxAttempts: 2 });
    pc.go("connected");
    for (let i = 0; i < 3; i++) {
      pc.go("failed");
      await vi.runAllTimersAsync();
    }
    expect(onFinalFailure).toHaveBeenCalled();
    expect(onUnestablished).not.toHaveBeenCalled();
  });
});
