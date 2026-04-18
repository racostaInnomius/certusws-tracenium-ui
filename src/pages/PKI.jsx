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
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";

import {
  getCertificateActivity,
  getCertificateDetail,
  getCertificateSummary,
  listCertificateDevices,
  listDeviceCertificates,
  listDevicesWithoutActiveCertificates,
  listExpiringCertificates,
  revokeCertificate,
} from "../api/certificates";
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
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{title}</Typography>
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

function formatDate(value) {
  if (!value) return " - ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return " - ";
  return date.toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hourCycle: "h24",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusAccent(status) {
  const value = String(status || "").toLowerCase();
  if (value === "active") return { bg: "rgba(27,166,166,0.12)", fg: "#0f6b72", label: "Active" };
  if (value === "pending") return { bg: "rgba(255,152,0,0.16)", fg: "#9a6700", label: "Pending" };
  if (value === "rotated") return { bg: "rgba(25,118,210,0.12)", fg: "#1976d2", label: "Rotated" };
  if (value === "revoked") return { bg: "rgba(211,47,47,0.12)", fg: "#b3261e", label: "Revoked" };
  if (value === "expired") return { bg: "rgba(117,117,117,0.16)", fg: "#525252", label: "Expired" };
  return { bg: "rgba(0,0,0,0.08)", fg: "#333", label: status || "Unknown" };
}

function StatusChip({ status }) {
  const accent = statusAccent(status);
  return (
    <Chip
      label={accent.label}
      size="small"
      sx={{
        bgcolor: accent.bg,
        color: accent.fg,
        fontWeight: 700,
      }}
    />
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 1, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit",
          wordBreak: "break-word",
        }}
      >
        {value || " - "}
      </Typography>
    </Box>
  );
}

export default function PKI() {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const { auth } = useAuthContext();

  const tenantMemberRole = String(auth?.tenantMember?.role || "");
  const tenantMemberIsActive = auth?.tenantMember?.isActive === true;
  const canAccess = tenantMemberIsActive && ["OWNER", "ADMIN"].includes(tenantMemberRole);

  const [summary, setSummary] = React.useState(null);
  const [expiring, setExpiring] = React.useState([]);
  const [missingActive, setMissingActive] = React.useState({ items: [], total: 0 });
  const [devices, setDevices] = React.useState({ items: [], total: 0 });
  const [deviceCertificates, setDeviceCertificates] = React.useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState("");
  const [selectedCertificate, setSelectedCertificate] = React.useState(null);
  const [certificateActivity, setCertificateActivity] = React.useState([]);

  const [days, setDays] = React.useState("30");
  const [deviceSearch, setDeviceSearch] = React.useState("");
  const [missingSearch, setMissingSearch] = React.useState("");
  const [deviceStatus, setDeviceStatus] = React.useState("");
  const [revokeReason, setRevokeReason] = React.useState("");
  const [devicePagination, setDevicePagination] = React.useState({ page: 0, pageSize: 10 });
  const [missingPagination, setMissingPagination] = React.useState({ page: 0, pageSize: 5 });
  const [overviewLoading, setOverviewLoading] = React.useState(true);
  const [devicesLoading, setDevicesLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [revokeLoading, setRevokeLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const deferredDeviceSearch = React.useDeferredValue(deviceSearch);
  const deferredMissingSearch = React.useDeferredValue(missingSearch);

  const showMessage = React.useCallback((message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const loadOverview = React.useCallback(async () => {
    if (!canAccess) return;

    try {
      setOverviewLoading(true);
      const [summaryResponse, expiringResponse, missingResponse] = await Promise.all([
        getCertificateSummary(),
        listExpiringCertificates({ days }),
        listDevicesWithoutActiveCertificates({
          page: missingPagination.page + 1,
          pageSize: missingPagination.pageSize,
          search: deferredMissingSearch,
        }),
      ]);

      setSummary(summaryResponse?.summary ?? null);
      setExpiring(Array.isArray(expiringResponse?.certificates) ? expiringResponse.certificates : []);
      setMissingActive({
        items: Array.isArray(missingResponse?.items) ? missingResponse.items : [],
        total: Number(missingResponse?.total ?? 0),
      });
    } catch (err) {
      console.error(err);
      showMessage("Failed to load PKI overview", "error");
    } finally {
      setOverviewLoading(false);
    }
  }, [
    canAccess,
    days,
    missingPagination.page,
    missingPagination.pageSize,
    deferredMissingSearch,
    showMessage,
  ]);

  const loadDevices = React.useCallback(async () => {
    if (!canAccess) return;

    try {
      setDevicesLoading(true);
      const response = await listCertificateDevices({
        page: devicePagination.page + 1,
        pageSize: devicePagination.pageSize,
        search: deferredDeviceSearch,
        status: deviceStatus,
      });

      setDevices({
        items: Array.isArray(response?.items) ? response.items : [],
        total: Number(response?.total ?? 0),
      });
    } catch (err) {
      console.error(err);
      showMessage("Failed to load certificate coverage", "error");
    } finally {
      setDevicesLoading(false);
    }
  }, [
    canAccess,
    devicePagination.page,
    devicePagination.pageSize,
    deferredDeviceSearch,
    deviceStatus,
    showMessage,
  ]);

  const loadCertificateDetail = React.useCallback(async (fingerprint, deviceId) => {
    if (!canAccess || !fingerprint) return;

    try {
      setDetailLoading(true);
      const [detailResponse, activityResponse, deviceResponse] = await Promise.all([
        getCertificateDetail(fingerprint),
        getCertificateActivity(fingerprint, { limit: 25 }),
        deviceId ? listDeviceCertificates(deviceId) : Promise.resolve(null),
      ]);

      setSelectedCertificate(detailResponse?.certificate ?? null);
      setCertificateActivity(Array.isArray(activityResponse?.items) ? activityResponse.items : []);
      if (deviceResponse?.certificates) {
        setDeviceCertificates(deviceResponse.certificates);
      }
    } catch (err) {
      console.error(err);
      showMessage("Failed to load certificate detail", "error");
    } finally {
      setDetailLoading(false);
    }
  }, [canAccess, showMessage]);

  const selectDevice = React.useCallback(async (deviceId) => {
    if (!canAccess || !deviceId) return;

    try {
      setDetailLoading(true);
      const response = await listDeviceCertificates(deviceId);
      const certificates = Array.isArray(response?.certificates) ? response.certificates : [];
      setSelectedDeviceId(deviceId);
      setDeviceCertificates(certificates);

      const preferred =
        certificates.find((item) => String(item.status).toLowerCase() === "active") ||
        certificates[0];

      if (preferred?.fingerprint_sha256) {
        await loadCertificateDetail(preferred.fingerprint_sha256, deviceId);
      } else {
        setSelectedFingerprint("");
        setSelectedCertificate(null);
        setCertificateActivity([]);
      }
    } catch (err) {
      console.error(err);
      showMessage("Failed to load device certificates", "error");
    } finally {
      setDetailLoading(false);
    }
  }, [canAccess, loadCertificateDetail, showMessage]);

  const handleRevoke = React.useCallback(async () => {
    if (!selectedCertificate?.fingerprint_sha256) return;
    const normalizedReason = String(revokeReason || "").trim();
    if (!normalizedReason) {
      showMessage("Revocation reason is required", "error");
      return;
    }

    const label = selectedCertificate.fingerprint_sha256;
    const confirmed = window.confirm(`Revoke certificate ${label}?`);
    if (!confirmed) return;

    try {
      setRevokeLoading(true);
      await revokeCertificate(selectedCertificate.fingerprint_sha256, {
        reason: normalizedReason,
      });
      showMessage("Certificate revoked");
      await Promise.all([
        loadOverview(),
        loadDevices(),
        loadCertificateDetail(selectedCertificate.fingerprint_sha256, selectedCertificate.device_id),
      ]);
    } catch (err) {
      console.error(err);
      showMessage("Failed to revoke certificate", "error");
    } finally {
      setRevokeLoading(false);
    }
  }, [loadCertificateDetail, loadDevices, loadOverview, revokeReason, selectedCertificate, showMessage]);

  const handleRefresh = React.useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        loadOverview(),
        loadDevices(),
        selectedDeviceId ? selectDevice(selectedDeviceId) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadDevices, loadOverview, selectDevice, selectedDeviceId]);

  React.useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  React.useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const deviceColumns = [
    { field: "device_id", headerName: "Device ID", minWidth: 220, flex: 1 },
    {
      field: "active_certs",
      headerName: "Active",
      minWidth: 85,
      flex: 0.35,
    },
    {
      field: "pending_certs",
      headerName: "Pending",
      minWidth: 85,
      flex: 0.35,
    },
    {
      field: "expired_certs",
      headerName: "Expired",
      minWidth: 85,
      flex: 0.35,
    },
    {
      field: "revoked_certs",
      headerName: "Revoked",
      minWidth: 85,
      flex: 0.35,
    },
    {
      field: "latest_expires_at",
      headerName: "Latest Expiry",
      minWidth: 155,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
  ];

  const expiringColumns = [
    { field: "device_id", headerName: "Device ID", minWidth: 210, flex: 1 },
    {
      field: "status",
      headerName: "Status",
      minWidth: 110,
      flex: 0.45,
      renderCell: (params) => <StatusChip status={params.value} />,
    },
    {
      field: "not_after",
      headerName: "Not After",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
    { field: "days_to_expiry", headerName: "Days Left", minWidth: 90, flex: 0.35 },
    { field: "fingerprint_sha256", headerName: "Fingerprint", minWidth: 260, flex: 1.2 },
  ];

  const missingColumns = [
    { field: "device_id", headerName: "Device ID", minWidth: 210, flex: 1 },
    { field: "agent_version", headerName: "Agent", minWidth: 110, flex: 0.45 },
    {
      field: "last_seen_at",
      headerName: "Last Seen",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
    { field: "cert_count", headerName: "Certs", minWidth: 70, flex: 0.3 },
    {
      field: "current_not_after",
      headerName: "Tracked Expiry",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
  ];

  const deviceCertColumns = [
    {
      field: "status",
      headerName: "Status",
      minWidth: 110,
      flex: 0.45,
      renderCell: (params) => <StatusChip status={params.value} />,
    },
    { field: "serial", headerName: "Serial", minWidth: 180, flex: 0.8 },
    {
      field: "created_at",
      headerName: "Issued",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "not_after",
      headerName: "Expires",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
    { field: "fingerprint_sha256", headerName: "Fingerprint", minWidth: 260, flex: 1.2 },
  ];

  const activityColumns = [
    {
      field: "occurred_at_utc",
      headerName: "Time",
      minWidth: 150,
      flex: 0.55,
      renderCell: (params) => formatDate(params.value),
    },
    { field: "event_type", headerName: "Event", minWidth: 160, flex: 0.7 },
    {
      field: "outcome",
      headerName: "Outcome",
      minWidth: 110,
      flex: 0.4,
      renderCell: (params) => <StatusChip status={params.value === "ok" ? "active" : params.value} />,
    },
    { field: "reason", headerName: "Reason", minWidth: 180, flex: 0.7 },
  ];

  if (!canAccess) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          PKI access is restricted to active tenant admins and owners.
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
            PKI
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Certificate coverage, lifecycle, activity, and remediation for the current tenant.
          </Typography>
        </Box>

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

      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Total" value={summary?.total ?? 0} />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Active" value={summary?.active ?? 0} accent="#0f6b72" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Pending" value={summary?.pending ?? 0} accent="#9a6700" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Revoked" value={summary?.revoked ?? 0} accent="#b3261e" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Expiring 30d" value={summary?.expiring_30d ?? 0} accent="#1976d2" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="No Active Cert" value={summary?.devices_without_active_cert ?? 0} accent="#8e24aa" />
          </Grid>
        </Grid>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 7 }}>
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 3,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
            }}
          >
            <Stack direction={isMdDown ? "column" : "row"} spacing={1.5} sx={{ mb: 1.5 }}>
              <TextField
                label="Search Device"
                size="small"
                value={deviceSearch}
                onChange={(e) => {
                  setDeviceSearch(e.target.value);
                  setDevicePagination((prev) => ({ ...prev, page: 0 }));
                }}
                fullWidth
              />
              <TextField
                select
                label="Coverage Filter"
                size="small"
                value={deviceStatus}
                onChange={(e) => {
                  setDeviceStatus(e.target.value);
                  setDevicePagination((prev) => ({ ...prev, page: 0 }));
                }}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="active">Has active</MenuItem>
                <MenuItem value="pending">Has pending</MenuItem>
                <MenuItem value="expired">Has expired</MenuItem>
                <MenuItem value="revoked">Has revoked</MenuItem>
              </TextField>
            </Stack>

            <Typography variant="h6" sx={{ mb: 1 }}>
              Certificate Coverage By Device
            </Typography>

            <DataGrid
              autoHeight
              disableRowSelectionOnClick
              rows={devices.items}
              rowCount={devices.total}
              loading={devicesLoading}
              columns={deviceColumns}
              paginationMode="server"
              paginationModel={devicePagination}
              onPaginationModelChange={setDevicePagination}
              pageSizeOptions={[10, 25, 50]}
              getRowId={(row) => row.device_id}
              onRowClick={(params) => selectDevice(params.row.device_id)}
              sx={{
                border: "none",
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: "#f3f6f8",
                },
              }}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, xl: 5 }}>
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 3,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
              mb: 2,
            }}
          >
            <Stack direction={isMdDown ? "column" : "row"} spacing={1.5} sx={{ mb: 1.5 }}>
              <TextField
                select
                label="Expiring Window"
                size="small"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="7">7 days</MenuItem>
                <MenuItem value="30">30 days</MenuItem>
                <MenuItem value="60">60 days</MenuItem>
                <MenuItem value="90">90 days</MenuItem>
              </TextField>
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Typography color="text.secondary">
                  Active certificates expiring within the selected window.
                </Typography>
              </Box>
            </Stack>

            <Typography variant="h6" sx={{ mb: 1 }}>
              Expiring Certificates
            </Typography>

            <DataGrid
              autoHeight
              disableRowSelectionOnClick
              rows={expiring}
              loading={overviewLoading}
              columns={expiringColumns}
              getRowId={(row) => `${row.device_id}-${row.fingerprint_sha256}`}
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 5, page: 0 },
                },
              }}
              pageSizeOptions={[5, 10, 25]}
              onRowClick={(params) =>
                loadCertificateDetail(params.row.fingerprint_sha256, params.row.device_id)
              }
              sx={{
                border: "none",
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: "#f3f6f8",
                },
              }}
            />
          </Paper>

          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 3,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
            }}
          >
            <Stack direction={isMdDown ? "column" : "row"} spacing={1.5} sx={{ mb: 1.5 }}>
              <TextField
                label="Search Missing"
                size="small"
                value={missingSearch}
                onChange={(e) => {
                  setMissingSearch(e.target.value);
                  setMissingPagination((prev) => ({ ...prev, page: 0 }));
                }}
                fullWidth
              />
            </Stack>

            <Typography variant="h6" sx={{ mb: 1 }}>
              Devices Without Active Certificate
            </Typography>

            <DataGrid
              autoHeight
              disableRowSelectionOnClick
              rows={missingActive.items}
              rowCount={missingActive.total}
              loading={overviewLoading}
              columns={missingColumns}
              paginationMode="server"
              paginationModel={missingPagination}
              onPaginationModelChange={setMissingPagination}
              pageSizeOptions={[5, 10, 25]}
              getRowId={(row) => row.device_id}
              onRowClick={(params) => selectDevice(params.row.device_id)}
              sx={{
                border: "none",
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: "#f3f6f8",
                },
              }}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 3,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
            }}
          >
            <Stack
              direction={isMdDown ? "column" : "row"}
              spacing={1.5}
              sx={{ mb: 1.5, justifyContent: "space-between", alignItems: isMdDown ? "stretch" : "center" }}
            >
              <Box>
                <Typography variant="h6">Certificate Detail</Typography>
                <Typography color="text.secondary">
                  {selectedDeviceId
                    ? `Device ${selectedDeviceId}`
                    : "Select a device or certificate to inspect lifecycle and activity."}
                </Typography>
              </Box>
              <Button
                variant="contained"
                color="error"
                disabled={
                  revokeLoading ||
                  !selectedCertificate ||
                  ["revoked", "expired", "rotated"].includes(String(selectedCertificate.status || "").toLowerCase())
                }
                onClick={handleRevoke}
              >
                Revoke Certificate
              </Button>
            </Stack>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, lg: 5 }}>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  {detailLoading ? (
                    <Typography color="text.secondary">Loading certificate detail…</Typography>
                  ) : selectedCertificate ? (
                    <>
                      <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "center" }}>
                        <StatusChip status={selectedCertificate.status} />
                        <Chip label={selectedCertificate.device_id} size="small" />
                      </Stack>
                      <DetailRow label="Fingerprint" value={selectedCertificate.fingerprint_sha256} mono />
                      <DetailRow label="Serial" value={selectedCertificate.serial} mono />
                      <DetailRow label="Issued" value={formatDate(selectedCertificate.created_at)} />
                      <DetailRow label="Activated" value={formatDate(selectedCertificate.activated_at)} />
                      <DetailRow label="Expires" value={formatDate(selectedCertificate.not_after)} />
                      <DetailRow label="Revoked At" value={formatDate(selectedCertificate.revoked_at)} />
                      <DetailRow label="Revoked Reason" value={selectedCertificate.revoked_reason} />
                      <DetailRow label="Enrollment Status" value={selectedCertificate.enrollment_status} />
                      <DetailRow label="Agent Version" value={selectedCertificate.agent_version} />
                      <DetailRow label="Last Seen" value={formatDate(selectedCertificate.last_seen_at)} />
                      <DetailRow label="Renewed From" value={selectedCertificate.renewal_of_fingerprint_sha256} mono />
                      <DetailRow label="Renewed By" value={selectedCertificate.renewed_by_fingerprint_sha256} mono />
                    </>
                  ) : (
                    <Typography color="text.secondary">
                      No certificate selected.
                    </Typography>
                  )}
                </Paper>
                <TextField
                  label="Revocation Reason"
                  size="small"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  helperText="Required when revoking from the dashboard"
                  fullWidth
                  sx={{ mt: 1.5 }}
                />
              </Grid>

              <Grid size={{ xs: 12, lg: 7 }}>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Device Certificate Chain
                  </Typography>
                  <DataGrid
                    autoHeight
                    disableRowSelectionOnClick
                    rows={deviceCertificates}
                    columns={deviceCertColumns}
                    loading={detailLoading}
                    hideFooter
                    getRowId={(row) => row.fingerprint_sha256}
                    onRowClick={(params) =>
                      loadCertificateDetail(params.row.fingerprint_sha256, params.row.device_id)
                    }
                    sx={{
                      border: "none",
                      "& .MuiDataGrid-columnHeaders": {
                        backgroundColor: "#f3f6f8",
                      },
                    }}
                  />
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Certificate Activity
                  </Typography>
                  <DataGrid
                    autoHeight
                    disableRowSelectionOnClick
                    rows={certificateActivity}
                    columns={activityColumns}
                    loading={detailLoading}
                    hideFooter
                    getRowId={(row) => row.id}
                    sx={{
                      border: "none",
                      "& .MuiDataGrid-columnHeaders": {
                        backgroundColor: "#f3f6f8",
                      },
                    }}
                  />

                  {selectedCertificate && certificateActivity.length > 0 ? (
                    <>
                      <Divider sx={{ my: 1.5 }} />
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Last event details
                      </Typography>
                      <Box
                        component="pre"
                        sx={{
                          m: 0,
                          p: 1.5,
                          fontSize: 12,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          borderRadius: 2,
                          backgroundColor: "#0f172a",
                          color: "#e5eef7",
                          overflow: "auto",
                        }}
                      >
                        {JSON.stringify(certificateActivity[0]?.details ?? {}, null, 2)}
                      </Box>
                    </>
                  ) : null}
                </Paper>
              </Grid>
            </Grid>
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
