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
    <Box sx={{ px: 2, py: 0.5, bgcolor: "white", borderBottom: "1px solid #e6e8ee" }}>
      <Typography variant="subtitle1" color="#dcdfdfff" sx={{ fontWeight: 700 }}>
        IT Management 
      </Typography>
      <Typography variant="caption" sx={{ color: "#667085" }}>
        {today}
      </Typography>
    </Box>
  );
}