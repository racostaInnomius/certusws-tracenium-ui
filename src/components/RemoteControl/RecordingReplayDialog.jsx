// src/components/RemoteControl/RecordingReplayDialog.jsx
//
// ADR-0012 — reproducción de una grabación de sesión de PANTALLA.
//
// Hermano de TranscriptReplayDialog, que hace lo mismo con la salida del
// terminal. Aquí lo que se reconstruye son fotogramas JPEG sobre un canvas,
// con la MISMA lógica de blit que ScreenShareViewer usa en directo: los
// completos se pintan enteros y los parciales encima, en su posición.
//
// ── Lo único delicado: el orden de dibujado ──────────────────────────
//
//   `img.onload` es asíncrono. En directo eso da igual —cada fotograma se
//   pinta cuando llega y el siguiente lo tapa—, pero al reproducir NO: los
//   parciales se pintan encima del estado anterior, así que uno que se
//   adelante corrompe todo lo que viene detrás.
//
//   Por eso cada imagen se ESPERA antes de dibujar la siguiente. Es más lento
//   que disparar todas a la vez y es la única forma de que lo que se ve sea lo
//   que ocurrió.
//
// ── Por qué se carga entera en memoria ───────────────────────────────
//
//   Buscar un instante obliga a volver al último fotograma completo anterior y
//   repintar desde ahí (ver recordingPlayback.js). Eso solo se puede hacer con
//   los fotogramas a mano, así que se guardan según llegan. Hay tope: una
//   grabación desmesurada se corta y se avisa, en vez de tumbar la pestaña del
//   operador.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Slider,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import ReplayIcon from "@mui/icons-material/Replay";

import { httpGetNdjson } from "../../api/http";
import { BRAND, TEXT } from "../../theme/brand";
import {
  seekPlan,
  totalDuration,
  integrityNotice,
} from "./recordingPlayback";

/**
 * Tope de fotogramas en memoria.
 *
 * A 5 fps de rects pequeños, 20 000 son más de una hora de sesión. Pasado eso
 * se deja de acumular y se dice: preferimos una reproducción parcial y honesta
 * a una pestaña que se queda sin memoria a mitad de una auditoría.
 */
const MAX_FRAMES = 20000;

const SPEEDS = [1, 2, 4];

export default function RecordingReplayDialog({ open, session, onClose }) {
  const canvasRef = React.useRef(null);
  const framesRef = React.useRef([]);
  const drawnRef = React.useRef(-1);      // índice del último pintado
  const drawingRef = React.useRef(false); // hay un dibujado en curso

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const [capped, setCapped] = React.useState(false);
  const [duration, setDuration] = React.useState(0);
  const [position, setPosition] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);

  // ── Carga ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open || !session?.sessionId) return;
    let cancelled = false;

    framesRef.current = [];
    drawnRef.current = -1;
    setLoading(true);
    setError(null);
    setNotice("");
    setCapped(false);
    setDuration(0);
    setPosition(0);
    setPlaying(false);

    let header = {};
    let end = {};

    httpGetNdjson(
      `/api/v1/remote-control/sessions/${encodeURIComponent(session.sessionId)}/recording`,
      (obj) => {
        if (cancelled) return;
        if (obj.kind === "header") header = obj;
        else if (obj.kind === "end") end = obj;
        else if (obj.kind === "frame") {
          if (framesRef.current.length >= MAX_FRAMES) {
            setCapped(true);
            return;
          }
          framesRef.current.push(obj);
        }
      }
    )
      .then(() => {
        if (cancelled) return;
        setDuration(totalDuration(framesRef.current));
        // El aviso de integridad se compone de lo que diga el servidor y de
        // cómo terminó el recorrido. Se enseña siempre que algo no cuadre:
        // media grabación sigue sirviendo, pero quien la mira tiene que saber
        // qué está viendo antes de sacar conclusiones.
        setNotice(
          integrityNotice({
            truncated: header.truncated,
            integrityOk: header.integrityOk,
            clean: end.clean,
          })
        );
        void drawUpTo(0);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.sessionId]);

  // ── Dibujado ─────────────────────────────────────────────────────

  /** Pinta una imagen y NO vuelve hasta que está en el canvas. */
  function drawOne(ctx, canvas, frame) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = Number(frame.w) || img.width;
        const h = Number(frame.h) || img.height;
        // Asignar width/height LIMPIA el canvas, así que solo cuando cambia de
        // verdad: si no, cada parcial borraría el fotograma que viene a
        // parchear.
        if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
          canvas.width = w;
          canvas.height = h;
        }
        if (frame.full) ctx.drawImage(img, 0, 0);
        else ctx.drawImage(img, Number(frame.x) || 0, Number(frame.y) || 0);
        resolve();
      };
      // Una imagen corrupta no puede colgar la reproducción entera.
      img.onerror = () => resolve();
      img.src = `data:image/jpeg;base64,${frame.data}`;
    });
  }

  /**
   * Lleva el canvas al instante `t`.
   *
   * `drawingRef` evita que dos llamadas se solapen: si el temporizador dispara
   * mientras aún se está pintando un salto, las dos secuencias se
   * entrelazarían y los parciales caerían sobre bases equivocadas — el mismo
   * daño que el ADR evita en el agente al no tirar rects.
   */
  async function drawUpTo(t) {
    if (drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frames = framesRef.current;
    const plan = seekPlan(frames, drawnRef.current, t);
    if (plan.target < 0) return;

    drawingRef.current = true;
    try {
      if (plan.clear) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      for (let i = plan.start; i <= plan.end; i++) {
        // await por fotograma: el orden es la corrección, no una optimización.
        // eslint-disable-next-line no-await-in-loop
        await drawOne(ctx, canvas, frames[i]);
      }
      drawnRef.current = plan.target;
    } finally {
      drawingRef.current = false;
    }
  }

  // ── Reloj de reproducción ────────────────────────────────────────
  React.useEffect(() => {
    if (!playing || duration <= 0) return;
    const STEP_MS = 100;
    const id = setInterval(() => {
      setPosition((p) => {
        const next = p + STEP_MS * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [playing, speed, duration]);

  React.useEffect(() => {
    void drawUpTo(position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <Dialog open={!!open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ flex: 1, fontWeight: 700, fontSize: TEXT.md }}>
          Screen recording · {session?.deviceId || ""}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* El aviso va ARRIBA y en severidad warning: si el operador va a
            sacar conclusiones de lo que ve, tiene que leer esto antes. */}
        {notice && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {notice}
          </Alert>
        )}

        {capped && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This recording is longer than the player can hold in memory. Only the
            first part is shown.
          </Alert>
        )}

        <Box
          sx={{
            // Deliberate one-off: this is the letterbox behind the recording
            // canvas, and it has to be true black. BRAND.dark (#3B404D) would
            // put a slate frame around captured screen content and make every
            // recording look washed out — a palette token is the wrong tool
            // for the inside of a video player.
            // eslint-disable-next-line no-restricted-syntax
            bgcolor: "#000",
            borderRadius: 1,
            display: "flex",
            justifyContent: "center",
            p: 1,
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ maxWidth: "100%", maxHeight: "60vh" }}
            data-testid="recording-canvas"
          />
        </Box>

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
          <IconButton
            size="small"
            onClick={() => setPlaying((p) => !p)}
            disabled={duration <= 0}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>

          <IconButton
            size="small"
            onClick={() => {
              setPlaying(false);
              setPosition(0);
            }}
            disabled={duration <= 0}
            aria-label="Restart"
          >
            <ReplayIcon />
          </IconButton>

          <Typography variant="caption" sx={{ color: BRAND.gray, minWidth: 88 }}>
            {fmt(position)} / {fmt(duration)}
          </Typography>

          <Slider
            size="small"
            value={position}
            min={0}
            max={Math.max(duration, 1)}
            onChange={(_, v) => {
              setPlaying(false);
              setPosition(Number(v));
            }}
            disabled={duration <= 0}
            sx={{ flex: 1 }}
            aria-label="Position"
          />

          {SPEEDS.map((s) => (
            <Button
              key={s}
              size="small"
              variant={speed === s ? "contained" : "text"}
              onClick={() => setSpeed(s)}
              sx={{ minWidth: 40, textTransform: "none" }}
            >
              {s}x
            </Button>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
