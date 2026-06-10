// src/components/RemoteControl/ScreenShareViewer.jsx
//
// RCP M3.S4 — live screen share viewer with input forwarding.
//   - M3.S1: WebRTC + canvas rendering of JPEG frames
//   - M3.S2: chunked frame reassembly
//   - M3.S3: RTT telemetry, auto quality adaptation, cursor overlay
//   - M3.S4: mouse + keyboard forwarded to the agent (real control)
//
// Architecture:
//   - Same WebRTC + WebSocket signaling bootstrap as ShellTerminal /
//     FileBrowserPanel (browser = offerer, agent = answerer).
//   - DataChannel "rcp.screen" carries JPEG frames encoded as base64
//     strings inside a JSON envelope. The backend never sees frame data.
//   - Agent → Browser protocol (JSON over DataChannel):
//       { op: "screenInfo",  width, height, fps }
//       { op: "frame",  seq, width, height, data, cursorX, cursorY }     // small
//       { op: "frameStart", seq, width, height, chunks, cursorX, cursorY } // large
//       { op: "frameChunk", seq, idx, data }
//       { op: "frameDone",  seq }
//       { op: "error",  code, message }
//   - Browser → Agent protocol:
//       { op: "setQuality",  fps, quality }
//       { op: "stop" }
//       { op: "mouseMove",  x, y }                  // M3.S4 — native display px
//       { op: "mouseDown",  button, x, y }
//       { op: "mouseUp",    button, x, y }
//       { op: "wheel",      deltaX, deltaY, x, y }
//       { op: "keyDown",    code }                  // JS KeyboardEvent.code
//       { op: "keyUp",      code }
//       { op: "releaseAll" }
//
// M3.S3 features:
//   - RTT measured every 2s via pc.getStats() → footer chip
//   - Auto quality: when ON, quality adjusts based on RTT thresholds:
//       <100ms → 80   |   <200ms → 60   |   <400ms → 40   |   ≥400ms → 25
//     Toggle off to override manually with the slider.
//   - Cursor overlay: agent sends cursorX/Y with each frame; UI renders
//     a small ring over the canvas at the scaled position.
//
// M3.S4 features:
//   - Control toggle in the header. When ON:
//       · Canvas captures mouse/wheel + window-level keydown/keyup
//       · Local cursor is hidden (cursor:none) so only the remote
//         cursor overlay is visible
//       · Right-click context menu suppressed
//       · Esc / blur / toggle-off → sends "releaseAll" to drop any
//         held buttons or modifiers on the remote
//   - Coordinates are translated: clientX/Y → canvas-rect-relative →
//     scaled to native display pixels using liveSize.
//
// Panel layout:
//   ┌────────────────────────────────────────────┐
//   │ Monitor · Screen Share · {device} · status │
//   ├────────────────────────────────────────────┤
//   │                                            │
//   │       <canvas>  (black bg, full flex)      │
//   │                                            │
//   ├────────────────────────────────────────────┤
//   │ {W}×{H} · {fps}fps · Quality slider · ⛶   │
//   └────────────────────────────────────────────┘

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Slider,
  Stack,
  Switch,
  Tooltip,
  Typography
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import FullscreenOutlinedIcon from "@mui/icons-material/FullscreenOutlined";
import FullscreenExitOutlinedIcon from "@mui/icons-material/FullscreenExitOutlined";
import MouseOutlinedIcon from "@mui/icons-material/MouseOutlined";
import PanToolOutlinedIcon from "@mui/icons-material/PanToolOutlined";

import { BRAND, ROLE } from "../../theme/brand";
import { getApiWsUrl } from "../../api/http";

// ── State machine ──────────────────────────────────────────────────────────

const STATE = Object.freeze({
  CONNECTING: "connecting",
  VIEWING:    "viewing",
  ERROR:      "error",
  ENDED:      "ended"
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Rolling FPS counter over the last WINDOW_SIZE frames. */
const FPS_WINDOW = 15;

function computeFps(timestamps) {
  if (timestamps.length < 2) return 0;
  const span = timestamps[timestamps.length - 1] - timestamps[0];
  if (span <= 0) return 0;
  return Math.round(((timestamps.length - 1) / span) * 1000);
}

// M3.S3 — RTT polling cadence. Every 2s is enough to drive the
// auto-quality decision without burdening the connection.
const RTT_POLL_MS = 2000;

// M3.S3 — Map RTT (ms) to a target JPEG quality. The thresholds are
// roughly tuned so that on a good LAN (sub-50ms) we stay at high
// quality, on a typical WAN (~200ms) we sit mid-range, and on a slow
// link (>400ms) we drop quality aggressively to keep the FPS up.
function rttToQuality(rttMs) {
  if (rttMs == null || !Number.isFinite(rttMs)) return 60;
  if (rttMs < 100) return 80;
  if (rttMs < 200) return 60;
  if (rttMs < 400) return 40;
  return 25;
}

// M3.S3 — Map RTT to a status color so the footer chip surfaces
// connection health at a glance.
function rttColor(rttMs, theme) {
  if (rttMs == null) return theme.gray;
  if (rttMs < 100) return theme.positive;
  if (rttMs < 300) return theme.caution;
  return theme.critical;
}

// ── StatusChip ─────────────────────────────────────────────────────────────

function StatusChip({ state }) {
  const map = {
    [STATE.CONNECTING]: { label: "Connecting…", color: ROLE.caution,  bg: ROLE.cautionSoft  },
    [STATE.VIEWING]:    { label: "Live",         color: ROLE.positive, bg: ROLE.positiveSoft },
    [STATE.ERROR]:      { label: "Error",        color: ROLE.critical, bg: ROLE.criticalSoft },
    [STATE.ENDED]:      { label: "Ended",        color: BRAND.gray,   bg: BRAND.surfaceMuted }
  };
  const { label, color, bg } = map[state] ?? map[STATE.ERROR];
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        fontWeight: 700,
        fontSize: 11,
        height: 20,
        bgcolor: bg,
        color,
        border: `1px solid ${color}33`
      }}
    />
  );
}

// ── Main component ─────────────────────────────────────────────────────────

/**
 * Props:
 *   session    — { sessionId, signalingUrl, turnConfig }
 *   device     — { deviceId, hostname, platform }
 *   onClose()  — called when the user closes the panel or the session ends
 */
export default function ScreenShareViewer({ session, device, onClose }) {
  const [state, setState]         = React.useState(STATE.CONNECTING);
  const [errorMsg, setErrorMsg]   = React.useState("");
  const [screenInfo, setScreenInfo] = React.useState(null); // { width, height, fps }
  const [liveSize, setLiveSize]   = React.useState(null);   // last frame { width, height }
  const [liveFps, setLiveFps]     = React.useState(0);
  const [quality, setQuality]     = React.useState(60);     // JPEG quality 1-100
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  // M3.S3 — telemetry & cursor overlay state.
  const [rtt, setRtt]             = React.useState(null);   // ms, null until first sample
  const [autoQuality, setAutoQuality] = React.useState(true);
  const [cursorPos, setCursorPos] = React.useState(null);   // { x, y } in native pixels
  // M3.S4 — input forwarding (real remote control).
  const [controlEnabled, setControlEnabled] = React.useState(false);

  const canvasRef   = React.useRef(null);
  const dcRef       = React.useRef(null);   // RTCDataChannel
  const pcRef       = React.useRef(null);   // RTCPeerConnection
  const wsRef       = React.useRef(null);   // WebSocket (signaling)
  const fpsTimestamps = React.useRef([]);   // rolling frame-arrival timestamps
  const containerRef  = React.useRef(null);
  // M3.S2 — chunked frame reassembly buffer.
  // Shape: { seq: number, expected: number, width: number, height: number,
  //          parts: Map<idx, string> } | null
  const assemblyRef = React.useRef(null);

  // ── Quality slider — debounced send ──────────────────────────────────
  const qualitySendTimer = React.useRef(null);

  function handleQualityChange(_, val) {
    // Moving the slider counts as manual override — disable auto so
    // the next RTT poll doesn't immediately overwrite the choice.
    if (autoQuality) setAutoQuality(false);
    setQuality(val);
    if (qualitySendTimer.current) clearTimeout(qualitySendTimer.current);
    qualitySendTimer.current = setTimeout(() => {
      dcSend({
        op: "setQuality",
        fps: screenInfo?.fps ?? 15,
        quality: val
      });
    }, 300);
  }

  // ── Fullscreen toggle ────────────────────────────────────────────────
  function handleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
  React.useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // M3.S3 — RTT polling via RTCPeerConnection.getStats(). We walk the
  // stats report once every RTT_POLL_MS, find the active candidate
  // pair, and pull `currentRoundTripTime` (seconds). Only runs while
  // the session is VIEWING so we don't poll during teardown.
  React.useEffect(() => {
    if (state !== STATE.VIEWING) return;

    let cancelled = false;

    async function pollRtt() {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const report = await pc.getStats();
        let nominated = null;
        let firstPair = null;
        report.forEach((stat) => {
          if (stat.type !== "candidate-pair") return;
          if (!firstPair) firstPair = stat;
          // `nominated` is the chosen pair after ICE completes.
          if (stat.nominated || stat.state === "succeeded") nominated = stat;
        });
        const pair = nominated || firstPair;
        const rttSec = pair?.currentRoundTripTime;
        if (!cancelled && typeof rttSec === "number" && rttSec >= 0) {
          setRtt(Math.round(rttSec * 1000));
        }
      } catch {
        // getStats can transiently fail during ICE renegotiation — ignore.
      }
    }

    pollRtt();
    const timer = setInterval(pollRtt, RTT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state]);

  // M3.S3 — auto-quality adaptation. When autoQuality is ON and the
  // RTT bucket changes, push the new target down to the agent. We
  // compare to the last sent value so we don't spam setQuality on
  // every RTT sample (the bucket function is stepped, not linear).
  const lastAutoQualityRef = React.useRef(null);
  React.useEffect(() => {
    if (!autoQuality || state !== STATE.VIEWING) {
      lastAutoQualityRef.current = null;
      return;
    }
    const target = rttToQuality(rtt);
    if (lastAutoQualityRef.current === target) return;
    lastAutoQualityRef.current = target;
    setQuality(target);
    dcSend({
      op: "setQuality",
      fps: screenInfo?.fps ?? 15,
      quality: target
    });
  // dcSend is stable (reads from ref); screenInfo.fps included so a
  // pending screenInfo update doesn't ship a stale fps with the quality.
  }, [autoQuality, rtt, state, screenInfo?.fps]);

  // ── M3.S4 — Input forwarding ─────────────────────────────────────────
  //
  // Translate a mouse event's clientX/Y into the agent's native display
  // pixel space. The canvas honors objectFit:contain, so we use the
  // canvas's bounding rect (post-CSS scaling) as the divisor, and
  // multiply by liveSize.width/height (the agent's reported resolution).
  function screenCoordsFromEvent(e) {
    const canvas = canvasRef.current;
    if (!canvas || !liveSize) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const xRel = e.clientX - rect.left;
    const yRel = e.clientY - rect.top;
    const x = Math.round((xRel / rect.width)  * liveSize.width);
    const y = Math.round((yRel / rect.height) * liveSize.height);
    // Clamp to [0..native-1] so a slightly-out-of-bounds click (e.g.
    // hovering the overlay edge during a fast drag) doesn't get
    // rejected by SendInput.
    return {
      x: Math.max(0, Math.min(liveSize.width  - 1, x)),
      y: Math.max(0, Math.min(liveSize.height - 1, y))
    };
  }

  function handleControlMouseMove(e) {
    if (!controlEnabled) return;
    const c = screenCoordsFromEvent(e);
    if (!c) return;
    dcSend({ op: "mouseMove", x: c.x, y: c.y });
  }

  function handleControlMouseDown(e) {
    if (!controlEnabled) return;
    const c = screenCoordsFromEvent(e);
    if (!c) return;
    dcSend({ op: "mouseDown", button: e.button, x: c.x, y: c.y });
  }

  function handleControlMouseUp(e) {
    if (!controlEnabled) return;
    const c = screenCoordsFromEvent(e);
    if (!c) return;
    dcSend({ op: "mouseUp", button: e.button, x: c.x, y: c.y });
  }

  function handleControlWheel(e) {
    if (!controlEnabled) return;
    e.preventDefault();
    const c = screenCoordsFromEvent(e) ?? { x: 0, y: 0 };
    dcSend({
      op: "wheel",
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      x: c.x,
      y: c.y
    });
  }

  function handleControlContextMenu(e) {
    // Suppress the browser's right-click menu while controlling so
    // right-clicks reach the remote app instead.
    if (controlEnabled) e.preventDefault();
  }

  // Keyboard capture lives on the window, not the canvas, because the
  // canvas can't receive focus reliably across browsers. We gate on
  // controlEnabled and only act when the panel is currently active.
  React.useEffect(() => {
    if (!controlEnabled || state !== STATE.VIEWING) return;

    function onKeyDown(e) {
      // Esc is the universal escape hatch: it leaves control mode
      // immediately instead of being forwarded to the remote.
      if (e.code === "Escape") {
        e.preventDefault();
        setControlEnabled(false);
        dcSend({ op: "releaseAll" });
        return;
      }
      e.preventDefault();
      dcSend({ op: "keyDown", code: e.code });
    }
    function onKeyUp(e) {
      if (e.code === "Escape") return;
      e.preventDefault();
      dcSend({ op: "keyUp", code: e.code });
    }
    function onBlur() {
      // Window lost focus — release everything so the remote doesn't
      // get stuck with a held key.
      dcSend({ op: "releaseAll" });
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup",   onKeyUp,   true);
    window.addEventListener("blur",    onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup",   onKeyUp,   true);
      window.removeEventListener("blur",    onBlur);
    };
  // dcSend is stable via closure over dcRef; safe to omit.
  }, [controlEnabled, state]);

  // Toggle off → release everything so we never leave a held key /
  // button on the remote when the operator gives up control.
  function toggleControl() {
    if (controlEnabled) dcSend({ op: "releaseAll" });
    setControlEnabled((v) => !v);
  }

  // ── Signaling + WebRTC setup ─────────────────────────────────────────
  React.useEffect(() => {
    let destroyed = false;
    const cleanupFns = [];

    (async () => {
      try {
        // 1. Open signaling WebSocket on the API origin (api.tracenium.com),
        // not the SPA origin — see getApiWsUrl.
        const wsUrl = getApiWsUrl(session.signalingUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        cleanupFns.push(() => { try { ws.close(); } catch {/**/ } });

        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("WS open timeout")), 10_000);
          ws.onopen  = () => { clearTimeout(t); resolve(); };
          ws.onerror = () => { clearTimeout(t); reject(new Error("WS error")); };
        });
        if (destroyed) return;

        // 2. Create RTCPeerConnection.
        const iceServers = session.turnConfig?.iceServers ?? [];
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;
        cleanupFns.push(() => { try { pc.close(); } catch {/**/ } });

        // 3. Create DataChannel "rcp.screen" before the offer.
        //    ordered: false, maxRetransmits: 0 = unreliable delivery —
        //    a dropped frame is preferable to buffering / head-of-line
        //    blocking on subsequent frames.
        const dc = pc.createDataChannel("rcp.screen", {
          ordered: false,
          maxRetransmits: 0
        });
        dcRef.current = dc;

        dc.onopen = () => {
          if (!destroyed) setState(STATE.VIEWING);
        };
        dc.onclose = () => {
          if (!destroyed) setState(STATE.ENDED);
        };
        dc.onerror = (ev) => {
          if (!destroyed) {
            setErrorMsg(`DataChannel error: ${ev.message || "unknown"}`);
            setState(STATE.ERROR);
          }
        };
        dc.onmessage = (ev) => {
          if (destroyed) return;
          try {
            handleDcMessage(JSON.parse(ev.data));
          } catch {
            // Malformed message — ignore.
          }
        };

        // 4. ICE trickling.
        pc.onicecandidate = ({ candidate }) => {
          if (candidate && !destroyed) {
            ws.send(JSON.stringify({
              type: "ice",
              sessionId: session.sessionId,
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid,
              sdpMLineIndex: candidate.sdpMLineIndex
            }));
          }
        };
        pc.onconnectionstatechange = () => {
          if (destroyed) return;
          const s = pc.connectionState;
          if (s === "failed" || s === "disconnected") {
            setErrorMsg("WebRTC connection lost.");
            setState(STATE.ERROR);
          }
        };

        // 5. WS message handler.
        ws.onmessage = ({ data }) => {
          if (destroyed) return;
          try {
            const msg = JSON.parse(data);
            if (msg.type === "answer") {
              pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
            } else if (msg.type === "ice" && msg.candidate) {
              pc.addIceCandidate({
                candidate: msg.candidate,
                sdpMid: msg.sdpMid,
                sdpMLineIndex: msg.sdpMLineIndex
              });
            } else if (msg.type === "close") {
              if (!destroyed) setState(STATE.ENDED);
            }
          } catch {/**/ }
        };
        ws.onclose = () => {
          if (!destroyed && state !== STATE.VIEWING && state !== STATE.ENDED) {
            setErrorMsg("Signaling WebSocket closed unexpectedly.");
            setState(STATE.ERROR);
          }
        };

        // 6. Generate SDP offer and send to backend.
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({
          type: "offer",
          sessionId: session.sessionId,
          sdp: offer.sdp
        }));
      } catch (err) {
        if (!destroyed) {
          setErrorMsg(err.message || "Setup failed");
          setState(STATE.ERROR);
        }
      }
    })();

    return () => {
      destroyed = true;
      for (const fn of cleanupFns) fn();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId]);

  // ── DataChannel message handler ───────────────────────────────────────

  // Shared render path used by both single-message "frame" (M3.S1
  // small frames) and fully-assembled chunked frames (M3.S2).
  function renderFrame(data, _width, _height) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width  = img.width;
        canvas.height = img.height;
      }
      ctx.drawImage(img, 0, 0);
      setLiveSize({ width: img.width, height: img.height });
    };
    img.src = `data:image/jpeg;base64,${data}`;

    // FPS counter — stamp on message arrival, not on img.onload, so
    // the counter reflects network cadence rather than decode latency.
    const now = performance.now();
    const ts = fpsTimestamps.current;
    ts.push(now);
    if (ts.length > FPS_WINDOW) ts.shift();
    setLiveFps(computeFps(ts));
  }

  // M3.S3 — agent sends cursorX/Y per frame. -1 means PrivSvc couldn't
  // read it (lock screen, RDP detach) — hide overlay in that case.
  function updateCursor(x, y) {
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || nx < 0 || ny < 0) {
      setCursorPos(null);
    } else {
      setCursorPos({ x: nx, y: ny });
    }
  }

  function handleDcMessage(msg) {
    if (!msg?.op) return;

    switch (msg.op) {
      case "screenInfo": {
        setScreenInfo({
          width:  Number(msg.width  || 0),
          height: Number(msg.height || 0),
          fps:    Number(msg.fps    || 15)
        });
        break;
      }

      // M3.S1 — small frame delivered as a single DataChannel message.
      // M3.S3 — cursorX/Y travel on the frame so the overlay stays in
      // sync with the underlying pixels.
      case "frame": {
        renderFrame(msg.data, msg.width, msg.height);
        updateCursor(msg.cursorX, msg.cursorY);
        break;
      }

      // M3.S2 — large frame split into chunks. ─────────────────────────
      //
      // frameStart: allocate a reassembly buffer for this seq. Any
      // stale in-progress assembly (from a frame whose chunks were
      // partially dropped by the unreliable transport) is silently
      // discarded — the new frame takes priority.
      //
      // M3.S3 — cursor pos rides on frameStart since chunks only carry
      // payload data. Updating cursor here keeps the overlay alive
      // even when the next frame's pixels are still in flight.
      case "frameStart": {
        assemblyRef.current = {
          seq:      Number(msg.seq),
          expected: Number(msg.chunks),
          width:    Number(msg.width  || 0),
          height:   Number(msg.height || 0),
          parts:    new Map()
        };
        updateCursor(msg.cursorX, msg.cursorY);
        break;
      }

      // frameChunk: accumulate into the current assembly buffer.
      // Chunks belonging to an older seq (arrived late after a new
      // frameStart) are dropped — we never render stale frames.
      case "frameChunk": {
        const asm = assemblyRef.current;
        if (!asm || asm.seq !== Number(msg.seq)) break;
        asm.parts.set(Number(msg.idx), String(msg.data || ""));

        // All chunks received — assemble and render immediately
        // without waiting for frameDone.
        if (asm.parts.size === asm.expected) {
          const assembled = Array.from(
            { length: asm.expected },
            (_, i) => asm.parts.get(i) ?? ""
          ).join("");
          assemblyRef.current = null;
          renderFrame(assembled, asm.width, asm.height);
        }
        break;
      }

      // frameDone: the agent finished sending all chunks. If we still
      // don't have all of them (unreliable transport dropped some),
      // discard this frame gracefully — the next frameStart resets.
      case "frameDone": {
        const asm = assemblyRef.current;
        if (asm && asm.seq === Number(msg.seq) && asm.parts.size < asm.expected) {
          assemblyRef.current = null; // drop incomplete frame
        }
        break;
      }

      case "error": {
        // Map agent error codes to user-friendly messages where possible.
        //
        // `no_interactive_desktop` is returned by ScreenCaptureDxgi.cs on
        // the agent side when the device has no active interactive desktop
        // — typically a Windows Server with no logged-in user, the lock
        // screen showing with no recent login, or any state where the
        // OS hasn't created a visible desktop for any session. This is
        // an architectural limitation of every screen-capture API on
        // Windows; a Virtual Display Driver is required for "headless"
        // capture and that is out of scope for the current milestone.
        // Surface the situation honestly rather than as a generic
        // "Connection error" so the operator knows what to try instead.
        let friendly;
        if (msg.code === "no_interactive_desktop") {
          friendly = "This device has no active interactive desktop right now. " +
            "Screen sharing needs a user to be logged in. " +
            "For a headless server, use a Shell session (rcp.shell) instead.";
        } else if (msg.code === "screen_capture_no_frame") {
          // Transient — the agent didn't observe a new frame within the
          // timeout, usually because the desktop was idle. The next poll
          // will pick up a frame. Don't tear down on this; ignore.
          break;
        } else {
          friendly = msg.message || "Unknown error from agent";
        }
        setErrorMsg(friendly);
        setState(STATE.ERROR);
        break;
      }

      default:
        break;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  function dcSend(obj) {
    const dc = dcRef.current;
    if (dc?.readyState === "open") {
      dc.send(JSON.stringify(obj));
    }
  }

  function handleStop() {
    dcSend({ op: "stop" });
    onClose?.();
  }

  // ── Render ────────────────────────────────────────────────────────────

  const devLabel = device?.hostname || device?.deviceId || "device";
  const resLabel = liveSize
    ? `${liveSize.width}×${liveSize.height}`
    : screenInfo
    ? `${screenInfo.width}×${screenInfo.height}`
    : "";

  return (
    <Box
      ref={containerRef}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: BRAND.dark,
        borderRadius: 2,
        overflow: "hidden"
      }}
    >
      {/* ── Header ── */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 1.5, bgcolor: BRAND.dark, flexShrink: 0 }}
      >
        <DesktopWindowsOutlinedIcon sx={{ color: BRAND.teal, fontSize: 18 }} />
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, color: "#fff", flex: 1, fontSize: 13 }}
        >
          Screen Share · {devLabel}
        </Typography>

        {/* M3.S4 — Control toggle. When ON, mouse + keyboard are
            forwarded to the agent. Esc inside the viewer also turns
            this off and sends releaseAll. Disabled until VIEWING. */}
        <Tooltip
          title={
            controlEnabled
              ? "Controlling — input is being sent to the device. Press Esc to release."
              : "Take control: mouse + keyboard will be forwarded to the device."
          }
        >
          <span>
            <Button
              size="small"
              variant={controlEnabled ? "contained" : "outlined"}
              onClick={toggleControl}
              disabled={state !== STATE.VIEWING}
              startIcon={
                controlEnabled
                  ? <PanToolOutlinedIcon fontSize="small" />
                  : <MouseOutlinedIcon fontSize="small" />
              }
              sx={{
                textTransform: "none",
                fontSize: 12,
                py: 0.25,
                ...(controlEnabled
                  ? {
                      bgcolor: BRAND.teal,
                      color: BRAND.dark,
                      "&:hover": { bgcolor: BRAND.teal, filter: "brightness(0.95)" }
                    }
                  : {
                      borderColor: BRAND.teal,
                      color: BRAND.teal,
                      "&:hover": { borderColor: BRAND.teal, bgcolor: "rgba(90,159,159,0.12)" }
                    })
              }}
            >
              {controlEnabled ? "Controlling" : "Take control"}
            </Button>
          </span>
        </Tooltip>

        <StatusChip state={state} />
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose} sx={{ color: BRAND.gray }}>
            <CloseOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* ── Error / Ended overlays ── */}
      {(state === STATE.ERROR || state === STATE.ENDED) && (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            bgcolor: "#fff",
            p: 3
          }}
        >
          <Typography
            variant="body1"
            sx={{
              color: state === STATE.ERROR ? ROLE.critical : BRAND.gray,
              fontWeight: 600
            }}
          >
            {state === STATE.ERROR
              ? `Connection error: ${errorMsg}`
              : "Session ended."}
          </Typography>
          <Button variant="outlined" size="small" onClick={onClose}>
            Close
          </Button>
        </Box>
      )}

      {/* ── Connecting spinner ── */}
      {state === STATE.CONNECTING && (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            bgcolor: "#000"
          }}
        >
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
          <Typography variant="body2" sx={{ color: BRAND.gray }}>
            Establishing screen share session…
          </Typography>
        </Box>
      )}

      {/* ── Canvas ── */}
      {state === STATE.VIEWING && (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "#000",
            overflow: "hidden",
            position: "relative"
          }}
        >
          {/* The canvas+overlay live in an inner wrapper sized exactly
              to the rendered frame so the cursor overlay coordinates
              map 1:1 onto displayed pixels (the canvas honors
              objectFit:contain and the wrapper inherits that ratio).
              M3.S4 — when controlEnabled the wrapper gets a teal outline
              so the operator knows their input is being forwarded. */}
          <Box
            sx={{
              position: "relative",
              maxWidth: "100%",
              maxHeight: "100%",
              display: "inline-block",
              lineHeight: 0,
              outline: controlEnabled ? `2px solid ${BRAND.teal}` : "none",
              outlineOffset: "-2px",
              transition: "outline-color 120ms ease"
            }}
          >
            <canvas
              ref={canvasRef}
              onMouseMove={handleControlMouseMove}
              onMouseDown={handleControlMouseDown}
              onMouseUp={handleControlMouseUp}
              onWheel={handleControlWheel}
              onContextMenu={handleControlContextMenu}
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "100%",
                width: "auto",
                height: "auto",
                // M3.S4 — hide local cursor while controlling so only
                // the remote cursor overlay is visible to the operator.
                cursor: controlEnabled ? "none" : "default"
              }}
            />

            {/* M3.S3 — Cursor overlay. Positioned in % so it tracks the
                canvas size at any zoom level. Pointer-events:none so it
                never intercepts clicks (input forwarding is M3.S4). */}
            {cursorPos && liveSize && (
              <Box
                sx={{
                  position: "absolute",
                  left:   `${(cursorPos.x / liveSize.width)  * 100}%`,
                  top:    `${(cursorPos.y / liveSize.height) * 100}%`,
                  width:  14,
                  height: 14,
                  marginLeft: "-7px",
                  marginTop:  "-7px",
                  borderRadius: "50%",
                  border: `2px solid ${BRAND.teal}`,
                  boxShadow: `0 0 0 1px rgba(0,0,0,0.6), 0 0 6px ${BRAND.teal}`,
                  pointerEvents: "none",
                  transition: "left 80ms linear, top 80ms linear"
                }}
              />
            )}
          </Box>

          {/* "Waiting for first frame" state — shown until canvas has content */}
          {liveFps === 0 && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                pointerEvents: "none"
              }}
            >
              <CircularProgress size={20} sx={{ color: BRAND.teal }} />
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                Waiting for first frame…
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ── Footer controls ── */}
      {state === STATE.VIEWING && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          sx={{
            px: 2,
            py: 1,
            bgcolor: BRAND.dark,
            borderTop: `1px solid rgba(255,255,255,0.07)`,
            flexShrink: 0
          }}
        >
          {/* Resolution + FPS readout */}
          <Typography
            variant="caption"
            sx={{
              color: BRAND.gray,
              fontFamily: "monospace",
              whiteSpace: "nowrap",
              minWidth: 110
            }}
          >
            {resLabel || "—"} · {liveFps}fps
          </Typography>

          {/* M3.S3 — RTT chip. Color-coded health hint. */}
          <Tooltip title={rtt == null ? "Measuring round-trip time…" : "Round-trip time"}>
            <Chip
              size="small"
              label={rtt == null ? "RTT —" : `RTT ${rtt}ms`}
              sx={{
                fontWeight: 700,
                fontSize: 11,
                height: 20,
                bgcolor: "rgba(255,255,255,0.06)",
                color: rttColor(rtt, ROLE),
                border: `1px solid ${rttColor(rtt, ROLE)}55`
              }}
            />
          </Tooltip>

          {/* Quality slider + Auto toggle */}
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ flex: 1, minWidth: 0 }}
          >
            <Typography
              variant="caption"
              sx={{ color: BRAND.gray, whiteSpace: "nowrap", flexShrink: 0 }}
            >
              Quality
            </Typography>
            <Slider
              size="small"
              min={10}
              max={90}
              step={5}
              value={quality}
              onChange={handleQualityChange}
              disabled={autoQuality}
              sx={{
                color: BRAND.teal,
                "& .MuiSlider-thumb": { width: 12, height: 12 },
                "& .MuiSlider-rail": { bgcolor: "rgba(255,255,255,0.15)" }
              }}
            />
            <Typography
              variant="caption"
              sx={{
                color: BRAND.gray,
                minWidth: 28,
                textAlign: "right",
                flexShrink: 0
              }}
            >
              {quality}
            </Typography>
            <Tooltip title={
              autoQuality
                ? "Auto: quality adapts to RTT. Move the slider to override."
                : "Auto off — quality stays where you set it."
            }>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={autoQuality}
                    onChange={(e) => setAutoQuality(e.target.checked)}
                    sx={{
                      "& .MuiSwitch-switchBase.Mui-checked": { color: BRAND.teal },
                      "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                        bgcolor: BRAND.teal
                      }
                    }}
                  />
                }
                label={
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    Auto
                  </Typography>
                }
                sx={{ ml: 0.5, mr: 0, flexShrink: 0 }}
              />
            </Tooltip>
          </Stack>

          {/* Fullscreen toggle */}
          <Tooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <IconButton
              size="small"
              onClick={handleFullscreen}
              sx={{ color: BRAND.gray, "&:hover": { color: BRAND.teal } }}
            >
              {isFullscreen ? (
                <FullscreenExitOutlinedIcon fontSize="small" />
              ) : (
                <FullscreenOutlinedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>

          {/* Stop */}
          <Button
            size="small"
            variant="outlined"
            onClick={handleStop}
            sx={{
              borderColor: ROLE.critical,
              color: ROLE.critical,
              textTransform: "none",
              fontSize: 12,
              py: 0.25,
              "&:hover": { borderColor: ROLE.critical, bgcolor: ROLE.criticalSoft }
            }}
          >
            Stop
          </Button>
        </Stack>
      )}
    </Box>
  );
}
