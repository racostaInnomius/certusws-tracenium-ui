// src/components/Audit/AuditBreakdown.jsx
//
// Lo que la página de Audit enseña arriba: QUÉ pasó y QUÉ no salió bien.
//
// ── Por qué sustituye a la serie temporal ───────────────────────────
//
// Medido en producción el 2026-09-04, ventana de 30 días: el carril
// administrativo del tenant más activo tenía 59 eventos —dos al día— y cinco
// de los últimos catorce días estaban a cero. Una gráfica de barras por día a
// ese volumen no es una gráfica medio vacía: es el instrumento equivocado. No
// hay forma de dibujar "2, 0, 0, 3, 1" que le diga algo a nadie.
//
// A veinte acciones humanas al mes la pregunta deja de ser CUÁNTA actividad
// hubo y pasa a ser QUÉ cambió y QUÉ se rechazó. Las dos se responden con
// conteos por tipo, que se leen igual con veinte eventos que con dos mil y no
// dependen de que la actividad se reparta uniformemente en el tiempo — que era
// la suposición que rompía la serie.
//
// ── Dos bloques, dos preguntas ──────────────────────────────────────
//
//   1. ATENCIÓN — lo que no salió bien. Va primero porque es raro y porque es
//      lo único que puede exigir una acción hoy. ⚠️ NO respeta el carril: un
//      rechazo importa igual lo haya causado una persona o la flota, y
//      esconderlo tras el selector sería pedirle al operador que adivine
//      dónde mirar.
//   2. ACTIVIDAD — qué cambió, de más a menos frecuente. Ésta sí sigue el
//      carril, porque "quién cambió qué" es una pregunta sobre personas.
//
// Las filas filtran la tabla de abajo al pulsarlas: el ranking es un índice
// de la tabla, no un adorno.

import * as React from "react";
import {
  Box,
  Chip,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { getEventTypeMeta } from "../../constants/auditEventTypes";
import { formatRelative } from "../../utils/format";

const OUTCOME_TONE = {
  rejected: { label: "Rejected", color: ROLE.caution },
  error: { label: "Error", color: ROLE.critical },
};

function Row({ label, meta, count, max, lastAt, tone, onClick, right }) {
  // La barra es proporcional al máximo de SU lista, no a un total: con 20 y 13
  // eventos, dos barras casi llenas dicen más que dos rayas del 1% de un total
  // que incluye el ruido de flota.
  const pct = max > 0 ? Math.max(3, Math.round((count / max) * 100)) : 0;
  const clickable = typeof onClick === "function";

  return (
    <Box
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        px: 1,
        py: 0.75,
        borderRadius: 1.5,
        cursor: clickable ? "pointer" : "default",
        "&:hover": clickable ? { bgcolor: BRAND.darkSoft } : undefined,
        "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Tooltip title={meta?.raw || label} placement="top" arrow>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: BRAND.dark,
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </Typography>
        </Tooltip>
        {right}
        <Typography variant="body2" sx={{ fontWeight: 800, color: BRAND.dark }}>
          {count}
        </Typography>
      </Stack>
      <Stack direction="row" alignItems="center" spacing={1}>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            bgcolor: BRAND.darkSoft,
            "& .MuiLinearProgress-bar": { bgcolor: tone, borderRadius: 3 },
          }}
        />
        {/* Cuándo fue la última. En una página que pasa días sin una sola
            acción, "hace 6 d" ubica mejor que cualquier conteo. */}
        <Typography variant="caption" sx={{ color: BRAND.gray, minWidth: 64, textAlign: "right" }}>
          {lastAt ? formatRelative(lastAt) : "—"}
        </Typography>
      </Stack>
    </Box>
  );
}

function Empty({ children }) {
  return (
    <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", py: 1.5, px: 1 }}>
      {children}
    </Typography>
  );
}

export default function AuditBreakdown({
  data,
  loading,
  failed,
  windowDays = 30,
  lane = "all",
  onSelectEventType,
  limit = 8,
}) {
  const activity = Array.isArray(data?.activity) ? data.activity : [];
  const attention = Array.isArray(data?.attention) ? data.attention : [];

  const shownActivity = activity.slice(0, limit);
  const maxActivity = shownActivity[0]?.count ?? 0;
  const maxAttention = attention[0]?.count ?? 0;
  const hiddenActivity = activity.length - shownActivity.length;

  const laneNoun = lane === "system" ? "machine events" : lane === "admin" ? "actions" : "events";

  if (loading) {
    return (
      <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }}>
        <Skeleton variant="rounded" height={180} />
      </Paper>
    );
  }

  // ⚠️ "No pude leerlo" no puede pintarse como "no hay nada". Es la misma
  // lección que dejó seis días en blanco la gráfica que esto sustituye: un 500
  // se leía como "sin eventos" y nadie lo reportó.
  if (failed) {
    return (
      <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }}>
        <Stack alignItems="center" spacing={0.5} sx={{ py: 3 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: ROLE.caution }}>
            Couldn't load the activity breakdown
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            The request failed — this is not the same as having no activity.
          </Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack spacing={2}>
      {/* ── Necesita atención ─────────────────────────────────── */}
      {attention.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            border: `1px solid ${ROLE.criticalSoft}`,
            bgcolor: `${ROLE.criticalSoft}33`,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <ReportProblemOutlinedIcon fontSize="small" sx={{ color: ROLE.critical }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark }}>
              Needs attention — last {windowDays} days
            </Typography>
            {/* Sólo el total de la franja. Ponerlo como "N de M" invitaría a
                compararlo con el conteo de al lado, que está filtrado por
                carril mientras que éste no — dos denominadores distintos
                presentados como si fueran el mismo. */}
            <Chip
              size="small"
              label={`${data?.totals?.attention ?? 0}`}
              sx={{ fontSize: TEXT.xs, fontWeight: 800 }}
            />
          </Stack>
          {/* Se dice explícitamente que esta franja ignora el carril: sin la
              frase, un operador en "Administrative" creería que estos rechazos
              son acciones de personas. */}
          <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1, px: 1 }}>
            Rejected and failed events across both lanes — shown whichever lane is selected.
          </Typography>
          <Stack spacing={0.5}>
            {attention.map((a) => {
              const meta = getEventTypeMeta(a.eventType);
              const tone = OUTCOME_TONE[a.outcome] ?? { label: a.outcome, color: ROLE.critical };
              return (
                <Row
                  key={`${a.eventType}:${a.outcome}`}
                  label={meta.label}
                  meta={meta}
                  count={a.count}
                  max={maxAttention}
                  lastAt={a.lastAt}
                  tone={tone.color}
                  onClick={onSelectEventType ? () => onSelectEventType(a.eventType, a.outcome) : undefined}
                  right={
                    <Chip
                      size="small"
                      label={tone.label}
                      sx={{
                        height: 20,
                        fontSize: TEXT.xs,
                        fontWeight: 700,
                        color: tone.color,
                        bgcolor: `${tone.color}1f`,
                        border: `1px solid ${tone.color}55`,
                      }}
                    />
                  }
                />
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* ── Qué cambió ────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark }}>
            What happened — last {windowDays} days
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {data?.totals?.activity ?? 0} {laneNoun}
          </Typography>
        </Stack>

        {shownActivity.length === 0 ? (
          <Empty>
            {lane === "admin"
              ? "No administrative actions in this window. Machine activity is under the System lane."
              : "No events in this window."}
          </Empty>
        ) : (
          <Stack spacing={0.5}>
            {shownActivity.map((a) => {
              const meta = getEventTypeMeta(a.eventType);
              return (
                <Row
                  key={a.eventType}
                  label={meta.label}
                  meta={meta}
                  count={a.count}
                  max={maxActivity}
                  lastAt={a.lastAt}
                  tone={BRAND.teal}
                  onClick={onSelectEventType ? () => onSelectEventType(a.eventType) : undefined}
                  right={
                    <Chip
                      size="small"
                      label={a.category}
                      sx={{
                        height: 20,
                        fontSize: TEXT.xs,
                        color: BRAND.tealText,
                        bgcolor: BRAND.tealSoft,
                        border: `1px solid ${BRAND.border}`,
                      }}
                    />
                  }
                />
              );
            })}
          </Stack>
        )}

        {hiddenActivity > 0 && (
          <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", pt: 1, px: 1 }}>
            +{hiddenActivity} more event type{hiddenActivity === 1 ? "" : "s"} — see the table below.
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}
