import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Chip,
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

import {
  getAuditFacets,
  getAuditSummary,
  listAuditEvents
} from "../api/audit";
import { useAuthContext } from "../auth/AuthContext";
import {
  downloadTextFile,
  getSearchParam,
  toCsv,
  updateSearchParams,
} from "../utils/browserState";

function SummaryCard({ title, value, accent = "#1ba6a6" }) {
  return (
    <Paper
      sx={{
        p: 2,
        minHeight: 104,
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        {title}
      </Typography>
      <Typography
        sx={{
          fontSize: 28,
          fontWeight: 800,
          color: accent,
          lineHeight: 1.1,
          mt: 1,
        }}
      >
        {value}
      </Typography>
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
        sx={{ bgcolor: "rgba(27,166,166,0.12)", color: "#0f6b72", fontWeight: 700 }}
      />
    );
  }

  if (value === "rejected") {
    return (
      <Chip
        label="Rejected"
        size="small"
        sx={{ bgcolor: "rgba(211,47,47,0.12)", color: "#b3261e", fontWeight: 700 }}
      />
    );
  }

  if (value === "error") {
    return (
      <Chip
        label="Error"
        size="small"
        sx={{ bgcolor: "rgba(255,152,0,0.14)", color: "#9a6700", fontWeight: 700 }}
      />
    );
  }

  return <Chip label={outcome || "Unknown"} size="small" />;
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
    { field: "device_id", headerName: "Device ID", minWidth: 220, flex: 1 },
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
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <Box
        sx={{
          mb: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          gap: 2,
          flexWrap: "wrap",
          flexDirection: { xs: "column", sm: "row" },
        }}
      >
        <Box>
          <Typography variant="h4" color="#1ba6a6" sx={{ fontWeight: 700 }}>
            Audit
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Investigate security events and operational traces from the control plane
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            startIcon={<DownloadOutlinedIcon />}
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            Export CSV
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadOutlinedIcon />}
            onClick={handleExportJson}
            disabled={rows.length === 0}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            Export JSON
          </Button>
          <Button
            variant="outlined"
            startIcon={<RestartAltOutlinedIcon />}
            onClick={handleReset}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            Reset Filters
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon />}
            onClick={handleRefresh}
            disabled={refreshing}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Total" value={summary?.total ?? 0} />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="OK" value={summary?.ok_count ?? 0} accent="#0f6b72" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Rejected" value={summary?.rejected_count ?? 0} accent="#b3261e" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Error" value={summary?.error_count ?? 0} accent="#9a6700" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Devices" value={summary?.unique_devices ?? 0} accent="#16324f" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Last 24h" value={summary?.last_24h ?? 0} accent="#1976d2" />
          </Grid>
        </Grid>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, sm: 1.5 },
          mb: 2,
          borderRadius: 3,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: 2,
            mb: 1.5,
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
            <MenuItem value="">all</MenuItem>
            {(facets.eventTypes || []).map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.value} ({item.count})
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Outcome" size="small" value={outcome} onChange={(e) => setOutcome(e.target.value)} fullWidth>
            <MenuItem value="all">all</MenuItem>
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

      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 1.5, sm: 1.5 },
              borderRadius: 3,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
            }}
          >
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
                  backgroundColor: "#f3f6f8",
                },
                "& .MuiDataGrid-row:hover": {
                  cursor: "pointer",
                },
              }}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 3,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
              height: "100%",
            }}
          >
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: "#16324f", mb: 1.5 }}>
              Event Detail
            </Typography>

            {!selectedEvent ? (
              <Typography color="text.secondary">
                Select an event to inspect its detail payload.
              </Typography>
            ) : (
              <Box sx={{ display: "grid", gap: 1.25 }}>
                <Typography><strong>Occurred At:</strong> {formatDate(selectedEvent.occurred_at_utc)}</Typography>
                <Typography><strong>Event Type:</strong> {selectedEvent.event_type}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography><strong>Outcome:</strong></Typography>
                  {renderOutcomeChip(selectedEvent.outcome)}
                </Box>
                <Typography><strong>Device:</strong> {selectedEvent.device_id || " - "}</Typography>
                <Typography><strong>Correlation:</strong> {selectedEvent.correlation_id || " - "}</Typography>
                <Typography><strong>Peer:</strong> {selectedEvent.peer || " - "}</Typography>
                <Typography><strong>Reason:</strong> {selectedEvent.reason || " - "}</Typography>
                <Typography><strong>mTLS Fingerprint:</strong> {selectedEvent.mtls_fingerprint_sha256 || " - "}</Typography>

                <Box>
                  <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Details JSON</Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.25,
                      bgcolor: "#0f172a",
                      color: "#e2e8f0",
                      overflow: "auto",
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
