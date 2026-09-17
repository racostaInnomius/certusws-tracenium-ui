// src/components/Compliance/StatusChangeDialog.jsx
//
// Confirm-with-note dialog for a finding remediation-status change. Extracted
// from the SecurityCompliance god-component. Pure: props + a local note field,
// no data fetching. risk_accepted / wont_fix never reach this dialog since
// P1-7: they are exceptions (ExceptionRequestDialog).

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

export default function StatusChangeDialog({ open, finding: _finding, targetStatus, onConfirm, onCancel }) {
  const [note, setNote] = React.useState("");

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
          Optionally add a note for the audit log.
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          maxRows={6}
          placeholder="Optional note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          helperText=" "
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => onConfirm({ note: note.trim() || null })}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
