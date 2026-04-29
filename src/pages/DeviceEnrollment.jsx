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
  Tabs,
  Tab,
  Stack,
  Typography,
  Paper,
} from "@mui/material";
import InstallDesktopOutlinedIcon from "@mui/icons-material/InstallDesktopOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";

import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { BRAND } from "../theme/brand";

import TokensAdministrator from "./TokensAdministrator";
import SoftwareDelivery from "./SoftwareDelivery";

const TAB_SX = {
  textTransform: "none",
  fontWeight: 600,
  minHeight: 62,
  letterSpacing: 0.2,
};

function a11yProps(index) {
  return {
    id: `enrollment-tab-${index}`,
    "aria-controls": `enrollment-tabpanel-${index}`,
  };
}

function TabPanel({ children, value, index, ...other }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`enrollment-tabpanel-${index}`}
      aria-labelledby={`enrollment-tab-${index}`}
      sx={{ pt: 2 }}
      {...other}
    >
      {value === index ? children : null}
    </Box>
  );
}

// Compact horizontal "Step 1 → Step 2" guide that replaces a long-form
// "How to enroll a device" doc. Two cards because there are exactly
// two prerequisites; numbered chips keep the order obvious. Uses
// neutral surface tones — we don't want the guide to compete with the
// data tables below.
function EnrollmentSteps() {
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
          number={1}
          icon={<VpnKeyOutlinedIcon fontSize="small" />}
          title="Generate an enrollment token"
          body="Use the Enrollment Tokens tab below. The token is a one-time secret — copy it as soon as it's shown."
        />
        <StepCard
          number={2}
          icon={<DownloadOutlinedIcon fontSize="small" />}
          title="Download the agent installer"
          body="Pick the platform / architecture in the Agent Downloads tab. Run the installer on the target device and paste the token when prompted."
        />
      </Stack>
    </Paper>
  );
}

function StepCard({ number, icon, title, body }) {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: 1,
        p: 1.5,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        bgcolor: "#fff",
        display: "flex",
        gap: 1.25,
        alignItems: "flex-start",
      }}
    >
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          bgcolor: BRAND.teal,
          color: "#fff",
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
            sx={{ fontWeight: 700, color: BRAND.dark }}
          >
            {title}
          </Typography>
        </Stack>
        <Typography variant="caption" sx={{ color: BRAND.gray }}>
          {body}
        </Typography>
      </Box>
    </Paper>
  );
}

export default function DeviceEnrollment() {
  const [activeTab, setActiveTab] = React.useState(0);

  const handleChange = (_e, value) => setActiveTab(value);

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Device Enrollment"
        subtitle="Generate enrollment tokens and download the agent installer."
        icon={<InstallDesktopOutlinedIcon />}
      />

      <EnrollmentSteps />

      <SectionPaper
        variant="panel"
        sx={{
          mb: 2,
          p: 0,
          overflow: "hidden",
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, sm: 2 },
            minHeight: 62,
            "& .MuiTabs-indicator": {
              height: 3,
              borderRadius: 999,
              backgroundColor: BRAND.teal,
            },
          }}
        >
          <Tab
            icon={<VpnKeyOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Enrollment Tokens"
            {...a11yProps(0)}
            sx={TAB_SX}
          />
          <Tab
            icon={<DownloadOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Agent Downloads"
            {...a11yProps(1)}
            sx={TAB_SX}
          />
        </Tabs>
      </SectionPaper>

      <TabPanel value={activeTab} index={0}>
        <TokensAdministrator embedded />
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        <SoftwareDelivery embedded />
      </TabPanel>
    </Box>
  );
}
