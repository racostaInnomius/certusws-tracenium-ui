// src/components/AgentSettings/PolicyRolloutView.jsx
//
// Where the policy actually is. Four numbers over the ACTIVE fleet, the
// convergence since the last tenant change (with catalog reversions marked
// so they are not read as failures), a bar per acknowledged version, and
// the device table filtered by state with a resend for the pending ones.
// Devices unseen for longer than the stale window are counted apart
// ("excluded") rather than as behind.

import * as React from "react";
import Grid from "@mui/material/Grid";
import { Box, Button, Chip, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import { BRAND, DATAGRID_SX, ROLE, TEXT } from "../../theme/brand";
import OnlineDot from "../common/OnlineDot";
import { formatDate } from "../../utils/format";
import { formatRelativeTime, SummaryCard } from "../Policies/policyDisplay";
import { BUCKET_LABEL, convergenceSeries, STALE_DAYS, summarizeRollout, versionLabel } from "./rolloutModel";
import { MONO_FONT } from "./fieldSpecs";

const CHART_MARGIN = { top: 8, right: 32, left: 8, bottom: 8 };
const Y_TICK = { fontSize: TEXT.sm, fontFamily: MONO_FONT };
const X_TICK = { fontSize: TEXT.xs };

function BarShape(props) {
  const { x, y, width, height, payload } = props;
  const fill = payload?.isCurrent ? BRAND.teal : BRAND.gray;
  return <rect x={x} y={y} width={width} height={height} rx={2} ry={2} fill={fill} />;
}

const FILTERS = [
  { id: "all", label: "Active" },
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

function sinceLabel(t, start) {
  const ms = t - start;
  if (ms <= 0) return "change";
  const m = Math.round(ms / 60000);
  if (m < 60) return `+${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `+${h} h`;
  return `+${Math.round(h / 24)} d`;
}

export default function PolicyRolloutView({ statusRows, deviceMap, tenantUpdatedAt = null, loading = false, onOpenDevice, onResendPending, resending = false, now }) {
  const [filter, setFilter] = React.useState("all");
  const summary = React.useMemo(() => summarizeRollout(statusRows, { now }), [statusRows, now]);
  const convergence = React.useMemo(() => convergenceSeries(statusRows, { since: tenantUpdatedAt, now }), [statusRows, tenantUpdatedAt, now]);

  const rows = React.useMemo(() => {
    const list = Array.isArray(statusRows) ? statusRows : [];
    const withBucket = list.map((r) => ({ ...r, bucket: summary.bucketOf(r) }));
    if (filter === "all") return withBucket.filter((r) => r.bucket !== "excluded");
    return withBucket.filter((r) => r.bucket === filter);
  }, [statusRows, filter, summary]);

  const pendingIds = React.useMemo(
    () => (Array.isArray(statusRows) ? statusRows : []).filter((r) => summary.bucketOf(r) === "pending").map((r) => r.device_id),
    [statusRows, summary]
  );

  const chartData = React.useMemo(
    () => summary.byVersion.map((v) => ({ label: v.label, count: v.count, isCurrent: v.isCurrent, raw: v.version })),
    [summary]
  );
  const barHeight = Math.max(160, chartData.length * 40 + 40);
  const convData = React.useMemo(() => convergence.points.map((p) => ({ t: p.t, inSync: p.inSync })), [convergence]);

  const columns = React.useMemo(
    () => [
      {
        field: "device_id",
        headerName: "Device",
        minWidth: 190,
        flex: 1,
        valueGetter: (_v, row) => deviceMap?.get(row.device_id)?.hostname || row.csr_common_name || row.device_id,
        renderCell: (params) => {
          const online = params.row?.is_connected === true;
          const seen = params.row?.last_seen_at || params.row?.last_heartbeat;
          const title = online ? "Online" : seen ? `Offline · last seen ${formatRelativeTime(seen)}` : "Offline · never seen";
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
              <OnlineDot online={online} title={title} />
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, color: BRAND.dark, overflow: "hidden", textOverflow: "ellipsis" }}>{params.value}</Typography>
            </Box>
          );
        },
      },
      {
        field: "agent",
        headerName: "Agent",
        minWidth: 80,
        flex: 0.3,
        valueGetter: (_v, row) => deviceMap?.get(row.device_id)?.agentVersion || "—",
        renderCell: (params) => <Typography variant="caption" sx={{ fontFamily: MONO_FONT }}>{params.value}</Typography>,
      },
      {
        field: "last_ack_policy_version",
        headerName: "Effective version",
        minWidth: 160,
        flex: 0.6,
        valueGetter: (_v, row) => versionLabel(row.last_ack_policy_version, summary.currentBase),
        renderCell: (params) => (
          <Tooltip title={`acknowledged ${params.row.last_ack_policy_version || "—"} · desired ${params.row.desired_policy_version || "—"}`} arrow>
            <Typography variant="caption" sx={{ fontFamily: MONO_FONT }}>{params.value}</Typography>
          </Tooltip>
        ),
      },
      {
        field: "bucket",
        headerName: "State",
        minWidth: 120,
        flex: 0.45,
        renderCell: (params) => {
          const c = BUCKET_CHIP[params.value] || BUCKET_CHIP.excluded;
          const label = params.value === "offline" && (params.row.last_seen_at || params.row.last_heartbeat)
            ? `offline ${formatRelativeTime(params.row.last_seen_at || params.row.last_heartbeat)}`
            : BUCKET_LABEL[params.value] || params.value;
          return <Chip size="small" label={label} sx={{ bgcolor: c.bg, color: c.fg, fontWeight: 700 }} />;
        },
      },
      {
        field: "last_ack_at",
        headerName: "Last ACK",
        minWidth: 190,
        flex: 0.7,
        renderCell: (params) =>
          params.value ? (
            <Tooltip title={formatDate(params.value)} arrow>
              <Typography variant="caption">
                {formatRelativeTime(params.value)}
                {params.row.last_ack_message ? ` · ${params.row.last_ack_message}` : ""}
              </Typography>
            </Tooltip>
          ) : (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>Never</Typography>
          ),
      },
      {
        field: "desired_policy_source",
        headerName: "Source",
        minWidth: 140,
        flex: 0.5,
        valueGetter: (_v, row) => (row.has_override === true || row.desired_policy_source === "device" ? "Tenant + override" : "Tenant"),
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
          <SummaryCard title="Up to date" value={summary.inSync} hint={`of ${summary.active} active${summary.active ? ` · ${Math.round((summary.inSync / summary.active) * 100)} %` : ""}`} icon={<CheckCircleOutlineOutlinedIcon />} accent={ROLE.positive} tint={ROLE.positiveSoft} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <SummaryCard title="Pending" value={summary.pending} hint={summary.error ? `online, no ACK yet · ${summary.error} rejected` : "online, no ACK yet"} icon={<HourglassEmptyOutlinedIcon />} accent={ROLE.caution} tint={ROLE.cautionSoft} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <SummaryCard title="Offline" value={summary.offline} hint="will receive it on reconnect" icon={<CloudOffOutlinedIcon />} accent={BRAND.dark} tint={BRAND.darkSoft} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <SummaryCard title="Excluded" value={summary.excluded} hint="retired or never seen" icon={<BlockOutlinedIcon />} accent={BRAND.gray} tint={BRAND.surfaceMuted} />
        </Grid>
      </Grid>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Box sx={{ p: 1.5, border: `1px solid ${BRAND.border}`, borderRadius: 2, bgcolor: BRAND.surfaceMuted, height: "100%" }}>
            <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
              Convergence since the last change
              {convergence.since ? (
                <Typography component="span" sx={{ ml: 1, fontSize: TEXT.xs, color: BRAND.gray }}>
                  {summary.currentBase ? <span style={{ fontFamily: MONO_FONT }}>{summary.currentBase} · </span> : null}
                  {formatDate(new Date(convergence.since))}
                </Typography>
              ) : null}
            </Typography>
            {convergence.since && convData.length > 1 ? (
              <Box sx={{ height: 200, width: "100%", minWidth: 0 }} data-testid="convergence-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={convData} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => sinceLabel(t, convergence.since)} tick={X_TICK} />
                    <YAxis allowDecimals={false} domain={[0, Math.max(convergence.active, 1)]} width={32} tick={X_TICK} />
                    <ChartTooltip formatter={(value) => [`${value} of ${convergence.active}`, "Up to date"]} labelFormatter={(t) => formatDate(new Date(t))} />
                    {convergence.markers.map((m) => (
                      <ReferenceLine key={m} x={m} stroke={ROLE.caution} strokeDasharray="4 3" label={{ value: "catalog", fill: ROLE.caution, fontSize: TEXT.xs, position: "top" }} />
                    ))}
                    <Area type="stepAfter" dataKey="inSync" stroke={BRAND.teal} fill={BRAND.teal} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>No tenant policy change recorded yet.</Typography>
            )}
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.5 }}>
              Devices on the current effective version over time. Dashed lines are catalog changes (probe suffix): the fleet re-versions without a policy edit.
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Box sx={{ p: 1.5, border: `1px solid ${BRAND.border}`, borderRadius: 2, bgcolor: BRAND.surfaceMuted, height: "100%" }}>
            <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>By effective version</Typography>
            {chartData.length > 0 ? (
              <Box sx={{ height: barHeight, width: "100%", minWidth: 0 }} data-testid="rollout-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={CHART_MARGIN} barCategoryGap={8}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={X_TICK} />
                    <YAxis type="category" dataKey="label" width={150} tick={Y_TICK} />
                    <ChartTooltip formatter={(value) => [`${value}`, "Devices"]} labelFormatter={(_l, payload) => payload?.[0]?.payload?.raw || _l} />
                    <Bar dataKey="count" shape={<BarShape />} isAnimationActive={false}>
                      <LabelList dataKey="count" position="right" style={{ fontSize: TEXT.sm, fill: BRAND.dark }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>No acknowledgements yet.</Typography>
            )}
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
              Base + catalog suffix (+ gateway role, + override). Grouped by suffix so a catalog change does not look like an edit. Excluded: {summary.excluded}.
            </Typography>
          </Box>
        </Grid>
      </Grid>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_e, v) => { if (v) setFilter(v); }} aria-label="Rollout filter">
          {FILTERS.map((f) => (
            <ToggleButton key={f.id} value={f.id} sx={{ textTransform: "none", px: 1.25 }}>
              {f.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{rows.length} device{rows.length === 1 ? "" : "s"} · click a row to open it</Typography>
        {onResendPending ? (
          <Button
            size="small"
            variant="outlined"
            disabled={resending || pendingIds.length === 0}
            onClick={() => onResendPending(pendingIds)}
            sx={{ ml: "auto", textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.teal }}
          >
            {resending ? "Resending…" : `Resend to pending${pendingIds.length ? ` (${pendingIds.length})` : ""}`}
          </Button>
        ) : null}
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
