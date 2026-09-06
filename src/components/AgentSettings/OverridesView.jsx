// src/components/AgentSettings/OverridesView.jsx
//
// Every device running a policy patch of its own, as a first-class list.
// Rows come from GET /policy/overrides (phase B): the override table with
// the paths each patch fixes — the truth of what is stored, not the rollout
// status that follows one heartbeat behind.
//
// An override is a PATCH: the device inherits the tenant policy and changes
// only the listed paths. A tenant push no longer resets anything; the
// explicit "Reset all" here does, audited per device.

import * as React from "react";
import { Alert, Box, Button, Chip, Tooltip, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { BRAND, DATAGRID_SX, TEXT } from "../../theme/brand";
import OnlineDot from "../common/OnlineDot";
import { formatDate } from "../../utils/format";
import { formatRelativeTime, renderAckChip } from "../Policies/policyDisplay";
import { SECTIONS, sectionForPath } from "./sections";

const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label]));

/** "Crypto Discovery · cdp" for a path, so the operator reads a section, not a key. */
function pathLabel(path) {
  const section = sectionForPath(path);
  const label = SECTION_LABEL[section] || section;
  return `${label} · ${path}`;
}

export default function OverridesView({ rows, deviceMap, loading = false, onEdit, onResetAll, resetting = false }) {
  const list = Array.isArray(rows) ? rows : [];

  const columns = React.useMemo(
    () => [
      {
        field: "device_id",
        headerName: "Device",
        minWidth: 200,
        flex: 1,
        valueGetter: (_v, row) => deviceMap?.get(row.device_id)?.hostname || row.csr_common_name || row.device_id,
      },
      {
        field: "is_connected",
        headerName: "Online",
        minWidth: 75,
        flex: 0.25,
        renderCell: (params) => {
          const online = params.row?.is_connected === true;
          const seen = params.row?.last_seen_at;
          const title = online ? "Online" : seen ? `Offline · last seen ${formatRelativeTime(seen)}` : "Offline · never seen";
          return <OnlineDot online={online} title={title} />;
        },
      },
      {
        field: "overridden_paths",
        headerName: "Overrides",
        minWidth: 260,
        flex: 1.2,
        sortable: false,
        renderCell: (params) => (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", py: 0.5 }}>
            {(params.value || []).map((p) => (
              <Tooltip key={p} title={pathLabel(p)} arrow>
                <Chip size="small" label={p} sx={{ bgcolor: BRAND.cyanSoft, color: BRAND.dark, fontWeight: 700, fontFamily: "monospace" }} />
              </Tooltip>
            ))}
          </Box>
        ),
      },
      {
        field: "updated_at",
        headerName: "Updated",
        minWidth: 120,
        flex: 0.4,
        renderCell: (params) =>
          params.value ? (
            <Tooltip title={formatDate(params.value)} arrow>
              <Typography variant="caption">{formatRelativeTime(params.value)}</Typography>
            </Tooltip>
          ) : (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>—</Typography>
          ),
      },
      {
        field: "last_ack_status",
        headerName: "ACK",
        minWidth: 130,
        flex: 0.5,
        renderCell: (params) => renderAckChip(params.row.last_ack_status, null),
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
            {list.length === 0
              ? "No device runs a policy of its own. Every device follows the tenant policy."
              : `${list.length} device${list.length === 1 ? "" : "s"} run${list.length === 1 ? "s" : ""} a policy of its own.`}
          </Typography>
        </Box>
        {list.length > 0 && onResetAll ? (
          <Button size="small" variant="outlined" color="error" disabled={resetting} onClick={onResetAll} sx={{ textTransform: "none", fontWeight: 700 }}>
            {resetting ? "Resetting…" : "Reset all to tenant policy…"}
          </Button>
        ) : null}
      </Box>

      {list.length > 0 ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          An override changes only the listed settings; everything else follows the tenant policy, including future tenant changes. A tenant push keeps overrides in place.
        </Alert>
      ) : null}

      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <DataGrid
          autoHeight
          disableRowSelectionOnClick
          rows={list}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.device_id}
          getRowHeight={() => "auto"}
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
