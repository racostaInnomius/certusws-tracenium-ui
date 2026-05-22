// src/components/RemoteControl/ScreenShareViewer.jsx
//
// RCP M3.S2 — live screen share viewer (chunked frame transport).
//
// Architecture:
//   - Same WebRTC + WebSocket signaling bootstrap as ShellTerminal /
//     FileBrowserPanel (browser = offerer, agent = answerer).
//   - DataChannel "rcp.screen" carries JPEG frames encoded as base64
//     strings inside a JSON envelope. The backend never sees frame data.
//   - Agent → Browser protocol (JSON over DataChannel):
//       { op: "screenInfo",  width, height, fps }      // once at open
//       { op: "frame",  seq, width, height, data }     // small frame (M3.S1 compat)
//       { op: "frameStart", seq, width, height, chunks } // large frame header (M3.S2)
//       { op: "frameChunk", seq, idx, data }           // one chunk
//       { op: "frameDone",  seq }                      // all chunks sent
//       { op: "error",  code, message }
//   - Browser → Agent protocol:
//       { op: "setQuality",  fps, quality }  // 1-100 JPEG quality
//       { op: "stop" }                       // graceful close
//
// M3.S2 chunking: large frames are split by the agent into up to N
// chunks of ≤ 48 KB base64 each, staying under the SCTP DataChannel
// limit. The browser reassembles chunks before rendering. Because the
// DataChannel is unreliable (ordered:false, maxRetransmits:0), a dropped
// chunk causes the whole frame to be discarded — the next complete frame
// renders normally. No head-of-line blocking.
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
  IconButton,
  Slider,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import FullscreenOutlinedIcon from "@mui/icons-material/FullscreenOutlined";
import FullscreenExitOutlinedIcon from "@mui/icons-material/FullscreenExitOutlined";

import { BRAND, ROLE } from "../../theme/brand";

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

  // ── Signaling + WebRTC setup ─────────────────────────────────────────
  React.useEffect(() => {
    let destroyed = false;
    const cleanupFns = [];

    (async () => {
      try {
        // 1. Open signaling WebSocket.
        const wsUrl = (() => {
          const u = new URL(
            session.signalingUrl,
            window.location.href.replace(/^http/, "ws")
          );
          u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
          return u.toString();
        })();

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
  function renderFrame(data, width, height) {
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
      case "frame": {
        renderFrame(msg.data, msg.width, msg.height);
        break;
      }

      // M3.S2 — large frame split into chunks. ─────────────────────────
      //
      // frameStart: allocate a reassembly buffer for this seq. Any
      // stale in-progress assembly (from a frame whose chunks were
      // partially dropped by the unreliable transport) is silently
      // discarded — the new frame takes priority.
      case "frameStart": {
        assemblyRef.current = {
          seq:      Number(msg.seq),
          expected: Number(msg.chunks),
          width:    Number(msg.width  || 0),
          height:   Number(msg.height || 0),
          parts:    new Map()
        };
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
        setErrorMsg(msg.message || "Unknown error from agent");
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
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
              // Initial placeholder size — canvas resizes on first frame.
              width: "100%",
              height: "auto"
            }}
          />
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

          {/* Quality slider */}
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
