import { CircularProgress, Alert, Button, Typography, Stack } from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import { BRAND } from "../../theme/brand";

/**
 * One place for the loading / error / empty triad that ~every page hand-rolls
 * (inline CircularProgress + copy-pasted <Alert> + ad-hoc empty strings, with
 * inconsistent severities and layouts). Render your content as children;
 * AsyncState shows the right state above it.
 *
 * Precedence: loading → error → empty → children.
 *
 * Props:
 *   loading?    boolean
 *   error?      Error | string | null  (message unwrapped from body/message)
 *   isEmpty?    boolean
 *   onRetry?    () => void   — shows a "Try again" button on the error state
 *   loadingText / emptyText  — optional copy
 *   emptyIcon   — optional node (defaults to an inbox glyph)
 *   minHeight   — vertical space reserved for the centered states (default 160)
 */
export function extractErrorMessage(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return error?.body?.message || error?.message || "Something went wrong.";
}

export default function AsyncState({
  loading = false,
  error = null,
  isEmpty = false,
  onRetry,
  loadingText,
  emptyText = "Nothing to show yet.",
  emptyIcon = null,
  minHeight = 160,
  children = null,
}) {
  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" spacing={1.25} sx={{ minHeight, py: 3 }}>
        <CircularProgress size={26} sx={{ color: BRAND.teal }} />
        {loadingText ? (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{loadingText}</Typography>
        ) : null}
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        sx={{ my: 1 }}
        action={
          onRetry ? (
            <Button color="inherit" size="small" startIcon={<RefreshRoundedIcon />} onClick={onRetry}>
              Try again
            </Button>
          ) : null
        }
      >
        {extractErrorMessage(error)}
      </Alert>
    );
  }

  if (isEmpty) {
    return (
      <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ minHeight, py: 3, textAlign: "center" }}>
        {emptyIcon ?? <InboxOutlinedIcon sx={{ fontSize: 34, color: BRAND.gray }} />}
        <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>{emptyText}</Typography>
      </Stack>
    );
  }

  return children;
}
