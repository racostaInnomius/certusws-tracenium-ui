// src/components/AgentSettings/HistoryPanel.jsx
//
// Saved versions of the tenant policy (phase C), newest first, with a
// review-then-restore flow. Restoring is a whole-document save locked on
// the current version; the page shows the diff first, like every save.

import * as React from "react";
import { Box, Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { formatRelativeTime, shortHash } from "../Policies/policyDisplay";

function reasonLabel(reason) {
  const r = String(reason || "");
  if (r === "put") return "Whole document";
  if (r === "seed") return "Before history";
  if (r.startsWith("domain:")) return `Section ${r.slice(7)}`;
  if (r.startsWith("restore:")) return `Restored ${r.slice(8)}`;
  return r || "—";
}

export default function HistoryPanel({ items, currentVersion, onReview, busy = false }) {
  const list = Array.isArray(items) ? items : [];
  return (
    <Box sx={{ mt: 3 }}>
      <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: BRAND.dark }}>Version history</Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1 }}>
        Every saved version of the tenant policy, newest first. Restoring shows the differences with the current version before writing anything.
      </Typography>
      {list.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>No versions saved yet. The next save starts the history.</Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Policy version history">
            <TableHead>
              <TableRow>
                <TableCell>Version</TableCell>
                <TableCell>Saved</TableCell>
                <TableCell>By</TableCell>
                <TableCell>Change</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((h) => {
                const isCurrent = String(h.policy_version) === String(currentVersion);
                return (
                  <TableRow key={h.id} hover>
                    <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {h.policy_version}
                      {isCurrent ? <Chip size="small" label="current" sx={{ ml: 1, height: 18, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800 }} /> : null}
                      <Typography component="span" sx={{ ml: 1, fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace" }}>{shortHash(h.policy_hash)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={formatDate(h.saved_at)} arrow>
                        <span>{formatRelativeTime(h.saved_at)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{h.actor_subject || "system"}</TableCell>
                    <TableCell>{reasonLabel(h.reason)}</TableCell>
                    <TableCell align="right">
                      {isCurrent ? null : (
                        <Button size="small" disabled={busy} onClick={() => onReview?.(h)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
                          Review and restore…
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
