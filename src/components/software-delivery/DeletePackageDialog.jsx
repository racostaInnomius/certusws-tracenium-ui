// src/components/software-delivery/DeletePackageDialog.jsx
//
// Tiny confirm dialog for catalog row deletion. Backend rejects with
// 409 when the package is referenced by any deployment — the parent
// surfaces that as a snackbar.

import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
} from "@mui/material";

export default function DeletePackageDialog({ open, item, submitting, onClose, onConfirm }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Delete software package</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary">
          This will permanently delete{" "}
          <strong>{item?.name}</strong>{" "}
          (v{item?.version}, {item?.platform}/{item?.arch}/{item?.format}).
          {" "}If any deployment still references this package the
          delete will fail — mark the package inactive instead.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          onClick={onConfirm}
          disabled={submitting}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
