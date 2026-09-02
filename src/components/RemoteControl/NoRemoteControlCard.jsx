// src/components/RemoteControl/NoRemoteControlCard.jsx
//
// The empty state for the Connect tab: no device in this tenant advertises
// any remote control capability.
//
// ── Where this came from ─────────────────────────────────────────────
//
// This is the old PluginUnavailableCard, which sat permanently in the second
// column of the page telling every operator the plugin was "not yet shipped"
// — on a page where it had been working for months. Copy that contradicts
// the screen around it is worse than no copy: it teaches people to ignore
// the panel, and then it's still being ignored the day it says something
// true.
//
// The list of capabilities was the good part, so it stays. What changes is
// WHEN it renders: only when it is actually true, in place of the table.
// An empty state answers "why is there nothing here?", which is a question
// somebody is really asking at that moment.

import { Paper, Box, Stack, Typography } from "@mui/material";
import ElectricalServicesOutlinedIcon from "@mui/icons-material/ElectricalServicesOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import FileCopyOutlinedIcon from "@mui/icons-material/FileCopyOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { BRAND, ICON } from "../../theme/brand";
import { RCP_METHODS } from "./rcpMethods";

const METHOD_ICON = {
  shell: TerminalOutlinedIcon,
  file: FileCopyOutlinedIcon,
  screen: VisibilityOutlinedIcon
};

/**
 * @param {number} fleetTotal how many devices the tenant has, so the copy can
 *   tell "no devices at all" apart from "devices, none with the capability".
 *   They are different problems and they have different fixes.
 */
export default function NoRemoteControlCard({ fleetTotal = 0 }) {
  const hasDevices = fleetTotal > 0;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 2,
        border: `1px dashed ${BRAND.borderStrong}`,
        bgcolor: BRAND.surfaceMuted
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            bgcolor: BRAND.cyanSoft,
            color: BRAND.tealText,
            display: "grid",
            placeItems: "center",
            flexShrink: 0
          }}
        >
          <ElectricalServicesOutlinedIcon />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            {hasDevices ? "No device offers remote control yet" : "No enrolled devices yet"}
          </Typography>
          <Typography variant="body2" sx={{ color: BRAND.textMuted }}>
            {hasDevices
              ? `None of your ${fleetTotal} devices advertises a remote control capability. ` +
                "Turn on remoteShell, remoteFile or remoteScreen in the agent policy, and the " +
                "device will appear here after its next check-in."
              : "Enrol a device from Device Enrollment and it will show up here once its agent connects."}
          </Typography>
        </Box>
      </Stack>

      <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600, mb: 1.5 }}>
        What each capability unlocks
      </Typography>

      <Stack spacing={1.5}>
        {RCP_METHODS.map((m) => {
          const Icon = METHOD_ICON[m.type];
          return (
            <Stack key={m.type} direction="row" spacing={1.5} alignItems="flex-start">
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: 1,
                  bgcolor: BRAND.tealSoft,
                  color: BRAND.tealText,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  mt: 0.25
                }}
              >
                <Icon sx={{ fontSize: ICON.sm }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
                  {m.label}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: BRAND.gray, display: "block", lineHeight: 1.45 }}
                >
                  {m.description} Enabled by <strong>{m.policyName}</strong>.
                </Typography>
              </Box>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}
