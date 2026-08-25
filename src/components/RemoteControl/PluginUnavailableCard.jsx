// src/components/RemoteControl/PluginUnavailableCard.jsx
//
// Info card for the Remote Control page right column. Explains what
// the operator will be able to do once the `rcp` plugin ships on the
// agent side, without implying it's already available.
//
// Copy is deliberately not "Feature disabled" — that reads like an
// admin toggle the user can flip. The real state is "plugin not yet
// shipped", which is a platform delivery thing, not a tenant config.

import { Paper, Box, Stack, Typography, Button, Chip } from "@mui/material";
import ElectricalServicesOutlinedIcon from "@mui/icons-material/ElectricalServicesOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import FileCopyOutlinedIcon from "@mui/icons-material/FileCopyOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import HistoryEduOutlinedIcon from "@mui/icons-material/HistoryEduOutlined";
import LaunchOutlinedIcon from "@mui/icons-material/LaunchOutlined";
import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";

const CAPABILITIES = [
  {
    icon: TerminalOutlinedIcon,
    title: "Encrypted shell",
    subtitle: "Open an interactive shell session to the device over mTLS."
  },
  {
    icon: FileCopyOutlinedIcon,
    title: "File transfer",
    subtitle: "Push/pull files between the operator workstation and the device."
  },
  {
    icon: VisibilityOutlinedIcon,
    title: "Screen share",
    subtitle: "View the device's current screen with explicit user consent."
  },
  {
    icon: HistoryEduOutlinedIcon,
    title: "Session transcripts",
    subtitle: "Every session recorded for audit + compliance review."
  }
];

export default function PluginUnavailableCard() {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px dashed ${BRAND.borderStrong}`,
        bgcolor: BRAND.surfaceMuted,
        height: "100%"
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
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
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            Remote Control plugin
          </Typography>
          <Chip
            size="small"
            label="rcp · not yet shipped"
            sx={{
              height: 18,
              mt: 0.25,
              bgcolor: ROLE.cautionSoft,
              color: ROLE.caution,
              fontWeight: 700,
              fontSize: TEXT.xs,
              border: `1px solid ${ROLE.caution}33`
            }}
          />
        </Box>
      </Stack>

      <Typography variant="body2" sx={{ color: BRAND.dark, mb: 1.5 }}>
        When <strong>rcp</strong> lands on the agent, this page will let operators:
      </Typography>

      <Stack spacing={1.25} sx={{ mb: 2 }}>
        {CAPABILITIES.map(({ icon: Icon, title, subtitle }) => (
          <Stack key={title} direction="row" spacing={1.25} alignItems="flex-start">
            <Box
              sx={{
                width: 24,
                height: 24,
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
                {title}
              </Typography>
              <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", lineHeight: 1.4 }}>
                {subtitle}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>

      <Button
        variant="outlined"
        size="small"
        endIcon={<LaunchOutlinedIcon />}
        fullWidth
        // No href yet — the "early access" program doesn't exist.
        // The button sits disabled until product lands a signup URL.
        disabled
        sx={{ borderColor: BRAND.border, color: BRAND.teal }}
      >
        Request early access
      </Button>
    </Paper>
  );
}
