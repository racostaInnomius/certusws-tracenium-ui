// src/components/RemoteControl/ConnectablesTable.jsx
//
// Device selector for the Remote Control page.
//
// Per-capability action buttons (M3.S1):
//   - Shell  (ElectricalServicesIcon): enabled when device advertises rcp.shell
//   - Files  (FolderIcon):             enabled when device advertises rcp.file
//   - Screen (DesktopWindowsIcon):     enabled when device advertises rcp.screen
//
// The `capabilities` array on each device drives which buttons are
// active. When no rcp.* capability is advertised, all three are disabled
// with an explanatory tooltip.

import * as React from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import ElectricalServicesOutlinedIcon from "@mui/icons-material/ElectricalServicesOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

function StatusChip({ online }) {
  return (
    <Chip
      size="small"
      label={online ? "Online" : "Offline"}
      sx={{
        height: 20,
        fontWeight: 700,
        fontSize: TEXT.xs,
        bgcolor: online ? ROLE.positiveSoft : BRAND.surfaceMuted,
        color: online ? ROLE.positive : BRAND.gray,
        border: `1px solid ${online ? ROLE.positive : BRAND.gray}33`
      }}
    />
  );
}

function RcpBadge({ enabled }) {
  return (
    <Chip
      size="small"
      label={enabled ? "rcp ready" : "rcp not available"}
      sx={{
        height: 20,
        fontWeight: 700,
        fontSize: TEXT.xs,
        bgcolor: enabled ? ROLE.positiveSoft : ROLE.cautionSoft,
        color: enabled ? ROLE.positive : ROLE.caution,
        border: `1px solid ${enabled ? ROLE.positive : ROLE.caution}33`
      }}
    />
  );
}

// onConnect(device, type) where type is "shell" | "file" | "screen"
export default function ConnectablesTable({ devices, loading, onConnect }) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) => {
      const hay = `${d.hostname || ""} ${d.deviceId} ${d.platform || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [devices, search]);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5, gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            Start a session
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Pick a device. Connect is enabled once `rcp` is reported by the agent.
          </Typography>
        </Box>
        {loading ? <CircularProgress size={16} sx={{ color: BRAND.teal }} /> : null}
      </Stack>

      <TextField
        size="small"
        placeholder="Search host, deviceId, platform…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray, mr: 1 }} />
        }}
        sx={{ mb: 1.5 }}
      />

      <TableContainer sx={{ flex: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Host</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Platform</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Agent</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Plugin</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ color: BRAND.gray, py: 3 }}>
                  {devices.length === 0
                    ? "No enrolled devices to display."
                    : "No devices match the search."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => {
                const caps = Array.isArray(d.capabilities) ? d.capabilities : [];
                const hasShell  = caps.includes("rcp.shell");
                const hasFile   = caps.includes("rcp.file");
                const hasScreen = caps.includes("rcp.screen");
                const isOnline  = d.online;

                const canShell  = isOnline && hasShell;
                const canFile   = isOnline && hasFile;
                const canScreen = isOnline && hasScreen;

                const shellTooltip = !isOnline
                  ? "Device is offline."
                  : !hasShell
                  ? "Agent does not advertise rcp.shell. Deploy the rcp plugin with remoteShell enabled."
                  : "Open a shell session.";
                const fileTooltip = !isOnline
                  ? "Device is offline."
                  : !hasFile
                  ? "Agent does not advertise rcp.file. Deploy the rcp plugin with remoteFile enabled."
                  : "Open a file manager session.";
                const screenTooltip = !isOnline
                  ? "Device is offline."
                  : !hasScreen
                  ? "Agent does not advertise rcp.screen. Deploy the rcp plugin with remoteScreen enabled."
                  : "Start a screen share session.";

                return (
                  <TableRow key={d.deviceId} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
                        {d.hostname || d.deviceId}
                      </Typography>
                      {d.hostname ? (
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          {d.deviceId}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell sx={{ textTransform: "capitalize" }}>
                      {d.platform || "—"}
                    </TableCell>
                    <TableCell>{d.agentVersion || "—"}</TableCell>
                    <TableCell>
                      <StatusChip online={d.online} />
                    </TableCell>
                    <TableCell>
                      <RcpBadge enabled={d.rcpEnabled} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {/* Shell button */}
                        <Tooltip title={shellTooltip} arrow>
                          <span>
                            <IconButton
                              aria-label="Start shell session"
                              size="small"
                              disabled={!canShell}
                              onClick={() => onConnect?.(d, "shell")}
                              sx={{
                                color: canShell ? BRAND.teal : BRAND.gray,
                                border: `1px solid ${canShell ? BRAND.teal : BRAND.border}`,
                                borderRadius: 1
                              }}
                            >
                              <ElectricalServicesOutlinedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        {/* File manager button (M2.S1) */}
                        <Tooltip title={fileTooltip} arrow>
                          <span>
                            <IconButton
                              aria-label="Open file browser"
                              size="small"
                              disabled={!canFile}
                              onClick={() => onConnect?.(d, "file")}
                              sx={{
                                color: canFile ? BRAND.teal : BRAND.gray,
                                border: `1px solid ${canFile ? BRAND.teal : BRAND.border}`,
                                borderRadius: 1
                              }}
                            >
                              <FolderOutlinedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>

                        {/* Screen share button (M3.S1) */}
                        <Tooltip title={screenTooltip} arrow>
                          <span>
                            <IconButton
                              aria-label="Start screen share"
                              size="small"
                              disabled={!canScreen}
                              onClick={() => onConnect?.(d, "screen")}
                              sx={{
                                color: canScreen ? BRAND.teal : BRAND.gray,
                                border: `1px solid ${canScreen ? BRAND.teal : BRAND.border}`,
                                borderRadius: 1
                              }}
                            >
                              <DesktopWindowsOutlinedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
