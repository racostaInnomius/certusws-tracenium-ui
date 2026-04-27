// src/components/RemoteControl/ConnectablesTable.jsx
//
// Device selector for the Remote Control page. Today every device
// shows up disabled because no agent reports `rcp`. When the plugin
// ships, the Connect buttons flip to enabled based on per-device
// `rcpEnabled` — zero UI changes needed.

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
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { BRAND, ROLE } from "../../theme/brand";

function StatusChip({ online }) {
  return (
    <Chip
      size="small"
      label={online ? "Online" : "Offline"}
      sx={{
        height: 20,
        fontWeight: 700,
        fontSize: 11,
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
        fontSize: 11,
        bgcolor: enabled ? ROLE.positiveSoft : ROLE.cautionSoft,
        color: enabled ? ROLE.positive : ROLE.caution,
        border: `1px solid ${enabled ? ROLE.positive : ROLE.caution}33`
      }}
    />
  );
}

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
              <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
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
                const canConnect = d.online && d.rcpEnabled;
                const tooltip = !d.rcpEnabled
                  ? "Remote Control plugin (`rcp`) is not reported by this agent yet."
                  : !d.online
                  ? "Device is offline. Connect is only possible while the device is online."
                  : "Start a new remote session.";
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
                      <Tooltip title={tooltip} arrow>
                        {/* span wrapper so the tooltip still shows when
                            the button is disabled (MUI's a11y quirk) */}
                        <span>
                          <IconButton
                            size="small"
                            disabled={!canConnect}
                            onClick={() => onConnect?.(d)}
                            sx={{
                              color: BRAND.teal,
                              border: `1px solid ${canConnect ? BRAND.teal : BRAND.border}`,
                              borderRadius: 1
                            }}
                          >
                            <ElectricalServicesOutlinedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
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
