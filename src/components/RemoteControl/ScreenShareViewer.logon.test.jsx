// TNS-OPER-SNOC04 (T1, 29-sep-2026), agente 1.1.86. El operador abrió screen
// share contra un servidor sin nadie dentro y vio «Waiting for first frame…».
// Lo dio por roto — con razón: nada lo distinguía de roto — hasta que pulsó
// «Take control» y apareció «Presiona Ctrl+Alt+Supr para desbloquear». Desde
// un Mac esa combinación no existe.
//
// Cuatro defectos del visor en esa sola escena:
//   1. El cartel de primer fotograma miraba los fps, no si había llegado uno.
//      En un escritorio quieto redondean a 0 para siempre.
//   2. Hacía falta «Take control» para poder hacer nada en un servidor sin
//      nadie dentro. Decisión del usuario: ese acceso YA implica control.
//   3. No había forma de mandar Ctrl+Alt+Supr.
//   4. (hallado al arreglar el 3) Los avisos sobre acciones del operador los
//      borraba el siguiente fotograma. «La persona rechazó que controles»
//      duraba ~125 ms a 8 fps.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ScreenShareViewer from "./ScreenShareViewer";

const sockets = [];
const peers = [];

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  constructor(url) { this.url = url; this.readyState = FakeWebSocket.OPEN; this.sent = []; sockets.push(this); }
  send(d) { this.sent.push(d); }
  close() { this.readyState = FakeWebSocket.CLOSED; }
  addEventListener() {}
  removeEventListener() {}
  fireOpen() { return act(() => this.onopen?.({})); }
  fireMessage(obj) {
    return act(async () => { await this.onmessage?.({ data: JSON.stringify(obj) }); });
  }
}

class FakeDataChannel {
  constructor() { this.readyState = "connecting"; this.sent = []; this.bufferedAmount = 0; }
  send(d) { this.sent.push(d); }
  close() { this.readyState = "closed"; }
  addEventListener() {}
  removeEventListener() {}
  fireOpen() { this.readyState = "open"; return act(() => this.onopen?.({})); }
  fireMessage(obj) { return act(() => this.onmessage?.({ data: JSON.stringify(obj) })); }
  ops() { return this.sent.map((s) => JSON.parse(s)); }
}

class FakeRTCPeerConnection {
  constructor() { this.connectionState = "new"; this.iceConnectionState = "new"; this._l = {}; this.dc = null; peers.push(this); }
  addEventListener(t, cb) { (this._l[t] ||= []).push(cb); }
  removeEventListener() {}
  createDataChannel() { this.dc = new FakeDataChannel(); return this.dc; }
  async createOffer() { return { type: "offer", sdp: "v=0" }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate() {}
  async getStats() { return new Map(); }
  close() { this.connectionState = "closed"; }
}

const SESSION = {
  sessionId: "sess-snoc04",
  signalingUrl: "/api/v1/remote-control/signal/sess-snoc04",
  turnConfig: { iceServers: [] }
};
const DEVICE = { deviceId: "0ff6aedf", hostname: "TNS-OPER-SNOC04" };

beforeEach(() => {
  sockets.length = 0;
  peers.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: () => {}, clearRect: () => {}, fillRect: () => {},
    putImageData: () => {}, getImageData: () => ({ data: [] }),
    canvas: { width: 0, height: 0 }
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function connect() {
  render(<ScreenShareViewer session={SESSION} device={DEVICE} onClose={vi.fn()} />);
  await waitFor(() => expect(sockets[0]).toBeTruthy());
  const ws = sockets[0];
  await ws.fireOpen();
  await waitFor(() => expect(peers[0]?.dc).toBeTruthy());
  await ws.fireMessage({ type: "answer", sdp: "v=0" });
  await peers[0].dc.fireOpen();
  return { ws, dc: peers[0].dc };
}

// Lo que manda el agente 1.1.86 ante la pantalla de login de SNOC04.
const LOGON_INFO = { op: "screenInfo", width: 1024, height: 768, fps: 8, noUserSignedIn: true, canSendSas: true };
const FRAME = { op: "frame", seq: 0, width: 1024, height: 768, data: "QUJD", full: true, x: 0, y: 0, rw: 1024, rh: 768 };

describe("1 · el cartel de primer fotograma", () => {
  it("🔴 se va con UN fotograma, aunque los fps sigan en 0", async () => {
    // Un solo fotograma da liveFps = 0 (computeFps necesita dos marcas), y en
    // una pantalla de login no llega otro hasta el keyframe de 4 s. Con la
    // condición vieja el cartel tapaba la imagen para siempre.
    const { dc } = await connect();
    expect(screen.getByText(/Waiting for first frame/i)).toBeInTheDocument();

    await dc.fireMessage(LOGON_INFO);
    await dc.fireMessage(FRAME);

    await waitFor(() =>
      expect(screen.queryByText(/Waiting for first frame/i)).not.toBeInTheDocument()
    );
  });

  it("y el pie dice «idle», no «0fps», con la imagen a la vista", async () => {
    const { dc } = await connect();
    await dc.fireMessage(LOGON_INFO);
    await dc.fireMessage(FRAME);
    expect(await screen.findByText(/1024×768 · idle/)).toBeInTheDocument();
    expect(screen.queryByText(/· 0fps/)).not.toBeInTheDocument();
  });
});

describe("2 · sin nadie dentro, el acceso ya es control", () => {
  it("⭐ arranca en «Controlling» sin pulsar nada", async () => {
    const { dc } = await connect();
    expect(screen.getByRole("button", { name: /Take control/i })).toBeInTheDocument();
    await dc.fireMessage(LOGON_INFO);
    expect(await screen.findByRole("button", { name: /Controlling/i })).toBeInTheDocument();
  });

  it("con alguien delante NO toma el control solo", async () => {
    const { dc } = await connect();
    await dc.fireMessage({ ...LOGON_INFO, noUserSignedIn: false });
    await dc.fireMessage(FRAME);
    expect(screen.getByRole("button", { name: /Take control/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Controlling/i })).not.toBeInTheDocument();
  });

  it("si el operador lo suelta, no se le vuelve a imponer", async () => {
    // El agente reenvía screenInfo al cambiar fps; eso no puede devolver el
    // control a alguien que acaba de soltarlo.
    const { dc } = await connect();
    await dc.fireMessage(LOGON_INFO);
    fireEvent.click(await screen.findByRole("button", { name: /Controlling/i }));
    expect(await screen.findByRole("button", { name: /Take control/i })).toBeInTheDocument();

    await dc.fireMessage({ ...LOGON_INFO, fps: 5 });
    expect(screen.getByRole("button", { name: /Take control/i })).toBeInTheDocument();
  });
});

describe("3 · Ctrl+Alt+Supr", () => {
  it("⭐ manda {op:'sas'} al pulsarlo", async () => {
    const { dc } = await connect();
    await dc.fireMessage(LOGON_INFO);
    const btn = await screen.findByRole("button", { name: /Ctrl\+Alt\+Del/i });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(dc.ops()).toContainEqual({ op: "sas" });
  });

  it("no aparece si el agente no lo anuncia (macOS, Linux, agente viejo)", async () => {
    const { dc } = await connect();
    await dc.fireMessage({ ...LOGON_INFO, canSendSas: false });
    await dc.fireMessage(FRAME);
    expect(screen.queryByRole("button", { name: /Ctrl\+Alt\+Del/i })).not.toBeInTheDocument();
  });

  it("sin control, está desactivado: es entrada como un clic", async () => {
    const { dc } = await connect();
    await dc.fireMessage({ ...LOGON_INFO, noUserSignedIn: false });
    expect(await screen.findByRole("button", { name: /Ctrl\+Alt\+Del/i })).toBeDisabled();
  });
});

describe("4 · los avisos sobre acciones no los borra un fotograma", () => {
  const WHY =
    "Windows on this device does not let services send Ctrl+Alt+Del "
    + "(SoftwareSASGeneration is not configured).";

  it("🔴 el de Ctrl+Alt+Supr sigue ahí tras el siguiente fotograma", async () => {
    const { dc } = await connect();
    await dc.fireMessage(LOGON_INFO);
    await dc.fireMessage({ op: "error", code: "sas_not_allowed", message: WHY, terminal: false });
    expect(await screen.findByText(WHY)).toBeInTheDocument();

    await dc.fireMessage({ ...FRAME, seq: 1 });
    expect(
      screen.getByText(WHY),
      "nombra la directiva que falta; si se borra en 4 s nadie la lee",
    ).toBeInTheDocument();
  });

  it("🔴 el de «rechazó que controles» también — antes duraba un fotograma", async () => {
    const { dc } = await connect();
    await dc.fireMessage({ ...LOGON_INFO, noUserSignedIn: false });
    await dc.fireMessage({
      op: "error", code: "control_consent_denied",
      message: "The person at the device declined to let you control it. Viewing continues.",
      terminal: false
    });
    await dc.fireMessage({ ...FRAME, seq: 1 });
    expect(screen.getByText(/declined to let you control it/i)).toBeInTheDocument();
  });

  it("se cierra con su botón", async () => {
    const { dc } = await connect();
    await dc.fireMessage({ op: "error", code: "sas_not_allowed", message: WHY, terminal: false });
    fireEvent.click(await screen.findByRole("button", { name: /Dismiss/i }));
    expect(screen.queryByText(WHY)).not.toBeInTheDocument();
  });

  it("los de salud de la captura SÍ los sigue borrando el fotograma", async () => {
    // Guarda de regresión: para esos «llegó un fotograma» significa «ya pasó».
    const { dc } = await connect();
    await dc.fireMessage(LOGON_INFO);
    await dc.fireMessage({
      op: "error", code: "screen_capture_failed",
      message: "Transient capture failure", terminal: false
    });
    expect(await screen.findByText(/capture/i)).toBeInTheDocument();
    await dc.fireMessage(FRAME);
    await waitFor(() =>
      expect(screen.queryByText(/Transient capture failure/i)).not.toBeInTheDocument()
    );
  });
});
