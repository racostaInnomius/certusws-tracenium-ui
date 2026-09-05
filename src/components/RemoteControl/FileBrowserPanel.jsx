// src/components/RemoteControl/FileBrowserPanel.jsx
//
// RCP M2.S2 — file browser panel for rcp.file sessions (hardened).
//
// Architecture:
//   - WebRTC DataChannel carries all file operations (P2P, like
//     ShellTerminal's PTY channel). No file bytes touch the backend.
//   - WebSocket carries signaling (SDP offer/answer + ICE), same
//     infrastructure as the shell sessions.
//   - A simple JSON protocol over the DataChannel:
//       Browser → Agent:
//         { op: "list",     path }
//         { op: "download", transferId, path }
//         { op: "upload",   transferId, path, name, size }
//         { op: "chunk",    transferId, seq, data }   // base64
//         { op: "uploadDone", transferId }
//         { op: "cancel",   transferId }
//       Agent → Browser:
//         { op: "listing",  path, entries: [{name, isDir, size, modifiedAt}] }
//         { op: "chunk",    transferId, seq, data, done? }  // base64
//         { op: "ready",    transferId }  // agent ready to receive upload
//         { op: "uploadComplete", transferId, bytes, sha256 } // it is on disk
//         { op: "roots",    roots: [...], maxUploadBytes }
//         { op: "error",    code, message, transferId? }
//
//   The agent also fires RemoteFileTransferAudit gRPC events at
//   transfer start and completion; the backend persists those to
//   remote_file_transfers for audit. This component doesn't need to
//   know about that — it's transparent.
//
// Panel layout:
//   ┌─────────────────────────────────────────────┐
//   │ Header: device · status strip · Close       │
//   ├─────────────────────────────────────────────┤
//   │ Breadcrumb path bar + Up button             │
//   ├────────────────────┬────────────────────────┤
//   │ File list table    │ Transfer queue panel   │
//   │ (name/size/date)   │ (active + completed)   │
//   │ Download / Upload  │                        │
//   └────────────────────┴────────────────────────┘
//
// For M2.S1 the screen capability is NOT yet wired; this panel
// handles only rcp.file sessions (capability === "rcp.file").

import * as React from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import ArrowUpwardOutlinedIcon from "@mui/icons-material/ArrowUpwardOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import UploadOutlinedIcon from "@mui/icons-material/UploadOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";

import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";
import { getApiWsUrl } from "../../api/http";
import { attachIceRestart } from "./iceRestart";
import useSessionHeartbeat from "./useSessionHeartbeat";
import { describeCloseReason } from "./closeReasons";

// ── State machine ──────────────────────────────────────────────────────────

const STATE = Object.freeze({
  CONNECTING: "connecting",
  BROWSING: "browsing",
  ERROR: "error",
  ENDED: "ended"
});

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function parentPath(path) {
  if (!path || path === "/") return "/";
  const trimmed = path.replace(/\/$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}

// Refusals from the agent's path jail (see plugins/rcp/path-jail.ts). These
// arrive on a `list` with no transferId, so they aren't transfer failures —
// they mean "that location is not reachable in this session".
const PATH_REFUSAL_CODES = new Set([
  "PATH_OUTSIDE_ROOTS",
  "PATH_DENIED",
  "PATH_INVALID",
  "PATH_UNRESOLVABLE"
]);

/** Last path component, for the root shortcut chips: "C:\Users" → "Users".
 *  Falls back to the whole string for a bare drive or "/". */
function shortRootLabel(root) {
  const trimmed = String(root || "").replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : trimmed || "/";
}

/**
 * Etiquetas para TODAS las raíces, desambiguando las que colisionan.
 *
 * El último componente basta casi siempre, y falla justo donde más molesta:
 * dos raíces de logs en árboles distintos dan dos chips llamados "logs" y el
 * operador no sabe cuál abrir. Pasó en campo con
 * ProgramData\Tracenium\logs y ProgramData\Tracenium\PrivSvc\logs.
 *
 * Cuando el nombre corto se repite se antepone el padre —"PrivSvc\logs"—, y
 * solo en las que repiten: alargar todas por una colisión haría ilegible la
 * fila entera.
 */
export function rootLabels(roots) {
  const list = Array.isArray(roots) ? roots : [];
  const counts = new Map();
  for (const r of list) {
    const k = shortRootLabel(r).toLowerCase();
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const out = new Map();
  for (const r of list) {
    const short = shortRootLabel(r);
    if ((counts.get(short.toLowerCase()) || 0) < 2) {
      out.set(r, short);
      continue;
    }
    const parts = String(r).replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
    out.set(r, parts.length >= 2 ? `${parts[parts.length - 2]}\\${short}` : short);
  }
  return out;
}

/** True when `path` sits inside one of the session's roots. Used to stop the
 *  Up button before it walks into a refusal. Case-insensitive because a
 *  Windows agent reports C:\Users while the user may have typed c:\users. */
function isInsideRoots(path, roots) {
  if (!Array.isArray(roots) || roots.length === 0) return true; // unconfined agent
  const p = String(path || "").replace(/[\\/]+$/, "").toLowerCase();
  return roots.some((r) => {
    const root = String(r).replace(/[\\/]+$/, "").toLowerCase();
    return p === root || p.startsWith(root + "/") || p.startsWith(root + "\\");
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusChip({ state }) {
  const map = {
    [STATE.CONNECTING]: { label: "Connecting…", color: ROLE.caution, bg: ROLE.cautionSoft },
    [STATE.BROWSING]:   { label: "Connected",   color: ROLE.positive, bg: ROLE.positiveSoft },
    [STATE.ERROR]:      { label: "Error",        color: ROLE.critical, bg: ROLE.criticalSoft },
    [STATE.ENDED]:      { label: "Ended",        color: BRAND.gray,   bg: BRAND.surfaceMuted }
  };
  const { label, color, bg } = map[state] || map[STATE.ERROR];
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        fontWeight: 700,
        fontSize: TEXT.xs,
        height: 20,
        bgcolor: bg,
        color,
        border: `1px solid ${color}33`
      }}
    />
  );
}

function TransferRow({ transfer, onCancel }) {
  const done =
    transfer.status === "completed" ||
    transfer.status === "failed" ||
    transfer.status === "cancelled";
  const pct =
    transfer.sizeBytes > 0
      ? Math.min(100, Math.round((transfer.transferred / transfer.sizeBytes) * 100))
      : done ? 100 : 0;

  return (
    <Box
      sx={{
        py: 0.75,
        px: 1,
        borderRadius: 1,
        bgcolor: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        mb: 0.5
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        {transfer.direction === "download" ? (
          <DownloadOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.teal, flexShrink: 0 }} />
        ) : (
          <UploadOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.teal, flexShrink: 0 }} />
        )}
        <Tooltip title={transfer.name} placement="top">
          <Typography
            variant="caption"
            sx={{
              flex: 1,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: BRAND.dark,
              minWidth: 0
            }}
          >
            {transfer.name}
          </Typography>
        </Tooltip>
        {transfer.status === "failed" ? (
          <Tooltip title={transfer.errorMsg || "Transfer failed"} placement="top">
            <ErrorOutlineIcon sx={{ fontSize: ICON.sm, color: ROLE.critical, flexShrink: 0 }} />
          </Tooltip>
        ) : transfer.status === "completed" ? (
          <CheckCircleOutlineIcon sx={{ fontSize: ICON.sm, color: ROLE.positive, flexShrink: 0 }} />
        ) : transfer.status === "cancelled" ? (
          <CancelOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.gray, flexShrink: 0 }} />
        ) : null}
        <Typography variant="caption" sx={{ color: BRAND.gray, whiteSpace: "nowrap", flexShrink: 0 }}>
          {transfer.status === "failed"
            ? "Failed"
            : transfer.status === "cancelled"
            ? "Cancelled"
            : transfer.status === "completed"
            ? formatBytes(transfer.sizeBytes)
            : `${pct}%`}
        </Typography>
        {/* Cancel button — only shown while active */}
        {!done && (
          <Tooltip title="Cancel transfer" placement="top">
            <IconButton
              aria-label="Cancel transfer"
              size="small"
              onClick={() => onCancel?.(transfer.id)}
              sx={{ color: BRAND.gray, p: 0.25, flexShrink: 0 }}
            >
              <CloseOutlinedIcon sx={{ fontSize: ICON.xs }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      {!done && (
        <LinearProgress
          variant={pct > 0 ? "determinate" : "indeterminate"}
          value={pct}
          sx={{
            mt: 0.5,
            height: 3,
            borderRadius: 1,
            bgcolor: BRAND.border,
            "& .MuiLinearProgress-bar": { bgcolor: BRAND.teal }
          }}
        />
      )}
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

/**
 * Props:
 *   session    — { sessionId, signalingUrl, turnConfig }
 *   device     — { deviceId, hostname, platform }
 *   onClose()  — called when user closes the panel or session ends
 */
export default function FileBrowserPanel({ session, device, onClose }) {
  const [state, setState] = React.useState(STATE.CONNECTING);
  const [errorMsg, setErrorMsg] = React.useState("");
  // Why the session ended, as the backend reported it. The `close` frame has
  // always carried a reason; this panel discarded it and said "Session ended."
  const [endReason, setEndReason] = React.useState(null);
  const [currentPath, setCurrentPath] = React.useState("/");
  // Roots the agent will let this session reach. `null` = we haven't heard
  // back yet (or the agent is too old to answer), `[]` = old agent, treat
  // the filesystem as unconfined the way we always did.
  const [roots, setRoots] = React.useState(null);
  // Se calcula una vez por cambio de raíces, no una vez por chip.
  const rootLabelMap = React.useMemo(() => rootLabels(roots), [roots]);
  const rootsRef = React.useRef(null);
  const rootsTimerRef = React.useRef(null);
  // Inline "that location is off limits" notice. Distinct from `errorMsg`,
  // which tears the panel down — a refused path leaves the session perfectly
  // usable, the operator just has to go somewhere else.
  const [pathNotice, setPathNotice] = React.useState("");
  const [entries, setEntries] = React.useState([]);
  const [listing, setListing] = React.useState(false);
  const [transfers, setTransfers] = React.useState([]);       // { id, name, path, direction, sizeBytes, transferred, status }
  const [selected, setSelected] = React.useState(new Set());  // M2.S2 multi-select
  const [dragOver, setDragOver] = React.useState(false);      // M2.S2 drag-and-drop
  const uploadRef = React.useRef(null);
  // Mirror `state` into a ref so the `ws.onclose` / async handlers set up
  // INSIDE the setup useEffect can see the live value instead of the value
  // that was current at the time we defined them. Closure capture would
  // otherwise pin them to `STATE.CONNECTING` forever, which means the
  // "Signaling WebSocket closed unexpectedly" branch fires even when the
  // DC opened cleanly and the WS was closed AS PART OF normal teardown.
  // Reproduced 2026-06-10 ~19:35 on Safari + Chrome incognito (cache-free)
  // where the user saw the error every time despite the WebRTC connection
  // technically succeeding end-to-end — the modal showed Establishing →
  // Error in the same beat.
  const stateRef = React.useRef(STATE.CONNECTING);
  React.useEffect(() => { stateRef.current = state; }, [state]);
  const dcRef = React.useRef(null);     // RTCDataChannel
  const pcRef = React.useRef(null);     // RTCPeerConnection
  const wsRef = React.useRef(null);     // WebSocket (signaling)
  // Tope de subida que anuncia el agente; null hasta que llegue (o si el
  // agente es anterior al campo).
  const maxUploadBytesRef = React.useRef(null);

  // File transfers run entirely P2P: the backend sees no byte of them and
  // would otherwise cut a large copy at 30 minutes as "idle".
  useSessionHeartbeat(wsRef);
  const pendingChunksRef = React.useRef({}); // transferId -> { chunks, totalSeq, blob }

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
          ws.onopen = () => { clearTimeout(t); resolve(); };
          ws.onerror = () => { clearTimeout(t); reject(new Error("WS error")); };
        });
        if (destroyed) return;

        // 2. Create RTCPeerConnection (browser = offerer).
        const iceServers = session.turnConfig?.iceServers ?? [];
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;
        cleanupFns.push(() => { try { pc.close(); } catch {/**/ } });

        // 3. Create DataChannel before offer (so it appears in the
        //    offer's SDP). The agent keys on the offer's `capability`
        //    field (not the DataChannel label) to set up the file
        //    transfer handler — see peer-session.ts onDataChannel.
        //    So the label here is purely for our own debugging; the
        //    agent ignores it.
        //
        // ⚠️ Bug-avoidance — use plain label "rcp" not "rcp.file":
        //
        // We discovered empirically that node-datachannel on the agent
        // (Windows ARM64, libdatachannel ABI version shipped with
        // 0.32.3) fails ICE check completion when the offerer's
        // DataChannel label is "rcp.file" or "rcp.screen" specifically.
        // Same code with label "rcp" or "rcp.shell" opens cleanly in
        // ~2s. Reproduced 2026-06-10 21:50 on W11-JPR-Lab01 across
        // four sequential tests, agent restart in between:
        //   label="rcp"        → DC OPEN 2.1s ✅
        //   label="rcp.shell"  → DC OPEN 1.9s ✅
        //   label="rcp.file"   → 20s timeout, ws-close(1005) ❌
        //   label="rcp.foo"    → 20s timeout ❌
        //
        // The label appears in the DCEP (RFC 8832) AFTER the SCTP
        // handshake completes — so in theory it cannot affect ICE.
        // The empirical reality says otherwise: there is a parser
        // path in libdatachannel that mis-handles certain label
        // strings during SDP negotiation. We have not isolated the
        // exact bytes that trip it; "rcp.shell" is fine but
        // "rcp.file" is not, despite both having the same shape.
        //
        // Fix: use the simplest label that works. "rcp" is what our
        // E2E console tests have always used (and they always
        // worked); the agent doesn't care what we call the channel
        // because it routes by capability.
        //
        // ⚠️ Do NOT pass `{ ordered: true }` either — separate
        // libdatachannel bug, also discovered empirically earlier
        // today, see ShellTerminal.jsx for the full notes.
        const dc = pc.createDataChannel("rcp");
        dcRef.current = dc;

        dc.onopen = () => {
          if (!destroyed) {
            setState(STATE.BROWSING);
            // Ask where we're allowed to start. The agent confines the
            // session to a set of roots, so "/" is normally outside it —
            // we can't just open there any more.
            dcSend({ op: "roots" });
            // Agents older than the confinement change never answer that
            // op. Fall back to the historical behaviour if nothing arrives,
            // so a mixed-version fleet keeps working during the rollout.
            rootsTimerRef.current = setTimeout(() => {
              if (destroyed) return;
              if (rootsRef.current === null) {
                rootsRef.current = [];
                sendList("/");
              }
            }, 1500);
          }
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
            // Non-JSON or malformed — ignore
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
          // No longer terminal-on-failed — the ICE restart helper
          // attached below gets first crack at recovery. Only after
          // its retries are exhausted (via onFinalFailure) do we go
          // to STATE.ERROR. See iceRestart.js for rationale.
        };

        // Attach the ICE restart helper. Same behaviour as in the
        // shell terminal: failed/disconnected ICE triggers a new
        // `pc.createOffer({ iceRestart: true })`, capped at 2 tries.
        // Without this, a brief WiFi hiccup mid-file-transfer would
        // kill the session and the user would have to click Files
        // again and pick the path back; the helper recovers
        // transparently.
        const detachIceRestart = attachIceRestart({
          pc,
          ws,
          sessionId: session.sessionId,
          onRestartAttempt: (attempt) => {
            if (destroyed) return;
            setErrorMsg(""); // clear stale message during recovery
            // We don't transition out of BROWSING — the file table
            // stays usable as-is during the brief renegotiation.
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
              if (!destroyed) {
                setEndReason(msg.reason ?? null);
                setState(STATE.ENDED);
              }
            } else if (msg.type === "error") {
              // Never handled before, so a session refused before it opened —
              // consent declined, most importantly — arrived as a plain
              // "Session ended."
              if (!destroyed) {
                const { title, detail } = describeCloseReason(msg.code);
                setErrorMsg(detail ? `${title} ${detail}` : title || msg.message || "Session error");
                setState(STATE.ERROR);
              }
            }
          } catch (err) {
            // Antes el try/catch envolvía promesas sin await, así que no
            // capturaba nada y los fallos se perdían como rechazos sueltos.
            console.warn("[rcp] signaling message failed", msg?.type, err);
          }
        };
        ws.onclose = (ev) => {
          // Use the ref instead of `state` (closure-captured value would
          // forever be CONNECTING, since this handler was defined during
          // the first render of the effect). The signaling WS is allowed
          // to close as part of normal teardown once we've entered
          // BROWSING — at that point the WebRTC DataChannel is the only
          // transport that matters and the signaling channel is moot.
          // Suppress the "closed unexpectedly" error in BROWSING / ENDED;
          // also suppress for clean closes (wasClean=true with code 1000
          // or 1001 = going away — eg StrictMode double-mount in dev,
          // operator dismissing the drawer, server-side teardown). Only
          // surface the error when we're still mid-handshake AND the
          // close was unclean — that's the only state that actually
          // means "your session is broken before it ever worked."
          if (destroyed) return;
          const s = stateRef.current;
          if (s === STATE.BROWSING || s === STATE.ENDED) return;
          // 1000 = normal close, 1001 = going away — both benign here.
          if (ev?.wasClean && (ev.code === 1000 || ev.code === 1001)) return;
          setErrorMsg("Signaling WebSocket closed unexpectedly.");
          setState(STATE.ERROR);
        };

        // 6. Generate offer and send.
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
      if (rootsTimerRef.current) {
        clearTimeout(rootsTimerRef.current);
        rootsTimerRef.current = null;
      }
      for (const fn of cleanupFns) fn();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId]);

  // ── DataChannel message handler ───────────────────────────────────────

  function handleDcMessage(msg) {
    if (!msg || !msg.op) return;

    switch (msg.op) {
      case "listing": {
        setCurrentPath(msg.path ?? currentPath);
        setEntries(Array.isArray(msg.entries) ? msg.entries : []);
        setListing(false);
        // A successful listing means we're somewhere legal again.
        setPathNotice("");
        break;
      }
      case "chunk": {
        const tid = msg.transferId;
        if (!tid) break;
        const buf = pendingChunksRef.current[tid];
        if (!buf) break;
        // Decode base64 chunk and push to chunks array.
        const binary = atob(msg.data || "");
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        buf.chunks.push(bytes);
        buf.transferred = (buf.transferred || 0) + bytes.length;

        setTransfers((prev) =>
          prev.map((t) =>
            t.id === tid ? { ...t, transferred: buf.transferred } : t
          )
        );

        if (msg.done) {
          // Assemble blob and trigger browser download.
          const blob = new Blob(buf.chunks, { type: "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = buf.filename;
          a.click();
          URL.revokeObjectURL(url);
          delete pendingChunksRef.current[tid];

          setTransfers((prev) =>
            prev.map((t) =>
              t.id === tid
                ? { ...t, status: "completed", sizeBytes: buf.transferred }
                : t
            )
          );
        }
        break;
      }
      case "ready": {
        // Agent is ready to receive an upload. The upload logic
        // starts the chunk-sending loop here.
        const tid = msg.transferId;
        const upload = pendingChunksRef.current[tid];
        if (!upload || !upload.file) break;
        startUploadChunks(tid, upload.file);
        break;
      }
      // ⚠️ The agent, not the browser, decides an upload is finished.
      //
      // This panel used to flip the row to "Completed" as soon as it had
      // handed its last chunk to the DataChannel. That says the bytes left
      // the browser — not that they arrived, not that the file was whole,
      // and not that the rename onto the destination succeeded. Combined
      // with a send path that dropped chunks in silence, it meant a
      // truncated file could be reported as a completed transfer.
      case "uploadComplete": {
        const tid = msg.transferId;
        delete pendingChunksRef.current[tid];
        setTransfers((prev) =>
          prev.map((t) =>
            t.id === tid
              ? {
                  ...t,
                  status: "completed",
                  transferred: Number(msg.bytes) || t.transferred,
                  // Kept for the operator to compare against their own copy.
                  // The audit trail's job is to answer "which file exactly",
                  // and a size alone does not.
                  sha256: typeof msg.sha256 === "string" ? msg.sha256 : null
                }
              : t
          )
        );
        break;
      }
      // The agent tells us which subtrees this session may reach. Sent in
      // reply to { op: "roots" } at channel open.
      case "roots": {
        if (rootsTimerRef.current) {
          clearTimeout(rootsTimerRef.current);
          rootsTimerRef.current = null;
        }
        const list = Array.isArray(msg.roots) ? msg.roots.filter(Boolean) : [];
        rootsRef.current = list;
        // El tope de subida del equipo, tal como lo dice su política. Llega
        // con las raíces porque es la misma pregunta: qué se puede hacer
        // aquí. Un agente anterior a este campo no lo manda y entonces no se
        // impone ninguno en el navegador — el del agente sigue puesto, y
        // rechazar aquí por un valor que no conocemos sería inventarlo.
        maxUploadBytesRef.current =
          Number.isFinite(Number(msg.maxUploadBytes)) && Number(msg.maxUploadBytes) > 0
            ? Number(msg.maxUploadBytes)
            : null;
        setRoots(list);
        if (list.length > 0) {
          setCurrentPath(list[0]);
          sendList(list[0]);
        } else {
          // Confined to nothing — the operator has an empty roots list in
          // policy. Say so rather than showing an empty directory.
          setErrorMsg(
            "Remote file access is enabled but no allowed locations are configured for this device."
          );
          setState(STATE.ERROR);
        }
        break;
      }

      case "error": {
        const tid = msg.transferId;
        if (tid) {
          delete pendingChunksRef.current[tid];
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === tid ? { ...t, status: "failed", errorMsg: msg.message } : t
            )
          );
          break;
        }
        // Sin transferId, el error viene de un `list`: la petición murió y
        // nadie más va a apagar el spinner.
        //
        // Esto solo miraba PATH_REFUSAL_CODES, o sea los rechazos de la jaula,
        // y dejaba fuera el caso más común en campo: LIST_FAILED, que es lo
        // que manda el agente cuando readdir falla. Y readdir falla a menudo
        // por motivos perfectamente normales — en macOS TCC le niega
        // ~/Downloads a un LaunchDaemon sin Full Disk Access aunque corra como
        // root, y en Linux el servicio no tiene permiso para entrar en los
        // home de otros usuarios. En esos casos el panel se quedaba girando
        // para siempre, sin decir nada.
        //
        // Cualquier error sin transferId apaga el spinner y se muestra. Un
        // mensaje que el operador no esperaba es mejor que un spinner eterno:
        // al menos dice qué pasó.
        setListing(false);
        setPathNotice(
          msg.message ||
            (PATH_REFUSAL_CODES.has(msg.code)
              ? "That location is not available."
              : "Could not read that folder.")
        );
        break;
      }
      default:
        break;
    }
  }

  // ── DataChannel send helpers ──────────────────────────────────────────

  function dcSend(obj) {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(JSON.stringify(obj));
      return true;
    }
    // ⚠️ Returns false rather than pretending. This used to drop the message
    // and say nothing, and the upload loop kept going — so a transfer whose
    // channel had closed carried on "sending" chunks into nowhere and then
    // reported success.
    return false;
  }

  function sendList(path) {
    setListing(true);
    setEntries([]);
    dcSend({ op: "list", path });
  }

  function handleNavigate(path) {
    setCurrentPath(path);
    sendList(path);
  }

  function handleUp() {
    const p = parentPath(currentPath);
    if (p === currentPath) return;
    // Stop at the root boundary rather than letting the agent refuse — the
    // operator gets a disabled button instead of an error they can't act on.
    if (!isInsideRoots(p, roots)) return;
    handleNavigate(p);
  }

  /** True when Up would leave the jail (or we're already at the top). */
  const atTopOfJail =
    currentPath === "/" || !isInsideRoots(parentPath(currentPath), roots);

  function handleDownload(entry) {
    const transferId = crypto.randomUUID();
    const fullPath = currentPath.replace(/\/$/, "") + "/" + entry.name;
    pendingChunksRef.current[transferId] = {
      chunks: [],
      transferred: 0,
      filename: entry.name,
      sizeBytes: entry.size || null
    };
    setTransfers((prev) => [
      {
        id: transferId,
        name: entry.name,
        path: fullPath,
        direction: "download",
        sizeBytes: entry.size || null,
        transferred: 0,
        status: "active"
      },
      ...prev
    ]);
    dcSend({ op: "download", transferId, path: fullPath });
  }

  function handleUploadClick() {
    uploadRef.current?.click();
  }

  function handleFileSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";  // reset so same file can be re-selected
    for (const file of files) {
      queueUpload(file);
    }
  }

  /**
   * Stream a file to the agent, chunk by chunk.
   *
   * ── What this used to get wrong ────────────────────────────────────
   *
   * It chained FileReader callbacks and pushed every chunk into `dcSend` as
   * fast as it could read them, then declared the transfer "Completed" the
   * moment the last one had been handed over. Three separate problems, all
   * invisible:
   *
   *   · No backpressure. `dc.send()` queues into the SCTP buffer; a large
   *     file fills it faster than the network drains it. The channel either
   *     stalls or is torn down for overrunning its buffer.
   *   · Silent drops. `dcSend` discarded anything sent while the channel was
   *     not open and returned nothing, so the loop never knew.
   *   · Optimistic completion. "I sent the last chunk" is not "the file is on
   *     the disk" — and with the two problems above, frequently was not.
   *
   * Now: await the buffer when it fills, stop on the first failed send, and
   * let the AGENT say when it is done (`uploadComplete`).
   */
  async function startUploadChunks(transferId, file) {
    const CHUNK_SIZE = 64 * 1024;
    // Pause at 4 MB queued and resume at 1 MB. Chosen relative to the chunk
    // size, not to the file: it bounds how much of the file can be in flight
    // regardless of how big the file is, which is the whole point.
    const HIGH_WATER = 4 * 1024 * 1024;
    const LOW_WATER = 1 * 1024 * 1024;

    const dc = dcRef.current;

    /** Resolve once the SCTP buffer has drained below the low-water mark. */
    /**
     * Espera a que el búfer SCTP baje del umbral.
     *
     * ⚠️ Resuelve también si el canal se CIERRA mientras espera. Sin eso, un
     * canal que muere con el búfer lleno dejaba esta promesa sin resolver
     * para siempre: el bucle de subida se quedaba colgado, la transferencia
     * eterna en "activa", y el operador mirando una barra que no avanzaba ni
     * fallaba. Un cuelgue silencioso es peor que un error.
     *
     * Al volver, el bucle vuelve a mirar `readyState` y falla como debe.
     */
    function waitForDrain() {
      return new Promise((resolve) => {
        dc.bufferedAmountLowThreshold = LOW_WATER;
        const done = () => {
          dc.removeEventListener("bufferedamountlow", onLow);
          dc.removeEventListener("close", done);
          dc.removeEventListener("error", done);
          resolve();
        };
        const onLow = () => done();
        dc.addEventListener("bufferedamountlow", onLow);
        dc.addEventListener("close", done);
        dc.addEventListener("error", done);
      });
    }

    function failTransfer(message) {
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId ? { ...t, status: "failed", error: message } : t
        )
      );
      delete pendingChunksRef.current[transferId];
    }

    try {
      let offset = 0;
      let seq = 0;
      while (offset < file.size) {
        if (!pendingChunksRef.current[transferId]) return; // cancelled
        if (!dc || dc.readyState !== "open") {
          failTransfer("The connection closed before the file finished sending.");
          return;
        }
        if (dc.bufferedAmount > HIGH_WATER) await waitForDrain();

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const bytes = new Uint8Array(await slice.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i += 1) {
          binary += String.fromCharCode(bytes[i]);
        }
        if (!dcSend({ op: "chunk", transferId, seq, data: btoa(binary) })) {
          failTransfer("The connection closed before the file finished sending.");
          return;
        }
        seq += 1;
        offset += bytes.byteLength;

        const transferred = offset;
        setTransfers((prev) =>
          prev.map((t) => (t.id === transferId ? { ...t, transferred } : t))
        );
      }

      // Hand over and WAIT. The transfer stays "active" until the agent
      // confirms the file was written and renamed into place; if it never
      // does, the operator sees an unfinished transfer, which is the truth.
      if (!dcSend({ op: "uploadDone", transferId })) {
        failTransfer("The connection closed before the file finished sending.");
      }
    } catch (err) {
      failTransfer(err?.message || "The file could not be read.");
    }
  }

  // ── M2.S2 — Cancel in-flight transfer ────────────────────────────────

  function handleCancelTransfer(transferId) {
    dcSend({ op: "cancel", transferId });
    delete pendingChunksRef.current[transferId];
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === transferId ? { ...t, status: "cancelled" } : t
      )
    );
  }

  // ── M2.S2 — Multi-select helpers ─────────────────────────────────────

  function toggleSelect(entryName) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryName)) next.delete(entryName);
      else next.add(entryName);
      return next;
    });
  }

  function handleDownloadSelected() {
    for (const name of selected) {
      const entry = entries.find((e) => e.name === name && !e.isDir);
      if (entry) handleDownload(entry);
    }
    setSelected(new Set());
  }

  // Clear selection whenever we navigate to a new path.
  // (handled in handleNavigate via setCurrentPath which triggers
  //  the listing update — we reset on listing change)
  React.useEffect(() => {
    setSelected(new Set());
  }, [currentPath]);

  // ── M2.S2 — Drag-and-drop upload ─────────────────────────────────────

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  }

  function handleDragLeave(e) {
    // Only clear if leaving the container (not a child element).
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOver(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (state !== STATE.BROWSING) return;
    const files = Array.from(e.dataTransfer?.files || []);
    for (const file of files) {
      queueUpload(file);
    }
  }

  // Shared upload-queue logic used by both file-picker and drag-drop.
  function queueUpload(file) {
    const transferId = crypto.randomUUID();
    const destPath = currentPath.replace(/\/$/, "") + "/" + file.name;

    // ⚠️ Antes de empezar, no después.
    //
    // El agente ya rechaza lo que se pasa del tope, pero lo hacía cuando la
    // subida ya estaba en marcha: el operador veía una barra avanzar y, al
    // final, un fallo. Con ficheros grandes eso son minutos de espera para un
    // "no" que se sabía desde el primer byte.
    //
    // Se comprueba solo si el agente dijo su tope. Rechazar por un límite que
    // no conocemos sería inventárnoslo, y el agente sigue teniendo el suyo.
    const cap = maxUploadBytesRef.current;
    if (cap && file.size > cap) {
      setTransfers((prev) => [
        {
          id: transferId,
          name: file.name,
          path: destPath,
          direction: "upload",
          sizeBytes: file.size,
          transferred: 0,
          status: "failed",
          errorMsg: `This device accepts uploads up to ${formatBytes(cap)}; this file is ${formatBytes(file.size)}.`
        },
        ...prev
      ]);
      return;
    }
    pendingChunksRef.current[transferId] = { file, transferred: 0 };
    setTransfers((prev) => [
      {
        id: transferId,
        name: file.name,
        path: destPath,
        direction: "upload",
        sizeBytes: file.size,
        transferred: 0,
        status: "active"
      },
      ...prev
    ]);
    dcSend({
      op: "upload",
      transferId,
      path: destPath,
      name: file.name,
      size: file.size
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const devLabel = device?.hostname || device?.deviceId || "device";
  const activeTransfers = transfers.filter((t) => t.status === "active");
  const doneTransfers = transfers.filter((t) => t.status !== "active");
  const fileEntries = entries.filter((e) => !e.isDir);
  const allFilesSelected =
    fileEntries.length > 0 && fileEntries.every((e) => selected.has(e.name));

  return (
    <Box
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
        <FolderOutlinedIcon sx={{ color: BRAND.teal, fontSize: ICON.lg }} />
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, color: BRAND.surface, flex: 1, fontSize: TEXT.md }}
        >
          File Manager · {devLabel}
        </Typography>
        <StatusChip state={state} />
        <Tooltip title="Close">
          <IconButton aria-label="Close file browser" size="small" onClick={onClose} sx={{ color: BRAND.gray }}>
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
              : describeCloseReason(endReason).title}
          </Typography>
          {state !== STATE.ERROR && describeCloseReason(endReason).detail ? (
            <Typography
              variant="body2"
              sx={{ color: BRAND.gray, maxWidth: 420, textAlign: "center" }}
            >
              {describeCloseReason(endReason).detail}
            </Typography>
          ) : null}
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
            bgcolor: BRAND.surface
          }}
        >
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
          <Typography variant="body2" sx={{ color: BRAND.gray }}>
            Establishing file transfer session…
          </Typography>
        </Box>
      )}

      {/* ── Browsing UI ── */}
      {state === STATE.BROWSING && (
        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", bgcolor: BRAND.surface }}>
          {/* Path bar */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ px: 2, py: 1, borderBottom: `1px solid ${BRAND.border}` }}
          >
            <Tooltip title="Parent directory">
              <span>
                <IconButton
                  aria-label="Go to parent directory"
                  size="small"
                  onClick={handleUp}
                  disabled={atTopOfJail}
                  sx={{ color: BRAND.teal }}
                >
                  <ArrowUpwardOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton
                aria-label="Refresh directory listing"
                size="small"
                onClick={() => sendList(currentPath)}
                disabled={listing}
                sx={{ color: BRAND.teal }}
              >
                {listing ? (
                  <CircularProgress size={14} sx={{ color: BRAND.teal }} />
                ) : (
                  <RefreshOutlinedIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
            {/* Root shortcuts. Only worth showing when the agent gave us
                more than one — with a single root the Up button already
                clamps there and a lone chip is just noise. */}
            {Array.isArray(roots) && roots.length > 1 && (
              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                {roots.map((r) => (
                  <Tooltip key={r} title={r}>
                    <Chip
                      size="small"
                      label={rootLabelMap.get(r) || shortRootLabel(r)}
                      onClick={() => handleNavigate(r)}
                      variant={isInsideRoots(currentPath, [r]) ? "filled" : "outlined"}
                      sx={{
                        maxWidth: 140,
                        fontSize: TEXT.xs,
                        height: 22,
                        cursor: "pointer",
                        ...(isInsideRoots(currentPath, [r])
                          ? { bgcolor: BRAND.tealSoft, color: BRAND.teal }
                          : { borderColor: BRAND.border, color: BRAND.gray })
                      }}
                    />
                  </Tooltip>
                ))}
              </Stack>
            )}
            <Typography
              variant="caption"
              sx={{
                flex: 1,
                fontFamily: "monospace",
                color: BRAND.dark,
                fontWeight: 600,
                userSelect: "all"
              }}
            >
              {currentPath}
            </Typography>
            <Button
              size="small"
              startIcon={<UploadOutlinedIcon />}
              variant="outlined"
              onClick={handleUploadClick}
              sx={{
                borderColor: BRAND.teal,
                color: BRAND.teal,
                textTransform: "none",
                fontSize: TEXT.sm,
                "&:hover": { borderColor: BRAND.teal, bgcolor: BRAND.tealSoft }
              }}
            >
              Upload
            </Button>
            <input
              ref={uploadRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={handleFileSelected}
            />
          </Stack>

          {/* Path refused by the agent's confinement policy. Non-fatal: the
              session is fine, this location just isn't reachable. */}
          {pathNotice && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                px: 2,
                py: 1,
                bgcolor: ROLE.cautionSoft,
                borderBottom: `1px solid ${BRAND.border}`
              }}
            >
              <LockOutlinedIcon sx={{ fontSize: ICON.md, color: ROLE.caution }} />
              <Typography variant="caption" sx={{ color: ROLE.caution, fontWeight: 600 }}>
                {pathNotice}
              </Typography>
            </Stack>
          )}

          {/* Split: file list + transfer queue */}
          <Grid container sx={{ flex: 1, overflow: "hidden" }}>
            {/* File list */}
            <Grid
              item
              xs={12}
              md={7}
              sx={{
                borderRight: `1px solid ${BRAND.border}`,
                overflow: "auto",
                height: "100%",
                position: "relative"
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Drag-and-drop overlay */}
              {dragOver && (
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 10,
                    bgcolor: `${BRAND.teal}18`,
                    border: `2px dashed ${BRAND.teal}`,
                    borderRadius: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    pointerEvents: "none"
                  }}
                >
                  <CloudUploadOutlinedIcon sx={{ fontSize: ICON["2xl"], color: BRAND.teal }} />
                  <Typography variant="body2" sx={{ color: BRAND.teal, fontWeight: 700 }}>
                    Drop files to upload to {currentPath}
                  </Typography>
                </Box>
              )}

              {/* Multi-select toolbar */}
              {selected.size > 0 && (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    bgcolor: BRAND.tealSoft,
                    borderBottom: `1px solid ${BRAND.border}`
                  }}
                >
                  <Typography variant="caption" sx={{ color: BRAND.teal, fontWeight: 700, flex: 1 }}>
                    {selected.size} file{selected.size > 1 ? "s" : ""} selected
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<DownloadOutlinedIcon />}
                    onClick={handleDownloadSelected}
                    sx={{
                      textTransform: "none",
                      fontSize: TEXT.sm,
                      color: BRAND.teal,
                      borderColor: BRAND.teal,
                      "&:hover": { bgcolor: BRAND.tealSoft }
                    }}
                    variant="outlined"
                  >
                    Download {selected.size > 1 ? `${selected.size} files` : ""}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => setSelected(new Set())}
                    sx={{ textTransform: "none", fontSize: TEXT.sm, color: BRAND.gray }}
                  >
                    Clear
                  </Button>
                </Stack>
              )}

              {listing && entries.length === 0 ? (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 120
                  }}
                >
                  <CircularProgress size={22} sx={{ color: BRAND.teal }} />
                </Box>
              ) : entries.length === 0 ? (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 120
                  }}
                >
                  <Typography variant="body2" sx={{ color: BRAND.gray }}>
                    Directory is empty. Drop files here to upload.
                  </Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {/* Select-all checkbox for files only */}
                        <TableCell padding="checkbox" sx={{ width: 42 }}>
                          <Checkbox
                            size="small"
                            indeterminate={selected.size > 0 && !allFilesSelected}
                            checked={allFilesSelected}
                            onChange={() => {
                              if (allFilesSelected) {
                                setSelected(new Set());
                              } else {
                                setSelected(new Set(fileEntries.map((e) => e.name)));
                              }
                            }}
                            sx={{ color: BRAND.gray, "&.Mui-checked": { color: BRAND.teal } }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, color: BRAND.dark, fontSize: TEXT.sm }}>
                          Name
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 700, color: BRAND.dark, fontSize: TEXT.sm, width: 90 }}
                        >
                          Size
                        </TableCell>
                        <TableCell
                          sx={{ fontWeight: 700, color: BRAND.dark, fontSize: TEXT.sm, width: 150 }}
                        >
                          Modified
                        </TableCell>
                        <TableCell sx={{ width: 48 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {entries.map((entry) => {
                        const isSelected = !entry.isDir && selected.has(entry.name);
                        return (
                          <TableRow
                            key={entry.name}
                            hover
                            selected={isSelected}
                            sx={{
                              cursor: entry.isDir ? "pointer" : "default",
                              "&.Mui-selected": { bgcolor: `${BRAND.teal}10` }
                            }}
                            onClick={
                              entry.isDir
                                ? () =>
                                    handleNavigate(
                                      (currentPath === "/"
                                        ? ""
                                        : currentPath.replace(/\/$/, "")) +
                                        "/" +
                                        entry.name
                                    )
                                : undefined
                            }
                          >
                            <TableCell padding="checkbox">
                              {!entry.isDir && (
                                <Checkbox
                                  size="small"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleSelect(entry.name);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  sx={{ color: BRAND.gray, "&.Mui-checked": { color: BRAND.teal } }}
                                />
                              )}
                            </TableCell>
                            <TableCell sx={{ fontSize: TEXT.sm }}>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                {entry.isDir ? (
                                  <FolderOutlinedIcon
                                    sx={{ fontSize: TEXT.base, color: BRAND.teal, flexShrink: 0 }}
                                  />
                                ) : (
                                  <InsertDriveFileOutlinedIcon
                                    sx={{ fontSize: TEXT.base, color: BRAND.gray, flexShrink: 0 }}
                                  />
                                )}
                                <Tooltip title={entry.name} placement="top">
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontWeight: entry.isDir ? 600 : 400,
                                      color: BRAND.dark,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      maxWidth: 180
                                    }}
                                  >
                                    {entry.name}
                                  </Typography>
                                </Tooltip>
                              </Stack>
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                              {entry.isDir ? "—" : formatBytes(entry.size)}
                            </TableCell>
                            <TableCell sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                              {entry.modifiedAt
                                ? new Date(entry.modifiedAt).toLocaleString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {!entry.isDir && (
                                <Tooltip title="Download">
                                  <IconButton
                                    aria-label={`Download ${entry.name}`}
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownload(entry);
                                    }}
                                    sx={{ color: BRAND.teal }}
                                  >
                                    <DownloadOutlinedIcon sx={{ fontSize: ICON.sm }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Grid>

            {/* Transfer queue */}
            <Grid
              item
              xs={12}
              md={5}
              sx={{ overflow: "auto", height: "100%", p: 1.5 }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: BRAND.dark, display: "block", mb: 1 }}
              >
                Transfers
              </Typography>

              {transfers.length === 0 ? (
                <Typography variant="caption" sx={{ color: BRAND.gray }}>
                  No transfers yet. Click a file to download, or use Upload.
                </Typography>
              ) : (
                <>
                  {activeTransfers.length > 0 && (
                    <>
                      <Typography
                        variant="caption"
                        sx={{ color: BRAND.gray, display: "block", mb: 0.5 }}
                      >
                        Active ({activeTransfers.length})
                      </Typography>
                      {activeTransfers.map((t) => (
                        <TransferRow key={t.id} transfer={t} onCancel={handleCancelTransfer} />
                      ))}
                    </>
                  )}
                  {doneTransfers.length > 0 && (
                    <>
                      {activeTransfers.length > 0 && (
                        <Divider sx={{ my: 1 }} />
                      )}
                      <Typography
                        variant="caption"
                        sx={{ color: BRAND.gray, display: "block", mb: 0.5 }}
                      >
                        Completed ({doneTransfers.length})
                      </Typography>
                      {doneTransfers.map((t) => (
                        <TransferRow key={t.id} transfer={t} onCancel={handleCancelTransfer} />
                      ))}
                    </>
                  )}
                </>
              )}
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );
}
