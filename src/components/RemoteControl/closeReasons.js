// src/components/RemoteControl/closeReasons.js
//
// Why a remote session ended, in words an operator can act on.
//
// ── What this replaces ───────────────────────────────────────────────
//
// Three viewers, three different answers to the same question:
//
//   shell   "Session closed (ice_failed)."   — the raw token, verbatim
//   screen  "Session ended."                 — the reason thrown away
//   file    "Session ended."                 — likewise
//
// So the single most important ending in the whole module, `consent_denied`
// — the person at the other end said no — reached the operator as "Session
// ended." on two of the three. Someone declining and a network failing look
// identical, and the operator's next move is opposite in each case: apologise
// and call them, or check the network.
//
// ── The shape of the answer ──────────────────────────────────────────
//
// `title` is what happened, short enough for a status line. `detail` is what
// to do about it, and is deliberately absent when there is nothing to do —
// padding a normal ending with advice is how a product teaches people to
// ignore its messages. `tone` separates "this is how sessions end" from "this
// went wrong", because ending a session is not a failure and colouring it red
// trains operators to distrust the colour.
//
// ⚠️ NOT a screen-capture error map. `screen_capture_*` codes arrive on the
// data channel while a session is alive and have their own copy in
// ScreenShareViewer, written around what the person at the device has to do.
// These are the terminal reasons a session STOPPED. Two vocabularies, and
// merging them would produce one list where half the entries never apply.

/** How to colour it. Ending a session is not an error. */
export const TONE = {
  NORMAL: "normal", // this is what a finished session looks like
  EXPECTED: "expected", // ended by a rule, not by a person or a fault
  PROBLEM: "problem" // something failed
};

const REASONS = {
  // ── Normal endings ───────────────────────────────────────────────
  operator_closed: { title: "You closed the session.", tone: TONE.NORMAL },
  operator_disconnected: {
    title: "Session closed.",
    // By far the most common ending in production (148 of 263). It means the
    // operator closed the panel — saying anything more alarming would put a
    // warning on the normal way out.
    tone: TONE.NORMAL
  },
  user_closed: { title: "Session closed.", tone: TONE.NORMAL },
  session_ended: { title: "Session ended.", tone: TONE.NORMAL },
  peer_closed: { title: "The device closed the session.", tone: TONE.NORMAL },
  shell_exit: {
    title: "The remote shell exited.",
    detail: "The session ends with its shell — `exit` or Ctrl-D does this.",
    tone: TONE.NORMAL
  },
  agent_closed: { title: "The device ended the session.", tone: TONE.NORMAL },
  agent_dispose: { title: "The device ended the session.", tone: TONE.NORMAL },

  // ── Consent (ADR-0012) ───────────────────────────────────────────
  //
  // The reason this module exists. These are not faults and must never read
  // as one: somebody exercised a right the product gave them on purpose.
  consent_denied: {
    title: "The person at the device declined.",
    detail:
      "They were asked before the session opened and said no. Nothing is " +
      "broken — if you need access, talk to them first.",
    tone: TONE.EXPECTED
  },
  consent_timeout: {
    title: "Nobody answered the request on the device.",
    detail:
      "The prompt appeared and expired with no answer. They may be away from " +
      "the machine.",
    tone: TONE.EXPECTED
  },
  consent_required: {
    title: "This device can't ask for consent.",
    detail:
      "Its policy requires the user to approve, but the agent cannot show a " +
      "prompt — nobody is logged in, or the build predates consent support. " +
      "A shell session may still work.",
    tone: TONE.PROBLEM
  },

  // ── Ended by a rule ──────────────────────────────────────────────
  idle_timeout: {
    title: "Closed after a long silence.",
    detail:
      "Sessions end when nothing has happened for 30 minutes. Keeping the " +
      "panel on screen counts as activity.",
    tone: TONE.EXPECTED
  },
  session_cap: {
    title: "This device already has the maximum open sessions.",
    detail: "Close one of the existing sessions on it and try again.",
    tone: TONE.EXPECTED
  },

  // ── Things that went wrong ───────────────────────────────────────
  handshake_timeout: {
    title: "The device never answered.",
    detail:
      "It is registered as online but did not respond to the connection " +
      "request. It may have just gone to sleep or lost its network.",
    tone: TONE.PROBLEM
  },
  agent_unreachable: {
    title: "The device isn't connected.",
    detail: "Its agent is offline, so there is nothing to connect to.",
    tone: TONE.PROBLEM
  },
  ice_failed: {
    title: "Could not open a direct connection.",
    detail:
      "The browser and the device could not find a network path to each " +
      "other, even through the relay. A restrictive firewall on either side " +
      "is the usual cause.",
    tone: TONE.PROBLEM
  },
  ice_restart_unsupported: {
    title: "The connection dropped and could not be rebuilt.",
    detail:
      "The network changed mid-session. Shell and file sessions cannot " +
      "recover from that yet — start the session again.",
    tone: TONE.PROBLEM
  },
  pty_spawn_failed: {
    title: "The remote shell would not start.",
    detail: "The agent could not open a terminal on the device.",
    tone: TONE.PROBLEM
  },
  pty_open_failed: {
    title: "The remote shell would not start.",
    detail: "The agent could not open a terminal on the device.",
    tone: TONE.PROBLEM
  },
  pty_socket_error: {
    title: "The remote shell stopped responding.",
    tone: TONE.PROBLEM
  },
  agent_rejected: {
    title: "The device refused the session.",
    detail: "Its policy does not allow this kind of session.",
    tone: TONE.PROBLEM
  },
  agent_failure: { title: "The device reported a failure.", tone: TONE.PROBLEM },
  signaling_error: {
    title: "The connection could not be set up.",
    detail: "Something went wrong between the portal and the device.",
    tone: TONE.PROBLEM
  }
};

/**
 * Describe a raw `close_reason`.
 *
 * Always returns something. An unknown reason is shown verbatim rather than
 * hidden: a token the operator can quote into a bug report is worth more than
 * a tidy "Session ended" that loses the only evidence there was.
 */
export function describeCloseReason(reason) {
  const raw = String(reason ?? "").trim();
  if (!raw) {
    // A NULL close_reason is its own finding — five sessions in production
    // have one — but to the operator it is simply an ending nobody recorded.
    return { title: "Session ended.", detail: null, tone: TONE.NORMAL, raw: "" };
  }

  const known = REASONS[raw];
  if (known) return { ...known, detail: known.detail ?? null, raw };

  // `agent_error:<code>` — the agent's own error, wrapped by the backend.
  // The suffix is the part worth showing; the prefix is plumbing.
  if (raw.startsWith("agent_error:")) {
    const code = raw.slice("agent_error:".length) || "unknown";
    return {
      title: "The device reported an error.",
      detail: code,
      tone: TONE.PROBLEM,
      raw
    };
  }

  return {
    title: "Session ended.",
    detail: `Reported reason: ${raw}`,
    tone: TONE.NORMAL,
    raw
  };
}

/** One line, for a status bar or a table cell. */
export function closeReasonLine(reason) {
  return describeCloseReason(reason).title;
}
