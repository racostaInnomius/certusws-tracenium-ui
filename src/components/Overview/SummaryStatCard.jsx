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
import { BRAND, ROLE, TEXT } from "../../theme/brand";

const TONE_COLOR = {
  critical: ROLE.critical,
  caution: ROLE.caution,
  positive: ROLE.positive,
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
  children,
}) {
  return (
    <Paper
      elevation={0}
      role="region"
      aria-label={title}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        {Icon ? <Icon fontSize="small" sx={{ color: BRAND.teal }} /> : null}
        <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700, flex: 1 }}>
          {title}
        </Typography>
      </Stack>
      {subtitle && !loading ? (
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
