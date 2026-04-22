import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Snackbar,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import {
  getAuditFacets,
  getAuditSummary,
  listAuditEvents
} from "../api/audit";
import { listKnownDevices } from "../api/jobs";
import { useAuthContext } from "../auth/AuthContext";
import {
  downloadTextFile,
  getSearchParam,
  toCsv,
  updateSearchParams,
} from "../utils/browserState";

// Tracenium brand palette
const BRAND = {
  dark: "#3B404D",
  teal: "#5A9F9F",
  tealHover: "#4E8C8C",
  cyan: "#8FFDFF",
  gray: "#BEBEBE",
  tealSoft: "rgba(90,159,159,0.12)",
  tealText: "#3E7878",
  cyanSoft: "rgba(143,253,255,0.22)",
  darkSoft: "rgba(59,64,77,0.08)",
  border: "rgba(190,190,190,0.5)",
  rowHover: "rgba(143,253,255,0.10)",
  shadow: "0 8px 20px rgba(59,64,77,0.10)",
};

function DetailRow({ label, value, mono = false }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
      <Typography
        sx={{
          fontSize: 12,
          color: "text.secondary",
          fontWeight: 600,
          minWidth: 96,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 13,
          color: BRAND.dark,
          fontFamily: mono ? "monospace" : "inherit",
          wordBreak: "break-all",
          flex: 1,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function SummaryCard({ title, value, icon, accent = BRAND.teal, tint = BRAND.tealSoft }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        minHeight: 96,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        alignItems: "center",
        gap: 1.75,
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: "0 12px 26px rgba(59,64,77,0.14)",
        },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          bgcolor: tint,
          color: accent,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 26, fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}

function renderOutcomeChip(outcome) {
  const value = String(outcome || "").toLowerCase();

  if (value === "ok") {
    return (
      <Chip
        label="OK"
        size="small"
        sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700, border: `1px solid ${BRAND.teal}55` }}
      />
    );
  }

  if (value === "rejected") {
    return (
      <Chip
        label="Rejected"
        size="small"
        sx={{ bgcolor: "rgba(179,38,30,0.12)", color: "#b3261e", fontWeight: 700, border: "1px solid rgba(179,38,30,0.35)" }}
      />
    );
  }

  if (value === "error") {
    return (
      <Chip
        label="Error"
        size="small"
        sx={{ bgcolor: "rgba(199,121,43,0.14)", color: "#8b5418", fontWeight: 700, border: "1px solid rgba(199,121,43,0.4)" }}
      />
    );
  }

  return (
    <Chip
      label={outcome || "Unknown"}
      size="small"
      sx={{ bgcolor: BRAND.darkSoft, color: BRAND.dark, fontWeight: 700 }}
    />
  );
}

function formatDate(value) {
  if (!value) return " - ";
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hourCycle: "h24",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toIsoOrUndefined(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export default function Audit() {
  const initialParamsRef = React.useRef({
    deviceId: getSearchParam("auditDeviceId", ""),
    eventType: getSearchParam("auditEventType", ""),
    outcome: getSearchParam("auditOutcome", "all"),
    correlationId: getSearchParam("auditCorrelationId", ""),
    from: getSearchParam("auditFrom", ""),
    to: getSearchParam("auditTo", ""),
    page: Math.max(Number(getSearchParam("auditPage", "0")) || 0, 0),
    pageSize: Math.max(Number(getSearchParam("auditPageSize", "10")) || 10, 1),
    eventId: getSearchParam("auditEventId", ""),
  });
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();

  const tenantMemberRole = String(auth?.tenantMember?.role || "");
  const tenantMemberIsActive = auth?.tenantMember?.isActive === true;
  const canAccess = tenantMemberIsActive && ["OWNER", "ADMIN"].includes(tenantMemberRole);

  const [rows, setRows] = React.useState([]);
  const [summary, setSummary] = React.useState(null);
  const [facets, setFacets] = React.useState({ eventTypes: [], outcomes: [] });
  const [selectedEvent, setSelectedEvent] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  // device_id → hostname map, loaded once, used to render hostnames instead
  // of raw device UUIDs in table cells and detail panel.
  const [deviceIndex, setDeviceIndex] = React.useState(() => new Map());

  const [deviceId, setDeviceId] = React.useState(initialParamsRef.current.deviceId);
  const [eventType, setEventType] = React.useState(initialParamsRef.current.eventType);
  const [outcome, setOutcome] = React.useState(initialParamsRef.current.outcome);
  const [correlationId, setCorrelationId] = React.useState(initialParamsRef.current.correlationId);
  const [from, setFrom] = React.useState(initialParamsRef.current.from);
  const [to, setTo] = React.useState(initialParamsRef.current.to);
  const [paginationModel, setPaginationModel] = React.useState({
    page: initialParamsRef.current.page,
    pageSize: initialParamsRef.current.pageSize,
  });
  const [totalRows, setTotalRows] = React.useState(0);
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedEventId, setSelectedEventId] = React.useState(initialParamsRef.current.eventId);

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });
  const deferredDeviceId = React.useDeferredValue(deviceId);
  const deferredCorrelationId = React.useDeferredValue(correlationId);

  const queryParams = React.useMemo(() => ({
    deviceId: deferredDeviceId || undefined,
    eventType: eventType || undefined,
    outcome: outcome !== "all" ? outcome : undefined,
    correlationId: deferredCorrelationId || undefined,
    from: toIsoOrUndefined(from),
    to: toIsoOrUndefined(to),
  }), [deferredCorrelationId, deferredDeviceId, eventType, from, outcome, to]);

  const hasInvalidDateRange = React.useMemo(() => {
    if (!from || !to) return false;
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return true;
    return fromTime > toTime;
  }, [from, to]);

  React.useEffect(() => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  }, [deviceId, eventType, outcome, correlationId, from, to]);

  // Load the device catalog once so we can show hostnames instead of UUIDs.
  React.useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    listKnownDevices()
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        const map = new Map();
        items.forEach((it) => {
          const id = String(it?.deviceId || "").trim();
          const host = String(it?.hostname || "").trim();
          if (id) map.set(id, host || id);
        });
        setDeviceIndex(map);
      })
      .catch(() => { /* non-fatal — fall back to device ids */ });
    return () => { cancelled = true; };
  }, [canAccess]);

  const getHostname = React.useCallback(
    (deviceIdValue) => {
      const id = String(deviceIdValue || "").trim();
      if (!id) return "\u2014";
      return deviceIndex.get(id) || id;
    },
    [deviceIndex]
  );

  React.useEffect(() => {
    if (!canAccess) return;
    if (hasInvalidDateRange) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const [eventsResponse, summaryResponse, facetsResponse] = await Promise.all([
          listAuditEvents({
            ...queryParams,
            page: paginationModel.page,
            pageSize: paginationModel.pageSize,
          }),
          getAuditSummary(queryParams),
          getAuditFacets(queryParams),
        ]);

        if (cancelled) return;

        const items = Array.isArray(eventsResponse?.items) ? eventsResponse.items : [];
        setRows(items);
        setTotalRows(Number(eventsResponse?.total ?? 0));
        setSelectedEvent((current) => {
          if (selectedEventId && items.some((item) => String(item.id) === String(selectedEventId))) {
            return items.find((item) => String(item.id) === String(selectedEventId)) ?? null;
          }

          if (current && items.some((item) => item.id === current.id)) {
            return items.find((item) => item.id === current.id) ?? current;
          }

          return items[0] ?? null;
        });
        setSummary(summaryResponse?.summary ?? null);
        setFacets(facetsResponse?.facets ?? { eventTypes: [], outcomes: [] });
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        setRows([]);
        setSummary(null);
        setFacets({ eventTypes: [], outcomes: [] });
        setSelectedEvent(null);
        setTotalRows(0);
        setSnackbar({
          open: true,
          message: "Failed to load audit events",
          severity: "error",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canAccess, hasInvalidDateRange, paginationModel.page, paginationModel.pageSize, queryParams, refreshNonce, selectedEventId]);

  React.useEffect(() => {
    updateSearchParams({
      auditDeviceId: deviceId,
      auditEventType: eventType,
      auditOutcome: outcome !== "all" ? outcome : "",
      auditCorrelationId: correlationId,
      auditFrom: from,
      auditTo: to,
      auditPage: paginationModel.page,
      auditPageSize: paginationModel.pageSize,
      auditEventId: selectedEvent?.id ?? selectedEventId,
    });
  }, [
    correlationId,
    deviceId,
    eventType,
    from,
    outcome,
    paginationModel.page,
    paginationModel.pageSize,
    selectedEvent?.id,
    selectedEventId,
    to,
  ]);

  React.useEffect(() => {
    if (!loading) {
      setRefreshing(false);
    }
  }, [loading]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    setRefreshNonce((value) => value + 1);
  }, []);

  const handleReset = React.useCallback(() => {
    setDeviceId("");
    setEventType("");
    setOutcome("all");
    setCorrelationId("");
    setFrom("");
    setTo("");
    setSelectedEventId("");
    setSelectedEvent(null);
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  }, []);

  const handleExportCsv = React.useCallback(() => {
    const csv = toCsv(rows);
    downloadTextFile(`audit-events-${new Date().toISOString()}.csv`, csv || "id\n", "text/csv;charset=utf-8");
  }, [rows]);

  const handleExportJson = React.useCallback(() => {
    const payload = {
      exportedAtUtc: new Date().toISOString(),
      filters: queryParams,
      summary,
      totalRows,
      items: rows,
      selectedEvent,
    };
    downloadTextFile(
      `audit-events-${new Date().toISOString()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }, [queryParams, rows, selectedEvent, summary, totalRows]);

  const columns = [
    {
      field: "occurred_at_utc",
      headerName: "Occurred At",
      minWidth: 170,
      flex: 0.7,
      renderCell: (params) => formatDate(params.value),
    },
    { field: "event_type", headerName: "Event Type", minWidth: 180, flex: 0.8 },
    {
      field: "outcome",
      headerName: "Outcome",
      minWidth: 110,
      flex: 0.45,
      renderCell: (params) => renderOutcomeChip(params.value),
    },
    {
      field: "device_id",
      headerName: "Device",
      minWidth: 200,
      flex: 1,
      valueGetter: (_v, row) => getHostname(row.device_id),
    },
    { field: "correlation_id", headerName: "Correlation", minWidth: 220, flex: 0.9 },
    { field: "peer", headerName: "Peer", minWidth: 160, flex: 0.6, valueGetter: (_v, row) => row.peer || " - " },
    { field: "reason", headerName: "Reason", minWidth: 200, flex: 0.8, valueGetter: (_v, row) => row.reason || " - " },
  ];

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return {
        peer: false,
        reason: false,
        correlation_id: false,
      };
    }

    if (isMdDown) {
      return {
        peer: false,
      };
    }

    return {};
  }, [isMdDown, isSmDown]);

  if (!canAccess) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          Audit access is restricted to active tenant admins and owners.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      {/* Header */}
      <Box
        sx={{
          mb: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          gap: 2,
          flexWrap: "wrap",
          flexDirection: { xs: "column", sm: "row" },
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: -0.5 }}>
            Audit
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
            Investigate security events and operational traces from the control plane.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            startIcon={<DownloadOutlinedIcon />}
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderColor: BRAND.teal,
              color: BRAND.teal,
              "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
            }}
          >
            CSV
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadOutlinedIcon />}
            onClick={handleExportJson}
            disabled={rows.length === 0}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderColor: BRAND.teal,
              color: BRAND.teal,
              "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
            }}
          >
            JSON
          </Button>
          <Button
            variant="outlined"
            startIcon={<RestartAltOutlinedIcon />}
            onClick={handleReset}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderColor: BRAND.gray,
              color: BRAND.dark,
              "&:hover": { borderColor: BRAND.dark, bgcolor: BRAND.darkSoft },
            }}
          >
            Reset
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon />}
            onClick={handleRefresh}
            disabled={refreshing}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderColor: BRAND.teal,
              color: BRAND.teal,
              "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </Box>
      </Box>

      {/* Summary cards */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="Total"
              value={summary?.total ?? 0}
              icon={<AssessmentOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.darkSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="OK"
              value={summary?.ok_count ?? 0}
              icon={<CheckCircleOutlineOutlinedIcon />}
              accent={BRAND.tealText}
              tint={BRAND.tealSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="Rejected"
              value={summary?.rejected_count ?? 0}
              icon={<BlockOutlinedIcon />}
              accent="#b3261e"
              tint="rgba(179,38,30,0.12)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="Error"
              value={summary?.error_count ?? 0}
              icon={<ErrorOutlineOutlinedIcon />}
              accent="#8b5418"
              tint="rgba(199,121,43,0.14)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="Devices"
              value={summary?.unique_devices ?? 0}
              icon={<DevicesOtherOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.cyanSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="Last 24h"
              value={summary?.last_24h ?? 0}
              icon={<ScheduleOutlinedIcon />}
              accent={BRAND.teal}
              tint={BRAND.tealSoft}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, sm: 2 },
          mb: 2,
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadow,
        }}
      >
        <Typography
          variant="overline"
          sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}
        >
          Filters
        </Typography>
        <Box
          sx={{
            mt: 1,
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          <TextField label="Device ID" size="small" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} fullWidth />
          <TextField
            select
            label="Event Type"
            size="small"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            fullWidth
          >
            <MenuItem value="">All event types</MenuItem>
            {(facets.eventTypes || []).map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.value} ({item.count})
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Outcome" size="small" value={outcome} onChange={(e) => setOutcome(e.target.value)} fullWidth>
            <MenuItem value="all">All outcomes</MenuItem>
            {(facets.outcomes || []).map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.value} ({item.count})
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Correlation ID" size="small" value={correlationId} onChange={(e) => setCorrelationId(e.target.value)} fullWidth />
          <TextField
            label="From"
            size="small"
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="To"
            size="small"
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            error={hasInvalidDateRange}
            helperText={hasInvalidDateRange ? "End date must be after start date" : ""}
            fullWidth
          />
        </Box>
      </Paper>

      {/* Table + Detail */}
      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 1.5, sm: 2 },
              borderRadius: 3,
              border: `1px solid ${BRAND.border}`,
              boxShadow: BRAND.shadow,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
                mb: 1.5,
                flexWrap: "wrap",
              }}
            >
              <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
                Audit Events
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                <strong>{totalRows}</strong> total
              </Typography>
            </Box>

            <Box sx={{ width: "100%", overflowX: "auto" }}>
              <DataGrid
                autoHeight
                disableRowSelectionOnClick
                rows={rows}
                columns={columns}
                loading={loading}
                rowCount={totalRows}
                paginationMode="server"
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                getRowId={(row) => row.id}
                onRowClick={(params) => {
                  setSelectedEvent(params.row);
                  setSelectedEventId(String(params.row.id));
                }}
                pageSizeOptions={[10, 25, 50]}
                columnVisibilityModel={columnVisibilityModel}
                sx={{
                  border: "none",
                  "& .MuiDataGrid-columnHeaders": {
                    backgroundColor: BRAND.darkSoft,
                    color: BRAND.dark,
                    fontWeight: 700,
                    borderBottom: `1px solid ${BRAND.border}`,
                  },
                  "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 700 },
                  "& .MuiDataGrid-row": {
                    cursor: "pointer",
                    transition: "background-color 0.12s ease",
                  },
                  "& .MuiDataGrid-row:hover": { backgroundColor: BRAND.rowHover },
                  "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": {
                    backgroundColor: BRAND.cyanSoft,
                  },
                  "& .MuiDataGrid-cell": {
                    borderBottom: `1px solid ${BRAND.border}`,
                  },
                  "& .MuiDataGrid-footerContainer": {
                    borderTop: `1px solid ${BRAND.border}`,
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 3,
              border: `1px solid ${BRAND.border}`,
              boxShadow: BRAND.shadow,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 800, color: BRAND.dark }}>
                Event Detail
              </Typography>
              {selectedEvent ? renderOutcomeChip(selectedEvent.outcome) : null}
            </Box>

            {!selectedEvent ? (
              <Box
                sx={{
                  flex: 1,
                  display: "grid",
                  placeItems: "center",
                  textAlign: "center",
                  color: "text.secondary",
                  p: 3,
                  border: `1px dashed ${BRAND.border}`,
                  borderRadius: 2,
                  bgcolor: BRAND.darkSoft,
                }}
              >
                <Box>
                  <InfoOutlinedIcon sx={{ fontSize: 36, color: BRAND.gray, mb: 1 }} />
                  <Typography variant="body2">
                    Select an event from the table to inspect its detail payload.
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75, flex: 1 }}>
                {/* Identity */}
                <Box>
                  <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                    Identity
                  </Typography>
                  <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                    <DetailRow label="Occurred" value={formatDate(selectedEvent.occurred_at_utc)} />
                    <DetailRow label="Event Type" value={selectedEvent.event_type} />
                    <DetailRow label="Host" value={getHostname(selectedEvent.device_id)} />
                    <DetailRow label="Device ID" value={selectedEvent.device_id || "—"} mono />
                    <DetailRow label="Correlation" value={selectedEvent.correlation_id || "—"} mono />
                  </Box>
                </Box>

                <Divider sx={{ borderColor: BRAND.border }} />

                {/* Context */}
                <Box>
                  <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                    Context
                  </Typography>
                  <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                    <DetailRow label="Peer" value={selectedEvent.peer || "—"} />
                    <DetailRow label="Reason" value={selectedEvent.reason || "—"} />
                    <DetailRow
                      label="mTLS FP"
                      value={selectedEvent.mtls_fingerprint_sha256 || "—"}
                      mono
                    />
                  </Box>
                </Box>

                <Divider sx={{ borderColor: BRAND.border }} />

                {/* Details JSON */}
                <Box>
                  <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                    Details
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      mt: 0.5,
                      p: 1.25,
                      bgcolor: BRAND.dark,
                      color: "#e2e8f0",
                      borderColor: BRAND.dark,
                      overflow: "auto",
                      maxHeight: 260,
                      fontFamily: "monospace",
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(selectedEvent.details ?? {}, null, 2)}
                  </Paper>
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
