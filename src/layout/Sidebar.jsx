import * as React from "react";
import { Box, List, ListItemButton, ListItemText, Typography, Button } from "@mui/material";
import { useAuthContext } from "../auth/AuthContext";
import LogoutIcon from "@mui/icons-material/Logout";

export default function Sidebar({ global_role, selected, onSelect }) {
  const { auth, loading } = useAuthContext();

  const tenantMemberRole = auth?.tenantMember?.role;
  const tenantMemberIsActive = auth?.tenantMember?.isActive;
  const items = [
    { label: "Welcome", key: "welcome" },
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
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE}/api/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );

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

      // fallback
      window.location.href = "https://api.sso.safecertus.com/logout";
    }
  };

  return (
    <Box sx={{ width: 170, bgcolor: "#111318", color: "white", p: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        Tracenium
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.7, mb: 2 }}>
        Business Dashboard
      </Typography>

      <List>
        {items.map((it) => (
          <ListItemButton
            key={it.key}
            selected={selected === it.key}
            onClick={() => onSelect?.(it.key)}
            sx={{
              borderRadius: 2,
              "&.Mui-selected": { bgcolor: "rgba(0, 200, 200, 0.25)" }
            }}
          >
            <ListItemText primary={it.label} />
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
        }}
      >
        Logout
      </Button>

    </Box>
  );
}