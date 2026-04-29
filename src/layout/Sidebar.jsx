import * as React from "react";
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Button,
  Chip,
  Divider,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useAuthContext } from "../auth/AuthContext";

import LogoutIcon from "@mui/icons-material/Logout";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import GppGoodOutlinedIcon from "@mui/icons-material/GppGoodOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import InstallDesktopOutlinedIcon from "@mui/icons-material/InstallDesktopOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import { TOPBAR_HEIGHT } from "./Topbar";

import { BRAND } from "../theme/brand";

export const SIDEBAR_WIDTH = 210;

function SidebarContent({ items, selected, onSelect, handleLogout }) {
  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        bgcolor: BRAND.dark,
        color: "#e7e9ee",
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
        borderRight: `1px solid rgba(143,253,255,0.08)`,
      }}
    >
      {/* Header: brand wordmark. Same height and bottom-border as the
          Topbar so the cyan line is continuous across the sidebar and
          the top of the main pane. */}
      <Box
        sx={{
          height: TOPBAR_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 1,
          borderBottom: `3px solid ${BRAND.cyan}`,
        }}
      >
        <Box
          component="img"
          src="/tracenium.ico"
          alt="Tracenium"
          sx={{
            height: 40,
            width: "auto",
            display: "block",
          }}
        />
      </Box>

      <List disablePadding sx={{ flex: 1, px: 1.5, pt: 1.5 }}>
        {items.map((it) => {
          // Divider rows: a faint horizontal rule with a small section
          // label above it. Uses the same teal-on-dark family the rest
          // of the sidebar uses (BRAND.cyan at low alpha) so it reads
          // as part of the chrome, not a heavy separator. The label is
          // optional — if absent, render only the line.
          if (it.type === "divider") {
            return (
              <Box key={it.key} sx={{ mt: 1.5, mb: 0.75, px: 1.1 }}>
                {it.label ? (
                  <Typography
                    component="div"
                    sx={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "rgba(143,253,255,0.55)",
                      mb: 0.5,
                    }}
                  >
                    {it.label}
                  </Typography>
                ) : null}
                <Divider
                  sx={{
                    borderColor: "rgba(143,253,255,0.18)",
                  }}
                />
              </Box>
            );
          }

          const isSelected = selected === it.key;
          return (
            <ListItemButton
              key={it.key}
              selected={isSelected}
              onClick={() => onSelect?.(it.key)}
              sx={{
                borderRadius: 2,
                mb: 0.25,
                py: 0.6,
                px: 1.1,
                minHeight: 36,
                color: "#e7e9ee",
                transition: "background-color 0.12s ease, color 0.12s ease",
                ...(it.highlighted && {
                  bgcolor: "rgba(143,253,255,0.12)",
                  border: "1px solid rgba(143,253,255,0.35)",
                  "&:hover": { bgcolor: "rgba(143,253,255,0.2)" },
                }),
                "&:hover": {
                  bgcolor: "rgba(143,253,255,0.08)",
                  color: "#ffffff",
                },
                "&.Mui-selected": {
                  bgcolor: "rgba(90,159,159,0.28)",
                  color: "#ffffff",
                  "& .MuiListItemIcon-root": { color: BRAND.cyan },
                },
                "&.Mui-selected:hover": {
                  bgcolor: "rgba(90,159,159,0.36)",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 32,
                  color: isSelected ? BRAND.cyan : "#b9bec8",
                  "& svg": { fontSize: 20 },
                }}
              >
                {it.icon}
              </ListItemIcon>
              <ListItemText
                primary={it.label}
                slotProps={{
                  primary: {
                    sx: {
                      fontSize: 13.5,
                      fontWeight: isSelected ? 700 : 500,
                      lineHeight: 1.2,
                      letterSpacing: 0.2,
                    },
                  },
                }}
              />
              {it.highlighted && (
                <Chip
                  label="Start"
                  size="small"
                  sx={{
                    ml: 0.5,
                    height: 20,
                    bgcolor: BRAND.cyan,
                    color: BRAND.dark,
                    fontWeight: 800,
                    fontSize: 10,
                  }}
                />
              )}
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
        <Button
          onClick={handleLogout}
          startIcon={<LogoutIcon />}
          fullWidth
          sx={{
            textTransform: "none",
            fontWeight: 600,
            justifyContent: "flex-start",
            color: BRAND.gray,
            px: 1.1,
            py: 0.75,
            borderRadius: 2,
            "&:hover": {
              bgcolor: "rgba(143,253,255,0.08)",
              color: "#ffffff",
            },
          }}
        >
          Logout
        </Button>
      </Box>
    </Box>
  );
}

export default function Sidebar({
  selected,
  onSelect,
  showWelcomeEntry = false,
  mobileOpen = false,
  onMobileClose,
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  const { auth } = useAuthContext();

  const tenantMemberRole = auth?.tenantMember?.role;
  const tenantMemberIsActive = auth?.tenantMember?.isActive;
  const isPrivileged =
    tenantMemberIsActive === true &&
    (String(tenantMemberRole ?? "") === "OWNER" ||
      String(tenantMemberRole ?? "") === "ADMIN");

  // Items render top-to-bottom in the sidebar. The list is split into
  // two functional groups separated by a divider:
  //
  //   1. Operational pages — what an operator monitors day-to-day
  //      (fleet state, posture, jobs, alerts).
  //   2. Administration pages — surfaces a privileged user touches
  //      occasionally (enrolling new devices, managing certificates,
  //      tenant settings). Pushing them below the divider keeps the
  //      ops-focused list short and signals that they're configuration
  //      surfaces, not daily-driver pages.
  //
  // Items use a tagged-union shape: regular nav items have
  // `{label, key, icon, highlighted?}`; the separator is
  // `{type: "divider"}`. The render loop in <SidebarContent /> picks
  // the right component per type. We place the divider only when the
  // admin group has at least one entry (i.e. when the user is
  // privileged) so non-privileged users don't see a trailing line
  // with nothing under it.
  const items = [
    ...(showWelcomeEntry
      ? [{ label: "Welcome", key: "welcome", icon: <RocketLaunchOutlinedIcon />, highlighted: true }]
      : []),
    { label: "Overview", key: "overview", icon: <DashboardOutlinedIcon /> },
    { label: "Asset Management", key: "assets", icon: <ComputerOutlinedIcon /> },
    { label: "Security Compliance", key: "ad", icon: <GppGoodOutlinedIcon /> },
    { label: "Patch Management", key: "patch", icon: <SystemUpdateAltOutlinedIcon /> },
    { label: "Remote Control", key: "remote-control", icon: <DesktopWindowsOutlinedIcon /> },
    ...(isPrivileged
      ? [{ label: "Jobs", key: "jobs", icon: <AssignmentOutlinedIcon /> }]
      : []),
    ...(isPrivileged
      ? [{ label: "Policies", key: "policies", icon: <PolicyOutlinedIcon /> }]
      : []),
    ...(isPrivileged
      ? [{ label: "Audit", key: "audit", icon: <FactCheckOutlinedIcon /> }]
      : []),
    { label: "Alerts", key: "alerts", icon: <NotificationsOutlinedIcon /> },

    // ── Administration group ───────────────────────────────
    ...(isPrivileged
      ? [
          { type: "divider", key: "divider-admin", label: "Administration" },
          { label: "Device Enrollment", key: "enrollment", icon: <InstallDesktopOutlinedIcon /> },
          { label: "PKI", key: "pki", icon: <VpnKeyOutlinedIcon /> },
          // Plugin Control — tenant-wide enable/disable for plugins.
          // Inserted between PKI and Settings as agreed; visually
          // groups with the other admin surfaces.
          { label: "Plugin Control", key: "plugin-control", icon: <ExtensionOutlinedIcon /> },
          { label: "Settings", key: "configurations", icon: <SettingsOutlinedIcon /> },
        ]
      : []),
  ];

  const handleLogout = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/logout`, {
        method: "POST",
        credentials: "include",
      });

      let logoutUrl = "https://api.sso.safecertus.com/logout";

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.logoutUrl) {
          logoutUrl = data.logoutUrl;
        }
      }

      window.location.href = logoutUrl;
    } catch (e) {
      console.error("Logout failed", e);

      window.location.href = "https://api.sso.safecertus.com/logout";
    }
  };

  if (isDesktop) {
    // Permanent sidebar for md+ viewports (≥ 900px). Includes iPad landscape.
    return (
      <Box sx={{ flexShrink: 0 }}>
        <SidebarContent
          items={items}
          selected={selected}
          onSelect={onSelect}
          handleLogout={handleLogout}
        />
      </Box>
    );
  }

  // Temporary drawer for xs/sm (< 900px). Includes phones and iPad portrait.
  return (
    <Drawer
      variant="temporary"
      open={mobileOpen}
      onClose={onMobileClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        "& .MuiDrawer-paper": {
          width: SIDEBAR_WIDTH,
          bgcolor: BRAND.dark,
          border: "none",
        },
      }}
    >
      <SidebarContent
        items={items}
        selected={selected}
        onSelect={onSelect}
        handleLogout={handleLogout}
      />
    </Drawer>
  );
}
