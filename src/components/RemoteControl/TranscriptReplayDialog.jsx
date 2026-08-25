// src/components/RemoteControl/TranscriptReplayDialog.jsx
//
// RCP M1.S3 — post-mortem session replay.
//
// Opens from SessionHistoryTable when an operator clicks "Replay" on
// a closed session. Loads the transcript via
// GET /sessions/:id/transcript (returns asciinema v2 header + events
// array), then replays the events through an xterm.js instance at
// the recorded pace.
//
// We don't use asciinema-player.js directly because:
//   - it's another ~150KB dep, and we already ship xterm.js for the
//     live shell (M1.S2);
//   - the player expects a fetched .cast file URL, not an inline
//     events array — adapting needs adapter code anyway;
//   - we want native pause/seek without learning the player's API.
//
// What we render:
//   - xterm.js terminal (same theme as the live ShellTerminal so
//     replay looks identical to operating);
//   - playback controls: play/pause, 1x/2x/4x speed, seek to start;
//   - progress bar showing position in the timeline;
//   - session metadata strip (operator, device, duration, close
//     reason).
//
// What this dialog deliberately omits in M1.S3:
//   - Search (Ctrl-F across transcript bytes) — a useful audit
//     feature but needs a server-side endpoint;
//   - Export (.cast download) — straightforward to add once we have
//     a real ops need;
//   - Multi-session compare. Sprint 4 backlog.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { BRAND, ROLE } from "../../theme/brand";
import { httpGetJson } from "../../api/http";

const SPEEDS = [1, 2, 4, 8];

// Reparto de la escritura progresiva. MAX_SMOOTH_MS evita que un hueco largo
// entre chunks convierta una linea en un goteo eterno; MIN_SLICE_MS mantiene
// los trozos por encima del ruido del temporizador del navegador.
const MAX_SMOOTH_MS = 1200;
const MIN_SLICE_MS = 40;
const MAX_SLICES = 40;

export default function TranscriptReplayDialog({ open, session, onClose }) {
  const containerRef = React.useRef(null);
  const termRef = React.useRef(null);
  const fitRef = React.useRef(null);
  const tickTimerRef = React.useRef(null);

  // Loaded transcript payload.
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [data, setData] = React.useState(null); // { header, events, truncated }

  // Playback state. `cursor` is the index into events[] of the NEXT
  // event to fire. `elapsedSeconds` is wall-clock seconds since
  // play started (re-anchored on pause/seek).
  const [playing, setPlaying] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [speed, setSpeed] = React.useState(1);

  // ── Fetch transcript on open ─────────────────────────────────────
  React.useEffect(() => {
    if (!open || !session?.sessionId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setCursor(0);
    setElapsedSeconds(0);
    setPlaying(false);
    httpGetJson(
      `/api/v1/remote-control/sessions/${encodeURIComponent(session.sessionId)}/transcript`
    )
      .then((res) => {
        if (cancelled) return;
        if (!res?.ok) {
          setError(res?.message || "Failed to load transcript.");
          return;
        }
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, session?.sessionId]);

  // ── Mount xterm when dialog opens + data is loaded ───────────────
  React.useEffect(() => {
    if (!open || !data || !containerRef.current) return;

    const term = new Terminal({
      cursorBlink: false,
      // Disable scroll-back so the replay always starts from a
      // clean buffer — scrolling DURING replay would be confusing
      // (the events are scripted by the transcript, not the
      // operator).
      scrollback: 5000,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: "#1f2933",
        foreground: "#e5e7eb",
        cursor: ROLE.accent
      },
      // Replay viewport sized from the asciinema header — if a
      // future agent reports the negotiated dimensions, this
      // matches the operator's actual screen.
      cols: Math.max(40, Math.min(200, data.header?.width ?? 80)),
      rows: Math.max(10, Math.min(80, data.header?.height ?? 24))
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    term.writeln(
      "\x1b[2;37m── Tracenium transcript replay ──\x1b[0m\r\n"
    );
    termRef.current = term;
    fitRef.current = fit;

    return () => {
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      if (tickTimerRef.current) {
        clearTimeout(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, [open, data]);

  // ── Escritura progresiva ─────────────────────────────────────────
  // Un bloque pendiente de escribir y su temporizador. Si el siguiente evento
  // llega antes de terminar, se vuelca lo que queda de golpe: mas vale un
  // salto que dos bloques entrelazandose en la pantalla.
  const pendingRef = React.useRef(null);

  const flushPending = React.useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.rest && termRef.current) termRef.current.write(p.rest);
    pendingRef.current = null;
  }, []);

  const typeOut = React.useCallback(
    (term, payload, spanMs) => {
      flushPending();
      // Techo al reparto: si el hueco al siguiente evento son 15 s, nadie
      // quiere ver una linea saliendo letra a letra durante 15 segundos.
      const budget = Math.min(spanMs, MAX_SMOOTH_MS);
      if (!payload || budget < MIN_SLICE_MS * 2) {
        term.write(payload);
        return;
      }
      const slices = Math.max(2, Math.min(MAX_SLICES, Math.floor(budget / MIN_SLICE_MS)));
      const size = Math.ceil(payload.length / slices);
      const step = budget / slices;
      let offset = 0;

      const writeSlice = () => {
        const term2 = termRef.current;
        if (!term2) { pendingRef.current = null; return; }
        term2.write(payload.slice(offset, offset + size));
        offset += size;
        if (offset >= payload.length) { pendingRef.current = null; return; }
        pendingRef.current = {
          rest: payload.slice(offset),
          timer: setTimeout(writeSlice, step)
        };
      };
      writeSlice();
    },
    [flushPending]
  );

  // ── Playback loop ────────────────────────────────────────────────
  React.useEffect(() => {
    if (!playing || !data || !termRef.current) return;
    const events = data.events || [];
    if (cursor >= events.length) {
      setPlaying(false);
      return;
    }
    // Compute delay until next event fires, in real wall-clock ms.
    const nextEvent = events[cursor];
    const nextEventTime = Number(nextEvent[0]) || 0;
    const delayMs = Math.max(
      0,
      ((nextEventTime - elapsedSeconds) * 1000) / speed
    );
    tickTimerRef.current = setTimeout(() => {
      const term = termRef.current;
      if (!term) return;
      const [, kind, payload] = events[cursor];
      if (kind === "o" && typeof payload === "string") {
        // Repartir el bloque en el hueco hasta el siguiente evento en vez de
        // volcarlo entero de golpe.
        //
        // El agente agrupa el transcript en chunks cada 5-15 s, asi que una
        // sesion de 10 s son dos o tres eventos. Escribir cada uno de una vez
        // hacia que el replay pareciera un pase de diapositivas: la pantalla
        // salta de un estado al siguiente sin nada en medio.
        //
        // Esto es SUAVIZADO, no fidelidad: los caracteres no llegaron
        // repartidos, llegaron a rafagas. Reproducirlos a ritmo constante se
        // parece mucho mas a lo que el operador vio en su terminal que el
        // volcado seco, y la linea de tiempo sigue siendo exacta — cada evento
        // empieza en su timestamp real.
        const nextTime = Number(events[cursor + 1]?.[0]);
        const spanMs = Number.isFinite(nextTime)
          ? ((nextTime - nextEventTime) * 1000) / speed
          : 0;
        typeOut(term, payload, spanMs);
      }
      // (input events 'i' are not recorded in M1.S3, so this
      // branch is unreachable. We keep it as a no-op for the day
      // we add opt-in stdin recording.)
      setElapsedSeconds(nextEventTime);
      setCursor((c) => c + 1);
    }, delayMs);

    return () => {
      if (tickTimerRef.current) {
        clearTimeout(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, [playing, cursor, data, elapsedSeconds, speed, typeOut]);

  // Pausar o cerrar no debe dejar un bloque escribiendose solo.
  React.useEffect(() => {
    if (!playing) flushPending();
  }, [playing, flushPending]);
  React.useEffect(() => () => flushPending(), [flushPending]);

  // ── Derived ──────────────────────────────────────────────────────
  const totalDurationSec = React.useMemo(() => {
    if (!data?.events?.length) return 0;
    const last = data.events[data.events.length - 1];
    return Number(last?.[0]) || 0;
  }, [data]);
  const progress =
    totalDurationSec > 0
      ? Math.min(100, (elapsedSeconds / totalDurationSec) * 100)
      : 0;
  const eventCount = data?.events?.length ?? 0;

  // ── Controls ─────────────────────────────────────────────────────
  function togglePlay() {
    if (cursor >= eventCount) {
      // Auto-restart on play from finished state.
      restart();
      return;
    }
    setPlaying((p) => !p);
  }
  function restart() {
    setPlaying(false);
    setCursor(0);
    setElapsedSeconds(0);
    // Clear the terminal so a re-play doesn't append on top of the
    // previous run.
    termRef.current?.clear();
    termRef.current?.write(
      "\x1b[2;37m── Tracenium transcript replay ──\x1b[0m\r\n"
    );
    // Use a microtask to let the state updates settle before the
    // playback effect re-runs.
    Promise.resolve().then(() => setPlaying(true));
  }

  // Format seconds → "1m 34s" for display.
  function fmtDuration(sec) {
    if (sec == null || !Number.isFinite(sec)) return "—";
    const total = Math.round(sec);
    if (total < 60) return `${total}s`;
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        // OPACO. `surfaceMuted` es rgba(190,190,190,0.08): un tinte del 8%
        // pensado para rellenos sutiles ENCIMA de una superficie, no para ser
        // la superficie. Como fondo del Paper dejaba el diálogo un 92%
        // transparente, y la tabla de sesiones de detrás se leía a través del
        // texto de la cabecera.
        sx: {
          bgcolor: BRAND.surface,
          backgroundImage: "none",
          borderRadius: 2,
          border: `1px solid ${BRAND.border}`
        }
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", pb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: BRAND.dark, lineHeight: 1.2 }}
            noWrap
          >
            Replay · {session?.hostname || session?.deviceId}
          </Typography>
          {/* `gray` (#BEBEBE) sobre blanco da ~1.9:1 de contraste, por debajo
              del 4.5:1 que pide WCAG AA para texto pequeño. Este renglón lleva
              el operador y la fecha: es dato de auditoría, tiene que leerse. */}
          <Typography variant="caption" sx={{ color: BRAND.dark, opacity: 0.75 }}>
            {session?.operator || "—"} ·{" "}
            {session?.startedAt
              ? new Date(session.startedAt).toLocaleString()
              : "—"}
          </Typography>
        </Box>
        <IconButton aria-label="Close replay" size="small" onClick={onClose}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : data && eventCount === 0 ? (
          <Alert severity="info">
            No transcript chunks were recorded for this session.
          </Alert>
        ) : data ? (
          <Stack spacing={1.5}>
            {data.truncated ? (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                Transcript truncated at the server-side row cap. Older or
                very-long sessions may not replay end-to-end.
              </Alert>
            ) : null}

            {/* Terminal */}
            <Box
              ref={containerRef}
              sx={{
                bgcolor: "#1f2933",
                borderRadius: 2,
                p: 1,
                minHeight: 380,
                "& .xterm-viewport": { padding: "8px" }
              }}
            />

            {/* Controls */}
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                p: 1,
                borderRadius: 1,
                bgcolor: "#161c25"
              }}
            >
              <Tooltip title={playing ? "Pause" : "Play"} arrow>
                <IconButton
                  aria-label={playing ? "Pause replay" : "Play replay"}
                  size="small"
                  onClick={togglePlay}
                  sx={{ color: "#e5e7eb" }}
                >
                  {playing ? (
                    <PauseOutlinedIcon />
                  ) : (
                    <PlayArrowOutlinedIcon />
                  )}
                </IconButton>
              </Tooltip>
              <Tooltip title="Restart" arrow>
                <IconButton aria-label="Restart replay" size="small" onClick={restart} sx={{ color: "#e5e7eb" }}>
                  <RestartAltOutlinedIcon />
                </IconButton>
              </Tooltip>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: "#2d3742",
                    "& .MuiLinearProgress-bar": { bgcolor: BRAND.teal }
                  }}
                />
              </Box>
              <Typography
                variant="caption"
                sx={{
                  color: "#9aa5b1",
                  fontFamily: "monospace",
                  minWidth: 90,
                  textAlign: "right"
                }}
              >
                {fmtDuration(elapsedSeconds)} /{" "}
                {fmtDuration(totalDurationSec)}
              </Typography>
              <ButtonGroup size="small" variant="outlined">
                {SPEEDS.map((s) => (
                  <Button
                    key={s}
                    onClick={() => setSpeed(s)}
                    variant={s === speed ? "contained" : "outlined"}
                    sx={{
                      minWidth: 36,
                      color: s === speed ? BRAND.dark : "#e5e7eb",
                      borderColor: "#2d3742"
                    }}
                  >
                    {s}x
                  </Button>
                ))}
              </ButtonGroup>
            </Stack>

            {/* Session metadata strip */}
            <Stack
              direction="row"
              spacing={2}
              sx={{ pt: 0.5, color: BRAND.gray }}
              flexWrap="wrap"
            >
              <Typography variant="caption">
                <strong>Status:</strong> {session?.status ?? "—"}
              </Typography>
              <Typography variant="caption">
                <strong>Close:</strong> {session?.closeReason ?? "—"}
              </Typography>
              <Typography variant="caption">
                <strong>Events:</strong> {eventCount}
              </Typography>
            </Stack>
          </Stack>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
