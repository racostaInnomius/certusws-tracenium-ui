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

import { getCertificateSummary, listExpiringCertificates } from "../api/certificates";
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

  if (value === "pending") {
    return (
      <Chip
        label="Pending"
        size="small"
        sx={{
          bgcolor: "rgba(255,152,0,0.16)",
          color: "#9a6700",
          fontWeight: 700,
        }}
      />
    );
  }

  if (["revoked", "expired"].includes(value)) {
    return (
      <Chip
        label={value === "revoked" ? "Revoked" : "Expired"}
        size="small"
        sx={{
          bgcolor: "rgba(211,47,47,0.12)",
          color: "#b3261e",
          fontWeight: 700,
        }}
      />
    );
  }

  if (value === "rotated") {
    return (
      <Chip
        label="Rotated"
        size="small"
        sx={{
          bgcolor: "rgba(25,118,210,0.12)",
          color: "#1976d2",
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

export default function PKI() {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();

  const tenantMemberRole = String(auth?.tenantMember?.role || "");
  const tenantMemberIsActive = auth?.tenantMember?.isActive === true;
  const canAccess =
    tenantMemberIsActive &&
    ["OWNER", "ADMIN"].includes(tenantMemberRole);

  const [summary, setSummary] = React.useState(null);
  const [certificates, setCertificates] = React.useState([]);
  const [days, setDays] = React.useState("30");
  const [loading, setLoading] = React.useState(true);

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const loadData = React.useCallback(async () => {
    if (!canAccess) return;

    try {
      setLoading(true);
      const [summaryResponse, expiringResponse] = await Promise.all([
        getCertificateSummary(),
        listExpiringCertificates({ days }),
      ]);

      setSummary(summaryResponse?.summary ?? null);
      setCertificates(
        Array.isArray(expiringResponse?.certificates)
          ? expiringResponse.certificates
          : []
      );
    } catch (e) {
      console.error(e);
      setSummary(null);
      setCertificates([]);
      setSnackbar({
        open: true,
        message: "Failed to load PKI metrics",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [canAccess, days]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const columns = [
    { field: "device_id", headerName: "Device ID", minWidth: 220, flex: 1 },
    {
      field: "status",
      headerName: "Status",
      minWidth: 110,
      flex: 0.45,
      renderCell: (params) => renderStatusChip(params.value),
    },
    { field: "serial", headerName: "Serial", minWidth: 200, flex: 0.8 },
    { field: "fingerprint_sha256", headerName: "Fingerprint", minWidth: 260, flex: 1.2 },
    {
      field: "not_after",
      headerName: "Not After",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
    { field: "days_to_expiry", headerName: "Days Left", minWidth: 100, flex: 0.4 },
  ];

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return {
        serial: false,
        fingerprint_sha256: false,
      };
    }

    if (isMdDown) {
      return {
        fingerprint_sha256: false,
      };
    }

    return {};
  }, [isMdDown, isSmDown]);

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
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" color="#1ba6a6" sx={{ fontWeight: 700 }}>
          PKI
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Certificate lifecycle summary and expiring active certificates
        </Typography>
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
              sm: "240px 1fr",
            },
          }}
        >
          <TextField
            select
            label="Expiring Window"
            size="small"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            fullWidth
          >
            <MenuItem value="7">7 days</MenuItem>
            <MenuItem value="30">30 days</MenuItem>
            <MenuItem value="60">60 days</MenuItem>
            <MenuItem value="90">90 days</MenuItem>
          </TextField>

          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography color="text.secondary">
              Showing active certificates expiring within the selected window.
            </Typography>
          </Box>
        </Box>

        <DataGrid
          autoHeight
          disableRowSelectionOnClick
          rows={certificates}
          columns={columns}
          loading={loading}
          getRowId={(row) => `${row.device_id}-${row.fingerprint_sha256}`}
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
