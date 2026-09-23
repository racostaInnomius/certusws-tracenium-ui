// src/components/Overview/SummaryStatCard.jsx
//
// Shell for the Overview cards that summarise one plugin page: a title, a
// short list of numbers that each say one thing, and a way into the page.
//
// Three states, kept apart on purpose because they read the same at a glance
// and mean opposite things:
//
//   · loading  — skeleton rows.
//   · failed   — "Couldn't load", NOT zeros. A zero from a failed request is
//                the classic dashboard lie.
//   · empty    — the plugin is in the plan but no device has reported yet;
//                the card says what to do instead of drawing a row of 0s.
//
// No charts: these sit on the landing page, and a flat list of labelled
// numbers reads faster than axes and legends for four values.

import { Box, ButtonBase, Paper, Skeleton, Stack, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

const TONE_COLOR = {
  critical: BRAND.alert.errorText,
  // «Pide una acción, pero nada ha fallado» — el naranja de la severidad High.
  attention: BRAND.alert.high,
  caution: BRAND.alert.warningText,
  positive: BRAND.alert.successText,
  neutral: BRAND.dark,
};

function StatRow({ label, value, tone = "neutral", hint }) {
  return (
    <Stack
      direction="row"
      alignItems="baseline"
      spacing={1}
      sx={{ py: 0.75, borderBottom: `1px solid ${BRAND.border}`, "&:last-of-type": { borderBottom: "none" } }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }} noWrap title={label}>
          {label}
        </Typography>
        {hint ? (
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }} noWrap title={hint}>
            {hint}
          </Typography>
        ) : null}
      </Box>
      <Typography
        sx={{ fontSize: TEXT.lg, fontWeight: 700, color: TONE_COLOR[tone] || BRAND.dark, flexShrink: 0 }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

export default function SummaryStatCard({
  title,
  icon: Icon,
  subtitle,
  loading = false,
  failed = false,
  empty = null,
  stats = [],
  openLabel,
  onOpen,
  // La card entera lleva a la página, sin enlace al pie. Ahorra la fila del
  // enlace, que es lo que la hacía más alta que sus vecinas.
  onCardClick,
  // Subtítulo en la fila del título en vez de debajo: una línea menos.
  inlineSubtitle = false,
  children,
}) {
  const clickable = typeof onCardClick === "function";
  return (
    <Paper
      elevation={0}
      role={clickable ? "button" : "region"}
      aria-label={title}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onCardClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onCardClick();
              }
            }
          : undefined
      }
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        cursor: clickable ? "pointer" : "default",
        transition: "border-color 120ms ease",
        "&:hover": clickable ? { borderColor: BRAND.teal } : undefined,
        "&:focus-visible": clickable ? { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 } : undefined,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 1, minWidth: 0 }}>
        {Icon ? <Icon fontSize="small" sx={{ color: BRAND.teal, alignSelf: "center" }} /> : null}
        <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700, flexShrink: 0 }}>
          {title}
        </Typography>
        {inlineSubtitle && subtitle && !loading ? (
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, minWidth: 0 }} noWrap title={subtitle}>
            {subtitle}
          </Typography>
        ) : null}
      </Stack>
      {subtitle && !inlineSubtitle && !loading ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mb: 0.5 }}>{subtitle}</Typography>
      ) : null}

      <Box sx={{ flex: 1 }}>
        {loading ? (
          <Stack spacing={1}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="text" height={28} />
            ))}
          </Stack>
        ) : failed ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, py: 2 }}>
            Couldn&apos;t load this summary. Open the page for the live view.
          </Typography>
        ) : empty ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, py: 2 }}>{empty}</Typography>
        ) : (
          <>
            {children}
            {stats.map((s) => (
              <StatRow key={s.label} {...s} />
            ))}
          </>
        )}
      </Box>

      {onOpen ? (
        <Box sx={{ pt: 1, textAlign: "right" }}>
          <ButtonBase
            onClick={onOpen}
            sx={{ fontSize: TEXT.sm, color: BRAND.teal, fontWeight: 600, borderRadius: 1, px: 0.5 }}
          >
            {openLabel || "Open"} →
          </ButtonBase>
        </Box>
      ) : null}
    </Paper>
  );
}
