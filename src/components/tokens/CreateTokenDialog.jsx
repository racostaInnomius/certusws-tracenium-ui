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
  const maxDevices = toPositiveNumber(quota?.maxDevices, 0);
  const used = toPositiveNumber(quota?.used, 0);
  const remaining = Number.isFinite(Number(quota?.remaining))
    ? Math.floor(Number(quota.remaining))
    : maxDevices - used;
  const upperLimit = toPositiveNumber(quota?.upperLimit, Math.ceil(maxDevices * 1.2));
  const creatableRemaining = toPositiveNumber(
    quota?.creatableRemaining,
    Math.max(upperLimit - used, 0)
  );
  const overageRemaining = toPositiveNumber(
    quota?.overageRemaining,
    Math.max(upperLimit - Math.max(maxDevices, used), 0)
  );
  const capacityStatus = quota?.capacityStatus || "normal";
  const hasCreatableCapacity = creatableRemaining > 0;

  const [tokenLabel, setTokenLabel] = React.useState("");
  const [maxUses, setMaxUses] = React.useState(creatableRemaining || 1);
  const [expiresInHours, setExpiresInHours] = React.useState(24);

  const [labelError, setLabelError] = React.useState(false);
  const [maxUsesError, setMaxUsesError] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setTokenLabel("");
      setMaxUses(creatableRemaining > 0 ? creatableRemaining : 1);
      setExpiresInHours(24);
      setLabelError(false);
      setMaxUsesError("");
    }
  }, [open, creatableRemaining]);

  const validateMaxUses = (value) => {
    const n = Number(value);

    if (!Number.isFinite(n) || n <= 0) {
      return "Max uses must be greater than 0.";
    }

    if (!Number.isInteger(n)) {
      return "Max uses must be a whole number.";
    }

    if (n > creatableRemaining) {
      return `Max uses cannot exceed the available enrollment capacity (${creatableRemaining}).`;
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
            severity={capacityStatus === "blocked" ? "error" : capacityStatus === "exceeded" || capacityStatus === "approaching" ? "warning" : "info"}
            sx={{
              borderRadius: 2,
              bgcolor:
                capacityStatus === "blocked"
                  ? BRAND.alert.errorSoft
                  : capacityStatus === "exceeded" || capacityStatus === "approaching"
                    ? BRAND.alert.warningSoft
                    : BRAND.tealSoft,
              color: BRAND.dark,
              "& .MuiAlert-icon": {
                color:
                  capacityStatus === "blocked"
                    ? BRAND.alert.error
                    : capacityStatus === "exceeded" || capacityStatus === "approaching"
                      ? BRAND.alert.warning
                      : BRAND.tealText,
              },
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
              Device enrollment capacity
            </Typography>
            <Typography sx={{ fontSize: 13 }}>
              Max devices: {maxDevices} · Used agents: {used} · Remaining before standard limit: {remaining}
            </Typography>
            <Typography sx={{ fontSize: 13 }}>
              Upper cap: {upperLimit} · Available token capacity: {creatableRemaining}
              {capacityStatus === "exceeded" ? ` · Grace remaining: ${overageRemaining}` : ""}
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
              `You can allocate up to ${creatableRemaining} device enrollment${creatableRemaining === 1 ? "" : "s"} before reaching the upper cap.`
            }
            fullWidth
            disabled={!hasCreatableCapacity}
            slotProps={{
              htmlInput: {
                min: 1,
                max: creatableRemaining,
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
            !hasCreatableCapacity ||
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
