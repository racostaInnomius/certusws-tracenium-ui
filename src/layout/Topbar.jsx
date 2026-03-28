import * as React from "react";
import { Box, Typography } from "@mui/material";

export default function Topbar() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "2-digit"
  });

  return (
    <Box
      sx={{
        width: "100%",
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
          Endpoint Intelligence & Compliance Platform
        </Typography>

        <Typography variant="caption" sx={{ color: "#667085" }}>
          {today}
        </Typography>
      </Box>
    </Box>
  );
}