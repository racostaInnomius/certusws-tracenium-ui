import * as React from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  Button,
  Chip,
} from "@mui/material";
import { useAuthContext } from "../auth/AuthContext";
import LogoutIcon from "@mui/icons-material/Logout";

export default function Sidebar({ global_role, selected, onSelect, showWelcomeEntry = false }) {
  const { auth, loading } = useAuthContext();

  const tenantMemberRole = auth?.tenantMember?.role;
  const tenantMemberIsActive = auth?.tenantMember?.isActive;

  const items = [
    ...(showWelcomeEntry
      ? [{ label: "Welcome", key: "welcome", highlighted: true }]
      : []),
    { label: "Overview", key: "overview" },
    { label: "Asset Management", key: "assets" },
    { label: "Security Compliance", key: "ad" },
    { label: "Software Delivery", key: "o365" },
    { label: "Patch Management", key: "remote" },
    { label: "Remote Control", key: "security" },
    { label: "Alerts", key: "alerts" },
    { label: "Reports", key: "reports" },
    ...(tenantMemberIsActive === true &&
    (String(tenantMemberRole ?? "") === "OWNER" ||
      String(tenantMemberRole ?? "") === "ADMIN")
      ? [{ label: "Settings", key: "configurations" }]
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

  return (
    <Box
      sx={{
        width: 170,
        bgcolor: "#111318",
        color: "white",
        p: 2,
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        Tracenium
      </Typography>

      <Typography variant="body2" sx={{ opacity: 0.7, mb: 2 }}>
        Business Dashboard
      </Typography>

      <List sx={{ flex: 1 }}>
        {items.map((it) => (
          <ListItemButton
            key={it.key}
            selected={selected === it.key}
            onClick={() => onSelect?.(it.key)}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              ...(it.highlighted && {
                bgcolor: "rgba(27,166,166,0.18)",
                border: "1px solid rgba(27,166,166,0.35)",
                boxShadow:
                  "0 0 0 1px rgba(27,166,166,0.08), 0 8px 18px rgba(27,166,166,0.10)",
                "&:hover": {
                  bgcolor: "rgba(27,166,166,0.24)",
                },
              }),
              "&.Mui-selected": {
                bgcolor: "rgba(0, 200, 200, 0.25)",
              },
              "&.Mui-selected:hover": {
                bgcolor: "rgba(0, 200, 200, 0.32)",
              },
            }}
          >
          <ListItemText
            primary={it.label}
            slotProps={{
              primary: {
                sx: {
                  fontWeight: it.highlighted ? 800 : 500,
                  color: it.highlighted ? "#0f6b72" : "inherit",
                },
              },
            }}
          />
            {it.highlighted && (
              <Chip
                label="Start"
                size="small"
                sx={{
                  ml: 1,
                  height: 22,
                  bgcolor: "white",
                  color: "#0f6b72",
                  fontWeight: 800,
                  fontSize: 11,
                }}
              />
            )}
          </ListItemButton>
        ))}
      </List>

      <Button
        color="inherit"
        startIcon={<LogoutIcon />}
        onClick={handleLogout}
        sx={{
          textTransform: "none",
          fontWeight: 600,
          justifyContent: "flex-start",
        }}
      >
        Logout
      </Button>
    </Box>
  );
}