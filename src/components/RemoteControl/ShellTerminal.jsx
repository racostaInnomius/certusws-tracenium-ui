// src/components/RemoteControl/ShellTerminal.jsx
//
// RCP M1.S2 — interactive shell terminal in the browser.
//
// Shape:
//   - xterm.js renders the terminal canvas + handles input.
//   - WebRTC RTCPeerConnection carries the I/O (DataChannel).
//   - WebSocket carries signaling (SDP offer/answer + ICE).
//   - Backend's /sessions POST returns {sessionId, signalingUrl,
//     turnConfig}; this component takes that envelope and runs the
//     negotiation.
//
// Why the browser is the OFFERER:
//   - DataChannels MUST be created before SDP is generated (the
//     channel shows up in the offer's m= line). It's simpler to
//     have the browser own that side; the agent answers.
//   - Matches the v2 design doc's transport_role convention
//     ('offerer' for the browser, 'answerer' for the agent).
//
// Lifecycle (happy path):
//   mount → open WS → wait WS open → create RTCPC → create DC →
//   createOffer → setLocalDescription → send offer via WS → wait
//   answer → setRemoteDescription → ICE flies both ways → DC opens
//   → xterm input ⇄ DC.
//
// Lifecycle (error paths):
//   - WS upgrade 401/403 → render unrecoverable error
//   - signaling timeout → render error + close DC + close WS
//   - peer "failed" state → render error
//   - explicit close from agent (peer dispose, shell exit) → render
//     "session ended" message
//
// Performance:
//   - xterm.js local echo is on by default; we don't enable any
//     extra echo logic. Backend round-trip latency only affects
//     when output appears, not when characters render.
//   - We send each keystroke as a separate {type: "stdin", data}
//     JSON message. xterm batches multi-character paste so this
//     doesn't fan out per character on paste.

import * as React from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { BRAND, ICON, NEUTRAL, ROLE, TEXT } from "../../theme/brand";
import { getApiWsUrl } from "../../api/http";
import { attachIceRestart } from "./iceRestart";

// State machine — drives the status strip + error rendering.
const STATE = Object.freeze({
  CONNECTING: "connecting",         // WS opening / signaling in flight
  RUNNING: "running",               // DataChannel open + xterm wired
  ERROR: "error",                   // unrecoverable
  ENDED: "ended"                    // shell exited cleanly
});

/**
 * Props:
 *   - session: { sessionId, signalingUrl, turnConfig } from
 *     POST /sessions.
 *   - device:  { deviceId, hostname, platform } for display.
 *   - onClose: invoked when the operator clicks the close button
 *     OR the session terminates. Parent removes the component.
 */
export default function ShellTerminal({ session, device, onClose }) {
  const containerRef = React.useRef(null);
  const termRef = React.useRef(null);
  const fitRef = React.useRef(null);
  const wsRef = React.useRef(null);
  const pcRef = React.useRef(null);
  const dcRef = React.useRef(null);
  // Cleanup handle for the ICE restart listener — set inside negotiate()
  // and called from the useEffect teardown. Keeping it on a ref instead
  // of a closure variable is the standard pattern when the producer
  // (negotiate) and consumer (cleanup return) live in different scopes.
  const iceRestartDetachRef = React.useRef(null);
  const [state, setState] = React.useState(STATE.CONNECTING);
  const [statusMsg, setStatusMsg] = React.useState("Establishing connection…");

  // ── 1. Mount xterm into the container ───────────────────────────
  React.useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: TEXT.md,
      // Match the brand-dark surface for visual continuity with the
      // rest of the dashboard.
      theme: {
        background: NEUTRAL[800],
        foreground: NEUTRAL[100],
        cursor: ROLE.accent
      },
      scrollback: 5000
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();
    term.writeln("\x1b[2;37mTracenium Remote Shell — establishing connection…\x1b[0m");

    termRef.current = term;
    fitRef.current = fit;

    // Window resize → terminal resize → notify agent via DC.
    const onResize = () => {
      try {
        fit.fit();
        sendResize(dcRef.current, term.cols, term.rows);
      } catch {
        /* ignore — pre-DC-open or DC closed */
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // ── 2. Establish WebRTC + WebSocket signaling ───────────────────
  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function negotiate() {
      // Connect the signaling WebSocket FIRST so we have somewhere to send the
      // offer once we generate it. The WS lives on the API origin
      // (api.tracenium.com), NOT the SPA origin (portal.tracenium.com) —
      // getApiWsUrl resolves against VITE_API_BASE just like every REST call.
      const ws = new WebSocket(getApiWsUrl(session.signalingUrl));
      wsRef.current = ws;

      // Open the PeerConnection with the TURN config the backend
      // minted. The browser SDK manages NAT traversal internally.
      const pc = new RTCPeerConnection({
        iceServers: Array.isArray(session.turnConfig?.iceServers)
          ? session.turnConfig.iceServers
          : []
      });
      pcRef.current = pc;

      // The DataChannel MUST be created BEFORE the offer so its
      // m= line ends up in the SDP.
      //
      // ⚠️ Do NOT pass `{ ordered: true }` here even though the WebRTC
      // spec says it's the default. node-datachannel (libdatachannel
      // wrapper used by the agent) has a bug on Windows ARM64 where the
      // SCTP negotiation silently fails when the offerer's DataChannel
      // INIT carries an explicit reliability flag set to ordered. The
      // DataChannel never reaches `open` on the agent side, the agent
      // stops trickling ICE candidates after the first ~3, and the
      // browser's pc.connectionState stays in 'new' indefinitely.
      // Empirically reproduced 2026-06-10 19:03 on W11-JPR-Lab01: passing
      // `{ ordered: true }` → timeout; passing no opts → DataChannel
      // opens in ~2s. The default is ordered=true anyway, so omitting
      // the opts is semantically identical AND bypasses the bug.
      // TODO: when node-datachannel is upgraded past the version that
      // fixes this, we can pass `{ ordered: true }` again for clarity.
      const dc = pc.createDataChannel("rcp.shell");
      dcRef.current = dc;

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(
          JSON.stringify({
            type: "ice",
            sessionId: session.sessionId,
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid ?? "",
            sdpMLineIndex: e.candidate.sdpMLineIndex ?? 0
          })
        );
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        // We no longer go straight to STATE.ERROR on `failed` — the ICE
        // restart helper attached below handles the first round of
        // recovery automatically. Only flip status text so the user
        // sees something happening; the helper's onFinalFailure (after
        // all attempts) is what actually transitions to STATE.ERROR.
        if (pc.connectionState === "failed" ||
            pc.connectionState === "disconnected") {
          setStatusMsg("Connection interrupted — recovering…");
        } else if (pc.connectionState === "connected") {
          // Helper resets its retry counter on this transition too.
          setStatusMsg("Connected.");
        }
      };

      // Attach the ICE restart helper — see iceRestart.js for the full
      // rationale. Short version: WebRTC ICE breaks for legitimate
      // reasons (NAT mapping ageing out, WiFi roaming, TURN allocation
      // expiry on Cloudflare's side) and the standard recovery path is
      // an ICE restart from the offerer. Without this we hard-failed
      // every transient drop, which was a worse UX than literally just
      // retrying.
      iceRestartDetachRef.current = attachIceRestart({
        pc,
        ws,
        sessionId: session.sessionId,
        onRestartAttempt: (attempt) => {
          if (cancelled) return;
          setStatusMsg(`Reconnecting (attempt ${attempt})…`);
        },
        onFinalFailure: () => {
          if (cancelled) return;
          setState(STATE.ERROR);
          setStatusMsg("WebRTC connection lost — retries exhausted.");
        }
      });

      dc.onopen = () => {
        if (cancelled) return;
        setState(STATE.RUNNING);
        setStatusMsg("Connected.");
        const term = termRef.current;
        if (term) {
          // Clear the "establishing" stub line so the prompt lands
          // at the top of the visible area.
          term.clear();
          term.focus();
          // Initial size sync — the PTY spawned with 80x24
          // defaults; tell it our actual viewport.
          sendResize(dc, term.cols, term.rows);
          // Pipe keystrokes → DC.
          term.onData((data) => {
            try {
              dc.send(JSON.stringify({ type: "stdin", data }));
            } catch {
              /* DC closed mid-send — onclose will handle */
            }
          });
          // Pipe resize events from xterm's internal "view" model
          // (covers font-size changes that don't trigger window
          // resize).
          term.onResize(({ cols, rows }) => sendResize(dc, cols, rows));
        }
      };

      dc.onmessage = (e) => {
        if (cancelled) return;
        let parsed;
        try {
          parsed =
            typeof e.data === "string" ? JSON.parse(e.data) : null;
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;
        const term = termRef.current;
        if (!term) return;
        if (parsed.type === "stdout" && typeof parsed.data === "string") {
          term.write(parsed.data);
        } else if (parsed.type === "exit") {
          setState(STATE.ENDED);
          setStatusMsg(
            `Shell exited (code ${parsed.code ?? "?"}). Connection closed.`
          );
          // Don't auto-close the UI — let the operator see the
          // final output. They click the X to dismiss.
        }
      };

      dc.onclose = () => {
        if (cancelled) return;
        if (state !== STATE.ERROR && state !== STATE.ENDED) {
          setState(STATE.ENDED);
          setStatusMsg("Connection closed.");
        }
      };

      // WS handlers. We wait for OPEN before sending the offer; we
      // queue any candidates that fire before then in a small array
      // so they don't get dropped on slow networks.
      const pendingIce = [];

      // `addIceCandidate` RECHAZA si todavía no hay descripción remota, y el
      // agente manda sus candidatos por mensajes independientes de su propia
      // answer. Esa carrera la pierde la answer a menudo: en campo se midió la
      // cola de señales entregando 4 candidatos ANTES que la answer, y el
      // navegador los descartaba todos — ICE se quedaba en `new`, sin una sola
      // pareja que probar, hasta morir de `ice_failed` a los 42 s. Encolar y
      // vaciar DESPUÉS de setRemoteDescription es lo único que lo hace
      // determinista; el orden de llegada no se puede garantizar.
      const applyOrQueueIce = async (cand) => {
        if (!pc.remoteDescription) {
          pendingIce.push(cand);
          return;
        }
        try {
          await pc.addIceCandidate(cand);
        } catch (err) {
          console.warn("[rcp] addIceCandidate failed", err);
        }
      };

      const drainPendingIce = async () => {
        if (!pc.remoteDescription) return;
        for (const cand of pendingIce.splice(0)) {
          try {
            await pc.addIceCandidate(cand);
          } catch (err) {
            console.warn("[rcp] queued addIceCandidate failed", err);
          }
        }
      };

      ws.onopen = async () => {
        if (cancelled) return;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "offer",
                sessionId: session.sessionId,
                sdp: offer.sdp
              })
            );
          }
          // Aquí NO se vacía la cola: acabamos de fijar la descripción
          // LOCAL, la remota sigue sin existir. El vaciado que había en este
          // punto sacaba los candidatos de la cola con splice y dejaba que
          // addIceCandidate los rechazara contra un catch vacío, así que los
          // destruía. El único punto correcto es tras la answer.
        } catch (err) {
          setState(STATE.ERROR);
          setStatusMsg(`Offer creation failed: ${err?.message || err}`);
        }
      };

      ws.onmessage = async (e) => {
        if (cancelled) return;
        let parsed;
        try {
          parsed = JSON.parse(e.data);
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;
        if (parsed.type === "answer" && typeof parsed.sdp === "string") {
          try {
            await pc.setRemoteDescription({
              type: "answer",
              sdp: parsed.sdp
            });
            // Ya hay descripción remota: todo lo que se adelantó a la answer
            // puede aplicarse por fin.
            await drainPendingIce();
          } catch (err) {
            setState(STATE.ERROR);
            setStatusMsg(`setRemoteDescription failed: ${err?.message}`);
          }
        } else if (parsed.type === "ice" && typeof parsed.candidate === "string") {
          const cand = {
            candidate: parsed.candidate,
            sdpMid: parsed.sdpMid,
            sdpMLineIndex: parsed.sdpMLineIndex
          };
          await applyOrQueueIce(cand);
        } else if (parsed.type === "close") {
          setState(STATE.ENDED);
          setStatusMsg(`Session closed (${parsed.reason || "remote"}).`);
        } else if (parsed.type === "error") {
          setState(STATE.ERROR);
          setStatusMsg(
            `${parsed.code || "Error"}: ${parsed.message || "session error"}`
          );
        }
      };

      ws.onerror = () => {
        if (cancelled) return;
        setState(STATE.ERROR);
        setStatusMsg("Signaling WebSocket error.");
      };
      ws.onclose = () => {
        if (cancelled) return;
        // If we were RUNNING this is unexpected; if we were already
        // ENDED it's the normal post-close.
        if (state === STATE.RUNNING) {
          setState(STATE.ENDED);
          setStatusMsg("Signaling channel closed unexpectedly.");
        }
      };
    }

    negotiate();

    return () => {
      cancelled = true;
      try {
        iceRestartDetachRef.current?.();
        iceRestartDetachRef.current = null;
      } catch {
        /* ignore */
      }
      try {
        dcRef.current?.close();
      } catch {
        /* ignore */
      }
      try {
        pcRef.current?.close();
      } catch {
        /* ignore */
      }
      try {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "close",
              sessionId: session.sessionId,
              reason: "user_closed"
            })
          );
        }
        ws?.close();
      } catch {
        /* ignore */
      }
      dcRef.current = null;
      pcRef.current = null;
      wsRef.current = null;
    };
    // `state` is intentionally not a dep: the effect should run
    // exactly once per session prop change. The handlers read the
    // latest state via closure; including state would tear down +
    // re-establish WebRTC on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const statusColor =
    state === STATE.RUNNING
      ? BRAND.teal
      : state === STATE.ERROR
      ? BRAND.alert.errorStrong
      : BRAND.gray;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        bgcolor: NEUTRAL[800],
        borderRadius: 2,
        overflow: "hidden",
        border: `1px solid ${BRAND.border}`,
        minHeight: 420
      }}
    >
      {/* Status bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderBottom: `1px solid ${NEUTRAL[700]}`,
          bgcolor: NEUTRAL[900]
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: statusColor,
            flexShrink: 0
          }}
        />
        <Typography
          variant="caption"
          sx={{
            color: NEUTRAL[100],
            fontFamily: "monospace",
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {device?.hostname || device?.deviceId} · {statusMsg}
        </Typography>
        <Tooltip title="Close session" arrow placement="left">
          <IconButton
            aria-label="Close terminal"
            size="small"
            onClick={onClose}
            sx={{ color: NEUTRAL[500] }}
          >
            <CloseOutlinedIcon sx={{ fontSize: ICON.md }} />
          </IconButton>
        </Tooltip>
      </Box>
      {/* xterm container — flex:1 so it fills the parent's height. */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          minHeight: 380,
          // Touch the inner xterm screen padding so the bottom row
          // isn't cropped by the rounded border.
          "& .xterm-viewport": { padding: "8px" }
        }}
      />
    </Box>
  );
}

function sendResize(dc, cols, rows) {
  if (!dc || dc.readyState !== "open") return;
  try {
    dc.send(JSON.stringify({ type: "resize", cols, rows }));
  } catch {
    /* ignore */
  }
}
