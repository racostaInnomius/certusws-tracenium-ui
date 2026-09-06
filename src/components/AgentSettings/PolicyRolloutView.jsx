// src/components/AgentSettings/PolicyRolloutView.jsx
//
// Where the policy actually is. Four numbers over the ACTIVE fleet, a bar
// per acknowledged version, and the device table filtered by bucket.
// Devices unseen for longer than the stale window are counted apart
// ("excluded") rather than as behind: the old "ACK OK 48 / 65" mixed in
// agents that had been gone for months and made every tenant look
// half-rolled-out.

import * as React from "react";
import Grid from "@mui/material/Grid";
import { Box, Chip, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import { BRAND, DATAGRID_SX, ROLE, TEXT } from "../../theme/brand";
import OnlineDot from "../common/OnlineDot";
import { formatDate } from "../../utils/format";
import { formatRelativeTime, renderAckChip, renderSourceChip, SummaryCard } from "../Policies/policyDisplay";
import { BUCKET_LABEL, STALE_DAYS, summarizeRollout, versionLabel } from "./rolloutModel";

const CHART_MARGIN = { top: 8, right: 32, left: 8, bottom: 8 };
const Y_TICK = { fontSize: TEXT.sm, fontFamily: "monospace" };

function BarShape(props) {
  const { x, y, width, height, payload } = props;
  const fill = payload?.isCurrent ? BRAND.teal : BRAND.gray;
  return <rect x={x} y={y} width={width} height={height} rx={2} ry={2} fill={fill} />;
}

const FILTERS = [
  { id: "all", label: "All active" },
  { id: "in_sync", label: BUCKET_LABEL.in_sync },
  { id: "pending", label: BUCKET_LABEL.pending },
  { id: "offline", label: BUCKET_LABEL.offline },
  { id: "error", label: BUCKET_LABEL.error },
  { id: "excluded", label: BUCKET_LABEL.excluded },
];

const BUCKET_CHIP = {
  in_sync: { bg: ROLE.positiveSoft, fg: ROLE.positive },
  pending: { bg: ROLE.cautionSoft, fg: ROLE.caution },
  offline: { bg: BRAND.darkSoft, fg: BRAND.dark },
  error: { bg: ROLE.criticalSoft, fg: ROLE.critical },
  excluded: { bg: BRAND.surfaceMuted, fg: BRAND.gray },
};

export default function PolicyRolloutView({ statusRows, deviceMap, loading = false, onOpenDevice, now }) {
  const [filter, setFilter] = React.useState("all");
  const summary = React.useMemo(() => summarizeRollout(statusRows, { now }), [statusRows, now]);

  const rows = React.useMemo(() => {
    const list = Array.isArray(statusRows) ? statusRows : [];
    const withBucket = list.map((r) => ({ ...r, bucket: summary.bucketOf(r) }));
    if (filter === "all") return withBucket.filter((r) => r.bucket !== "excluded");
    return withBucket.filter((r) => r.bucket === filter);
  }, [statusRows, filter, summary]);

  const chartData = React.useMemo(
    () => summary.byVersion.map((v) => ({ label: v.label, count: v.count, isCurrent: v.isCurrent, raw: v.version })),
    [summary]
  );
  const chartHeight = Math.max(160, chartData.length * 40 + 40);

  const columns = React.useMemo(
    () => [
      {
        field: "device_id",
        headerName: "Device",
        minWidth: 180,
        flex: 1,
        valueGetter: (_v, row) => deviceMap?.get(row.device_id)?.hostname || row.device_id,
      },
      {
        field: "is_connected",
        headerName: "Online",
        minWidth: 70,
        flex: 0.25,
        renderCell: (params) => {
          const online = params.row?.is_connected === true;
          const seen = params.row?.last_heartbeat;
          const title = online ? "Online" : seen ? `Offline · last seen ${formatRelativeTime(seen)}` : "Offline · never seen";
          return <OnlineDot online={online} title={title} />;
        },
      },
      {
        field: "bucket",
        headerName: "State",
        minWidth: 120,
        flex: 0.5,
        renderCell: (params) => {
          const c = BUCKET_CHIP[params.value] || BUCKET_CHIP.excluded;
          return <Chip size="small" label={BUCKET_LABEL[params.value] || params.value} sx={{ bgcolor: c.bg, color: c.fg, fontWeight: 700 }} />;
        },
      },
      {
        field: "desired_policy_source",
        headerName: "Source",
        minWidth: 110,
        flex: 0.4,
        renderCell: (params) => renderSourceChip(params.value),
      },
      {
        field: "last_ack_policy_version",
        headerName: "Acknowledged",
        minWidth: 150,
        flex: 0.6,
        valueGetter: (_v, row) => versionLabel(row.last_ack_policy_version, summary.currentBase),
        renderCell: (params) => (
          <Tooltip title={params.row.last_ack_policy_version || "—"} arrow>
            <Typography variant="caption" sx={{ fontFamily: "monospace" }}>{params.value}</Typography>
          </Tooltip>
        ),
      },
      {
        field: "desired_policy_version",
        headerName: "Desired",
        minWidth: 150,
        flex: 0.6,
        valueGetter: (_v, row) => versionLabel(row.desired_policy_version, summary.currentBase),
        renderCell: (params) => (
          <Tooltip title={params.row.desired_policy_version || "—"} arrow>
            <Typography variant="caption" sx={{ fontFamily: "monospace" }}>{params.value}</Typography>
          </Tooltip>
        ),
      },
      {
        field: "last_ack_status",
        headerName: "ACK",
        minWidth: 120,
        flex: 0.4,
        renderCell: (params) => renderAckChip(params.row.last_ack_status, null),
      },
      {
        field: "last_ack_at",
        headerName: "ACK at",
        minWidth: 120,
        flex: 0.4,
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
        field: "last_ack_message",
        headerName: "Message",
        minWidth: 180,
        flex: 0.8,
        valueGetter: (_v, row) => row.last_ack_message || "—",
      },
    ],
    [deviceMap, summary.currentBase]
  );

  return (
    <Box>
      <Box sx={{ mb: 1.5 }}>
        <Typography component="h2" sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>Policy rollout</Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          Which version each device acknowledged. Devices unseen for more than {STALE_DAYS} days are excluded from the numbers
          {summary.excluded > 0 ? ` (${summary.excluded} excluded)` : ""}.
        </Typography>
      </Box>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <SummaryCard title="In sync" value={summary.inSync} hint={`of ${summary.active} active`} icon={<CheckCircleOutlineOutlinedIcon />} accent={ROLE.positive} tint={ROLE.positiveSoft} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <SummaryCard title="Pending" value={summary.pending} hint="online, not yet on the desired version" icon={<HourglassEmptyOutlinedIcon />} accent={ROLE.caution} tint={ROLE.cautionSoft} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <SummaryCard title="Offline" value={summary.offline} hint="will converge on reconnect" icon={<CloudOffOutlinedIcon />} accent={BRAND.dark} tint={BRAND.darkSoft} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <SummaryCard title="Errors" value={summary.error} hint="agent rejected the policy" icon={<ErrorOutlineOutlinedIcon />} accent={ROLE.critical} tint={ROLE.criticalSoft} />
        </Grid>
      </Grid>

      {chartData.length > 0 ? (
        <Box sx={{ mb: 2, p: 1.5, border: `1px solid ${BRAND.border}`, borderRadius: 2, bgcolor: BRAND.surfaceMuted }}>
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
            Acknowledged versions (active fleet)
            {summary.currentBase ? (
              <Typography component="span" sx={{ ml: 1, fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace" }}>
                current base {summary.currentBase}
              </Typography>
            ) : null}
          </Typography>
          <Box sx={{ height: chartHeight, width: "100%", minWidth: 0 }} data-testid="rollout-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={CHART_MARGIN} barCategoryGap={8}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={200} tick={Y_TICK} />
                <ChartTooltip formatter={(value) => [`${value}`, "Devices"]} labelFormatter={(_l, payload) => payload?.[0]?.payload?.raw || _l} />
                <Bar dataKey="count" shape={<BarShape />} isAnimationActive={false}>
                  <LabelList dataKey="count" position="right" style={{ fontSize: TEXT.sm, fill: BRAND.dark }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
            Teal = every device on that version is on its desired version. Suffixes after the base come from probe-catalog and gateway reversioning, not from a new save.
          </Typography>
        </Box>
      ) : null}

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_e, v) => { if (v) setFilter(v); }} aria-label="Rollout filter">
          {FILTERS.map((f) => (
            <ToggleButton key={f.id} value={f.id} sx={{ textTransform: "none", px: 1.25 }}>
              {f.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{rows.length} device{rows.length === 1 ? "" : "s"} · click a row to open its override</Typography>
      </Box>

      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <DataGrid
          autoHeight
          disableRowSelectionOnClick
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.device_id}
          onRowClick={(params) => onOpenDevice?.(params.row.device_id)}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
          sx={DATAGRID_SX}
        />
      </Box>
    </Box>
  );
}
