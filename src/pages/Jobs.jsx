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
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import { DataGrid } from "@mui/x-data-grid";

import { useAuthContext } from "../auth/AuthContext";
import {
  createDeviceJob,
  createTenantJobs,
  listConnectedDevices,
  listDeviceJobs,
} from "../api/jobs";

const JOB_TYPE_OPTIONS = [
  { value: "facts_snapshot", label: "Facts Snapshot" },
  { value: "agent_update", label: "Agent Update" },
];

const FACT_TYPE_OPTIONS = [
  { value: "inventory", label: "Inventory" },
  { value: "compliance", label: "Compliance" },
  { value: "all", label: "All" },
];

const TARGET_OPTIONS = [
  { value: "device", label: "Selected Device" },
  { value: "tenant", label: "All Connected Devices" },
];

function SummaryCard({ title, value, accent = "#1ba6a6" }) {
  return (
    <Paper
      sx={{
        p: 2,
        height: "100%",
        minHeight: 96,
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

function renderStatusChip(status) {
  const value = String(status || "").toLowerCase();

  if (value === "completed") {
    return (
      <Chip
        label="Completed"
        size="small"
        sx={{
          bgcolor: "rgba(27,166,166,0.12)",
          color: "#0f6b72",
          fontWeight: 700,
        }}
      />
    );
  }

  if (value === "running" || value === "sent") {
    return (
      <Chip
        label={value === "running" ? "Running" : "Sent"}
        size="small"
        sx={{
          bgcolor: "rgba(25,118,210,0.12)",
          color: "#1976d2",
          fontWeight: 700,
        }}
      />
    );
  }

  if (value === "pending" || value === "retrying") {
    return (
      <Chip
        label={value === "pending" ? "Pending" : "Retrying"}
        size="small"
        sx={{
          bgcolor: "rgba(255,152,0,0.14)",
          color: "#9a6700",
          fontWeight: 700,
        }}
      />
    );
  }

  if (value === "failed" || value === "timeout" || value === "cancelled") {
    return (
      <Chip
        label={String(status || "Failed")}
        size="small"
        sx={{
          bgcolor: "rgba(211,47,47,0.12)",
          color: "#b3261e",
          fontWeight: 700,
        }}
      />
    );
  }

  return <Chip label={status || "Unknown"} size="small" />;
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
  });
}

function buildJobPayload(jobType, factType, version) {
  if (jobType === "agent_update") {
    return { version: String(version || "").trim() };
  }

  return { factType };
}

export default function Jobs() {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();

  const tenantId = auth?.tenantId;
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;

  const canManageJobs =
    isActiveMember &&
    (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [connectedDeviceIds, setConnectedDeviceIds] = React.useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState("");
  const [jobs, setJobs] = React.useState([]);

  const [loadingDevices, setLoadingDevices] = React.useState(true);
  const [loadingJobs, setLoadingJobs] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [jobType, setJobType] = React.useState("facts_snapshot");
  const [targetMode, setTargetMode] = React.useState("device");
  const [factType, setFactType] = React.useState("inventory");
  const [version, setVersion] = React.useState("");
  const [timeoutSeconds, setTimeoutSeconds] = React.useState("");
  const [maxAttempts, setMaxAttempts] = React.useState("");

  const [statusFilter, setStatusFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const loadConnectedDevices = React.useCallback(async () => {
    try {
      setLoadingDevices(true);
      const response = await listConnectedDevices();
      const items = Array.isArray(response?.deviceIds) ? response.deviceIds : [];
      setConnectedDeviceIds(items);

      setSelectedDeviceId((current) => {
        if (current && items.includes(current)) return current;
        return items[0] || "";
      });
    } catch (e) {
      console.error(e);
      setConnectedDeviceIds([]);
      setSelectedDeviceId("");
      setSnackbar({
        open: true,
        message: "Failed to load connected devices",
        severity: "error",
      });
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  const loadJobs = React.useCallback(async (deviceId) => {
    if (!deviceId) {
      setJobs([]);
      return;
    }

    try {
      setLoadingJobs(true);
      const response = await listDeviceJobs(deviceId, { limit: 100 });
      const items = Array.isArray(response?.jobs) ? response.jobs : [];
      setJobs(items);
    } catch (e) {
      console.error(e);
      setJobs([]);
      setSnackbar({
        open: true,
        message: "Failed to load jobs",
        severity: "error",
      });
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  React.useEffect(() => {
    loadConnectedDevices();
  }, [loadConnectedDevices]);

  React.useEffect(() => {
    loadJobs(selectedDeviceId);
  }, [selectedDeviceId, loadJobs]);

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();

    return jobs.filter((row) => {
      const matchesStatus =
        statusFilter === "all" ||
        String(row.status || "").toLowerCase() === statusFilter;

      const matchesSearch =
        !q ||
        String(row.job_id || "").toLowerCase().includes(q) ||
        String(row.job_type || "").toLowerCase().includes(q) ||
        String(row.last_error || "").toLowerCase().includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [jobs, search, statusFilter]);

  const summary = React.useMemo(() => {
    const total = jobs.length;
    const pending = jobs.filter((job) =>
      ["pending", "retrying", "sent", "running"].includes(
        String(job.status || "").toLowerCase()
      )
    ).length;
    const completed = jobs.filter(
      (job) => String(job.status || "").toLowerCase() === "completed"
    ).length;

    return {
      connectedDevices: connectedDeviceIds.length,
      total,
      pending,
      completed,
    };
  }, [connectedDeviceIds.length, jobs]);

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return {
        attempts: false,
        sent_at: false,
        completed_at: false,
        created_by: false,
        last_error: false,
      };
    }

    if (isMdDown) {
      return {
        created_by: false,
      };
    }

    return {};
  }, [isMdDown, isSmDown]);

  const columns = [
    { field: "job_id", headerName: "Job ID", minWidth: 230, flex: 1.2 },
    { field: "job_type", headerName: "Type", minWidth: 130, flex: 0.6 },
    {
      field: "status",
      headerName: "Status",
      minWidth: 120,
      flex: 0.55,
      renderCell: (params) => renderStatusChip(params.value),
    },
    {
      field: "attempts",
      headerName: "Attempts",
      minWidth: 90,
      flex: 0.35,
    },
    {
      field: "created_at",
      headerName: "Created At",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "sent_at",
      headerName: "Sent At",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "completed_at",
      headerName: "Completed At",
      minWidth: 150,
      flex: 0.65,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "created_by",
      headerName: "Created By",
      minWidth: 160,
      flex: 0.8,
      valueGetter: (_value, row) => row.created_by || " - ",
    },
    {
      field: "last_error",
      headerName: "Last Error",
      minWidth: 220,
      flex: 1,
      valueGetter: (_value, row) => row.last_error || " - ",
    },
  ];

  const handleSubmit = async () => {
    if (!canManageJobs) return;

    const payload = {
      jobType,
      payload: buildJobPayload(jobType, factType, version),
      timeoutSeconds: timeoutSeconds ? Number(timeoutSeconds) : undefined,
      maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
    };

    if (jobType === "agent_update" && !String(version || "").trim()) {
      setSnackbar({
        open: true,
        message: "Version is required for agent update jobs",
        severity: "error",
      });
      return;
    }

    if (targetMode === "device" && !selectedDeviceId) {
      setSnackbar({
        open: true,
        message: "Select a connected device first",
        severity: "error",
      });
      return;
    }

    if (targetMode === "tenant" && (!tenantId || connectedDeviceIds.length === 0)) {
      setSnackbar({
        open: true,
        message: "No connected devices available for tenant dispatch",
        severity: "error",
      });
      return;
    }

    try {
      setSubmitting(true);

      if (targetMode === "tenant") {
        const response = await createTenantJobs(tenantId, {
          deviceIds: connectedDeviceIds,
          ...payload,
        });

        setSnackbar({
          open: true,
          message: `Tenant job queued for ${response?.created?.count ?? connectedDeviceIds.length} devices`,
          severity: "success",
        });
      } else {
        const response = await createDeviceJob(selectedDeviceId, payload);

        setSnackbar({
          open: true,
          message: `Job queued successfully (${response?.jobId || "created"})`,
          severity: "success",
        });
      }

      await loadJobs(selectedDeviceId);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to create job",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

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
            Jobs
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Dispatch facts snapshots and agent update jobs to connected devices
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          onClick={() => {
            loadConnectedDevices();
            loadJobs(selectedDeviceId);
          }}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          Refresh
        </Button>
      </Box>

      {!canManageJobs && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          Jobs management is restricted to active tenant admins and owners.
        </Alert>
      )}

      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Connected Devices" value={summary.connectedDevices} />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Jobs Loaded" value={summary.total} accent="#16324f" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Pending / Running" value={summary.pending} accent="#9a6700" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Completed" value={summary.completed} accent="#0f6b72" />
          </Grid>
        </Grid>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, sm: 2 },
          mb: 2,
          borderRadius: 3,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
        }}
      >
        <Typography sx={{ fontSize: 18, fontWeight: 700, color: "#16324f", mb: 1.5 }}>
          Create Job
        </Typography>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(4, minmax(0, 1fr))",
            },
          }}
        >
          <TextField
            select
            label="Target"
            size="small"
            value={targetMode}
            onChange={(e) => setTargetMode(e.target.value)}
            disabled={!canManageJobs}
            fullWidth
          >
            {TARGET_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Connected Device"
            size="small"
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            disabled={!canManageJobs || targetMode !== "device" || loadingDevices}
            helperText={
              targetMode === "tenant"
                ? "Tenant dispatch will use all currently connected devices"
                : loadingDevices
                  ? "Loading connected devices..."
                  : `${connectedDeviceIds.length} connected`
            }
            fullWidth
          >
            {connectedDeviceIds.length === 0 ? (
              <MenuItem value="">No connected devices</MenuItem>
            ) : (
              connectedDeviceIds.map((deviceId) => (
                <MenuItem key={deviceId} value={deviceId}>
                  {deviceId}
                </MenuItem>
              ))
            )}
          </TextField>

          <TextField
            select
            label="Job Type"
            size="small"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            disabled={!canManageJobs}
            fullWidth
          >
            {JOB_TYPE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          {jobType === "facts_snapshot" ? (
            <TextField
              select
              label="Facts Scope"
              size="small"
              value={factType}
              onChange={(e) => setFactType(e.target.value)}
              disabled={!canManageJobs}
              fullWidth
            >
              {FACT_TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              label="Target Version"
              size="small"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={!canManageJobs}
              placeholder="1.0.87"
              fullWidth
            />
          )}

          <TextField
            label="Timeout Seconds"
            size="small"
            type="number"
            value={timeoutSeconds}
            onChange={(e) => setTimeoutSeconds(e.target.value)}
            disabled={!canManageJobs}
            fullWidth
          />

          <TextField
            label="Max Attempts"
            size="small"
            type="number"
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(e.target.value)}
            disabled={!canManageJobs}
            fullWidth
          />
        </Box>

        <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            startIcon={<PlayArrowOutlinedIcon />}
            onClick={handleSubmit}
            disabled={submitting || !canManageJobs}
            sx={{
              bgcolor: "#1ba6a6",
              "&:hover": { bgcolor: "#158d8d" },
              minWidth: 170,
            }}
          >
            Dispatch Job
          </Button>
        </Box>
      </Paper>

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
              lg: "1.3fr 0.7fr",
            },
          }}
        >
          <TextField
            label="Search Jobs"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
          />

          <TextField
            select
            label="Status"
            size="small"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            fullWidth
          >
            <MenuItem value="all">all</MenuItem>
            <MenuItem value="pending">pending</MenuItem>
            <MenuItem value="retrying">retrying</MenuItem>
            <MenuItem value="sent">sent</MenuItem>
            <MenuItem value="running">running</MenuItem>
            <MenuItem value="completed">completed</MenuItem>
            <MenuItem value="failed">failed</MenuItem>
            <MenuItem value="timeout">timeout</MenuItem>
            <MenuItem value="cancelled">cancelled</MenuItem>
          </TextField>
        </Box>

        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ fontWeight: 700, color: "#16324f" }}>
            Device History
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {selectedDeviceId
              ? `Showing jobs for device ${selectedDeviceId}`
              : "Select a connected device to view job history"}
          </Typography>
        </Box>

        <DataGrid
          autoHeight
          disableRowSelectionOnClick
          rows={filteredRows}
          columns={columns}
          loading={loadingJobs}
          getRowId={(row) => row.job_id}
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
            "& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus": {
              outline: "none",
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
