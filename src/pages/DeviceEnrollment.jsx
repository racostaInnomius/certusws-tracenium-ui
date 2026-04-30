// src/pages/DeviceEnrollment.jsx
//
// Single landing for everything an operator needs to bring a new
// machine into the fleet. Two things are required to enroll a device:
//
//   1. An enrollment token (one-time secret that proves the device is
//      authorized to register against this tenant).
//   2. The agent installer binary for the device's platform/arch.
//
// Until now those lived in completely separate places — tokens were
// buried in Settings → Tokens (admin surface), and the binary catalog
// was a tab inside Asset Management (an inventory surface). A new
// operator who'd never enrolled a device before had to discover that
// "to install an agent you also need a token", then hunt for tokens
// in Settings. This page collapses both into the same flow:
//
//   * Header guidance lays out the 2-step path verbally so the user
//     knows what to do before they look at any tab.
//   * Two tabs ordered Tokens → Downloads matching the natural flow:
//     mint the token first, then grab the installer.
//
// Both panels are rendered via their existing page components in
// `embedded` mode — we don't duplicate the table/dialog/state logic,
// we just suppress the panel's own PageHeader so the host's chrome
// is the only one on screen.

import * as React from "react";
import {
  Box,
  Stack,
  Typography,
  Paper,
  ButtonBase,
} from "@mui/material";
import InstallDesktopOutlinedIcon from "@mui/icons-material/InstallDesktopOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";

import PageHeader from "../components/common/PageHeader";
import { BRAND } from "../theme/brand";

import TokensAdministrator from "./TokensAdministrator";
import SoftwareDelivery from "./SoftwareDelivery";

// Compact horizontal "Step 1 → Step 2" guide. The cards now replace
// the old tabs: clicking each step switches the content below.
function EnrollmentSteps({ activeTab, onSelectTab }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        bgcolor: BRAND.surfaceMuted,
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{ color: BRAND.dark, fontWeight: 700, mb: 1 }}
      >
        How to enroll a new device
      </Typography>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems="stretch"
      >
        <StepCard
          active={activeTab === 0}
          number={1}
          icon={<VpnKeyOutlinedIcon fontSize="small" />}
          title="Generate an enrollment token"
          body="Create a one-time enrollment token. Copy it as soon as it is shown because it will be required during agent installation."
          actionLabel="Open Enrollment Tokens"
          onClick={() => onSelectTab(0)}
        />

        <StepCard
          active={activeTab === 1}
          number={2}
          icon={<DownloadOutlinedIcon fontSize="small" />}
          title="Download the agent installer"
          body="Pick the platform and architecture that matches the target device, then run the installer and paste the token when prompted."
          actionLabel="Open Agent Downloads"
          onClick={() => onSelectTab(1)}
        />
      </Stack>
    </Paper>
  );
}

function StepCard({ active, number, icon, title, body, actionLabel, onClick }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        flex: 1,
        textAlign: "left",
        borderRadius: 2,
        display: "block",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          height: "100%",
          p: 1.5,
          borderRadius: 2,
          border: active
            ? `1px solid ${BRAND.teal}`
            : `1px solid ${BRAND.border}`,
          bgcolor: "#fff",
          display: "flex",
          gap: 1.25,
          alignItems: "flex-start",
          boxShadow: active
            ? "0 14px 30px rgba(27,166,166,0.18)"
            : "none",
          transition:
            "border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease",
          "&:hover": {
            borderColor: BRAND.teal,
            boxShadow: "0 14px 30px rgba(59,64,77,0.10)",
            transform: "translateY(-1px)",
          },
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            bgcolor: active ? BRAND.teal : BRAND.tealSoftStrong,
            color: active ? "#fff" : BRAND.tealText,
            fontSize: 13,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            mt: 0.25,
          }}
        >
          {number}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
            <Box sx={{ color: BRAND.teal, display: "flex" }}>{icon}</Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 800, color: BRAND.dark }}
            >
              {title}
            </Typography>
          </Stack>

          <Typography
            variant="caption"
            sx={{
              color: BRAND.gray,
              display: "block",
              lineHeight: 1.7,
              mb: 1.25,
            }}
          >
            {body}
          </Typography>

          <Stack direction="row" spacing={0.75} alignItems="center">
            <Typography
              variant="caption"
              sx={{
                color: active ? BRAND.tealText : BRAND.dark,
                fontWeight: 800,
              }}
            >
              {actionLabel}
            </Typography>
            <ArrowForwardRoundedIcon
              sx={{
                fontSize: 16,
                color: active ? BRAND.tealText : BRAND.gray,
              }}
            />
          </Stack>
        </Box>
      </Paper>
    </ButtonBase>
  );
}

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 0 }}>{children}</Box> : null;
}

export default function DeviceEnrollment() {
  const [activeTab, setActiveTab] = React.useState(0);

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Device Enrollment"
        subtitle="Generate enrollment tokens and download the agent installer."
        icon={<InstallDesktopOutlinedIcon />}
      />

      <EnrollmentSteps activeTab={activeTab} onSelectTab={setActiveTab} />

      <TabPanel value={activeTab} index={0}>
        <TokensAdministrator embedded />
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        <SoftwareDelivery embedded />
      </TabPanel>
    </Box>
  );
}