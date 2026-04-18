import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
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

import { listAuditEvents } from "../api/audit";
import { useAuthContext } from "../auth/AuthContext";

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
        sx={{
          bgcolor: "rgba(27,166,166,0.12)",
          color: "#0f6b72",
          fontWeight: 700,
        }}
      />
    );
  }

  if (value === "rejected") {
    return (
      <Chip
        label="Rejected"
        size="small"
        sx={{
          bgcolor: "rgba(211,47,47,0.12)",
          color: "#b3261e",
          fontWeight: 700,
        }}
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

export default function Audit() {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();

  const tenantMemberRole = String(auth?.tenantMember?.role || "");
  const tenantMemberIsActive = auth?.tenantMember?.isActive === true;
  const canAccess =
    tenantMemberIsActive &&
    ["OWNER", "ADMIN"].includes(tenantMemberRole);

  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const [deviceId, setDeviceId] = React.useState("");
  const [eventType, setEventType] = React.useState("");
  const [outcome, setOutcome] = React.useState("all");
  const [correlationId, setCorrelationId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const loadData = React.useCallback(async () => {
    if (!canAccess) return;

    try {
      setLoading(true);
      const response = await listAuditEvents({
        deviceId: deviceId || undefined,
        eventType: eventType || undefined,
        outcome: outcome !== "all" ? outcome : undefined,
        correlationId: correlationId || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 200,
      });

      setRows(Array.isArray(response?.data) ? response.data : []);
    } catch (e) {
      console.error(e);
      setRows([]);
      setSnackbar({
        open: true,
        message: "Failed to load audit events",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [canAccess, correlationId, deviceId, eventType, from, outcome, to]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = React.useMemo(() => {
    const total = rows.length;
    const rejected = rows.filter(
      (row) => String(row.outcome || "").toLowerCase() === "rejected"
    ).length;
    const uniqueDevices = new Set(rows.map((row) => row.device_id).filter(Boolean)).size;

    return { total, rejected, uniqueDevices };
  }, [rows]);

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
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" color="#1ba6a6" sx={{ fontWeight: 700 }}>
          Audit
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Query security events and operational traces stored in control DB
        </Typography>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Loaded Events" value={summary.total} />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Rejected" value={summary.rejected} accent="#b3261e" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Devices Seen" value={summary.uniqueDevices} accent="#16324f" />
          </Grid>
        </Grid>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, sm: 1.5 },
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
          <TextField label="Event Type" size="small" value={eventType} onChange={(e) => setEventType(e.target.value)} fullWidth />
          <TextField select label="Outcome" size="small" value={outcome} onChange={(e) => setOutcome(e.target.value)} fullWidth>
            <MenuItem value="all">all</MenuItem>
            <MenuItem value="ok">ok</MenuItem>
            <MenuItem value="rejected">rejected</MenuItem>
          </TextField>
          <TextField label="Correlation ID" size="small" value={correlationId} onChange={(e) => setCorrelationId(e.target.value)} fullWidth />
          <TextField label="From (ISO)" size="small" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2026-04-17T00:00:00Z" fullWidth />
          <TextField label="To (ISO)" size="small" value={to} onChange={(e) => setTo(e.target.value)} placeholder="2026-04-17T23:59:59Z" fullWidth />
        </Box>

        <DataGrid
          autoHeight
          disableRowSelectionOnClick
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.id}
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 10, page: 0 },
            },
          }}
          columnVisibilityModel={columnVisibilityModel}
          sx={{
            border: "none",
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "#f3f6f8",
            },
          }}
        />
      </Paper>

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
