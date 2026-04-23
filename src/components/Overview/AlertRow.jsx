// src/components/Overview/AlertRow.jsx
//
// Single row in the Attention panel. Shows a severity icon, a count, a
// label, and navigates to the target page+filter when clicked. Severity
// drives the color; the brand palette is only used for info-level
// signals (nothing critical is teal — that'd confuse the user).

import { Box, Stack, Typography, ButtonBase, Chip } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { BRAND, ROLE } from "../../theme/brand";

const SEVERITY_STYLE = {
  error: { fg: ROLE.critical, bg: ROLE.criticalSoft },
  warning: { fg: ROLE.caution, bg: ROLE.cautionSoft },
  info: { fg: BRAND.teal, bg: BRAND.tealSoft },
  success: { fg: ROLE.positive, bg: ROLE.positiveSoft }
};

export default function AlertRow({
  icon: Icon,
  severity = "info",
  count,
  label,
  onClick
}) {
  const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info;

  const interactive = typeof onClick === "function";
  const Wrapper = interactive ? ButtonBase : Box;

  return (
    <Wrapper
      onClick={interactive ? onClick : undefined}
      sx={{
        width: "100%",
        textAlign: "left",
        p: 1.25,
        borderRadius: 1.5,
        border: `1px solid ${BRAND.border}`,
        transition: "background-color 120ms ease, border-color 120ms ease",
        "&:hover": interactive
          ? { backgroundColor: BRAND.surfaceMuted, borderColor: BRAND.borderStrong }
          : undefined
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: "100%" }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: style.bg,
            color: style.fg,
            flexShrink: 0
          }}
        >
          <Icon fontSize="small" />
        </Box>

        <Chip
          size="small"
          label={count}
          sx={{
            minWidth: 40,
            height: 24,
            fontWeight: 700,
            color: style.fg,
            backgroundColor: style.bg,
            borderRadius: 1
          }}
        />

        <Typography
          variant="body2"
          sx={{ color: BRAND.dark, flex: 1, lineHeight: 1.3 }}
        >
          {label}
        </Typography>

        {interactive && (
          <ChevronRightIcon fontSize="small" sx={{ color: BRAND.gray }} />
        )}
      </Stack>
    </Wrapper>
  );
}
