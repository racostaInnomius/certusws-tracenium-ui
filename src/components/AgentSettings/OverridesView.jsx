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
//
// Phase C: overrides applied through a batch ("12 devices via group SQL
// Servers") are listed by provenance first, with revoke; devices whose
// override was set by hand follow.

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

function BatchCard({ batch, onRevoke, revoking }) {
  const target = batch.group_name ? `via group ${batch.group_name}` : "via a device list";
  const live = Number(batch.live_device_count ?? 0);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", p: 1.25, border: `1px solid ${BRAND.border}`, borderRadius: 2, bgcolor: BRAND.surfaceMuted }} data-testid="override-batch">
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: BRAND.dark }}>
          {live} device{live === 1 ? "" : "s"} {target}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          {SECTION_LABEL[batch.domain] || batch.domain} · applied {formatRelativeTime(batch.applied_at)}
          {batch.applied_by ? ` by ${batch.applied_by}` : ""}
          {Number(batch.device_count) !== live ? ` · ${batch.device_count} at the time` : ""}
        </Typography>
      </Box>
      {batch.sync_membership ? (
        <Tooltip title={batch.last_sync_at ? `Follows the group's membership · last checked ${formatRelativeTime(batch.last_sync_at)}` : "Follows the group's membership"} arrow>
          <Chip size="small" label="in sync with group" sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }} />
        </Tooltip>
      ) : null}
      <Button size="small" variant="outlined" color="error" disabled={revoking} onClick={() => onRevoke?.(batch)} sx={{ textTransform: "none", fontWeight: 700 }}>
        {revoking ? "Revoking…" : "Revoke"}
      </Button>
    </Box>
  );
}

export default function OverridesView({
  rows,
  batches,
  deviceMap,
  loading = false,
  onEdit,
  onResetAll,
  resetting = false,
  onApply,
  onRevokeBatch,
  revokingId = null,
}) {
  const list = Array.isArray(rows) ? rows : [];
  const batchList = React.useMemo(() => (Array.isArray(batches) ? batches : []), [batches]);
  const batchById = React.useMemo(() => new Map(batchList.map((b) => [b.id, b])), [batchList]);

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
            {(params.value || []).map((p) => {
              const prov = params.row?.provenance?.[sectionForPath(p)];
              const batch = prov ? batchById.get(prov.batchId) : null;
              const via = prov ? ` · via ${batch?.group_name ? `group ${batch.group_name}` : "batch"}` : "";
              return (
                <Tooltip key={p} title={`${pathLabel(p)}${via}`} arrow>
                  <Chip
                    size="small"
                    label={prov ? `${p} ↗` : p}
                    sx={{ bgcolor: prov ? BRAND.tealSoft : BRAND.cyanSoft, color: BRAND.dark, fontWeight: 700, fontFamily: "monospace" }}
                  />
                </Tooltip>
              );
            })}
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
    [deviceMap, onEdit, batchById]
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
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {onApply ? (
            <Button size="small" variant="contained" onClick={onApply} sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
              Apply to devices…
            </Button>
          ) : null}
          {list.length > 0 && onResetAll ? (
            <Button size="small" variant="outlined" color="error" disabled={resetting} onClick={onResetAll} sx={{ textTransform: "none", fontWeight: 700 }}>
              {resetting ? "Resetting…" : "Reset all to tenant policy…"}
            </Button>
          ) : null}
        </Box>
      </Box>

      {batchList.length > 0 ? (
        <Box sx={{ display: "grid", gap: 1, mb: 2 }}>
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: BRAND.dark }}>Applied in batches</Typography>
          {batchList.map((b) => (
            <BatchCard key={b.id} batch={b} onRevoke={onRevokeBatch} revoking={revokingId === b.id} />
          ))}
        </Box>
      ) : null}

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
