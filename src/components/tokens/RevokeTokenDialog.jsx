import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from "@mui/material";

export default function RevokeTokenDialog({ open, token, onClose, onConfirm, submitting }) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Revoke Token</DialogTitle>

      <DialogContent>
        <Typography>
          Are you sure you want to revoke token <strong>{token?.id ?? "—"}</strong>?
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={onConfirm} disabled={submitting}>
          Revoke
        </Button>
      </DialogActions>
    </Dialog>
  );
}