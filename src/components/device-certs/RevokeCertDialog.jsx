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

export default function RevokeCertDialog({
  open,
  cert,
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
      <DialogTitle>Revoke Certificate</DialogTitle>

      <DialogContent>
        <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
          <Typography color="text.secondary">
            You are about to revoke the selected certificate
            {cert?.serial ? ` (${cert.serial})` : ""}.
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Fingerprint: {cert?.fingerprint_sha256 || " - "}
          </Typography>

          <TextField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            placeholder="Example: compromised device"
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          onClick={handleConfirm}
          disabled={submitting}
        >
          Revoke
        </Button>
      </DialogActions>
    </Dialog>
  );
}