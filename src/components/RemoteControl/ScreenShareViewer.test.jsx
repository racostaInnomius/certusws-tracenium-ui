// src/components/RemoteControl/ScreenShareViewer.test.jsx
//
// ⚠️ El visor de pantalla no tenía NI UN test, y es el componente con más
// superficie del módulo: 1.400 líneas, la negociación WebRTC, el
// reensamblado de fotogramas, la inyección de entrada y doce códigos de
// error de captura.
//
// No se puede probar entero aquí: dibuja sobre un canvas y jsdom no
// implementa `getContext()`. Lo que sí se puede —y es donde han estado los
// fallos— es la máquina de estados y lo que el operador acaba leyendo:
//
//   · Esc suelta el control SIN cerrar la sesión. Era el bug: el listener
//     hacía preventDefault pero no stopPropagation, el Drawer de MUI veía
//     la tecla y cerraba, así que la única tecla documentada como "sal del
//     modo control" terminaba la sesión entera.
//   · Un `close` con motivo se traduce a algo legible. Este visor tiraba
//     el motivo y decía "Session ended.", así que un consentimiento
//     denegado y una red rota se veían idénticos.
//   · Un `type:"error"` se procesa. No se miraba en absoluto.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import ScreenShareViewer from "./ScreenShareViewer";

// ── Dobles de transporte ────────────────────────────────────────────
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
  send(d) {
    this.sent.push(d);
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
  addEventListener() {}
  removeEventListener() {}
  fireOpen() {
    return act(() => this.onopen?.({}));
  }
  fireMessage(obj) {
    return act(async () => {
      await this.onmessage?.({
        data: typeof obj === "string" ? obj : JSON.stringify(obj)
      });
    });
  }
}

class FakeDataChannel {
  constructor() {
    this.readyState = "connecting";
    this.sent = [];
    this.bufferedAmount = 0;
  }
  send(d) {
    this.sent.push(d);
  }
  close() {
    this.readyState = "closed";
  }
  addEventListener() {}
  removeEventListener() {}
  fireOpen() {
    this.readyState = "open";
    return act(() => this.onopen?.({}));
  }
  fireMessage(obj) {
    return act(() =>
      this.onmessage?.({ data: typeof obj === "string" ? obj : JSON.stringify(obj) })
    );
  }
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
  addEventListener(t, cb) {
    (this._listeners[t] ||= []).push(cb);
  }
  removeEventListener(t, cb) {
    this._listeners[t] = (this._listeners[t] || []).filter((h) => h !== cb);
  }
  createDataChannel() {
    this.dc = new FakeDataChannel();
    return this.dc;
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0" };
  }
  async setLocalDescription() {}
  async setRemoteDescription(d) {
    this.remoteDescription = d;
  }
  async addIceCandidate() {}
  async getStats() {
    return new Map();
  }
  close() {
    this.connectionState = "closed";
  }
}

const SESSION = {
  sessionId: "sess-1",
  signalingUrl: "/api/v1/remote-control/signal/sess-1",
  turnConfig: { iceServers: [] }
};
const DEVICE = { deviceId: "dev-1", hostname: "SRV-DC01", platform: "windows" };

beforeEach(() => {
  sockets.length = 0;
  peers.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);
  // jsdom no implementa getContext y el componente lo llama al montar. Un
  // contexto 2D de mentira basta: aquí no se prueba lo que se dibuja.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: () => {},
    clearRect: () => {},
    fillRect: () => {},
    putImageData: () => {},
    getImageData: () => ({ data: [] }),
    canvas: { width: 0, height: 0 }
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderViewer(props = {}) {
  return render(
    <ScreenShareViewer session={SESSION} device={DEVICE} onClose={vi.fn()} {...props} />
  );
}

/** Lleva la negociación hasta tener el canal abierto. */
async function connect() {
  renderViewer();
  await waitFor(() => expect(sockets[0]).toBeTruthy());
  const ws = sockets[0];
  await ws.fireOpen();
  await waitFor(() => expect(peers[0]?.dc).toBeTruthy());
  const pc = peers[0];
  await ws.fireMessage({ type: "answer", sdp: "v=0" });
  await pc.dc.fireOpen();
  return { ws, pc, dc: pc.dc };
}

describe("cómo termina la sesión", () => {
  it("⚠️ un consentimiento denegado se dice con palabras", async () => {
    // Este visor tiraba `msg.reason` y pintaba "Session ended.", así que
    // alguien negándose y una red rota se veían iguales — y la reacción
    // correcta es la contraria en cada caso.
    const { ws } = await connect();
    await ws.fireMessage({ type: "close", reason: "consent_denied" });

    expect(
      await screen.findByText(/The person at the device declined/i)
    ).toBeInTheDocument();
  });

  it("un cierre normal no se disfraza de problema", async () => {
    const { ws } = await connect();
    await ws.fireMessage({ type: "close", reason: "user_closed" });
    expect(await screen.findByText(/Session closed/i)).toBeInTheDocument();
  });

  it("un cierre sin motivo sigue diciendo algo", async () => {
    const { ws } = await connect();
    await ws.fireMessage({ type: "close" });
    expect(await screen.findByText(/Session ended/i)).toBeInTheDocument();
  });

  it("⚠️ un 'error' de señalización ya no se ignora", async () => {
    // El visor no miraba `type:"error"` en absoluto: una sesión rechazada
    // antes de abrirse caía al estado genérico de terminada.
    const { ws } = await connect();
    await ws.fireMessage({
      type: "error",
      code: "agent_unreachable",
      message: "Agent is not currently connected"
    });
    expect(
      await screen.findByText(/isn't connected|is not connected/i)
    ).toBeInTheDocument();
  });
});

describe("Esc en modo control", () => {
  it("⚠️ suelta el control y NO cierra la sesión", async () => {
    // El fallo: `preventDefault` sin `stopPropagation`. El listener está en
    // la ventana en fase de captura, así que corría primero — pero el
    // evento seguía subiendo, el Drawer de MUI lo veía y cerraba. La tecla
    // documentada como "sal del modo control" terminaba la conexión.
    const onClose = vi.fn();
    renderViewer({ onClose });
    await waitFor(() => expect(sockets[0]).toBeTruthy());
    const ws = sockets[0];
    await ws.fireOpen();
    await waitFor(() => expect(peers[0]?.dc).toBeTruthy());
    await ws.fireMessage({ type: "answer", sdp: "v=0" });
    await peers[0].dc.fireOpen();
    await peers[0].dc.fireMessage({ op: "screenInfo", width: 1920, height: 1080, fps: 5 });

    const toggle = await screen.findByRole("button", { name: "Take control" });
    await act(async () => {
      toggle.click();
    });
    // El botón cambia de texto: es la señal de que el modo está activo y de
    // que el listener de teclado ya está enganchado.
    await screen.findByRole("button", { name: "Controlling" });

    const ev = new KeyboardEvent("keydown", {
      code: "Escape",
      bubbles: true,
      cancelable: true
    });
    let propagationStopped = false;
    const original = ev.stopPropagation.bind(ev);
    ev.stopPropagation = () => {
      propagationStopped = true;
      original();
    };
    await act(async () => {
      window.dispatchEvent(ev);
    });

    // Lo que impide que el Drawer cierre: el evento no sigue subiendo.
    expect(propagationStopped).toBe(true);
    // Y la sesión sigue viva: nadie llamó a onClose.
    expect(onClose).not.toHaveBeenCalled();
    // Se soltó todo lo que estuviera pulsado en el remoto.
    expect(peers[0].dc.sent.some((m) => m.includes("releaseAll"))).toBe(true);
  });
});
