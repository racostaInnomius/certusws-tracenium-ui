// src/components/RemoteControl/TranscriptReplayDialog.speed.test.jsx
//
// The shell replay's default playback speed.
//
// Narrow on purpose: the rest of this dialog drives xterm.js against a real
// canvas, which jsdom does not provide (`getContext()` is unimplemented), so
// the player itself is not testable here. What IS testable — and what someone
// would plausibly "tidy" back to 1x without knowing why — is which speed the
// dialog opens on.

import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const httpGetJson = vi.fn();
vi.mock("../../api/http", () => ({ httpGetJson: (...a) => httpGetJson(...a) }));

// xterm needs a canvas; the speed buttons do not. Stubbing the terminal keeps
// this test about the one thing it claims to cover.
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    open() {}
    write() {}
    writeln() {}
    clear() {}
    reset() {}
    dispose() {}
    loadAddon() {}
    get cols() {
      return 80;
    }
  }
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
    dispose() {}
  }
}));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import TranscriptReplayDialog from "./TranscriptReplayDialog";

const SESSION = { sessionId: "sess-1", hostname: "SRV-DC01", type: "shell" };

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  httpGetJson.mockResolvedValue({
    ok: true,
    header: { width: 80, height: 24 },
    events: [[0, "o", "prompt$ "]],
    truncated: false
  });
});

describe("default playback speed", () => {
  it("⚠️ opens at 4x, not 1x", async () => {
    // A shell transcript at 1x is minutes of somebody typing, thinking and
    // reading — watched back, mostly waiting. And the data is coarse anyway:
    // the agent coalesces output into ~5-second flush windows, so 1x
    // reproduces a precision the capture never had.
    render(<TranscriptReplayDialog open session={SESSION} onClose={vi.fn()} />);

    await waitFor(() => expect(httpGetJson).toHaveBeenCalled());

    const four = await screen.findByRole("button", { name: "4x" });
    const one = screen.getByRole("button", { name: "1x" });

    // MUI marks the selected speed with the "contained" variant.
    expect(four.className).toMatch(/contained/i);
    expect(one.className).not.toMatch(/contained/i);
  });

  it("still offers 1x for when exact timing is the point", async () => {
    // Establishing that two commands really were seconds apart is a real
    // question; it is just not the common one.
    render(<TranscriptReplayDialog open session={SESSION} onClose={vi.fn()} />);
    await waitFor(() => expect(httpGetJson).toHaveBeenCalled());

    for (const label of ["1x", "2x", "4x", "8x"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });
});
