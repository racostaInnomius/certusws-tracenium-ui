// src/components/AssetsDashboard/detailAtoms.jsx
//
// Small presentational atoms for the agent detail workbench, extracted from
// the AssetsDashboard god-component. DetailField is a label/value pair
// (optionally monospaced) that truncates with a title tooltip; FieldGrid is
// their responsive 1/2/3-column container. SummaryTile / IdentityItem /
// ResourceCard / UsageMeter build the visual Agent and Hardware tabs. All
// pure — value fallbacks render an em-dash.

import * as React from "react";
import { Box, ButtonBase, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import { BRAND, FOCUS_RING, ICON, ROLE, TEXT } from "../../theme/brand";

export function DetailField({ label, value, mono = false, hint = "" }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: TEXT.xs, fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.35,
          fontSize: TEXT.md,
          fontWeight: 700,
          color: BRAND.dark,
          fontFamily: mono ? "monospace" : "inherit",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={String(value || "—")}
      >
        {value || "—"}
      </Typography>
      {/* Optional second line explaining a value that is technically correct
          but not self-explanatory — e.g. a bare CIDR under "Location", which
          is what is left when no site mapping and no GPS fix exist. */}
      {hint ? (
        <Typography sx={{ mt: 0.25, fontSize: TEXT.xs, color: "text.secondary", whiteSpace: "normal" }}>
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

// ── Piezas de la ficha visual (pestañas Agent y Hardware) ────────────────────
//
// Tono → colores. ROLE rellena y BRAND.alert.*Text escribe: el relleno fuerte
// como texto no pasa contraste sobre su propio fondo suave.
const TONES = {
  positive: { fill: ROLE.positive, soft: ROLE.positiveSoft, text: BRAND.alert.successText },
  caution: { fill: ROLE.caution, soft: ROLE.cautionSoft, text: BRAND.alert.warningText },
  critical: { fill: ROLE.critical, soft: ROLE.criticalSoft, text: BRAND.alert.errorText },
  neutral: { fill: BRAND.teal, soft: BRAND.tealSoft, text: BRAND.tealText },
  muted: { fill: BRAND.gray, soft: BRAND.surfaceMuted, text: "text.secondary" },
};

function toneColors(tone) {
  return TONES[tone] ?? TONES.neutral;
}

const CAPTION_SX = {
  fontSize: TEXT.xs,
  fontWeight: 800,
  color: "text.secondary",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

/**
 * Tarjeta-resumen de la cabecera de una pestaña: icono en su color, valor
 * grande y una línea de contexto. Con `onClick` es un botón (lleva a la
 * pestaña que tiene el detalle).
 */
export function SummaryTile({ icon, label, value, sub, tone = "neutral", mono = false, onClick, ariaLabel }) {
  const c = toneColors(tone);
  const body = (
    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ width: "100%", minWidth: 0 }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          display: "grid",
          placeItems: "center",
          bgcolor: c.soft,
          color: c.fill,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
        <Typography sx={CAPTION_SX}>{label}</Typography>
        <Typography
          sx={{
            mt: 0.25,
            fontSize: TEXT.lg,
            fontWeight: 900,
            color: BRAND.dark,
            lineHeight: 1.2,
            fontFamily: mono ? "monospace" : "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={String(value ?? "—")}
        >
          {value === null || value === undefined || value === "" ? "—" : value}
        </Typography>
        {sub ? (
          <Typography sx={{ mt: 0.35, fontSize: TEXT.xs, fontWeight: 700, color: c.text }} title={typeof sub === "string" ? sub : undefined}>
            {sub}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
  const sx = {
    p: 1.75,
    height: "100%",
    width: "100%",
    borderRadius: 3,
    border: `1px solid ${BRAND.border}`,
    borderTop: `3px solid ${c.fill}`,
    bgcolor: BRAND.surface,
    display: "flex",
    alignItems: "flex-start",
  };
  if (onClick) {
    return (
      <ButtonBase
        onClick={onClick}
        aria-label={ariaLabel}
        focusRipple
        sx={{ ...sx, "&:hover": { bgcolor: BRAND.tealSoft }, "&.Mui-focusVisible": { boxShadow: FOCUS_RING } }}
      >
        {body}
      </ButtonBase>
    );
  }
  return (
    <Paper elevation={0} sx={sx}>
      {body}
    </Paper>
  );
}

/** Fila de tarjetas-resumen: 1 / 2 / 4 columnas. */
export function TileRow({ children }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
        gap: 1.5,
      }}
    >
      {children}
    </Box>
  );
}

/** Bloque con título discreto; agrupa los campos de una pestaña. */
export function SectionCard({ title, action, children }) {
  return (
    <Paper elevation={0} sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, border: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface }}>
      {title || action ? (
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
          {title ? <Typography sx={{ ...CAPTION_SX, letterSpacing: "0.08em" }}>{title}</Typography> : <span />}
          {action}
        </Stack>
      ) : null}
      {children}
    </Paper>
  );
}

export function CopyButton({ value, label }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Tooltip title={copied ? "Copied" : `Copy ${label.toLowerCase()}`}>
      <IconButton
        size="small"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => {
          // Sin permiso de portapapeles (http, iframe) no pasa nada: el valor
          // sigue ahí para seleccionarlo a mano.
          navigator.clipboard?.writeText?.(String(value))?.then(() => setCopied(true), () => {});
        }}
        sx={{ p: 0.25, color: "text.secondary" }}
      >
        {copied ? <CheckRoundedIcon sx={{ fontSize: ICON.sm }} /> : <ContentCopyRoundedIcon sx={{ fontSize: ICON.sm }} />}
      </IconButton>
    </Tooltip>
  );
}

/**
 * Un dato con su icono. `value` puede ser un nodo (un chip de plataforma);
 * `copyable` añade el botón de copiar cuando es texto.
 */
export function IdentityItem({ icon, label, value, mono = false, copyable = false, hint = "" }) {
  const empty = value === null || value === undefined || value === "" || value === "—";
  const isText = typeof value === "string" || typeof value === "number";
  return (
    <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
      <Box sx={{ color: BRAND.teal, mt: 0.25, display: "flex", flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={CAPTION_SX}>{label}</Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
          {isText || empty ? (
            <Typography
              sx={{
                mt: 0.25,
                fontSize: TEXT.md,
                fontWeight: 700,
                color: BRAND.dark,
                fontFamily: mono ? "monospace" : "inherit",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={empty ? "—" : String(value)}
            >
              {empty ? "—" : value}
            </Typography>
          ) : (
            <Box sx={{ mt: 0.25 }}>{value}</Box>
          )}
          {copyable && isText && !empty ? <CopyButton value={value} label={label} /> : null}
        </Stack>
        {hint ? (
          <Typography sx={{ mt: 0.25, fontSize: TEXT.xs, color: "text.secondary", whiteSpace: "normal" }}>{hint}</Typography>
        ) : null}
      </Box>
    </Stack>
  );
}

/**
 * Barra de uso. `value` null = sin medida: la barra se pinta vacía y gris, no
 * a cero en verde.
 */
export function UsageMeter({ value, tone = "neutral", label }) {
  const c = toneColors(tone);
  return (
    <Box
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      sx={{ height: 8, borderRadius: 999, bgcolor: BRAND.darkSoft, overflow: "hidden" }}
    >
      <Box sx={{ width: `${value ?? 0}%`, height: "100%", bgcolor: c.fill, borderRadius: 999 }} />
    </Box>
  );
}

/** Tarjeta de un recurso de hardware: icono, valor, medidor opcional y pie. */
export function ResourceCard({ icon, label, value, sub, meter = null, tone = "neutral", valueWraps = false }) {
  const c = toneColors(tone);
  return (
    <Paper
      elevation={0}
      sx={{ p: 1.75, height: "100%", borderRadius: 3, border: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Box
          sx={{ width: 32, height: 32, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: c.soft, color: c.fill }}
        >
          {icon}
        </Box>
        <Typography sx={CAPTION_SX}>{label}</Typography>
      </Stack>
      <Typography
        sx={{
          fontSize: valueWraps ? TEXT.md : TEXT.xl,
          fontWeight: 900,
          color: BRAND.dark,
          lineHeight: 1.25,
          ...(valueWraps
            ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }
            : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
        }}
        title={String(value ?? "—")}
      >
        {value === null || value === undefined || value === "" ? "—" : value}
      </Typography>
      {meter ? <Box sx={{ mt: 1.25 }}>{meter}</Box> : null}
      {sub ? (
        <Typography sx={{ mt: 0.75, fontSize: TEXT.xs, color: "text.secondary" }}>{sub}</Typography>
      ) : null}
    </Paper>
  );
}

export function FieldGrid({ children }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" },
        gap: 1.5,
      }}
    >
      {children}
    </Box>
  );
}
