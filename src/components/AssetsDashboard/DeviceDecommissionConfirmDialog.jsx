// src/components/AssetsDashboard/DeviceDecommissionConfirmDialog.jsx
//
// Type-to-confirm dialog for permanently decommissioning a device, extracted
// from the AssetsDashboard god-component. Fully props-driven: the page owns the
// confirmation-text / reason state and the submit action; this component only
// gates the Delete button on an exact hostname/id match (canConfirm). Deletion
// revokes agent certs and drops the device from active inventory.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { BRAND, TEXT } from "../../theme/brand";
import { getHostDeviceId, getHostDisplayName } from "./hostHelpers";

export default function DeviceDecommissionConfirmDialog({
  open,
  device,
  submitting = false,
  confirmationText,
  reason,
  onConfirmationTextChange,
  onReasonChange,
  onClose,
  onConfirm,
}) {
  const safeDevice = device || {};
  const deviceId = getHostDeviceId(safeDevice);
  const hostname = getHostDisplayName(safeDevice);
  const requiredText = String(hostname || deviceId || "").trim();
  const confirmationMatches =
    requiredText.length > 0 &&
    String(confirmationText || "").trim() === requiredText;
  const canConfirm = Boolean(deviceId && confirmationMatches && !submitting);

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadow,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          color: BRAND.dark,
          fontWeight: 800,
          pb: 1.25,
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: BRAND.alert.errorSoft,
            color: BRAND.alert.error,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <WarningAmberRoundedIcon fontSize="small" />
        </Box>
        Delete device permanently?
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          <Alert
            severity="warning"
            variant="outlined"
            sx={{
              borderColor: `${BRAND.alert.warning}55`,
              bgcolor: BRAND.alert.warningSoft,
              color: BRAND.dark,
              "& .MuiAlert-icon": { color: BRAND.alert.warning },
            }}
          >
            This action will decommission the device immediately, revoke all active
            agent certificates, and remove it from active inventory.
          </Alert>

          <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark, lineHeight: 1.65 }}>
            Collected hardware inventory, software inventory, sessions, compliance
            data, projections, and related telemetry will be retained only during
            the configured retention window and then permanently purged. Revoked
            certificates will not be restored.
          </Typography>

          <Box
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: `1px solid ${BRAND.border}`,
              bgcolor: BRAND.surfaceMuted,
            }}
          >
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, fontWeight: 700 }}>
              Device
            </Typography>
            <Typography sx={{ fontSize: TEXT.base, color: BRAND.dark, fontWeight: 800 }}>
              {hostname || "—"}
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, fontFamily: "monospace" }}>
              {deviceId || "—"}
            </Typography>
          </Box>

          <TextField
            size="small"
            label="Reason optional"
            value={reason}
            onChange={(event) => onReasonChange?.(event.target.value)}
            placeholder="e.g. Device retired, replaced, or no longer trusted"
            disabled={submitting}
            fullWidth
          />

          <TextField
            size="small"
            label={`Type ${requiredText || "the device name"} to confirm`}
            value={confirmationText}
            onChange={(event) => onConfirmationTextChange?.(event.target.value)}
            disabled={submitting}
            fullWidth
            error={Boolean(confirmationText) && !confirmationMatches}
            helperText={
              confirmationMatches
                ? "Confirmation matched."
                : "This prevents accidental permanent device decommission."
            }
          />
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          gap: 1,
          borderTop: `1px solid ${BRAND.border}`,
          bgcolor: BRAND.surfaceMuted,
        }}
      >
        <Button
          onClick={onClose}
          disabled={submitting}
          sx={{ textTransform: "none", color: BRAND.dark, fontWeight: 700 }}
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={!canConfirm}
          variant="contained"
          startIcon={
            submitting ? (
              <CircularProgress size={14} sx={{ color: "#fff" }} />
            ) : (
              <DeleteOutlineRoundedIcon />
            )
          }
          sx={{
            textTransform: "none",
            fontWeight: 800,
            bgcolor: BRAND.alert.error,
            "&:hover": { bgcolor: BRAND.alert.errorHover },
          }}
        >
          {submitting ? "Queueing..." : "Delete permanently"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
