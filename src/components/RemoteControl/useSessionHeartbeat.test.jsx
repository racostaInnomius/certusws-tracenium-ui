// src/components/RemoteControl/useSessionHeartbeat.test.jsx
//
// The only thing that keeps a screen or file session alive.
//
// Their traffic runs peer-to-peer, so the backend sees nothing at all
// after the handshake and its idle sweep would cut them at 30 minutes
// mid-work. A shell has its transcript as a server-side pulse; these two
// have this heartbeat and nothing else.
//
// The rules worth pinning are the ones that are easy to "simplify" into a
// plain setInterval: the visibility gate is what stops a forgotten tab
// from holding a root shell open until the agent's 4h cap.

import React from "react";
import { render, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import useSessionHeartbeat from "./useSessionHeartbeat";

const OPEN = 1;
const CLOSING = 2;

function makeSocket(readyState = OPEN) {
  return { readyState, send: vi.fn() };
}

// A plain { current } object rather than useRef: the hook only reads
// `.current`, and writing a real ref during render is (rightly) a lint error.
function Harness({ wsRef }) {
  useSessionHeartbeat(wsRef);
  return null;
}

let visibility = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useSessionHeartbeat", () => {
  it("beats on the open socket while the tab is visible", () => {
    const ws = makeSocket();
    render(<Harness wsRef={{ current: ws }} />);

    vi.advanceTimersByTime(60_000);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "activity" }));

    vi.advanceTimersByTime(60_000);
    expect(ws.send).toHaveBeenCalledTimes(2);
  });

  it("⚠️ goes quiet when the tab is not visible", () => {
    // A forgotten tab must be allowed to time out. Without this gate the
    // idle sweep can never fire on anything, and a root shell left behind
    // six other tabs stays open until the agent's hard cap.
    const ws = makeSocket();
    render(<Harness wsRef={{ current: ws }} />);
    visibility = "hidden";

    vi.advanceTimersByTime(300_000);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("beats immediately on coming back to the tab", () => {
    // Returning after 25 minutes should reset the clock now, not leave
    // five minutes of luck between the operator and a dropped session.
    const ws = makeSocket();
    render(<Harness wsRef={{ current: ws }} />);
    visibility = "hidden";
    vi.advanceTimersByTime(120_000);
    expect(ws.send).not.toHaveBeenCalled();

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  it("does not write to a socket that is closing", () => {
    const ws = makeSocket(CLOSING);
    render(<Harness wsRef={{ current: ws }} />);
    vi.advanceTimersByTime(60_000);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("survives a socket that throws on send", () => {
    // A failing send means the socket is going away; its close handler is
    // what ends the session. The heartbeat must not be what crashes the
    // viewer on the way out.
    const ws = makeSocket();
    ws.send.mockImplementation(() => {
      throw new Error("socket gone");
    });
    render(<Harness wsRef={{ current: ws }} />);
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
  });

  it("stops beating once the viewer unmounts", () => {
    const ws = makeSocket();
    const { unmount } = render(<Harness wsRef={{ current: ws }} />);
    unmount();
    vi.advanceTimersByTime(300_000);
    expect(ws.send).not.toHaveBeenCalled();
  });
});
