import * as React from "react";
import { Box, IconButton, Typography, Badge } from "@mui/material";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";

const BRAND = {
  dark: "#3B404D",
  teal: "#5A9F9F",
  cyan: "#8FFDFF",
};

export const TOPBAR_HEIGHT = 56;

export default function Topbar({ onMenuClick }) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  return (
    <Box
      sx={{
        width: "100%",
        height: TOPBAR_HEIGHT,
        px: { xs: 1.5, sm: 2, md: 3 },
        gap: 1,
        background: `linear-gradient(90deg, ${BRAND.dark} 0%, ${BRAND.teal} 100%)`,
        borderBottom: `1px solid ${BRAND.cyan}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        color: "#ffffff",
      }}
    >
      {/* Left cluster: hamburger (mobile only) + brand + subtitle.
          flex:1 + minWidth:0 lets the title ellipsize instead of pushing
          the right cluster (date + notifications) out of view. */}
      <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, flex: 1 }}>
        <IconButton
          onClick={onMenuClick}
          aria-label="Open navigation"
          size="small"
          sx={{
            color: "#ffffff",
            mr: 0.5,
            flexShrink: 0,
            display: { xs: "inline-flex", md: "none" },
            "&:hover": { bgcolor: "rgba(143,253,255,0.18)" },
          }}
        >
          <MenuOutlinedIcon />
        </IconButton>

        <Typography
          sx={{
            fontSize: { xs: 12, sm: 13 },
            fontWeight: 400,
            letterSpacing: 0.3,
            color: "#ffffff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
            flex: 1,
          }}
        >
          <Box
            component="span"
            sx={{
              fontFamily: 'Calibri, Carlito, "Segoe UI", sans-serif',
              fontWeight: 900,
              letterSpacing: 0.4,
              fontSize: { xs: 16, sm: 18 },
            }}
          >
            Tracenium
          </Box>
          {/* Subtitle with separator hidden on xs to prevent overflow on phones. */}
          <Box
            component="span"
            sx={{ display: { xs: "none", sm: "inline" } }}
          >
            <Box
              component="span"
              sx={{ color: BRAND.cyan, fontWeight: 900, mx: 1 }}
            >
              |
            </Box>
            Endpoint Intelligence{" "}
            <Box component="span" sx={{ color: BRAND.cyan, px: 0.25 }}>
              &
            </Box>{" "}
            Compliance Platform
          </Box>
        </Typography>
      </Box>

      {/* Right cluster: flexShrink:0 guarantees the notification icon
          is always visible; the date hides on small widths. */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 }}>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: "#ffffff",
            whiteSpace: "nowrap",
            display: { xs: "none", md: "block" },
          }}
        >
          {today}
        </Typography>
        <IconButton
          size="small"
          aria-label="Notifications"
          sx={{
            color: "#ffffff",
            flexShrink: 0,
            "&:hover": { bgcolor: "rgba(143,253,255,0.18)" },
          }}
        >
          <Badge color="error" variant="dot" overlap="circular">
            <NotificationsNoneOutlinedIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Box>
    </Box>
  );
}
