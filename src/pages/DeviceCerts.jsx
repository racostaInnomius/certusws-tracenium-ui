import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Chip,
  Snackbar,
  Alert,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { DataGrid } from "@mui/x-data-grid";

import { useAuthContext } from "../auth/AuthContext";
import {
  listDeviceCertDevices,
  listDeviceCerts,
  revokeDeviceCert,
  revokeBulkDeviceCerts,
} from "../api/deviceCerts";

import RevokeCertDialog from "../components/device-certs/RevokeCertDialog";
import RevokeBulkCertsDialog from "../components/device-certs/RevokeBulkCertsDialog";

function SummaryCard({ title, value, accent = "#1ba6a6" }) {
  return (
    <Paper
      sx={{
        p: 2,
        minHeight: 120,
        height: "auto",
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

  if (value === "active") {
    return (
      <Chip
        label="Active"
        size="small"
        sx={{
          bgcolor: "rgba(27,166,166,0.12)",
          color: "#0f6b72",
          fontWeight: 700,
        }}
      />
    );
  }

  if (value === "revoked") {
    return (
      <Chip
        label="Revoked"
        size="small"
        sx={{
          bgcolor: "rgba(211,47,47,0.12)",
          color: "#b3261e",
          fontWeight: 700,
        }}
      />
    );
  }

  if (value === "expired") {
    return (
      <Chip
        label="Expired"
        size="small"
        sx={{
          bgcolor: "rgba(251, 191, 36, 0.18)",
          color: "#b45309",
          fontWeight: 700,
        }}
      />
    );
  }

  return <Chip label={status || "Unknown"} size="small" />;
}

function renderPemChip(value) {
  return (
    <Chip
      label={value ? "Yes" : "No"}
      size="small"
      sx={{
        bgcolor: value
          ? "rgba(27,166,166,0.12)"
          : "rgba(120,120,120,0.12)",
        color: value ? "#0f6b72" : "#555",
        fontWeight: 700,
      }}
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
  });
}

export default function DeviceCerts() {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();

  const tenantMemberRole = auth?.tenantMember?.role;
  const tenantMemberIsActive = auth?.tenantMember?.isActive === true;

  const canAccess =
    tenantMemberIsActive &&
    ["ADMIN", "OWNER"].includes(String(tenantMemberRole || ""));

  const canRevoke = canAccess;

  const [devices, setDevices] = React.useState([]);
  const [selectedDevice, setSelectedDevice] = React.useState(null);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState(null);

  const [certs, setCerts] = React.useState([]);
  const [selectedCertIds, setSelectedCertIds] = React.useState([]);

  const [loadingDevices, setLoadingDevices] = React.useState(true);
  const [loadingCerts, setLoadingCerts] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [deviceSearch, setDeviceSearch] = React.useState("");
  const [deviceStatus, setDeviceStatus] = React.useState("all");
  const [certStatusFilter, setCertStatusFilter] = React.useState("all");

  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [revokeBulkOpen, setRevokeBulkOpen] = React.useState(false);
  const [selectedCert, setSelectedCert] = React.useState(null);

  const [certsFlash, setCertsFlash] = React.useState(false);

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const loadDevices = async () => {
    try {
      setLoadingDevices(true);

      const response = await listDeviceCertDevices({
        search: deviceSearch || undefined,
        status: deviceStatus !== "all" ? deviceStatus : undefined,
        page: 1,
        pageSize: 25,
      });

      const items = Array.isArray(response?.items) ? response.items : [];
      setDevices(items);

      if (!selectedDevice && items.length > 0) {
        setSelectedDevice(items[0]);
        setSelectedDeviceId(items[0].deviceId);
      } else if (selectedDevice) {
        const refreshed =
          items.find((d) => d.deviceId === selectedDevice.deviceId) || null;
        setSelectedDevice(refreshed);
        setSelectedDeviceId(refreshed?.deviceId ?? null);
      }
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load devices",
        severity: "error",
      });
    } finally {
      setLoadingDevices(false);
    }
  };

  const loadCerts = async (deviceId) => {
    if (!deviceId) {
      setCerts([]);
      setSelectedCertIds([]);
      return;
    }

    try {
      setLoadingCerts(true);
      const response = await listDeviceCerts(deviceId);
      const items = Array.isArray(response) ? response : [];
      setCerts(items);
      setSelectedCertIds([]);
      setCertsFlash(true);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load certificates",
        severity: "error",
      });
    } finally {
      setLoadingCerts(false);
    }
  };

  React.useEffect(() => {
    if (!canAccess) return;
    loadDevices();
  }, [deviceSearch, deviceStatus, canAccess]);

  React.useEffect(() => {
    if (!canAccess) return;
    loadCerts(selectedDevice?.deviceId);
  }, [selectedDevice?.deviceId, canAccess]);

  React.useEffect(() => {
    if (!certsFlash) return;

    const timer = setTimeout(() => {
      setCertsFlash(false);
    }, 900);

    return () => clearTimeout(timer);
  }, [certsFlash]);

  const filteredCerts = React.useMemo(() => {
    if (certStatusFilter === "all") return certs;
    return certs.filter(
      (c) => String(c.status || "").toLowerCase() === certStatusFilter
    );
  }, [certs, certStatusFilter]);

  const summary = React.useMemo(() => {
    const totalDevices = devices.length;
    const totalCerts = devices.reduce(
      (acc, d) => acc + Number(d.totalCerts || 0),
      0
    );
    const activeCerts = devices.reduce(
      (acc, d) => acc + Number(d.activeCerts || 0),
      0
    );
    const revokedCerts = devices.reduce(
      (acc, d) => acc + Number(d.revokedCerts || 0),
      0
    );

    return { totalDevices, totalCerts, activeCerts, revokedCerts };
  }, [devices]);

  const handleCopyFingerprint = async (value) => {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      setSnackbar({
        open: true,
        message: "Fingerprint copied to clipboard",
        severity: "success",
      });
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Unable to copy fingerprint",
        severity: "error",
      });
    }
  };

  const handleRevokeSingle = async (reason) => {
    if (!selectedDevice?.deviceId || !selectedCert?.fingerprint_sha256) return;

    try {
      setSubmitting(true);

      const res = await revokeDeviceCert(
        selectedDevice.deviceId,
        selectedCert.fingerprint_sha256,
        reason
      );

      setRevokeOpen(false);
      setSelectedCert(null);

      setSnackbar({
        open: true,
        message: res?.revoked
          ? "Certificate revoked successfully"
          : "Certificate was already revoked",
        severity: res?.revoked ? "success" : "info",
      });

      await loadDevices();
      await loadCerts(selectedDevice.deviceId);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to revoke certificate",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeBulk = async (reason) => {
    if (!selectedDevice?.deviceId || selectedCertIds.length === 0) return;

    try {
      setSubmitting(true);

      const res = await revokeBulkDeviceCerts(
        selectedDevice.deviceId,
        selectedCertIds,
        reason
      );

      setRevokeBulkOpen(false);

      const revoked = Number(res?.revoked || 0);
      const alreadyRevoked = Number(res?.alreadyRevoked || 0);
      const notFound = Number(res?.notFound || 0);
      const requested = Number(res?.requested || selectedCertIds.length);

      setSnackbar({
        open: true,
        message: `Bulk revoke completed. Requested: ${requested}, Revoked: ${revoked}, Already revoked: ${alreadyRevoked}, Not found: ${notFound}`,
        severity: "success",
      });

      await loadDevices();
      await loadCerts(selectedDevice.deviceId);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to revoke selected certificates",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const deviceColumns = [
    { field: "deviceId", headerName: "Device ID", minWidth: 160, flex: 0.9 },
    { field: "hostname", headerName: "Hostname", minWidth: 180, flex: 1 },
    { field: "tenantName", headerName: "Tenant", minWidth: 150, flex: 0.8 },
    { field: "totalCerts", headerName: "Total", minWidth: 90, flex: 0.4 },
    { field: "activeCerts", headerName: "Active", minWidth: 90, flex: 0.4 },
    { field: "revokedCerts", headerName: "Revoked", minWidth: 100, flex: 0.45 },
    { field: "expiredCerts", headerName: "Expired", minWidth: 100, flex: 0.45 },
    {
      field: "latestIssuedAt",
      headerName: "Latest Issued",
      minWidth: 150,
      flex: 0.7,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "latestExpiresAt",
      headerName: "Latest Expires",
      minWidth: 150,
      flex: 0.7,
      renderCell: (params) => formatDate(params.value),
    },
  ];

  const certColumns = [
    { field: "serial", headerName: "Serial", minWidth: 150, flex: 0.8 },
    {
      field: "fingerprint_sha256",
      headerName: "Fingerprint",
      minWidth: 260,
      flex: 1.2,
      renderCell: (params) => (
        <Box
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 1,
            overflow: "hidden",
          }}
        >
          <Typography
            variant="body2"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {params.value}
          </Typography>

          <Tooltip title="Copy fingerprint">
            <IconButton
              size="small"
              onClick={() => handleCopyFingerprint(params.value)}
            >
              <ContentCopyOutlinedIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      minWidth: 110,
      flex: 0.5,
      renderCell: (params) => renderStatusChip(params.value),
    },
    {
      field: "not_before",
      headerName: "Not Before",
      minWidth: 150,
      flex: 0.7,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "not_after",
      headerName: "Not After",
      minWidth: 150,
      flex: 0.7,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "created_at",
      headerName: "Created At",
      minWidth: 150,
      flex: 0.7,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "has_cert_pem",
      headerName: "PEM",
      minWidth: 90,
      flex: 0.4,
      renderCell: (params) => renderPemChip(params.value),
    },
    ...(canRevoke
      ? [
          {
            field: "actions",
            headerName: "Actions",
            minWidth: 130,
            flex: 0.6,
            sortable: false,
            filterable: false,
            renderCell: (params) => (
              <Button
                size="small"
                color="error"
                disabled={String(params.row?.status).toLowerCase() !== "active"}
                onClick={() => {
                  setSelectedCert(params.row);
                  setRevokeOpen(true);
                }}
              >
                Revoke
              </Button>
            ),
          },
        ]
      : []),
  ];

  const deviceColumnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return {
        tenantName: false,
        latestIssuedAt: false,
        latestExpiresAt: false,
      };
    }

    if (isMdDown) {
      return {
        latestIssuedAt: false,
      };
    }

    return {};
  }, [isMdDown, isSmDown]);

  const certColumnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return {
        created_at: false,
        has_cert_pem: false,
      };
    }

    if (isMdDown) {
      return {
        created_at: false,
      };
    }

    return {};
  }, [isMdDown, isSmDown]);

  if (!canAccess) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Paper
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Access restricted
          </Typography>
          <Typography color="text.secondary">
            Only active OWNER and ADMIN users can access Device Certs.
          </Typography>
        </Paper>
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
            Device Certs
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Review and revoke device certificates
          </Typography>
        </Box>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard title="Devices" value={summary.totalDevices} />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="Total Certs"
              value={summary.totalCerts}
              accent="#0f6b72"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="Active Certs"
              value={summary.activeCerts}
              accent="#1ba6a6"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="Revoked Certs"
              value={summary.revokedCerts}
              accent="#b3261e"
            />
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
          mb: 2,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: 2,
            mb: 1.5,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr 1fr",
              lg: "1.2fr 0.8fr",
            },
          }}
        >
          <TextField
            label="Search devices"
            size="small"
            value={deviceSearch}
            onChange={(e) => setDeviceSearch(e.target.value)}
            fullWidth
          />

          <TextField
            select
            label="Status"
            size="small"
            value={deviceStatus}
            onChange={(e) => setDeviceStatus(e.target.value)}
            fullWidth
          >
            <MenuItem value="all">all</MenuItem>
            <MenuItem value="active">active</MenuItem>
            <MenuItem value="revoked">revoked</MenuItem>
            <MenuItem value="expired">expired</MenuItem>
          </TextField>
        </Box>

        <Box
          sx={{
            height: {
              xs: 340,
              sm: 360,
              md: 360,
            },
            width: "100%",
          }}
        >
          <DataGrid
            rows={devices}
            columns={deviceColumns}
            columnVisibilityModel={deviceColumnVisibilityModel}
            loading={loadingDevices}
            disableRowSelectionOnClick
            getRowId={(row) => row.deviceId}
            pageSizeOptions={[10, 25, 50]}
            rowSelectionModel={{
              type: "include",
              ids:
                selectedDeviceId != null
                  ? new Set([selectedDeviceId])
                  : new Set(),
            }}
            onRowClick={(params) => {
              setSelectedDevice(params.row);
              setSelectedDeviceId(params.row.deviceId);
            }}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 10, page: 0 },
              },
            }}
            sx={{
              border: "none",
              width: "100%",
              "& .MuiDataGrid-columnHeaders": {
                backgroundColor: "rgba(166, 83, 27, 0.08)",
                fontWeight: 700,
              },
              "& .MuiDataGrid-row": {
                cursor: "pointer",
              },
              "& .MuiDataGrid-row.Mui-selected": {
                backgroundColor: "rgba(15, 107, 114, 0.18) !important",
              },
              "& .MuiDataGrid-row.Mui-selected:hover": {
                backgroundColor: "rgba(15, 107, 114, 0.24) !important",
              },
            }}
          />
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
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Certificates
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedDevice
                ? `Certificates for ${selectedDevice.hostname || selectedDevice.deviceId}`
                : "Select a device to view certificates"}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 2,
              flexWrap: "wrap",
              width: { xs: "100%", sm: "auto" },
            }}
          >
            <TextField
              select
              label="Cert Status"
              size="small"
              value={certStatusFilter}
              onChange={(e) => setCertStatusFilter(e.target.value)}
              sx={{ width: { xs: "100%", sm: 180 } }}
              disabled={!selectedDevice}
            >
              <MenuItem value="all">all</MenuItem>
              <MenuItem value="active">active</MenuItem>
              <MenuItem value="revoked">revoked</MenuItem>
              <MenuItem value="expired">expired</MenuItem>
            </TextField>

            {canRevoke && (
              <Button
                variant="contained"
                color="error"
                disabled={!selectedDevice || selectedCertIds.length === 0}
                onClick={() => setRevokeBulkOpen(true)}
                sx={{
                  width: { xs: "100%", sm: "auto" },
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                Revoke Selected
              </Button>
            )}
          </Box>
        </Box>

        {selectedDevice && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Tenant:</strong> {selectedDevice.tenantName} &nbsp;&nbsp;|&nbsp;&nbsp;
              <strong>Device ID:</strong> {selectedDevice.deviceId} &nbsp;&nbsp;|&nbsp;&nbsp;
              <strong>Total Certs:</strong> {selectedDevice.totalCerts}
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            height: {
              xs: 420,
              sm: "calc(100vh - 430px)",
              md: 360,
            },
            width: "100%",
            borderRadius: 2,
            transition: "box-shadow 0.25s ease, background-color 0.25s ease",
            boxShadow: certsFlash
              ? "0 0 0 2px rgba(15, 107, 114, 0.25), 0 0 18px rgba(15, 107, 114, 0.12)"
              : "none",
            backgroundColor: certsFlash
              ? "rgba(15, 107, 114, 0.04)"
              : "transparent",
          }}
        >
          <DataGrid
            rows={filteredCerts}
            columns={certColumns}
            columnVisibilityModel={certColumnVisibilityModel}
            loading={loadingCerts}
            disableRowSelectionOnClick={!canRevoke}
            checkboxSelection={canRevoke}
            rowSelectionModel={{
                type: "include",
                ids: new Set(selectedCertIds),
            }}
            onRowSelectionModelChange={(newSelection) => {
                const nextSelection = Array.from(newSelection?.ids || []);
                setSelectedCertIds(nextSelection);
            }}
            getRowId={(row) => row.fingerprint_sha256}
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 10, page: 0 },
              },
            }}
            sx={{
              border: "none",
              width: "100%",
              "& .MuiDataGrid-columnHeaders": {
                backgroundColor: "rgba(166, 83, 27, 0.08)",
                fontWeight: 700,
              },
            }}
          />
        </Box>
      </Paper>

      <RevokeCertDialog
        open={revokeOpen}
        cert={selectedCert}
        submitting={submitting}
        onClose={() => setRevokeOpen(false)}
        onConfirm={handleRevokeSingle}
      />

      <RevokeBulkCertsDialog
        open={revokeBulkOpen}
        selectedCount={selectedCertIds.length}
        deviceId={selectedDevice?.deviceId}
        submitting={submitting}
        onClose={() => setRevokeBulkOpen(false)}
        onConfirm={handleRevokeBulk}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4500}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}