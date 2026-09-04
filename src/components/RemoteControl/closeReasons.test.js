// src/components/RemoteControl/closeReasons.test.js
//
// What the operator is told when a session ends.
//
// The rules worth pinning are not "does the map have an entry" — that is
// data. They are the judgement calls someone could plausibly undo while
// tidying: never losing an unknown token, never dressing a normal ending
// as a failure, and never letting "somebody said no" read like a fault.

import { describe, it, expect } from "vitest";
import { describeCloseReason, closeReasonLine, TONE } from "./closeReasons";

describe("consent", () => {
  it("⚠️ says a person declined, and does not call it an error", async () => {
    // The reason this module exists. Two of the three viewers rendered this
    // as "Session ended." — indistinguishable from a clean hang-up, when the
    // operator's correct next move is to go and talk to somebody.
    const d = describeCloseReason("consent_denied");
    expect(d.title).toMatch(/declined/i);
    expect(d.tone).toBe(TONE.EXPECTED);
    expect(d.tone).not.toBe(TONE.PROBLEM);
    expect(d.detail).toMatch(/nothing is broken/i);
  });

  it("separates 'said no' from 'nobody answered'", async () => {
    // Same outcome, different human situation: one is a decision, the other
    // is an empty chair. Collapsing them would tell an operator they were
    // refused by someone who never saw the prompt.
    expect(describeCloseReason("consent_denied").title).not.toBe(
      describeCloseReason("consent_timeout").title
    );
    expect(describeCloseReason("consent_timeout").title).toMatch(/nobody answered/i);
  });
});

describe("tone", () => {
  it("a session ending normally is not a problem", async () => {
    // 148 of 263 production sessions end as operator_disconnected — the
    // operator closing the panel. Colouring the ordinary way out as a
    // failure is how a product teaches people to ignore its warnings.
    for (const r of ["operator_disconnected", "user_closed", "shell_exit", "peer_closed"]) {
      expect(describeCloseReason(r).tone).toBe(TONE.NORMAL);
    }
  });

  it("a rule ending the session is not a fault either", async () => {
    expect(describeCloseReason("idle_timeout").tone).toBe(TONE.EXPECTED);
    expect(describeCloseReason("session_cap").tone).toBe(TONE.EXPECTED);
  });

  it("things that actually broke are marked as such", async () => {
    for (const r of ["ice_failed", "handshake_timeout", "pty_spawn_failed", "agent_unreachable"]) {
      expect(describeCloseReason(r).tone).toBe(TONE.PROBLEM);
    }
  });
});

describe("unknown reasons", () => {
  it("⚠️ never swallows a token it does not recognise", async () => {
    // A reason nobody has written copy for is exactly the one worth quoting
    // into a bug report. Hiding it behind a tidy "Session ended." throws
    // away the only searchable evidence there was.
    const d = describeCloseReason("some_new_backend_reason");
    expect(d.detail).toContain("some_new_backend_reason");
    expect(d.raw).toBe("some_new_backend_reason");
  });

  it("unwraps agent_error:<code> and keeps the code", async () => {
    const d = describeCloseReason("agent_error:pty_socket_error");
    expect(d.title).toMatch(/device reported an error/i);
    expect(d.detail).toBe("pty_socket_error");
    expect(d.tone).toBe(TONE.PROBLEM);
  });

  it("handles a missing reason without rendering 'undefined'", async () => {
    // Five sessions in production have a NULL close_reason. That is a finding
    // for the backend, not something to spell out to an operator.
    for (const empty of [null, undefined, "", "   "]) {
      const d = describeCloseReason(empty);
      expect(d.title).toBe("Session ended.");
      expect(d.detail).toBeNull();
    }
  });
});

describe("detail", () => {
  it("is absent when there is nothing to do about it", async () => {
    // Padding an ordinary ending with advice is noise, and noise is what
    // makes the useful lines invisible.
    expect(describeCloseReason("user_closed").detail).toBeNull();
    expect(describeCloseReason("operator_disconnected").detail).toBeNull();
  });

  it("is present when the operator has a next move", async () => {
    expect(describeCloseReason("ice_failed").detail).toMatch(/firewall/i);
    expect(describeCloseReason("session_cap").detail).toMatch(/close one/i);
  });
});

describe("closeReasonLine", () => {
  it("gives a single line for a table cell", async () => {
    expect(closeReasonLine("idle_timeout")).toMatch(/long silence/i);
    expect(closeReasonLine("idle_timeout")).not.toContain("\n");
  });
});
