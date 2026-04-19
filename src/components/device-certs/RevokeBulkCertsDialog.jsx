import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  TextField,
  Box,
} from "@mui/material";

export default function RevokeBulkCertsDialog({
  open,
  selectedCount,
  deviceId,
  submitting,
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setReason("");
    }
  }, [open]);

  const handleConfirm = () => {
    onConfirm?.(reason);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Bulk Revoke Certificates</DialogTitle>

      <DialogContent>
        <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
          <Typography color="text.secondary">
            You are about to revoke {selectedCount} certificate
            {selectedCount === 1 ? "" : "s"} for device {deviceId || " - "}.
          </Typography>

          <TextField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            placeholder="Example: bulk revoke from UI"
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          onClick={handleConfirm}
          disabled={submitting || selectedCount <= 0}
        >
          Revoke Selected
        </Button>
      </DialogActions>
    </Dialog>
  );
}