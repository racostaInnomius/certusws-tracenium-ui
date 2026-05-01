import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
  Typography,
} from "@mui/material";
import { BRAND } from "../../theme/brand";

function toPositiveNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export default function CreateTokenDialog({
  open,
  onClose,
  onSubmit,
  submitting,
  quota,
}) {
  const remaining = toPositiveNumber(quota?.remaining, 0);
  const maxDevices = toPositiveNumber(quota?.maxDevices, 0);
  const used = toPositiveNumber(quota?.used, 0);
  const hasQuota = remaining > 0;

  const [tokenLabel, setTokenLabel] = React.useState("");
  const [maxUses, setMaxUses] = React.useState(remaining || 1);
  const [expiresInHours, setExpiresInHours] = React.useState(24);

  const [labelError, setLabelError] = React.useState(false);
  const [maxUsesError, setMaxUsesError] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setTokenLabel("");
      setMaxUses(remaining > 0 ? remaining : 1);
      setExpiresInHours(24);
      setLabelError(false);
      setMaxUsesError("");
    }
  }, [open, remaining]);

  const validateMaxUses = (value) => {
    const n = Number(value);

    if (!Number.isFinite(n) || n <= 0) {
      return "Max uses must be greater than 0.";
    }

    if (!Number.isInteger(n)) {
      return "Max uses must be a whole number.";
    }

    if (n > remaining) {
      return `Max uses cannot exceed the remaining quota (${remaining}).`;
    }

    return "";
  };

  const handleMaxUsesChange = (event) => {
    const value = event.target.value;
    setMaxUses(value);
    setMaxUsesError(validateMaxUses(value));
  };

  const handleSubmit = () => {
    const trimmedLabel = tokenLabel.trim();
    const maxUsesValidation = validateMaxUses(maxUses);

    if (!trimmedLabel) {
      setLabelError(true);
    }

    if (maxUsesValidation) {
      setMaxUsesError(maxUsesValidation);
    }

    if (!trimmedLabel || maxUsesValidation) return;

    onSubmit?.({
      tokenLabel: trimmedLabel,
      maxUses: Number(maxUses),
      expiresInHours: Number(expiresInHours),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        Create Token
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
          <Alert
            severity={hasQuota ? "info" : "warning"}
            sx={{
              borderRadius: 2,
              bgcolor: hasQuota ? BRAND.tealSoft : BRAND.alert.warningSoft,
              color: BRAND.dark,
              "& .MuiAlert-icon": {
                color: hasQuota ? BRAND.tealText : BRAND.alert.warning,
              },
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
              Device enrollment quota
            </Typography>
            <Typography sx={{ fontSize: 13 }}>
              Max devices: {maxDevices} · Used: {used} · Remaining: {remaining}
            </Typography>
          </Alert>

          <TextField
            label="Token Label"
            value={tokenLabel}
            onChange={(e) => {
              setTokenLabel(e.target.value);
              if (labelError) setLabelError(false);
            }}
            error={labelError}
            helperText={labelError ? "Token label is required" : "Give this token a short rollout-friendly label."}
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
            onChange={handleMaxUsesChange}
            error={Boolean(maxUsesError)}
            helperText={
              maxUsesError ||
              `You can allocate up to ${remaining} remaining device enrollment${remaining === 1 ? "" : "s"}.`
            }
            fullWidth
            disabled={!hasQuota}
            slotProps={{
              htmlInput: {
                min: 1,
                max: remaining,
                step: 1,
              },
            }}
          />

          <TextField
            label="Expires In Hours"
            type="number"
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(e.target.value)}
            helperText="Default is 24 hours. Use a shorter window for high-security rollouts."
            fullWidth
            slotProps={{
              htmlInput: {
                min: 1,
                step: 1,
              },
            }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>

        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={
            submitting ||
            !hasQuota ||
            !tokenLabel.trim() ||
            Boolean(validateMaxUses(maxUses))
          }
          sx={{
            bgcolor: BRAND.teal,
            textTransform: "none",
            fontWeight: 700,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
