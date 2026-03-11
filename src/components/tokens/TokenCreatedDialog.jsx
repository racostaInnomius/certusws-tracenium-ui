import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Paper,
  Box,
} from "@mui/material";

export default function TokenCreatedDialog({ open, onClose, tokenData }) {
  const handleCopy = async () => {
    if (!tokenData?.token) return;
    await navigator.clipboard.writeText(tokenData.token);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Token Created</DialogTitle>

      <DialogContent>
        <Typography sx={{ mb: 2, color: "text.secondary" }}>
          Save this token now. For security reasons, it may only be shown once.
        </Typography>

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: "#f8fafc",
            wordBreak: "break-all",
            fontFamily: "monospace",
            mb: 2,
          }}
        >
          {tokenData?.token ?? "—"}
        </Paper>

        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Typography>
            <strong>Max Uses:</strong> {tokenData?.maxUses ?? "—"}
          </Typography>
          <Typography>
            <strong>Expires At:</strong> {tokenData?.expiresAt ?? "—"}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleCopy}>Copy Token</Button>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}