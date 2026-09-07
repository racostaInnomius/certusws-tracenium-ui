// src/components/AgentSettings/OverridesView.jsx
//
// Every device and group with a policy of its own: which sections differ,
// how many fields, whether it is applied, who created it. The diff is the
// unit of reading — a row expands into the drawer below with only the
// leaves that differ from the tenant, tenant value struck through.
//
// An override is a PATCH: the device inherits the tenant policy and changes
// only the listed paths. A tenant push keeps overrides; "Reset all" and
// revoking a batch are the explicit, audited ways to remove them.

import * as React from "react";
import { Alert, Box, Button, Chip, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { BRAND, DATAGRID_SX, ROLE, TEXT } from "../../theme/brand";
import OnlineDot from "../common/OnlineDot";
import { formatDate } from "../../utils/format";
import { formatRelativeTime } from "../Policies/policyDisplay";
import { formatDiffValue, overrideDiff } from "./policyDiff";
import { overrideRowsOf } from "./overrides";
import { MONO_FONT } from "./fieldSpecs";

const KIND_SIGN = { added: "+", removed: "−", changed: "~", same: "=" };

function AppliedChip({ item }) {
  if (item.kind === "batch") {
    const { ok, total } = item.applied;
    const full = ok >= total;
    return <Chip size="small" label={`${ok} / ${total}`} sx={{ bgcolor: full ? ROLE.positiveSoft : ROLE.cautionSoft, color: full ? ROLE.positive : ROLE.caution, fontWeight: 700 }} />;
  }
  const a = item.applied;
  if (a.ack !== null && a.ack !== undefined && a.ack !== 0) return <Chip size="small" label="rejected" sx={{ bgcolor: ROLE.criticalSoft, color: ROLE.critical, fontWeight: 700 }} />;
  if (a.inSync) return <Chip size="small" label="applied" sx={{ bgcolor: ROLE.positiveSoft, color: ROLE.positive, fontWeight: 700 }} />;
  if (!a.connected) return <Chip size="small" label={`pending · offline${a.lastSeen ? ` ${formatRelativeTime(a.lastSeen)}` : ""}`} sx={{ bgcolor: ROLE.cautionSoft, color: ROLE.caution, fontWeight: 700 }} />;
  return <Chip size="small" label="pending" sx={{ bgcolor: ROLE.cautionSoft, color: ROLE.caution, fontWeight: 700 }} />;
}

function Drawer({ item, tenantJson, onEdit, onRemove, onRevoke, busy }) {
  const entries = React.useMemo(() => overrideDiff(tenantJson, item?.json), [tenantJson, item]);
  if (!item) return null;
  const isBatch = item.kind === "batch";
  return (
    <Box sx={{ mt: 1.5, p: 1.5, borderLeft: `3px solid ${BRAND.teal}`, bgcolor: BRAND.surfaceMuted, borderRadius: 1 }} data-testid="override-drawer">
      <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: BRAND.dark }}>
        {item.name} · difference from the tenant policy
      </Typography>
      <Box component="ul" aria-label="Override difference" sx={{ listStyle: "none", m: 0, p: 0, mt: 0.75, fontFamily: MONO_FONT, fontSize: TEXT.sm }}>
        {entries.length === 0 ? (
          <Typography component="li" sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>Identical to the tenant policy: this override pins what the tenant already has.</Typography>
        ) : (
          entries.map((e) => (
            <Box component="li" key={e.path} sx={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 1, py: 0.25, color: e.kind === "same" ? BRAND.gray : BRAND.dark }}>
              <span style={{ fontWeight: 800, color: e.kind === "added" ? ROLE.positive : e.kind === "changed" ? ROLE.caution : BRAND.gray }}>{KIND_SIGN[e.kind]}</span>
              <span style={{ wordBreak: "break-all" }}>
                <strong>{e.path}</strong>{" "}
                {e.kind === "changed" ? <s style={{ color: BRAND.gray }}>{formatDiffValue(e.before)} (tenant)</s> : null}
                {e.kind === "changed" ? " → " : " "}
                <span>{formatDiffValue(e.after)}</span>
              </span>
            </Box>
          ))
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 1 }}>
        {isBatch ? (
          <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => onRevoke?.(item.batch)} sx={{ textTransform: "none", fontWeight: 700 }}>
            {busy ? "Revoking…" : "Revoke batch"}
          </Button>
        ) : (
          <>
            <Button size="small" onClick={() => onEdit?.(item.deviceId)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
              Edit on the device →
            </Button>
            <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => onRemove?.(item.deviceId)} sx={{ textTransform: "none", fontWeight: 700 }}>
              Remove override
            </Button>
          </>
        )}
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, ml: "auto" }}>
          {isBatch
            ? `${item.applied.ok} of ${item.applied.total} devices still carry it${item.applied.sync ? " · follows the group's membership" : ""}`
            : item.row?.desired_policy_version
              ? `Effective policy ${item.row.desired_policy_version} · tenant < device`
              : "tenant < device"}
        </Typography>
      </Box>
    </Box>
  );
}

export default function OverridesView({
  rows,
  batches,
  deviceMap,
  tenantJson,
  loading = false,
  onEdit,
  onRemoveDevice,
  onResetAll,
  resetting = false,
  onApply,
  onRevokeBatch,
  revokingId = null,
}) {
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(null);

  const items = React.useMemo(() => overrideRowsOf({ rows, batches, deviceMap }), [rows, batches, deviceMap]);
  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "groups" && it.kind !== "batch") return false;
      if (filter === "devices" && it.kind !== "device") return false;
      if (!q) return true;
      return `${it.name} ${it.sections.join(" ")} ${it.deviceId || ""}`.toLowerCase().includes(q);
    });
  }, [items, filter, search]);
  const selected = visible.find((it) => it.id === selectedId) || null;

  const columns = React.useMemo(
    () => [
      {
        field: "scope",
        headerName: "Scope",
        minWidth: 90,
        flex: 0.3,
        renderCell: (params) =>
          params.value === "device" ? (
            <Chip size="small" label="Device" sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.dark, fontWeight: 700 }} />
          ) : (
            <Chip size="small" label={params.value === "group" ? "Group" : "List"} sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }} />
          ),
      },
      {
        field: "name",
        headerName: "Name",
        minWidth: 200,
        flex: 1,
        renderCell: (params) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
            {params.row.kind === "device" ? <OnlineDot online={params.row.connected} title={params.row.connected ? "Online" : "Offline"} /> : null}
            <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, color: BRAND.dark, overflow: "hidden", textOverflow: "ellipsis" }}>{params.value}</Typography>
            {params.row.kind === "batch" ? <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>({params.row.count} device{params.row.count === 1 ? "" : "s"})</Typography> : null}
          </Box>
        ),
      },
      { field: "sections", headerName: "Sections with override", minWidth: 200, flex: 1, valueGetter: (_v, row) => row.sections.join(" · ") },
      { field: "fields", headerName: "Fields", minWidth: 70, flex: 0.25, align: "right", headerAlign: "right" },
      { field: "applied", headerName: "Applied", minWidth: 150, flex: 0.5, sortable: false, renderCell: (params) => <AppliedChip item={params.row} /> },
      {
        field: "at",
        headerName: "Created by",
        minWidth: 170,
        flex: 0.6,
        renderCell: (params) => (
          <Tooltip title={params.value ? formatDate(params.value) : ""} arrow>
            <Typography sx={{ fontSize: TEXT.sm }}>{params.row.by} · {params.value ? formatRelativeTime(params.value) : "—"}</Typography>
          </Tooltip>
        ),
      },
      {
        field: "actions",
        headerName: "",
        sortable: false,
        minWidth: 150,
        renderCell: (params) => (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Button size="small" onClick={(e) => { e.stopPropagation(); setSelectedId(params.row.id); }} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
              View diff
            </Button>
            {params.row.kind === "device" ? (
              <Button size="small" onClick={(e) => { e.stopPropagation(); onEdit?.(params.row.deviceId); }} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
                Edit
              </Button>
            ) : null}
          </Box>
        ),
      },
    ],
    [onEdit]
  );

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>Overrides</Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
            {items.length === 0
              ? "No device or group runs a policy of its own. Every device follows the tenant policy."
              : `${items.length} override${items.length === 1 ? "" : "s"}: what differs from the tenant policy, and where.`}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {onApply ? (
            <Button size="small" variant="contained" onClick={onApply} sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
              New override…
            </Button>
          ) : null}
          {(Array.isArray(rows) ? rows.length : 0) > 0 && onResetAll ? (
            <Button size="small" variant="outlined" color="error" disabled={resetting} onClick={onResetAll} sx={{ textTransform: "none", fontWeight: 700 }}>
              {resetting ? "Resetting…" : "Reset all to tenant policy…"}
            </Button>
          ) : null}
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", p: 1, border: `1px solid ${BRAND.border}`, borderRadius: 2, bgcolor: BRAND.surfaceMuted, mb: 1.5 }}>
        <TextField
          size="small"
          placeholder="Search by device, group or section…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": "Search overrides" } }}
          sx={{ flex: 1, minWidth: 220, "& .MuiInputBase-root": { bgcolor: BRAND.surface } }}
        />
        <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_e, v) => { if (v) setFilter(v); }} aria-label="Override scope filter">
          <ToggleButton value="all" sx={{ textTransform: "none", px: 1.5 }}>All</ToggleButton>
          <ToggleButton value="groups" sx={{ textTransform: "none", px: 1.5 }}>Groups</ToggleButton>
          <ToggleButton value="devices" sx={{ textTransform: "none", px: 1.5 }}>Devices</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {items.length > 0 ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          An override changes only the listed settings; everything else follows the tenant policy, including future tenant changes. A tenant push keeps overrides in place.
        </Alert>
      ) : null}

      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <DataGrid
          autoHeight
          disableRowSelectionOnClick
          rows={visible}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.id}
          onRowClick={(params) => setSelectedId(params.row.id)}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
          sx={DATAGRID_SX}
          localeText={{ noRowsLabel: "No overrides" }}
        />
      </Box>

      <Drawer item={selected} tenantJson={tenantJson} onEdit={onEdit} onRemove={onRemoveDevice} onRevoke={onRevokeBatch} busy={selected?.kind === "batch" && revokingId === selected.batch.id} />
    </Box>
  );
}
