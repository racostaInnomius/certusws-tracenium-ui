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

import { BRAND, ROLE } from "../../theme/brand";

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

function basename(path) {
  return path.replace(/^.*\//, "") || path;
}

function parentPath(path) {
  if (!path || path === "/") return "/";
  const trimmed = path.replace(/\/$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
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
        fontSize: 11,
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
          <DownloadOutlinedIcon sx={{ fontSize: 14, color: BRAND.teal, flexShrink: 0 }} />
        ) : (
          <UploadOutlinedIcon sx={{ fontSize: 14, color: BRAND.teal, flexShrink: 0 }} />
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
            <ErrorOutlineIcon sx={{ fontSize: 14, color: ROLE.critical, flexShrink: 0 }} />
          </Tooltip>
        ) : transfer.status === "completed" ? (
          <CheckCircleOutlineIcon sx={{ fontSize: 14, color: ROLE.positive, flexShrink: 0 }} />
        ) : transfer.status === "cancelled" ? (
          <CancelOutlinedIcon sx={{ fontSize: 14, color: BRAND.gray, flexShrink: 0 }} />
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
              size="small"
              onClick={() => onCancel?.(transfer.id)}
              sx={{ color: BRAND.gray, p: 0.25, flexShrink: 0 }}
            >
              <CloseOutlinedIcon sx={{ fontSize: 13 }} />
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
  const [currentPath, setCurrentPath] = React.useState("/");
  const [entries, setEntries] = React.useState([]);
  const [listing, setListing] = React.useState(false);
  const [transfers, setTransfers] = React.useState([]);       // { id, name, path, direction, sizeBytes, transferred, status }
  const [selected, setSelected] = React.useState(new Set());  // M2.S2 multi-select
  const [dragOver, setDragOver] = React.useState(false);      // M2.S2 drag-and-drop
  const uploadRef = React.useRef(null);
  const dcRef = React.useRef(null);     // RTCDataChannel
  const pcRef = React.useRef(null);     // RTCPeerConnection
  const wsRef = React.useRef(null);     // WebSocket (signaling)
  const pendingChunksRef = React.useRef({}); // transferId -> { chunks, totalSeq, blob }

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
        //    offer's SDP). Channel name 'rcp.file' is what the agent
        //    keys on to set up the file-transfer handler.
        const dc = pc.createDataChannel("rcp.file", {
          ordered: true  // file transfers need ordered delivery
        });
        dcRef.current = dc;

        dc.onopen = () => {
          if (!destroyed) {
            setState(STATE.BROWSING);
            sendList("/");
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
              if (!destroyed) {
                setState(STATE.ENDED);
              }
            }
          } catch {/**/ }
        };
        ws.onclose = () => {
          if (!destroyed && state !== STATE.BROWSING && state !== STATE.ENDED) {
            setErrorMsg("Signaling WebSocket closed unexpectedly.");
            setState(STATE.ERROR);
          }
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
      case "error": {
        const tid = msg.transferId;
        if (tid) {
          delete pendingChunksRef.current[tid];
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === tid ? { ...t, status: "failed", errorMsg: msg.message } : t
            )
          );
        }
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
    }
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
    if (p !== currentPath) handleNavigate(p);
  }

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

  async function startUploadChunks(transferId, file) {
    const CHUNK_SIZE = 64 * 1024; // 64 KB
    let offset = 0;
    let seq = 0;
    const reader = new FileReader();

    const sendChunk = () => {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (ev) => {
      const bytes = new Uint8Array(ev.target.result);
      // base64-encode for JSON transport over DataChannel.
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);
      offset += bytes.byteLength;
      const done = offset >= file.size;

      dcSend({ op: "chunk", transferId, seq, data: b64 });
      seq++;

      const transferred = offset;
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId ? { ...t, transferred } : t
        )
      );

      if (done) {
        dcSend({ op: "uploadDone", transferId });
        setTransfers((prev) =>
          prev.map((t) =>
            t.id === transferId
              ? { ...t, status: "completed", transferred: file.size }
              : t
          )
        );
        delete pendingChunksRef.current[transferId];
      } else {
        sendChunk();
      }
    };

    sendChunk();
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
        <FolderOutlinedIcon sx={{ color: BRAND.teal, fontSize: 18 }} />
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, color: "#fff", flex: 1, fontSize: 13 }}
        >
          File Manager · {devLabel}
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
            bgcolor: "#fff"
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
        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", bgcolor: "#fff" }}>
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
                  size="small"
                  onClick={handleUp}
                  disabled={currentPath === "/"}
                  sx={{ color: BRAND.teal }}
                >
                  <ArrowUpwardOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton
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
                fontSize: 12,
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
                  <CloudUploadOutlinedIcon sx={{ fontSize: 36, color: BRAND.teal }} />
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
                      fontSize: 12,
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
                    sx={{ textTransform: "none", fontSize: 12, color: BRAND.gray }}
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
                        <TableCell sx={{ fontWeight: 700, color: BRAND.dark, fontSize: 12 }}>
                          Name
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 700, color: BRAND.dark, fontSize: 12, width: 90 }}
                        >
                          Size
                        </TableCell>
                        <TableCell
                          sx={{ fontWeight: 700, color: BRAND.dark, fontSize: 12, width: 150 }}
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
                            <TableCell sx={{ fontSize: 12 }}>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                {entry.isDir ? (
                                  <FolderOutlinedIcon
                                    sx={{ fontSize: 15, color: BRAND.teal, flexShrink: 0 }}
                                  />
                                ) : (
                                  <InsertDriveFileOutlinedIcon
                                    sx={{ fontSize: 15, color: BRAND.gray, flexShrink: 0 }}
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
                            <TableCell align="right" sx={{ fontSize: 12, color: BRAND.gray }}>
                              {entry.isDir ? "—" : formatBytes(entry.size)}
                            </TableCell>
                            <TableCell sx={{ fontSize: 12, color: BRAND.gray }}>
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
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownload(entry);
                                    }}
                                    sx={{ color: BRAND.teal }}
                                  >
                                    <DownloadOutlinedIcon sx={{ fontSize: 15 }} />
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
