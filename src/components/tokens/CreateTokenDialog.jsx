import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
} from "@mui/material";

export default function CreateTokenDialog({ open, onClose, onSubmit, submitting }) {
  const [maxUses, setMaxUses] = React.useState(100);
  const [expiresInHours, setExpiresInHours] = React.useState(24);

  React.useEffect(() => {
    if (!open) {
      setMaxUses(100);
      setExpiresInHours(24);
    }
  }, [open]);

  const handleSubmit = () => {
    onSubmit?.({
      maxUses: Number(maxUses),
      expiresInHours: Number(expiresInHours),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create Token</DialogTitle>

      <DialogContent>
        <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
          <TextField
            label="Max Uses"
            type="number"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            fullWidth
          />

          <TextField
            label="Expires In Hours"
            type="number"
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(e.target.value)}
            fullWidth
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}