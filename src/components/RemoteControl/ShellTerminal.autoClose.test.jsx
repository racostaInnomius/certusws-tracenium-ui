// src/components/RemoteControl/ShellTerminal.autoClose.test.jsx
//
// ⚠️ Escribir `exit` cierra el panel.
//
// Antes no lo cerraba: la sesión terminaba y la ventana se quedaba puesta
// hasta que el operador pulsaba la X. Estaba decidido a propósito —«que vea la
// última salida»— y el motivo es bueno, pero se cobraba un clic en TODAS las
// veces, incluida la normal: uno escribe `exit` porque ya terminó y lo sabe.
//
// La cuenta atrás se queda con las dos cosas. Por eso lo que se prueba aquí no
// es sólo que cierre, sino:
//   - que NO cierre de inmediato (ahí se perdería la última pantalla),
//   - que se pueda quedar,
//   - y que un final que el operador NO pidió no cierre nada, porque en ese
//     caso el mensaje del panel es la única explicación que va a recibir.
//
// Reloj parado: el test no espera cinco segundos de verdad.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const xtermState = vi.hoisted(() => ({ lastTerm: null }));

vi.mock("@xterm/xterm", () => {
  class FakeTerminal {
    constructor() {
      this.cols = 80;
      this.rows = 24;
      this.writes = [];
      xtermState.lastTerm = this;
    }
    loadAddon() {}
    open() {}
    writeln(s) { this.writes.push(s); }
    write(s) { this.writes.push(s); }
    clear() {}
    focus() {}
    onData() {}
    onResize() {}
    dispose() {}
  }
  return { Terminal: FakeTerminal };
});
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import ShellTerminal from "./ShellTerminal";

const sockets = [];
const peers = [];

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.sent = [];
    sockets.push(this);
  }
  send(d) { this.sent.push(d); }
  close() { this.readyState = FakeWebSocket.CLOSED; }
  fireOpen() { return act(() => this.onopen?.({})); }
  fireMessage(o) { return act(() => this.onmessage?.({ data: JSON.stringify(o) })); }
  fireClose() { return act(() => this.onclose?.({})); }
}

class FakeDataChannel {
  constructor() { this.readyState = "connecting"; this.sent = []; }
  send(d) { this.sent.push(d); }
  close() { this.readyState = "closed"; }
  fireOpen() { this.readyState = "open"; return act(() => this.onopen?.({})); }
  fireMessage(o) { return act(() => this.onmessage?.({ data: JSON.stringify(o) })); }
  fireClose() { this.readyState = "closed"; return act(() => this.onclose?.({})); }
}

class FakeRTCPeerConnection {
  constructor() {
    this.connectionState = "new";
    this.iceConnectionState = "new";
    this._listeners = {};
    this.remoteDescription = null;
    this.dc = null;
    peers.push(this);
  }
  addEventListener(t, cb) { (this._listeners[t] ||= []).push(cb); }
  removeEventListener() {}
  createDataChannel() { this.dc = new FakeDataChannel(); return this.dc; }
  async createOffer() { return { type: "offer", sdp: "v=0" }; }
  async setLocalDescription() {}
  async setRemoteDescription(d) { this.remoteDescription = d; }
  async addIceCandidate() {}
  close() { this.connectionState = "closed"; }
}

const SESSION = {
  sessionId: "sess-1",
  signalingUrl: "/api/v1/remote-control/signal/sess-1",
  turnConfig: { iceServers: [] }
};
const DEVICE = { deviceId: "dev-1", hostname: "W11-LAB01", platform: "windows" };

beforeEach(() => {
  sockets.length = 0;
  peers.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Negociación hasta el DataChannel abierto. */
async function connect(onClose = vi.fn()) {
  render(<ShellTerminal session={SESSION} device={DEVICE} onClose={onClose} />);
  const ws = sockets[0];
  const pc = peers[0];
  await ws.fireOpen();
  await ws.fireMessage({ type: "answer", sdp: "v=0-fake-answer" });
  await pc.dc.fireOpen();
  return { ws, pc, dc: pc.dc, onClose };
}

/**
 * Avanza el reloj SEGUNDO A SEGUNDO.
 *
 * ⚠️ No vale un `advanceTimersByTime(5000)` de una vez: cada tic programa el
 * siguiente desde un efecto, o sea DESPUÉS de que React repinte, y un salto
 * grande sólo dispara los temporizadores que ya existían — la cuenta atrás
 * avanzaba uno y el test daba un falso rojo.
 */
async function tick(seconds) {
  for (let i = 0; i < seconds; i += 1) {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  }
}

/**
 * La barra de estado entera, como la lee una persona.
 *
 * El texto vive en varios nodos (hostname · mensaje · cuenta atrás), así que
 * `getByText` no lo encuentra aunque esté a la vista.
 */
const statusText = () =>
  document.querySelector(".MuiTypography-caption")?.textContent ?? "";

describe("⚠️ un `exit` cierra el panel solo", () => {
  it("cierra tras la cuenta atrás, sin que nadie toque la X", async () => {
    const { dc, onClose } = await connect();
    await dc.fireMessage({ type: "exit", code: 0 });

    expect(onClose).not.toHaveBeenCalled();
    await tick(5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("⚠️ NO cierra de inmediato: la última salida se tiene que poder leer", async () => {
    // Es el motivo por el que esto no se cerraba. Cerrar en cuanto llega el
    // `exit` haría desaparecer la última pantalla de una shell de diagnóstico
    // antes de que dé tiempo a mirarla.
    const { dc, onClose } = await connect();
    await dc.fireMessage({ type: "exit", code: 3 });

    await tick(4);
    expect(onClose).not.toHaveBeenCalled();
    expect(statusText()).toMatch(/Shell exited \(code 3\)/i);
  });

  it("dice cuánto queda, para que el cierre no parezca un fallo", async () => {
    const { dc } = await connect();
    await dc.fireMessage({ type: "exit", code: 0 });
    expect(statusText()).toMatch(/Closing in 5 s/i);

    await tick(2);
    expect(statusText()).toMatch(/Closing in 3 s/i);
  });

  it("«Keep open» cancela el cierre y ya no vuelve", async () => {
    const { dc, onClose } = await connect();
    await dc.fireMessage({ type: "exit", code: 0 });

    fireEvent.click(screen.getByRole("button", { name: /keep open/i }));
    await tick(30);

    expect(onClose).not.toHaveBeenCalled();
    expect(statusText()).not.toMatch(/Closing in/i);
    // Y el panel sigue contando lo que pasó.
    expect(statusText()).toMatch(/Shell exited \(code 0\)/i);
  });
});

describe("un final que el operador NO pidió deja el panel quieto", () => {
  it("el DataChannel que se cae no cierra nada", async () => {
    // Aquí el mensaje del panel es la única explicación que va a recibir.
    // Cerrarlo solo sería hacer desaparecer la ventana sin decir por qué.
    const { dc, onClose } = await connect();
    await dc.fireClose();

    await tick(30);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("un cierre anunciado por el agente tampoco", async () => {
    const { ws, onClose } = await connect();
    await ws.fireMessage({ type: "close", reason: "agent_dispose" });

    await tick(30);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("⚠️ el temporizador no sobrevive al panel", () => {
  it("cerrar con la X mientras corre la cuenta atrás no llama a onClose dos veces", async () => {
    // Un timer que siguiera vivo llamaría a `onClose` sobre un panel
    // desmontado: en el padre eso es un `setState` tardío y un refresco de
    // listas que ya nadie pidió.
    const onClose = vi.fn();
    const { dc } = await connect(onClose);
    await dc.fireMessage({ type: "exit", code: 0 });

    fireEvent.click(screen.getByRole("button", { name: /close terminal/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();
    await tick(30);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
