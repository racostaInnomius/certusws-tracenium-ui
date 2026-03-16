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

  const [tokenLabel, setTokenLabel] = React.useState("");
  const [maxUses, setMaxUses] = React.useState(100);
  const [expiresInHours, setExpiresInHours] = React.useState(24);

  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setTokenLabel("");
      setMaxUses(100);
      setExpiresInHours(24);
      setError(false);
    }
  }, [open]);

  const handleSubmit = () => {

    if (!tokenLabel.trim()) {
      setError(true);
      return;
    }

    onSubmit?.({
      tokenLabel: tokenLabel.trim(),
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
            label="Token Label"
            value={tokenLabel}
            onChange={(e) => {
              setTokenLabel(e.target.value);
              if (error) setError(false);
            }}
            error={error}
            helperText={error ? "Token label is required" : ""}
            required
            fullWidth
            slotProps={{
              htmlInput: {
                maxLength: 25,
              },
            }}
          />

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

        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !tokenLabel.trim()}
        >
          Create
        </Button>

      </DialogActions>
    </Dialog>
  );
}