// src/components/RemoteControl/ShellTerminal.test.jsx
//
// RCP M1.S2 — interactive remote-shell terminal state machine.
//
// jsdom has no WebRTC and no real xterm canvas, so we isolate the
// component from all three transports:
//
//   * @xterm/xterm / @xterm/addon-fit / @xterm/addon-web-links + the css import
//     are vi.mock'd with minimal fakes. The Terminal fake records the
//     onData / onResize callbacks and exposes write/writeln/clear/focus
//     so we can drive the "stdout" path and assert keystroke piping.
//   * WebSocket is replaced by a controllable FakeWebSocket that lets a
//     test flip readyState + fire onopen/onmessage/onerror/onclose.
//   * RTCPeerConnection is replaced by a FakeRTCPeerConnection whose
//     createDataChannel returns a FakeDataChannel we can open/close and
//     whose createOffer/setLocalDescription/setRemoteDescription are
//     resolved no-ops.
//
// With those in place the component's STATE machine (CONNECTING →
// RUNNING → ERROR/ENDED) becomes fully observable through the status
// strip text, which is what these tests assert.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

// ── xterm module mocks ────────────────────────────────────────────────
// Hoisted holder so the test body can reach the last Terminal instance.
const xtermState = vi.hoisted(() => ({ lastTerm: null }));

vi.mock("@xterm/xterm", () => {
  class FakeTerminal {
    constructor() {
      this.cols = 80;
      this.rows = 24;
      this._dataCb = null;
      this._resizeCb = null;
      this.writes = [];
      this.disposed = false;
      this.cleared = false;
      xtermState.lastTerm = this;
    }
    loadAddon() {}
    open() {}
    writeln(s) {
      this.writes.push(s);
    }
    write(s) {
      this.writes.push(s);
    }
    clear() {
      this.cleared = true;
    }
    focus() {
      this.focused = true;
    }
    onData(cb) {
      this._dataCb = cb;
    }
    onResize(cb) {
      this._resizeCb = cb;
    }
    dispose() {
      this.disposed = true;
    }
  }
  return { Terminal: FakeTerminal };
});

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {},
}));

// The component imports the stylesheet for side effects; jsdom can't
// parse it, so stub it to nothing.
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import ShellTerminal from "./ShellTerminal";

// ── WebSocket / RTCPeerConnection fakes ───────────────────────────────
const sockets = [];
const peers = [];

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN; // "connected" by default
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    sockets.push(this);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
  // helpers
  fireOpen() {
    return act(() => this.onopen?.({}));
  }
  fireMessage(obj) {
    return act(() =>
      this.onmessage?.({ data: typeof obj === "string" ? obj : JSON.stringify(obj) })
    );
  }
  fireError() {
    return act(() => this.onerror?.({}));
  }
  fireClose() {
    return act(() => this.onclose?.({}));
  }
}

class FakeDataChannel {
  constructor() {
    this.readyState = "connecting";
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = "closed";
  }
  fireOpen() {
    this.readyState = "open";
    return act(() => this.onopen?.({}));
  }
  fireMessage(obj) {
    return act(() =>
      this.onmessage?.({ data: typeof obj === "string" ? obj : JSON.stringify(obj) })
    );
  }
  fireClose() {
    this.readyState = "closed";
    return act(() => this.onclose?.({}));
  }
}

class FakeRTCPeerConnection {
  constructor() {
    this.connectionState = "new";
    // ICE state + an EventTarget-style listener registry: the component's ICE
    // restart helper (iceRestart.js) attaches via
    // pc.addEventListener("iceconnectionstatechange", …) and reads
    // pc.iceConnectionState, so the fake must speak that API — not just the
    // legacy on* handlers.
    this.iceConnectionState = "new";
    this._listeners = {};
    this.remoteDescription = null;
    this.localDescription = null;
    this.onicecandidate = null;
    this.onconnectionstatechange = null;
    this.dc = null;
    peers.push(this);
  }
  addEventListener(type, cb) {
    (this._listeners[type] ||= []).push(cb);
  }
  removeEventListener(type, cb) {
    this._listeners[type] = (this._listeners[type] || []).filter((h) => h !== cb);
  }
  createDataChannel() {
    this.dc = new FakeDataChannel();
    return this.dc;
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0-fake-offer" };
  }
  async setLocalDescription(desc) {
    this.localDescription = desc;
  }
  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
  }
  async addIceCandidate() {}
  close() {
    this.connectionState = "closed";
  }
  fireConnectionState(state) {
    this.connectionState = state;
    return act(() => this.onconnectionstatechange?.({}));
  }
  fireIceConnectionState(state) {
    this.iceConnectionState = state;
    return act(() => {
      for (const cb of this._listeners.iceconnectionstatechange || []) cb({});
    });
  }
}

const SESSION = {
  sessionId: "sess-1",
  signalingUrl: "/api/v1/remote-control/signal/sess-1",
  turnConfig: { iceServers: [] },
};
const DEVICE = { deviceId: "dev-1", hostname: "W11-LAB01", platform: "windows" };

beforeEach(() => {
  sockets.length = 0;
  peers.length = 0;
  xtermState.lastTerm = null;
  // jsdom's WebSocket / RTCPeerConnection globals are read-only, so use
  // vi.stubGlobal (writable + auto-restored by unstubAllGlobals).
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderTerminal(props = {}) {
  return render(
    <ShellTerminal session={SESSION} device={DEVICE} onClose={vi.fn()} {...props} />
  );
}

// Drive the happy-path negotiation up to a live DataChannel.
async function connect() {
  renderTerminal();
  const ws = sockets[0];
  const pc = peers[0];
  await ws.fireOpen(); // → createOffer → send offer
  await ws.fireMessage({ type: "answer", sdp: "v=0-fake-answer" });
  await pc.dc.fireOpen(); // DataChannel open → RUNNING
  return { ws, pc, dc: pc.dc };
}

describe("ShellTerminal — CONNECTING (initial state)", () => {
  it("mounts in the connecting state and opens a WS on the API origin", () => {
    renderTerminal();
    // Status strip shows the establishing message.
    expect(screen.getByText(/establishing connection/i)).toBeInTheDocument();
    // Exactly one WS + one PC were created; WS URL is ws(s):// scheme.
    expect(sockets).toHaveLength(1);
    expect(peers).toHaveLength(1);
    expect(sockets[0].url).toMatch(/^wss?:\/\//);
    // xterm was mounted and printed its banner line.
    expect(xtermState.lastTerm).not.toBeNull();
    expect(xtermState.lastTerm.writes.join("")).toMatch(/establishing connection/i);
  });

  it("creates the DataChannel BEFORE generating the SDP offer", async () => {
    renderTerminal();
    const pc = peers[0];
    // DataChannel exists immediately at negotiate() time (before ws open).
    expect(pc.dc).toBeInstanceOf(FakeDataChannel);
    // Offer only goes out after ws.onopen.
    await sockets[0].fireOpen();
    await waitFor(() =>
      expect(sockets[0].sent.some((m) => JSON.parse(m).type === "offer")).toBe(true)
    );
  });
});

describe("ShellTerminal — CONNECTING → RUNNING (happy path)", () => {
  it("reaches Connected once the DataChannel opens, and clears/focuses xterm", async () => {
    const { dc } = await connect();

    expect(await screen.findByText(/Connected\./i)).toBeInTheDocument();
    // On open the component clears the stub banner and focuses the term.
    expect(xtermState.lastTerm.cleared).toBe(true);
    expect(xtermState.lastTerm.focused).toBe(true);
    // Initial resize sync was pushed down the DataChannel.
    const resizeMsg = dc.sent.map(JSON.parse).find((m) => m.type === "resize");
    expect(resizeMsg).toMatchObject({ type: "resize", cols: 80, rows: 24 });
  });

  it("pipes xterm keystrokes to the DataChannel as {type:'stdin'}", async () => {
    const { dc } = await connect();
    // Simulate the user typing — invoke the recorded onData callback.
    act(() => xtermState.lastTerm._dataCb("ls\n"));
    const stdin = dc.sent.map(JSON.parse).find((m) => m.type === "stdin");
    expect(stdin).toEqual({ type: "stdin", data: "ls\n" });
  });

  it("writes agent stdout frames into the terminal", async () => {
    const { dc } = await connect();
    await dc.fireMessage({ type: "stdout", data: "hello world" });
    expect(xtermState.lastTerm.writes.join("")).toContain("hello world");
  });
});

describe("ShellTerminal — ENDED transitions", () => {
  it("shell exit frame → 'Shell exited' status, stays mounted", async () => {
    const { dc } = await connect();
    await dc.fireMessage({ type: "exit", code: 0 });
    expect(await screen.findByText(/Shell exited \(code 0\)/i)).toBeInTheDocument();
  });

  it("WS 'close' control frame → 'Session closed' status", async () => {
    const { ws } = await connect();
    await ws.fireMessage({ type: "close", reason: "agent_dispose" });
    expect(await screen.findByText(/Session closed \(agent_dispose\)/i)).toBeInTheDocument();
  });
});

describe("ShellTerminal — ERROR transitions", () => {
  it("WS error → error status + red indicator", async () => {
    renderTerminal();
    await sockets[0].fireError();
    expect(await screen.findByText(/Signaling WebSocket error/i)).toBeInTheDocument();
  });

  it("backend 'error' control frame → surfaces code + message", async () => {
    renderTerminal();
    await sockets[0].fireOpen();
    await sockets[0].fireMessage({
      type: "error",
      code: "FORBIDDEN",
      message: "no shell permission",
    });
    expect(await screen.findByText(/FORBIDDEN: no shell permission/i)).toBeInTheDocument();
  });

  it("RTCPeerConnection 'failed' → shows recovery status (ICE restart handles it, not an immediate error)", async () => {
    // The component no longer hard-fails on connectionState 'failed'; the ICE
    // restart helper attempts recovery first, so the user sees a recovering
    // message. Only the helper's onFinalFailure (retries exhausted) → ERROR.
    renderTerminal();
    const pc = peers[0];
    await pc.fireConnectionState("failed");
    expect(await screen.findByText(/recovering/i)).toBeInTheDocument();
  });

  it("ICE restart exhausts its retries → WebRTC connection lost / ERROR", async () => {
    // Drive onFinalFailure deterministically: with the signaling WS not open,
    // the first restart attempt can't deliver the offer and gives up.
    renderTerminal();
    const pc = peers[0];
    const ws = sockets[0];
    ws.readyState = FakeWebSocket.CLOSED; // offer can't be sent → final failure
    await pc.fireIceConnectionState("failed");
    expect(await screen.findByText(/WebRTC connection lost|retries exhausted/i)).toBeInTheDocument();
  });
});

describe("ShellTerminal — teardown", () => {
  it("unmount closes the DataChannel, PC, and sends a close frame on the WS", async () => {
    // Render + connect inline so we own the unmount handle.
    const { unmount } = renderTerminal();
    const ws = sockets[0];
    const pc = peers[0];
    await ws.fireOpen();
    await ws.fireMessage({ type: "answer", sdp: "v=0-fake-answer" });
    await pc.dc.fireOpen();
    const dc = pc.dc;

    unmount();

    expect(dc.readyState).toBe("closed");
    expect(pc.connectionState).toBe("closed");
    const closeFrame = ws.sent.map(JSON.parse).find((m) => m.type === "close");
    expect(closeFrame).toMatchObject({ type: "close", reason: "user_closed" });
    // xterm was disposed on cleanup.
    expect(xtermState.lastTerm.disposed).toBe(true);
  });
});
