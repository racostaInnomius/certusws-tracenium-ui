import * as React from "react";
import { Box, Typography, Button } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";

export default function Topbar() {

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

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "2-digit"
  });

  return (
    <Box
      sx={{
        px: 2,
        py: 0.5,
        bgcolor: "#c6c8cdff",
        borderBottom: "1px solid #9fa4b1ff",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          IT Management
        </Typography>

        <Typography variant="caption" sx={{ color: "#667085" }}>
          {today}
        </Typography>
      </Box>
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