// src/components/common/ConfirmDialog.jsx
//
// Branded confirm dialog + companion `useConfirm()` hook.
//
// Why this exists:
//   `window.confirm()` ships a native browser dialog that ignores our
//   palette, ignores our typography, and on some Chromium builds even
//   blocks the JS thread (it's a synchronous prompt). Operators saw
//   the OS-default look at the most critical moments — pushing
//   tenant policy, retrying a job, deleting an override — and the
//   inconsistency made the UI feel half-finished.
//
// Two surfaces are exposed:
//
//   <ConfirmDialog open ... />
//     The presentational component. Useful when you want to host the
//     state yourself (e.g. inside a form that already manages a draft).
//
//   const confirm = useConfirm();
//     const ok = await confirm({ title, body, confirmText, danger });
//     if (ok) { ... }
//   The async-await ergonomics that drop-in replace
//   `if (window.confirm("..."))`. Backed by a single Dialog mounted
//   at the root so we don't paint a Dialog tree per call site.
//
// Variants:
//   - `danger=true` paints the confirm button with the brand critical
//     tone. Use for destructive ops (delete override, cancel job,
//     mass push, …).
//   - `confirmText` / `cancelText` accept any string; defaults are
//     "Confirm" / "Cancel".

import * as React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

import { BRAND, ROLE } from "../../theme/brand";

/**
 * Presentational confirm dialog. Branded to match PageHeader / panel
 * tokens. Keeps the API minimal: open + onClose + onConfirm + the
 * copy. Anything more elaborate (forms, validation) belongs in a
 * dedicated dialog, not in this generic shell.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  body,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  busy = false,
  icon = null,
}) {
  const confirmBg = danger ? ROLE.critical : BRAND.teal;
  const confirmHover = danger ? "#c66460" : BRAND.tealHover;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadow,
          // Soft top-edge accent in the danger variant — visual cue
          // without resorting to red header text.
          ...(danger && {
            borderTop: `3px solid ${ROLE.critical}`,
          }),
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          pr: 5,
          pb: 1,
          color: BRAND.dark,
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: -0.2,
        }}
      >
        {icon ? (
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 2,
              bgcolor: danger ? ROLE.criticalSoft : BRAND.tealSoft,
              color: danger ? ROLE.critical : BRAND.tealText,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              "& svg": { fontSize: 20 },
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        ) : null}
        <Box sx={{ flex: 1, minWidth: 0 }}>{title}</Box>
        <IconButton
          aria-label="close"
          onClick={onClose}
          disabled={busy}
          size="small"
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            color: BRAND.gray,
            "&:hover": { color: BRAND.dark },
          }}
        >
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 1.5 }}>
        {typeof body === "string" ? (
          <Typography
            variant="body2"
            sx={{
              color: BRAND.dark,
              fontSize: 14,
              lineHeight: 1.55,
              whiteSpace: "pre-line",
            }}
          >
            {body}
          </Typography>
        ) : (
          // Allow callers to pass a ReactNode (e.g. a list, a code
          // block). The Typography wrapper above only kicks in when
          // body is a plain string.
          body
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          gap: 1,
          borderTop: `1px solid ${BRAND.border}`,
          bgcolor: BRAND.surfaceMuted,
        }}
      >
        <Button
          onClick={onClose}
          disabled={busy}
          variant="text"
          sx={{
            textTransform: "none",
            fontWeight: 600,
            color: BRAND.dark,
            "&:hover": { bgcolor: BRAND.darkSoft },
          }}
        >
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={busy}
          variant="contained"
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: confirmBg,
            "&:hover": { bgcolor: confirmHover },
            "&.Mui-disabled": {
              bgcolor: confirmBg,
              opacity: 0.6,
              color: "#fff",
            },
          }}
        >
          {busy ? "Working…" : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Async hook + provider ───────────────────────────────────────────
//
// Pattern: <ConfirmProvider> mounts ONE dialog at the root and exposes
// `useConfirm()`. Calls return a Promise<boolean> that resolves true
// on confirm and false on cancel/close. This keeps page code clean:
//
//   const confirm = useConfirm();
//   const ok = await confirm({ title: "Cancel job?", danger: true });
//   if (!ok) return;
//   ...
//
// Compared to a per-page Dialog state (open + onClose + onConfirm
// trios), this collapses ~10 lines per call site into one.

const ConfirmContext = React.createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = React.useState({
    open: false,
    title: "",
    body: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    danger: false,
    icon: null,
  });
  // Promise resolver kept in a ref so a Dialog re-render doesn't
  // strand it. Set when `confirm()` is called, called from the
  // button handlers.
  const resolverRef = React.useRef(null);

  const confirm = React.useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        title: opts?.title ?? "Are you sure?",
        body: opts?.body ?? "",
        confirmText: opts?.confirmText ?? "Confirm",
        cancelText: opts?.cancelText ?? "Cancel",
        danger: Boolean(opts?.danger),
        icon: opts?.icon ?? null,
      });
    });
  }, []);

  const handleClose = React.useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  }, []);

  const handleConfirm = React.useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={state.open}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={state.title}
        body={state.body}
        confirmText={state.confirmText}
        cancelText={state.cancelText}
        danger={state.danger}
        icon={state.icon}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Returns an async `confirm()` function. Throws if called outside
 * <ConfirmProvider> (don't fail silently — that would bypass user
 * confirmation in production).
 */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx;
}
