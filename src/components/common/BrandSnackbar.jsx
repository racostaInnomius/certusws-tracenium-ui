// src/components/common/BrandSnackbar.jsx
//
// Drop-in replacement for `<Snackbar><Alert severity=... variant="filled">`.
//
// Why we built this:
//   MUI's <Alert> reads its colors from `theme.palette.success/error/...`.
//   We don't run a custom MUI theme provider, so the Alert always falls
//   back to the stock Material palette (#2E7D32 dark green, #C62828 red,
//   etc.). That's the "verde bandera" the operator complained about —
//   it ignores our brand semáforo trio (#52B788 / #F4D37D / #E37D78).
//
//   We could solve this by configuring a global ThemeProvider with our
//   palette mapped in, but that bleeds into every <Button color="success">,
//   <Chip color="warning">, MUI form controls — too broad a blast
//   radius for a cosmetic fix. <BrandSnackbar> reads our tokens
//   directly, leaving the rest of the app's MUI behavior untouched.
//
// Same API surface as the previous pattern, drop-in:
//
//   <BrandSnackbar
//     open={snackbar.open}
//     severity={snackbar.severity}    // "success" | "error" | "warning" | "info"
//     message={snackbar.message}
//     onClose={() => setSnackbar(s => ({ ...s, open: false }))}
//   />
//
// `autoHideDuration` defaults to 4500ms (same as the page-level
// patterns we're replacing). Override if needed.
//
// `anchorOrigin` defaults to bottom-right — matches what most pages
// were already doing implicitly.

import * as React from "react";
import {
  Box,
  Snackbar,
  IconButton,
  Typography,
} from "@mui/material";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

import { BRAND, ROLE } from "../../theme/brand";

// Severity → visual contract. Filled background uses the brand
// color (high saturation); the body text rides on BRAND.dark for
// AAA contrast against the soft pastels (the brand colors are too
// light for white text). The icon picks up the brand color too.
const SEVERITY_META = {
  success: {
    bg: ROLE.positive,
    icon: <CheckCircleOutlineOutlinedIcon fontSize="small" />,
  },
  error: {
    bg: ROLE.critical,
    icon: <ErrorOutlineOutlinedIcon fontSize="small" />,
  },
  warning: {
    bg: ROLE.caution,
    icon: <ReportProblemOutlinedIcon fontSize="small" />,
  },
  info: {
    bg: BRAND.teal,
    icon: <InfoOutlinedIcon fontSize="small" />,
  },
};

export default function BrandSnackbar({
  open,
  onClose,
  message,
  severity = "success",
  autoHideDuration = 4500,
  anchorOrigin = { vertical: "bottom", horizontal: "right" },
}) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.info;
  // For brand pastels (success/warning) use BRAND.dark text; for the
  // coral critical it works with white. Keep this simple: dark on
  // anything except critical.
  const fg = severity === "error" ? BRAND.surface : BRAND.dark;

  return (
    <Snackbar
      open={open}
      onClose={onClose}
      autoHideDuration={autoHideDuration}
      anchorOrigin={anchorOrigin}
    >
      <Box
        // Keep the role hint MUI provides via Alert. We're rolling
        // our own visual but don't want to lose accessibility.
        role="alert"
        aria-live={severity === "error" ? "assertive" : "polite"}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          minWidth: 280,
          maxWidth: 520,
          py: 1,
          pr: 1,
          pl: 1.5,
          borderRadius: 2,
          bgcolor: meta.bg,
          color: fg,
          boxShadow: "0 6px 16px rgba(59,64,77,0.18)",
          border: `1px solid ${meta.bg}`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", color: fg, opacity: 0.95 }}>
          {meta.icon}
        </Box>
        <Typography
          sx={{
            flex: 1,
            fontSize: 13.5,
            fontWeight: 600,
            color: fg,
            lineHeight: 1.45,
          }}
        >
          {message}
        </Typography>
        {onClose ? (
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="dismiss"
            sx={{
              color: fg,
              opacity: 0.85,
              "&:hover": { opacity: 1, bgcolor: "rgba(0,0,0,0.08)" },
            }}
          >
            <CloseOutlinedIcon fontSize="small" />
          </IconButton>
        ) : null}
      </Box>
    </Snackbar>
  );
}
