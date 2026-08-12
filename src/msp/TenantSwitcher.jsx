// src/msp/TenantSwitcher.jsx
//
// Fast client switching (F1) — the fix for the #1 pain. Two entry points
// into the SAME searchable list:
//   * a topbar dropdown showing the current client (click → searchable menu)
//   * a global Cmd/Ctrl+K command palette (keyboard-first, scales to many
//     clients)
//
// The list is the sibling clients of the active client (MspContext
// switchableClients) plus a "Back to portfolio" escape hatch. Selecting a
// client calls enterTenant → the http layer swaps X-Tenant-Id and the
// shell re-renders against the new client.

import * as React from "react";
import {
  Box,
  Button,
  Dialog,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import UnfoldMoreOutlinedIcon from "@mui/icons-material/UnfoldMoreOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import { BRAND } from "../theme/brand";
import { useMsp } from "./MspContext";

export default function TenantSwitcher() {
  const { activeTenant, switchableClients, enterTenant, exitTenant, hasPortfolio } = useMsp();

  const [anchorEl, setAnchorEl] = React.useState(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  // Cmd/Ctrl+K → open the palette. Registered app-wide while mounted.
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Nothing to switch between if the user isn't an MSP operator / vendor.
  if (!hasPortfolio && !activeTenant) return null;

  const clients = switchableClients || [];
  const filtered = query.trim()
    ? clients.filter((c) => (c.name || `tenant ${c.id}`).toLowerCase().includes(query.trim().toLowerCase()))
    : clients;

  const currentName = activeTenant?.name || (activeTenant ? `Tenant ${activeTenant.id}` : "Select client");

  const pick = (c) => {
    enterTenant(c.id, c.name, clients);
    setAnchorEl(null);
    setPaletteOpen(false);
    setQuery("");
  };

  const goPortfolio = () => {
    exitTenant();
    setAnchorEl(null);
    setPaletteOpen(false);
  };

  return (
    <>
      {/* Topbar dropdown trigger */}
      <Button
        onClick={(e) => setAnchorEl(e.currentTarget)}
        endIcon={<UnfoldMoreOutlinedIcon />}
        sx={{
          textTransform: "none",
          color: BRAND.dark,
          fontWeight: 700,
          borderRadius: 1.5,
          px: 1.5,
          bgcolor: BRAND.tealSoft,
          "&:hover": { bgcolor: BRAND.tealSoftStrong },
          maxWidth: 240,
        }}
      >
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentName}
        </Box>
      </Button>

      {/* Dropdown menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{ paper: { sx: { minWidth: 280, maxHeight: 420 } } }}
      >
        <Box sx={{ px: 1.5, py: 1 }}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="Search clients…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        {filtered.map((c) => (
          <MenuItem key={c.id} onClick={() => pick(c)} selected={String(c.id) === String(activeTenant?.id)}>
            {String(c.id) === String(activeTenant?.id) ? (
              <CheckOutlinedIcon fontSize="small" sx={{ mr: 1, color: BRAND.tealText }} />
            ) : (
              <Box sx={{ width: 24 }} />
            )}
            <ListItemText primary={c.name || `Tenant ${c.id}`} />
          </MenuItem>
        ))}
        {filtered.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" sx={{ color: BRAND.gray }}>No matches</Typography>
          </MenuItem>
        ) : null}
        <MenuItem onClick={goPortfolio} sx={{ mt: 0.5, borderTop: `1px solid ${BRAND.border}` }}>
          <GridViewOutlinedIcon fontSize="small" sx={{ mr: 1, color: BRAND.gray }} />
          <ListItemText primary="Back to portfolio" />
        </MenuItem>
      </Menu>

      {/* Cmd+K palette */}
      <Dialog
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        slotProps={{ paper: { sx: { position: "fixed", top: 80, m: 0, width: 520, maxWidth: "92vw", borderRadius: 2 } } }}
      >
        <Box sx={{ p: 1.5 }}>
          <TextField
            fullWidth
            autoFocus
            placeholder="Jump to client…  (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon sx={{ color: BRAND.gray }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <List sx={{ maxHeight: 360, overflow: "auto", pt: 0 }}>
          {filtered.map((c) => (
            <ListItemButton key={c.id} onClick={() => pick(c)}>
              {String(c.id) === String(activeTenant?.id) ? (
                <CheckOutlinedIcon fontSize="small" sx={{ mr: 1, color: BRAND.tealText }} />
              ) : (
                <Box sx={{ width: 24 }} />
              )}
              <ListItemText primary={c.name || `Tenant ${c.id}`} secondary={`#${c.id}`} />
            </ListItemButton>
          ))}
          {filtered.length === 0 ? (
            <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
              <Typography variant="body2" sx={{ color: BRAND.gray }}>No matching clients</Typography>
            </Box>
          ) : null}
          <ListItemButton onClick={goPortfolio} sx={{ borderTop: `1px solid ${BRAND.border}` }}>
            <GridViewOutlinedIcon fontSize="small" sx={{ mr: 1, color: BRAND.gray }} />
            <ListItemText primary="Back to portfolio" />
          </ListItemButton>
        </List>
      </Dialog>
    </>
  );
}
