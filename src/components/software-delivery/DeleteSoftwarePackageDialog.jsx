import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
} from "@mui/material";

export default function DeleteSoftwarePackageDialog({
  open,
  item,
  submitting,
  onClose,
  onConfirm,
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Delete Software Package</DialogTitle>

      <DialogContent>
        <Typography color="text.secondary">
          This action will permanently delete the selected software package
          {item?.name ? `: "${item.name}"` : ""}.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
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