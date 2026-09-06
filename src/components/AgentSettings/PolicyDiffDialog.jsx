// src/components/AgentSettings/PolicyDiffDialog.jsx
//
// "Review before saving": the flat list of policy leaves that will change.
// Exists because a one-switch edit once rewrote five plugins (tenant 111,
// 2026-09-03) and nobody saw it coming — the form showed a toggle, the
// request carried a document. The diff shows the document.

import * as React from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { formatDiffValue } from "./policyDiff";

const KIND_COLOR = { added: ROLE.positive, removed: ROLE.critical, changed: ROLE.caution };
const KIND_SIGN = { added: "+", removed: "−", changed: "~" };

export default function PolicyDiffDialog({ open, onClose, entries, onConfirm, title = "Review changes", confirmText = "Save", busy = false, scopeLabel = "" }) {
  const list = Array.isArray(entries) ? entries : [];
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        {title}
        {scopeLabel ? <Typography component="span" sx={{ ml: 1, fontSize: TEXT.sm, color: BRAND.gray, fontWeight: 500 }}>{scopeLabel}</Typography> : null}
      </DialogTitle>
      <DialogContent dividers>
        {list.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.base, color: BRAND.gray }}>Nothing changes: the document you would save is identical to the one loaded.</Typography>
        ) : (
          <Box component="ul" aria-label="Policy changes" sx={{ listStyle: "none", m: 0, p: 0, fontFamily: "monospace", fontSize: TEXT.sm }}>
            {list.map((e) => (
              <Box component="li" key={e.path} sx={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 1, py: 0.5, borderBottom: `1px solid ${BRAND.border}` }}>
                <Typography component="span" sx={{ color: KIND_COLOR[e.kind], fontWeight: 800, fontFamily: "monospace" }}>{KIND_SIGN[e.kind]}</Typography>
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="div" sx={{ fontFamily: "monospace", fontSize: TEXT.sm, color: BRAND.dark, fontWeight: 700, wordBreak: "break-all" }}>{e.path}</Typography>
                  <Typography component="div" sx={{ fontFamily: "monospace", fontSize: TEXT.sm, color: BRAND.gray, wordBreak: "break-all" }}>
                    {e.kind !== "added" ? <span style={{ textDecoration: "line-through" }}>{formatDiffValue(e.before)}</span> : null}
                    {e.kind === "changed" ? " → " : null}
                    {e.kind !== "removed" ? <span style={{ color: BRAND.dark }}>{formatDiffValue(e.after)}</span> : null}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={busy || list.length === 0}
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          {busy ? "Saving…" : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
