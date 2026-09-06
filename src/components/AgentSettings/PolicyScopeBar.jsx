// src/components/AgentSettings/PolicyScopeBar.jsx
//
// Top bar of Agent Settings: WHAT the form below edits. Two scopes only —
// the tenant policy, or one device's override — plus a one-line rollout
// summary that links to the Policy rollout view.
//
// The device is chosen with the same server-paginated, searchable picker
// Software Delivery and Asset Groups use. The old `<Select>` listed the
// first 25 devices the API returned and nothing else.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import KnownDevicesPicker from "../AssetGroups/KnownDevicesPicker";

export function DevicePickerDialog({ open, onClose, onPick, currentId }) {
  const selected = React.useMemo(() => new Set(currentId ? [currentId] : []), [currentId]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Choose a device</DialogTitle>
      <DialogContent dividers>
        <KnownDevicesPicker
          open={open}
          selectedIds={selected}
          onToggleDevice={(id) => {
            onPick(id);
            onClose();
          }}
          selectedLabel="selected"
          emptyLabel="No devices match."
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PolicyScopeBar({
  scope,
  onScopeChange,
  device,
  onPickDevice,
  versionText,
  rolloutText,
  onOpenRollout,
  dirtyCount = 0,
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        flexWrap: "wrap",
        p: 1.25,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 2,
        bgcolor: BRAND.surfaceMuted,
      }}
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        value={scope}
        onChange={(_e, next) => { if (next) onScopeChange(next); }}
        aria-label="Policy scope"
      >
        <ToggleButton value="tenant" sx={{ textTransform: "none", px: 1.5 }}>Tenant</ToggleButton>
        <ToggleButton value="device" sx={{ textTransform: "none", px: 1.5 }}>Device</ToggleButton>
      </ToggleButtonGroup>

      {scope === "device" ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          {device ? (
            <Chip
              label={`${device.hostname || device.deviceId}${device.agentVersion ? ` · ${device.agentVersion}` : ""}${device.connected ? " · online" : " · offline"}`}
              sx={{ bgcolor: BRAND.cyanSoft, color: BRAND.dark, fontWeight: 700 }}
            />
          ) : (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>No device selected</Typography>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<SearchOutlinedIcon />}
            onClick={() => setPickerOpen(true)}
            sx={{ textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.teal }}
          >
            {device ? "Change device" : "Choose device"}
          </Button>
        </Box>
      ) : null}

      <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        {dirtyCount > 0 ? (
          <Chip
            size="small"
            label={`${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`}
            sx={{ bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warning, fontWeight: 800 }}
          />
        ) : null}
        {versionText ? (
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", fontFamily: "monospace" }}>{versionText}</Typography>
        ) : null}
        {rolloutText ? (
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{rolloutText}</Typography>
        ) : null}
        {onOpenRollout ? (
          <Button size="small" onClick={onOpenRollout} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
            View rollout →
          </Button>
        ) : null}
      </Box>

      <DevicePickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPickDevice} currentId={device?.deviceId || ""} />
    </Box>
  );
}
