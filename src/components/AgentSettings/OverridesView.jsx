// src/components/AgentSettings/OverridesView.jsx
//
// Every device running a policy of its own, as a first-class list. Today
// the only way to know a device had an override was to select it from a
// 25-entry dropdown and look for a chip. The rows come from the tenant's
// policy-status (desired_policy_source === "device"), which is what the
// dispatcher actually uses — not from the override table, which the
// status may lag by one heartbeat.

import * as React from "react";
import { Alert, Box, Button, Tooltip, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { BRAND, DATAGRID_SX, TEXT } from "../../theme/brand";
import OnlineDot from "../common/OnlineDot";
import { formatDate } from "../../utils/format";
import { formatRelativeTime, renderAckChip } from "../Policies/policyDisplay";
import { overrideRows } from "./overrides";

export default function OverridesView({ statusRows, deviceMap, loading = false, onEdit, onPushAll, pushing = false }) {
  const rows = React.useMemo(() => overrideRows(statusRows), [statusRows]);

  const columns = React.useMemo(
    () => [
      {
        field: "device_id",
        headerName: "Device",
        minWidth: 200,
        flex: 1,
        valueGetter: (_v, row) => deviceMap?.get(row.device_id)?.hostname || row.device_id,
      },
      {
        field: "is_connected",
        headerName: "Online",
        minWidth: 75,
        flex: 0.25,
        renderCell: (params) => {
          const online = params.row?.is_connected === true;
          const seen = params.row?.last_heartbeat;
          const title = online ? "Online" : seen ? `Offline · last seen ${formatRelativeTime(seen)}` : "Offline · never seen";
          return <OnlineDot online={online} title={title} />;
        },
      },
      {
        field: "desired_policy_version",
        headerName: "Override version",
        minWidth: 200,
        flex: 0.7,
        valueGetter: (_v, row) => row.desired_policy_version || "—",
      },
      {
        field: "last_ack_status",
        headerName: "ACK",
        minWidth: 130,
        flex: 0.5,
        renderCell: (params) => renderAckChip(params.row.last_ack_status, null),
      },
      {
        field: "last_ack_at",
        headerName: "ACK at",
        minWidth: 140,
        flex: 0.5,
        renderCell: (params) =>
          params.value ? (
            <Tooltip title={formatDate(params.value)} arrow>
              <Typography variant="caption">{formatRelativeTime(params.value)}</Typography>
            </Tooltip>
          ) : (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>Never</Typography>
          ),
      },
      {
        field: "actions",
        headerName: "",
        sortable: false,
        minWidth: 90,
        renderCell: (params) => (
          <Button size="small" onClick={() => onEdit?.(params.row.device_id)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
            Edit
          </Button>
        ),
      },
    ],
    [deviceMap, onEdit]
  );

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>Overrides</Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
            {rows.length === 0
              ? "No device runs a policy of its own. Every device follows the tenant policy."
              : `${rows.length} device${rows.length === 1 ? "" : "s"} run${rows.length === 1 ? "s" : ""} a policy of its own.`}
          </Typography>
        </Box>
        {rows.length > 0 && onPushAll ? (
          <Button size="small" variant="outlined" color="error" disabled={pushing} onClick={onPushAll} sx={{ textTransform: "none", fontWeight: 700 }}>
            Reset all to tenant policy…
          </Button>
        ) : null}
      </Box>

      {rows.length > 0 ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          An override is a complete policy: the device stops following the tenant policy entirely until the override is removed. A tenant push resets every override.
        </Alert>
      ) : null}

      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <DataGrid
          autoHeight
          disableRowSelectionOnClick
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.device_id}
          onRowClick={(params) => onEdit?.(params.row.device_id)}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
          sx={DATAGRID_SX}
          localeText={{ noRowsLabel: "No overrides" }}
        />
      </Box>
    </Box>
  );
}
