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
      ? [{ label: "PKI", key: "pki", icon: <VpnKeyOutlinedIcon /> }]
      : []),
    ...(isPrivileged
      ? [{ label: "Audit", key: "audit", icon: <FactCheckOutlinedIcon /> }]
      : []),
    { label: "Alerts", key: "alerts", icon: <NotificationsOutlinedIcon /> },
    ...(isPrivileged
      ? [{ label: "Settings", key: "configurations", icon: <SettingsOutlinedIcon /> }]
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
