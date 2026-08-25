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
//       { op: "frame",  seq, width, height, data, cursorX, cursorY,
//                       full, x, y, rw, rh }                       // small
//       { op: "frameStart", seq, width, height, chunks, cursorX, cursorY,
//                       full, x, y, rw, rh }                       // large
//       { op: "frameChunk", seq, idx, data }
//       { op: "frameDone",  seq }
//       { op: "error",  code, message, terminal }
//   - Browser → Agent protocol:
//       { op: "setQuality",  fps, quality }   // fps 1-15, quality 10-90
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
// Dirty rects:
//   `width`/`height` are ALWAYS the full desktop size; the canvas is sized
//   from them and input coordinates map through them. `full:false` means
//   `data` is only the region at (x,y) that changed, which we blit over the
//   pixels already on the canvas. That makes frames interdependent over an
//   unreliable DataChannel, so the agent forces a periodic full frame — a
//   dropped region self-heals within one keyframe interval instead of
//   persisting for the whole session.
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

import { BRAND, NEUTRAL, ROLE } from "../../theme/brand";
import { getApiWsUrl } from "../../api/http";
import { attachIceRestart } from "./iceRestart";

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

// Frame rate bounds. These MUST match MIN_FPS / MAX_FPS in the agent's
// screen-session.ts — the agent clamps to its own range and echoes the
// applied value back via `screenInfo`, so a mismatch here just means the
// slider snaps after the round trip.
//
// The default stays at the agent's conservative 5 fps on purpose: a 1080p
// JPEG at quality 60 is ~150-250 KB, so 5 fps is already ~8-10 Mbit/s over
// TURN. Raising the ceiling is the operator's call on a LAN; the real fix
// for bandwidth is dirty-rect capture, not a higher default.
const MIN_FPS = 1;
const MAX_FPS = 15;
const DEFAULT_FPS = 5;

// Operator-facing copy for the capture failures the agent can report. We
// write these rather than showing the agent's own `message`, which is
// phrased for whoever is reading the endpoint log.
//
// Every key here is a stable code produced by one of the three PrivSvc
// implementations (ScreenCaptureDxgi.cs on Windows, privsvc/{macos,linux}
// screen-capture.ts and their native helpers).
const CAPTURE_ERROR_COPY = {
  no_interactive_desktop:
    "This device has no active interactive desktop right now. Screen sharing " +
    "needs a user to be logged in. For a headless server, use a Shell session instead.",
  wayland_unsupported:
    "This device is running a Wayland session, which isn't supported by screen " +
    "sharing yet. Ask the user to log out and back in selecting an X11 / Xorg " +
    "session, then retry. Shell and file sessions work on Wayland normally.",
  // Este texto mandaba al operador a comprobar un perfil MDM que NUNCA puede
  // conceder este permiso: Apple trata Screen Recording como deny-only en
  // PPPC. Decirle que revise el perfil es mandarlo a una tarea imposible.
  no_screen_recording_permission:
    "macOS hasn't granted Screen Recording to the Tracenium capture helper. " +
    "Apple requires a person to approve this on the Mac itself — MDM cannot " +
    "grant it. Ask someone at the device to open System Settings › Privacy & " +
    "Security › Screen Recording and enable Tracenium.",
  // No es un error: es un permiso recién solicitado con alguien decidiendo al
  // otro lado. Se redacta como una acción pendiente y no como un fallo, porque
  // lo que el operador tiene que hacer es hablar con la persona del equipo.
  screen_recording_permission_pending:
    "Waiting for someone at the Mac to approve Screen Recording. macOS has " +
    "just asked, and Tracenium now appears in System Settings › Privacy & " +
    "Security › Screen Recording — ask them to enable it there, then start " +
    "the session again. Apple requires a person to approve this; it cannot " +
    "be granted remotely.",
  screen_capture_helper_missing:
    "The screen capture helper isn't installed on this device. Reinstall or " +
    "upgrade the agent package to deploy it.",
  screen_capture_no_display:
    "This device reports no attached display, so there is nothing to capture.",
  x11_connect_failed:
    "The capture helper could not reach the device's X server. The user may have " +
    "logged out since the session started.",
  screen_capture_unsupported_adapter:
    "This device's display adapter can't do the screen duplication that sharing " +
    "requires — common on virtual machines with a basic or paravirtual display " +
    "adapter. Nothing is wrong with the session; the hardware path isn't there. " +
    "Shell and file sessions work normally.",
  screen_capture_access_denied:
    "The agent was denied access to the desktop. This happens while a UAC prompt " +
    "or the lock screen is showing — retry once it's dismissed. If it persists, " +
    "the agent's service cannot attach to the user's session on this build.",
  screen_capture_init_failed:
    "The device's screen capture stack failed to initialise. A GPU driver issue " +
    "or a locked-down Windows build are the usual causes."
};

// Codes that describe a passing blip rather than a state the operator has to
// act on. Only consulted for agents old enough not to send the `terminal`
// flag — anything unrecognised from those is treated as fatal, matching the
// behaviour before the flag existed.
const TRANSIENT_CAPTURE_CODES = new Set([
  "screen_capture_no_frame",
  "screen_capture_failed",
  "screen_capture_acquire_failed",
  "screen_capture_encode_failed",
  "screen_capture_ipc_error",
  "screen_capture_spawn_failed",
  "screen_capture_no_output",
  "screen_capture_bad_output",
  "sck_failed",
  "out_of_memory"
]);

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
  const [liveSize, setLiveSize]   = React.useState(null);   // full desktop { width, height }
  const [liveFps, setLiveFps]     = React.useState(0);
  const [quality, setQuality]     = React.useState(60);     // JPEG quality 1-100
  const [fps, setFps]             = React.useState(DEFAULT_FPS); // requested capture rate
  // Non-fatal capture trouble: shown as a banner over the still-live canvas
  // instead of replacing the viewer with an error page.
  const [warning, setWarning]     = React.useState("");
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
  // Mirror of liveSize for renderFrame, which lives in the first render's
  // closure (dc.onmessage is bound once) and would otherwise read a stale
  // value forever.
  const liveSizeRef = React.useRef(null);

  // ── Stream settings (fps + quality) ──────────────────────────────────
  //
  // Both travel on the same `setQuality` message, so every send has to carry
  // the CURRENT value of the other one. `fpsRef` mirrors the fps state so the
  // auto-quality effect below can read it without taking fps as a dependency
  // (which would make it re-fire — and re-send — on every fps change).
  //
  // This used to send `fps: screenInfo?.fps ?? 15`, i.e. it echoed back
  // whatever the agent had just reported. The agent reports its own current
  // rate, so the value was always a no-op and the capture rate was pinned at
  // the agent's 5 fps default with no way for the operator to change it.
  const qualitySendTimer = React.useRef(null);
  const fpsSendTimer = React.useRef(null);
  const fpsRef = React.useRef(DEFAULT_FPS);
  React.useEffect(() => {
    fpsRef.current = fps;
  }, [fps]);
  React.useEffect(() => {
    liveSizeRef.current = liveSize;
  }, [liveSize]);

  function sendStreamSettings(nextFps, nextQuality) {
    dcSend({ op: "setQuality", fps: nextFps, quality: nextQuality });
  }

  function handleQualityChange(_, val) {
    // Moving the slider counts as manual override — disable auto so
    // the next RTT poll doesn't immediately overwrite the choice.
    if (autoQuality) setAutoQuality(false);
    setQuality(val);
    if (qualitySendTimer.current) clearTimeout(qualitySendTimer.current);
    qualitySendTimer.current = setTimeout(() => {
      sendStreamSettings(fpsRef.current, val);
    }, 300);
  }

  function handleFpsChange(_, val) {
    setFps(val);
    if (fpsSendTimer.current) clearTimeout(fpsSendTimer.current);
    fpsSendTimer.current = setTimeout(() => {
      sendStreamSettings(val, quality);
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
    // Auto adapts quality only — the operator's chosen frame rate is
    // preserved, so we read it from the ref rather than the render closure.
    sendStreamSettings(fpsRef.current, target);
  // sendStreamSettings only touches refs (dcRef, fpsRef), so it's behaviourally
  // stable even though it's re-created each render. Listing it would re-fire
  // this effect on every render and re-send setQuality on each one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoQuality, rtt, state]);

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

        // 3. Create DataChannel before the offer.
        //    ordered: false, maxRetransmits: 0 = unreliable delivery —
        //    a dropped frame is preferable to buffering / head-of-line
        //    blocking on subsequent frames.
        //
        // ⚠️ Label is "rcp" (plain), NOT "rcp.screen". See
        // FileBrowserPanel.jsx for the empirical bug write-up:
        // node-datachannel on ARM64 fails ICE completion when the
        // label is "rcp.file" or "rcp.screen" specifically. The
        // agent routes by capability not by label so "rcp" is
        // functionally equivalent and avoids the bug.
        const dc = pc.createDataChannel("rcp", {
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
          // Non-terminal — the ICE restart helper handles recovery
          // (see iceRestart.js). For screen-share specifically, a
          // brief reconnect is much better UX than tearing down the
          // viewer mid-presentation: the JPEG stream just pauses,
          // resumes after the new ICE pair is selected.
        };

        // Attach the ICE restart helper. Cap is 2 attempts; after
        // that the helper invokes onFinalFailure and we surface the
        // error. The stream continues to render the last received
        // frame during recovery, so the operator sees a frozen
        // screenshot rather than a black panel.
        const detachIceRestart = attachIceRestart({
          pc,
          ws,
          sessionId: session.sessionId,
          onRestartAttempt: (_attempt) => {
            if (destroyed) return;
            setErrorMsg("");
          },
          onFinalFailure: () => {
            if (destroyed) return;
            setErrorMsg("WebRTC connection lost — retries exhausted.");
            setState(STATE.ERROR);
          }
        });
        cleanupFns.push(detachIceRestart);

        // `addIceCandidate` RECHAZA mientras no haya descripción remota, y los
        // candidatos del agente viajan en mensajes independientes de su propia
        // answer: es habitual que se le adelanten. Sin cola, el navegador los
        // descartaba todos e ICE moría en `new` sin probar una sola pareja.
        // También sirve para el ICE restart, porque su answer entra por este
        // mismo handler (ver iceRestart.js).
        const pendingIce = [];
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

        // 5. WS message handler.
        ws.onmessage = async ({ data }) => {
          if (destroyed) return;
          let msg;
          try {
            msg = JSON.parse(data);
          } catch {
            return;
          }
          try {
            if (msg.type === "answer") {
              await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
              await drainPendingIce();
            } else if (msg.type === "ice" && msg.candidate) {
              const cand = {
                candidate: msg.candidate,
                sdpMid: msg.sdpMid,
                sdpMLineIndex: msg.sdpMLineIndex
              };
              if (!pc.remoteDescription) {
                pendingIce.push(cand);
              } else {
                await pc.addIceCandidate(cand);
              }
            } else if (msg.type === "close") {
              if (!destroyed) setState(STATE.ENDED);
            }
          } catch (err) {
            // Antes el try/catch envolvía promesas sin await, así que no
            // capturaba nada y los fallos se perdían como rechazos sueltos.
            console.warn("[rcp] signaling message failed", msg?.type, err);
          }
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
  /**
   * Paint one update onto the canvas.
   *
   * `meta` describes what `data` actually contains:
   *   { screenW, screenH } — the FULL desktop size. The canvas is sized from
   *     these, never from the decoded image, because a partial update's image
   *     is only the changed region. Getting this wrong also breaks input
   *     forwarding, which maps clicks through liveSize.
   *   { full, x, y } — whether this is the whole desktop or a region to blit
   *     at (x,y) over the pixels already on the canvas.
   *
   * Assigning canvas.width/height CLEARS the canvas, so it must happen only
   * on a real resolution change — otherwise every partial update would wipe
   * the frame it is supposed to be patching.
   */
  function renderFrame(data, meta) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const screenW = Number(meta?.screenW) || 0;
    const screenH = Number(meta?.screenH) || 0;
    const isFull = meta?.full !== false;
    const dx = Number(meta?.x) || 0;
    const dy = Number(meta?.y) || 0;

    const img = new Image();
    img.onload = () => {
      // Fall back to the image's own size for a full frame from an agent
      // that doesn't report screen dimensions.
      const w = screenW || (isFull ? img.width : canvas.width);
      const h = screenH || (isFull ? img.height : canvas.height);

      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        // Resolution change — this wipes the canvas, which is correct here:
        // any partial we still hold refers to the old geometry.
        canvas.width = w;
        canvas.height = h;
        setLiveSize({ width: w, height: h });
      } else if (!liveSizeRef.current) {
        setLiveSize({ width: canvas.width, height: canvas.height });
      }

      if (isFull) {
        ctx.drawImage(img, 0, 0);
      } else {
        // Blit the changed region in place. Everything else on the canvas is
        // still valid from earlier frames.
        ctx.drawImage(img, dx, dy);
      }
    };
    img.src = `data:image/jpeg;base64,${data}`;

    // A frame arrived, so whatever the agent complained about has passed.
    // Functional updates throughout: this runs on every frame, and React
    // bails out when the value is unchanged, so there's no re-render storm.
    // They also sidestep the stale-closure problem — handleDcMessage is
    // captured by dc.onmessage on the first render and never refreshed.
    setWarning((w) => (w ? "" : w));

    // Recover from a terminal capture error without making the operator
    // reconnect. The agent keeps retrying on a slow cadence after reporting
    // one, so the user logging back in (or the PPPC profile landing) resumes
    // the stream on its own — but only if we put the canvas back.
    setState((s) => (s === STATE.ERROR ? STATE.VIEWING : s));
    setErrorMsg((m) => (m ? "" : m));

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
        const appliedFps = Number(msg.fps || DEFAULT_FPS);
        setScreenInfo({
          width:  Number(msg.width  || 0),
          height: Number(msg.height || 0),
          fps:    appliedFps
        });
        // The agent echoes the rate it actually applied (after its own
        // clamp) both on the first frame and whenever setQuality changes it.
        // Snapping the slider to that keeps the control honest instead of
        // showing a number the device never honoured.
        if (Number.isFinite(appliedFps) && appliedFps > 0) {
          setFps(Math.max(MIN_FPS, Math.min(MAX_FPS, Math.round(appliedFps))));
        }
        break;
      }

      // M3.S1 — small frame delivered as a single DataChannel message.
      // M3.S3 — cursorX/Y travel on the frame so the overlay stays in
      // sync with the underlying pixels.
      case "frame": {
        renderFrame(msg.data, {
          screenW: msg.width,
          screenH: msg.height,
          full: msg.full,
          x: msg.x,
          y: msg.y
        });
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
          // Region metadata rides on frameStart; the chunks carry payload only.
          full:     msg.full,
          x:        msg.x,
          y:        msg.y,
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
          renderFrame(assembled, {
            screenW: asm.width,
            screenH: asm.height,
            full: asm.full,
            x: asm.x,
            y: asm.y
          });
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
        const code = String(msg.code || "");

        // Belt-and-braces: the agent no longer forwards this at all (an idle
        // desktop is a normal state, not a failure), but an older agent on a
        // slow upgrade ring might. Never act on it — the canvas already
        // holds the correct pixels.
        if (code === "screen_capture_no_frame") break;

        // `terminal` says whether the device can recover on its own. Agents
        // predating the flag collapsed every failure into one code with no
        // flag; for those, fall back to the code table so we stay at least
        // as conservative as the old behaviour.
        const terminal =
          typeof msg.terminal === "boolean"
            ? msg.terminal
            : !TRANSIENT_CAPTURE_CODES.has(code);

        // Prefer our own copy; fall back to the agent's message, which is
        // written for a log reader but beats showing nothing.
        const friendly =
          CAPTURE_ERROR_COPY[code] ||
          msg.message ||
          "Screen capture failed on the device.";

        if (!terminal) {
          // A blip — a UAC prompt, a fast user switch, a GPU driver reset.
          // The agent already absorbed several of these before telling us,
          // and it keeps trying. Warn over the live canvas and let the next
          // good frame clear it; tearing the viewer down here is exactly
          // what made screen share look broken on healthy machines.
          setWarning(friendly);
          break;
        }

        // Nothing will arrive until something changes on the endpoint
        // (someone logs in, the PPPC profile lands, the session leaves
        // Wayland). Say so plainly — the agent is still retrying slowly in
        // the background, so recovery reopens the stream without a reconnect.
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
          sx={{ fontWeight: 700, color: BRAND.surface, flex: 1, fontSize: 13 }}
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
          <IconButton aria-label="Close screen share" size="small" onClick={onClose} sx={{ color: BRAND.gray }}>
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
            bgcolor: BRAND.surface,
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
            bgcolor: NEUTRAL[0]
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
            bgcolor: NEUTRAL[0],
            overflow: "hidden",
            position: "relative"
          }}
        >
          {/* Non-fatal capture warning. Floats over the last good frame so
              the operator keeps seeing the device while the agent works
              through a transient (UAC prompt, fast user switch, GPU driver
              reset). Clears itself on the next frame that arrives. */}
          {warning && (
            <Box
              sx={{
                position: "absolute",
                top: 8,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 2,
                maxWidth: "90%",
                px: 1.5,
                py: 0.75,
                borderRadius: 1,
                bgcolor: "rgba(0,0,0,0.78)",
                border: `1px solid ${ROLE.caution}66`,
                pointerEvents: "none"
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: ROLE.caution, fontWeight: 600 }}
              >
                {warning}
              </Typography>
            </Box>
          )}

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

          {/* Frame rate slider. Separate from Quality because they trade off
              against each other and the operator needs both knobs: on a LAN
              you want 15fps at quality 80; over a congested TURN relay you
              want 2fps at quality 60 rather than a smooth stream of mush. */}
          <Tooltip title="Capture frame rate. Higher is smoother but costs bandwidth — a 1080p frame is roughly 200 KB, so 15fps is a busy link.">
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
                FPS
              </Typography>
              <Slider
                size="small"
                min={MIN_FPS}
                max={MAX_FPS}
                step={1}
                value={fps}
                onChange={handleFpsChange}
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
                  minWidth: 18,
                  textAlign: "right",
                  flexShrink: 0
                }}
              >
                {fps}
              </Typography>
            </Stack>
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
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
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
