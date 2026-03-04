import * as React from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

export default function HostsTable({
  rows = [],
  selectedAgentId = null,
  onSelectAgentId,
}) {
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
    {rows.length === 0 && (
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Hostname</Typography>
    )}
      <TableContainer sx={{ flex: 1, minHeight: 0 }}>
        <Table stickyHeader size="small" aria-label="hosts table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Hostname</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Last Logon User</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Local IP</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((r) => {
              const isSelected = r.agent_id === selectedAgentId;

              return (
                <TableRow
                  key={r.agent_id}
                  hover
                  selected={isSelected}
                  onClick={() => onSelectAgentId?.(r.agent_id)}
                  sx={{
                    cursor: "pointer",
                    "&.Mui-selected": {
                      backgroundColor: "rgba(0,0,0,0.08)",
                    },
                    "&.Mui-selected:hover": {
                      backgroundColor: "rgba(0,0,0,0.12)",
                    },
                  }}
                >
                  <TableCell>{r.hostname ?? r.agent_id}</TableCell>
                  <TableCell>{r.last_logon_user ?? "—"}</TableCell>
                  <TableCell>{r.local_ip ?? "—"}</TableCell>
                </TableRow>
              );
            })}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} sx={{ color: "text.secondary" }}>
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