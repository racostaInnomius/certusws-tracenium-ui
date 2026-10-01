// El visor de pantalla CUENTA lo que vio cuando la sesión se rompe.
//
// connectionDiag.test.js prueba el módulo; esto prueba que el visor lo usa —
// la forma de que un módulo bien probado no sirva de nada es que nadie lo
// llame. SNOC04, 1-oct-2026: la caída sólo dejó `operator_disconnected`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

const diag = vi.hoisted(() => ({
  instances: [],
  make() {
    const d = {
      watchPc: vi.fn(), watchWs: vi.fn(), note: vi.fn(), frame: vi.fn(),
      report: vi.fn(async () => {}), dispose: vi.fn()
    };
    this.instances.push(d);
    return d;
  }
}));
vi.mock("./connectionDiag", () => ({ createConnectionDiag: vi.fn(() => diag.make()) }));

import ScreenShareViewer from "./ScreenShareViewer";

const sockets = [];
const peers = [];
class FakeWebSocket {
  static OPEN = 1; static CLOSED = 3;
  constructor() { this.readyState = 1; this.sent = []; sockets.push(this); }
  send(d) { this.sent.push(d); }
  close() { this.readyState = 3; }
  addEventListener() {} removeEventListener() {}
}
class FakeRTCPeerConnection {
  constructor() { this.connectionState = "new"; this.iceConnectionState = "new"; this.dc = null; peers.push(this); }
  addEventListener() {} removeEventListener() {}
  createDataChannel() { this.dc = { send() {}, close() {}, addEventListener() {}, removeEventListener() {} }; return this.dc; }
  async createOffer() { return { type: "offer", sdp: "v=0" }; }
  async setLocalDescription() {} async setRemoteDescription() {} async addIceCandidate() {}
  async getStats() { return new Map(); }
  close() {}
}

beforeEach(() => {
  sockets.length = 0; peers.length = 0; diag.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage() {}, clearRect() {}, fillRect() {}, putImageData() {}, getImageData: () => ({ data: [] }), canvas: {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const SESSION = { sessionId: "sess-diag", signalingUrl: "/api/v1/remote-control/signal/sess-diag", turnConfig: { iceServers: [] } };

describe("el visor de pantalla deja rastro al romperse", () => {
  it("⭐ vigila la conexión y el WebSocket desde el principio", async () => {
    render(<ScreenShareViewer session={SESSION} device={{ hostname: "SNOC04" }} onClose={vi.fn()} />);
    await waitFor(() => expect(sockets[0]).toBeTruthy());
    await act(async () => { sockets[0].onopen?.({}); });
    await waitFor(() => expect(diag.instances).toHaveLength(1));
    const d = diag.instances[0];
    expect(d.watchPc).toHaveBeenCalledWith(peers[0]);
    expect(d.watchWs).toHaveBeenCalledWith(sockets[0]);
  });

  it("🔴 un WebSocket que se cierra a mitad de negociación se cuenta como signaling_closed", async () => {
    render(<ScreenShareViewer session={SESSION} device={{ hostname: "SNOC04" }} onClose={vi.fn()} />);
    await waitFor(() => expect(sockets[0]).toBeTruthy());
    await act(async () => { sockets[0].onopen?.({}); });
    await waitFor(() => expect(diag.instances).toHaveLength(1));
    await act(async () => { sockets[0].onclose?.({ code: 1006 }); });
    expect(diag.instances[0].report).toHaveBeenCalledWith("signaling_closed");
  });

  it("al cerrar el visor se sueltan los oyentes", async () => {
    const { unmount } = render(<ScreenShareViewer session={SESSION} device={{ hostname: "SNOC04" }} onClose={vi.fn()} />);
    await waitFor(() => expect(sockets[0]).toBeTruthy());
    await act(async () => { sockets[0].onopen?.({}); });
    await waitFor(() => expect(diag.instances).toHaveLength(1));
    unmount();
    expect(diag.instances[0].dispose).toHaveBeenCalled();
  });
});
