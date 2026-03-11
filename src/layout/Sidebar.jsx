import * as React from "react";
import { Box, List, ListItemButton, ListItemText, Typography } from "@mui/material";

export default function Sidebar({ tenantId, selected, onSelect }) {
  const items = [
    { label: "Overview", key: "overview" },
    { label: "Assets", key: "assets" },
    { label: "Active Directory", key: "ad" },
    { label: "Office 365", key: "o365" },
    { label: "Remote Access", key: "remote" },
    { label: "Security", key: "security" },
    ...(String(tenantId ?? "") === "2"
      ? [{ key: "configurations", label: "Configurations" }]
      : []),
  ];

  return (
    <Box sx={{ width: 190, bgcolor: "#111318", color: "white", p: 2 }}>
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
    </Box>
  );
}