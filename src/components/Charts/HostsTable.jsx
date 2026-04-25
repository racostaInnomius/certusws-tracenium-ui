// src/components/Charts/HostsTable.jsx
//
// Rendered inside AssetsDashboard's Row 4. Presents the raw
// `/dashboard/hosts` list with the columns an operator cares about
// at a glance:
//
//   Online dot · Hostname · Platform · Agent version · Last logon · IP
//
// The "Online" column is a 8px traffic-light dot (green when the
// device has an active gRPC session, gray otherwise). The parent
// passes a `connectedIds` Set built from
// `/api/v1/orchestrator/devices-connected` — intersection keeps
// the signal honest even if one of the two endpoints is stale.
//
// Row click used to drive a "Selected Host Detail" panel below the
// table; that panel was removed in the Asset Management redesign
// and with it the selection state. The table is read-only now.

import * as React from "react";
import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { BRAND, ROLE } from "../../theme/brand";

// Platform chip colors map to the brand family used across the app.
// A chip (vs. raw text) makes it easier to eyeball filter results —
// clicking the Overview donut and landing here, the operator scans
// the column and sees the matching color pattern instantly.
const PLATFORM_STYLE = {
  windows: { bg: BRAND.darkSoft,                fg: BRAND.dark     },
  macos:   { bg: BRAND.tealSoft,                fg: BRAND.tealText },
  linux:   { bg: "rgba(237,108,2,0.12)",        fg: "#8a4400"      },
};

function PlatformChip({ platform }) {
  const p = String(platform || "").trim().toLowerCase();
  if (!p) return <Typography variant="caption" sx={{ color: "text.secondary" }}>—</Typography>;
  const style = PLATFORM_STYLE[p] || { bg: BRAND.surfaceMuted, fg: BRAND.dark };
  return (
    <Chip
      size="small"
      label={p}
      sx={{
        height: 20,
        fontWeight: 700,
        fontSize: 11,
        textTransform: "capitalize",
        bgcolor: style.bg,
        color: style.fg,
        border: `1px solid ${style.fg}33`,
      }}
    />
  );
}

// Traffic-light indicator: filled green circle when online, open
// gray ring when offline. Glow on the online variant makes the eye
// catch the "is this device actually reachable" question at a
// glance in a crowded table.
function OnlineDot({ online }) {
  return (
    <Tooltip title={online ? "Online — active session" : "Offline"} arrow>
      <Box
        aria-label={online ? "Online" : "Offline"}
        sx={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: online ? ROLE.positive : "transparent",
          border: `1.5px solid ${online ? ROLE.positive : BRAND.gray}`,
          boxShadow: online ? `0 0 0 3px ${ROLE.positiveSoft}` : "none",
          display: "inline-block",
        }}
      />
    </Tooltip>
  );
}

export default function HostsTable({ rows = [], connectedIds = new Set() }) {
  return (
    <Box sx={{ width: "100%" }}>
      <TableContainer sx={{ maxHeight: 520 }}>
        <Table stickyHeader size="small" aria-label="hosts table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Online</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Hostname</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Platform</TableCell>
              {/* Added so the Overview's "Agent versions" deep-link
                  (?page=assets&versionBucket=...) is actionable — the
                  operator lands on the filtered list and can identify
                  each stale device by its reported version at a glance. */}
              <TableCell sx={{ fontWeight: 700 }}>Agent version</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Last logon user</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Local IP</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((r) => {
              const online = connectedIds?.has?.(String(r.agent_id)) === true;
              return (
                <TableRow
                  key={r.agent_id}
                  hover
                  sx={{
                    "&:hover": { backgroundColor: BRAND.rowHover },
                    "& > td": { borderBottom: `1px solid ${BRAND.border}` },
                  }}
                >
                  <TableCell>
                    <OnlineDot online={online} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: BRAND.dark }}>
                    {r.hostname ?? r.agent_id}
                  </TableCell>
                  <TableCell>
                    <PlatformChip platform={r.os_platform} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {r.agent_version ?? "—"}
                  </TableCell>
                  <TableCell>{r.last_logon_user ?? "—"}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {r.local_ip ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ color: "text.secondary" }}>
                  No hosts found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
