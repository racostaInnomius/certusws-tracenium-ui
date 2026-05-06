import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Stack,
} from "@mui/material";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import SettingsApplicationsOutlinedIcon from "@mui/icons-material/SettingsApplicationsOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";

import { BRAND } from "../theme/brand";

function StepCard({ step, title, description, icon, actionLabel, onAction, hint }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        height: "85%",
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            bgcolor: BRAND.tealSoft,
            color: BRAND.tealText,
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {step}
        </Box>

        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            bgcolor: BRAND.darkSoft,
            color: BRAND.dark,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      </Box>

      <Typography sx={{ fontSize: 18, fontWeight: 700, color: BRAND.dark }}>
        {title}
      </Typography>

      <Typography sx={{ color: "text.secondary", lineHeight: 1.6 }}>
        {description}
      </Typography>

      {hint && (
        <Typography sx={{ fontSize: 13, color: "#98A2B3", lineHeight: 1.5 }}>
          {hint}
        </Typography>
      )}

      {actionLabel && onAction && (
        <Box sx={{ mt: "auto", pt: 1 }}>
          <Button
            variant="outlined"
            endIcon={<ArrowForwardOutlinedIcon />}
            onClick={onAction}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderColor: BRAND.tealSoftStrong,
              color: BRAND.tealText,
              "&:hover": {
                borderColor: BRAND.tealText,
                backgroundColor: BRAND.tealSoft,
              },
            }}
          >
            {actionLabel}
          </Button>
        </Box>
      )}
    </Paper>
  );
}

export default function Welcome({ onNavigate }) {
  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, sm: 4 },
          mb: 2,
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadow,
          background: `linear-gradient(135deg, ${BRAND.tealSoft} 0%, ${BRAND.darkSoft} 100%)`,
        }}
      >
        <Stack spacing={1.5}>
          <Chip
            label="Getting Started"
            sx={{
              alignSelf: "flex-start",
              bgcolor: BRAND.tealSoft,
              color: BRAND.tealText,
              fontWeight: 700,
            }}
          />

          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              color: BRAND.dark,
              lineHeight: 1.1,
            }}
          >
            Welcome to Tracenium
          </Typography>

          <Typography
            sx={{
              maxWidth: 820,
              color: "text.secondary",
              fontSize: 16,
              lineHeight: 1.7,
            }}
          >
            To begin collecting inventory and security telemetry in Tracenium,
            complete the onboarding steps below. Once your first agent is installed
            and reports data, your Asset Management dashboard will populate
            automatically.
          </Typography>
        </Stack>
      </Paper>

      <Grid container spacing={2} rowSpacing={3} >
        <Grid size={{ xs: 12, md: 6 }}>
          <StepCard
            step="1"
            icon={<KeyOutlinedIcon />}
            title="Create an enrollment token"
            description="Generate an enrollment token in Settings > Tokens. Define the number of permitted uses based on your rollout plan and store the token securely, as it will be required during agent installation."
            hint="Recommended path: Settings > Tokens"
            actionLabel="Go to Tokens"
            onAction={() => onNavigate?.("tokens")}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <StepCard
            step="2"
            icon={<DownloadOutlinedIcon />}
            title="Download the Tracenium Agent"
            description="Open Agent Releases from the left navigation, then select the operating system and version that matches the device you want to onboard."
            hint="Agent Releases hosts the catalog of platform-specific Tracenium agent installer binaries."
            actionLabel="Go to Agent Releases"
            onAction={() => onNavigate?.("agent-releases")}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <StepCard
            step="3"
            icon={<SettingsApplicationsOutlinedIcon />}
            title="Install the Tracenium Agent"
            description="Run the installer on the target device. During setup, you will be prompted for the enrollment token created in step 1. The token validates and associates the agent with your tenant."
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <StepCard
            step="4"
            icon={<InsightsOutlinedIcon />}
            title="Review data in the portal"
            description="After installation, the Tracenium Agent will automatically send the required telemetry to the platform. No further action is needed from the user. Device, operating system and inventory data will begin appearing in Asset Management once reporting is received."
            actionLabel="Go to Asset Management"
            onAction={() => onNavigate?.("assets")}
          />
        </Grid>
      </Grid>
    </Box>
  );
}