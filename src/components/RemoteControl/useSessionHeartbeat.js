// src/components/RemoteControl/useSessionHeartbeat.js
//
// Tells the backend that the operator is still there.
//
// ── Why the backend cannot work this out on its own ──────────────────
//
// A remote session's traffic runs peer-to-peer over the WebRTC
// DataChannel. The backend brokers the handshake and then sees nothing:
// not a keystroke, not a frame, not a byte of a file transfer. The single
// exception is a shell's transcript, which the agent uploads for the audit
// trail — so shell sessions have a server-side pulse and screen and file
// sessions have none at all.
//
// The idle sweep closes sessions that have gone quiet for 30 minutes.
// Without this heartbeat, a screen session showing a long install and a
// file session moving a large directory both look identical to an
// abandoned tab, and both get cut mid-work.
//
// ── Why visibility, and not a plain timer ────────────────────────────
//
// A bare interval would keep any forgotten tab alive until the agent's 4h
// hard cap — a root shell left open behind six other tabs is exactly what
// an idle timeout exists to end. Gating on `document.visibilityState`
// draws the line where it belongs: a session on screen is in use, whether
// or not anybody is typing (watching a progress bar is work). A session
// nobody has looked at for half an hour is not.
//
// It also gets sleep right for free: a suspended laptop runs no timers, so
// the session times out the way it should.

import * as React from "react";

// Well inside the 30-minute timeout, and matched to the backend's own
// write throttle — sending more often would cost a DB write per beat for
// no extra precision.
const HEARTBEAT_MS = 60_000;

/**
 * Beat while the socket is open and the page is visible.
 *
 * @param {React.MutableRefObject<WebSocket|null>} wsRef the signaling socket
 */
export default function useSessionHeartbeat(wsRef) {
  React.useEffect(() => {
    function beat() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const ws = wsRef.current;
      // readyState is the authority on whether there is anything to write
      // to — the ref outlives the socket during teardown.
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ type: "activity" }));
      } catch {
        // A send that fails means the socket is going away, and its close
        // handler is what ends the session. Nothing to do here.
      }
    }

    // Beat on becoming visible too: coming back to the tab after 25
    // minutes should reset the clock immediately rather than leaving five
    // minutes of luck between the operator and a dropped session.
    document.addEventListener("visibilitychange", beat);
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [wsRef]);
}
