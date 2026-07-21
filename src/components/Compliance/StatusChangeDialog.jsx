// src/components/Compliance/StatusChangeDialog.jsx
//
// Confirm-with-note dialog for a finding remediation-status change. Extracted
// from the SecurityCompliance god-component. Pure: props + a local note field,
// no data fetching. Terminal transitions (risk_accepted / wont_fix) require an
// audit note before Confirm enables.

import * as React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { REMEDIATION_STATUS_META } from "./complianceChips";
import { TERMINAL_TRANSITIONS_REQUIRING_NOTE } from "./complianceHelpers";

export default function StatusChangeDialog({ open, finding: _finding, targetStatus, onConfirm, onCancel }) {
  const [note, setNote] = React.useState("");
  const requiresNote = TERMINAL_TRANSITIONS_REQUIRING_NOTE.has(targetStatus);
  const canSubmit = !requiresNote || note.trim().length > 0;

  // Reset the note when the dialog reopens for a different transition, so
  // text from a previous click can't leak into the next confirmation.
  React.useEffect(() => {
    if (open) setNote("");
  }, [open]);

  if (!targetStatus) return null;

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        Mark as {REMEDIATION_STATUS_META[targetStatus]?.label.toLowerCase()}?
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {requiresNote
            ? "This is a terminal state. Please provide a brief justification — it will be recorded in the audit log."
            : "Optionally add a note for the audit log."}
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          maxRows={6}
          placeholder={
            requiresNote
              ? "e.g. Mitigated via network ACL; revisit Q3."
              : "Optional note"
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required={requiresNote}
          error={requiresNote && note.trim().length === 0}
          helperText={
            requiresNote && note.trim().length === 0
              ? "A note is required for this transition."
              : " "
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => onConfirm({ note: note.trim() || null })}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
