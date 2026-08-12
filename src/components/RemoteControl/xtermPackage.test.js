// Guard for the @xterm/* dependency surface.
//
// ShellTerminal.test.jsx mocks xterm entirely (jsdom has no canvas), which
// means no test would notice if the real package stopped exporting what we
// import. These assertions load the REAL modules and pin the exact API surface
// ShellTerminal / TranscriptReplayDialog rely on, so a future upgrade that
// renames or drops one of them fails here instead of at runtime in a live
// remote-shell session.
//
// Deliberately NOT mocked — that is the whole point of this file.

import { describe, it, expect } from "vitest";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

describe("@xterm package surface", () => {
  it("exports the constructors we import", () => {
    expect(Terminal).toBeTypeOf("function");
    expect(FitAddon).toBeTypeOf("function");
    expect(WebLinksAddon).toBeTypeOf("function");
  });

  it("Terminal exposes every method/property ShellTerminal calls", () => {
    // Constructed with the same options object shape the component passes.
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      theme: { background: "#1f2933", foreground: "#e5e7eb", cursor: "#8ffdff" },
      scrollback: 5000,
    });

    for (const method of [
      "open",
      "write",
      "writeln",
      "clear",
      "focus",
      "dispose",
      "loadAddon",
      "onData",
      "onResize",
    ]) {
      expect(term[method], `Terminal.${method} missing`).toBeTypeOf("function");
    }

    // Read back by the resize handshake sent over the DataChannel.
    expect(term.cols).toBeTypeOf("number");
    expect(term.rows).toBeTypeOf("number");

    term.dispose();
  });

  it("FitAddon exposes fit()", () => {
    expect(new FitAddon().fit).toBeTypeOf("function");
  });
});
