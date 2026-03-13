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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";

import { listTokens, createToken, revokeToken } from "../api/tokens";
import CreateTokenDialog from "../components/tokens/CreateTokenDialog";
import TokenCreatedDialog from "../components/tokens/TokenCreatedDialog";
import RevokeTokenDialog from "../components/tokens/RevokeTokenDialog";

function SummaryCard({ title, value, accent = "#1ba6a6" }) {
  return (
    <Paper
      sx={{
        p: 2,
        height: "70%",
        minHeight: 60,
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

  if (value === "expired") {
    return (
      <Chip
        label="Expired"
        size="small"
        sx={{
          bgcolor: "rgba(211,47,47,0.12)",
          color: "#b3261e",
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
          bgcolor: "rgba(120,120,120,0.15)",
          color: "#555",
          fontWeight: 700,
        }}
      />
    );
  }

  return <Chip label={status || "Unknown"} size="small" />;
}

export default function TokensAdministrator() {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));

  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createdOpen, setCreatedOpen] = React.useState(false);
  const [createdToken, setCreatedToken] = React.useState(null);

  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [selectedToken, setSelectedToken] = React.useState(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await listTokens();
      const list = Array.isArray(data) ? data : [];
      setRows(list);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load tokens",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadData();
  }, []);

const filteredRows = React.useMemo(() => {
  return rows.filter((row) => {
    const matchesStatus =
      status === "all" ||
      String(row.status).toLowerCase() === status.toLowerCase();

    const matchesSearch =
      !search ||
      String(row.token_label || "")
        .toLowerCase()
        .includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });
}, [rows, status, search]);

  const summary = React.useMemo(() => {
    const total = rows.length;
    const active = rows.filter(
      (r) => String(r.status).toLowerCase() === "active"
    ).length;
    const expired = rows.filter(
      (r) => String(r.status).toLowerCase() === "expired"
    ).length;
    const revoked = rows.filter(
      (r) => String(r.status).toLowerCase() === "revoked"
    ).length;


    return { total, active, expired, revoked};
  }, [rows]);

  const handleCreateToken = async (payload) => {
    try {
      setSubmitting(true);
      const created = await createToken(payload);

      setCreatedToken(created);
      setCreateOpen(false);
      setCreatedOpen(true);

      await loadData();

      setSnackbar({
        open: true,
        message: "Token created successfully",
        severity: "success",
      });
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to create token",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!selectedToken?.id) return;

    try {
      setSubmitting(true);
      await revokeToken(selectedToken.id);

      setRevokeOpen(false);
      setSelectedToken(null);

      await loadData();

      setSnackbar({
        open: true,
        message: "Token revoked successfully",
        severity: "success",
      });
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to revoke token",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (value) => {
    if (!value) return " - ";   // evita null / undefined

    const date = new Date(value);
    
    return date.toLocaleString("en-US", {
      year: "2-digit",
      month: "short",
      day: "2-digit",
      hourCycle: "h24",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const columns = [
    { field: "id", headerName: "ID", width: 40 },
    { field: "name", headerName: "Tenant", minWidth: 110, flex: 0.5 },
    { field: "token_label", headerName: "Label", minWidth: 110, flex: 0.5 },
    {
      field: "status",
      headerName: "Status",
      minWidth: 100,
      flex: 0.5,
      renderCell: (params) => renderStatusChip(params.value),
    },
    { field: "max_uses", headerName: "Max Uses", minWidth: 83, flex: 0.3 },
    { field: "used_count", headerName: "Used", minWidth: 55, flex: 0.3 },
    {
      field: "expires_at",
      headerName: "Expires At",
      minWidth: 140,
      flex: 1,
      renderCell: (params) => formatDate(params?.value)
    },
    {
      field: "created_at",
      headerName: "Created At",
      minWidth: 140,
      flex: 1,
      renderCell: (params) => formatDate(params?.value)
    },
    {
      field: "last_used_at",
      headerName: "Last Used At",
      minWidth: 140,
      flex: 1,
      renderCell: (params) => formatDate(params?.value)
    },
    { field: "created_by", headerName: "Created By", minWidth: 140, flex: 0.9 },
    {
      field: "actions",
      headerName: "Actions",
      minWidth: 120,
      flex: 0.8,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Button
          size="small"
          color="error"
          disabled={String(params.row?.status).toLowerCase() !== "active"}
          onClick={() => {
            setSelectedToken(params.row);
            setRevokeOpen(true);
          }}
        >
          Revoke
        </Button>
      ),
    },
  ];

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return {
        name: false,
        created_at: false,
        last_used_at: false,
        created_by: false,
      };
    }

    if (isMdDown) {
      return {
        last_used_at: false,
      };
    }

    return {};
  }, [isMdDown, isSmDown]);

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <Box
        sx={{
          mb: 0.5,
          display: "inline-flex",
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          gap: 13.5,
          flexWrap: "wrap",
          flexDirection: { xs: "column", sm: "row" },
        }}
      >
        <Box>
          <Typography variant="h4" color="#1ba6a6" sx={{ fontWeight: 700 }}>
            Tokens Administrator
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage enrollment tokens for this tenant
          </Typography>
        </Box>

        <Button
          variant="contained"
          onClick={() => setCreateOpen(true)}
          fullWidth={isSmDown}
          sx={{
            bgcolor: "#1ba6a6",
            "&:hover": { bgcolor: "#158d8d" },
            minWidth: { xs: "100%", sm: 170 },
            alignSelf: { xs: "stretch", sm: "center" },
          }}
        >
          + CREATE TOKEN
        </Button>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Total Tokens" value={summary.total} />
          </Grid>

          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard
              title="Active"
              value={summary.active}
              accent="#0f6b72"
            />
          </Grid>

          <Grid size={{ xs: 12, md: 2 }} >
            <SummaryCard sx={{backgroundColor: "#2e8f92"}}
              title="Expired"
              value={summary.expired}
              accent="#b3ac1eff"
            />
          </Grid>

          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard
              title="Revoked"
              value={summary.revoked}
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
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            gap: 2,
            mb: 0,
            flexWrap: "wrap",
          }}
        >
          <TextField
            label="Search by Label"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              width: { xs: "100%", sm: 220 },
            }}
          />
          <TextField
            select
            label="Status"
            size="small"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{
              width: { xs: "100%", sm: 180 },
            }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="expired">Expired</MenuItem>
            <MenuItem value="revoked">Revoked</MenuItem>
          </TextField>

          <Button
            onClick={loadData}
            variant="outlined"
            sx={{
              width: { xs: "100%", sm: "auto" },
              minHeight: 40,
            }}
          >
            REFRESH
          </Button>
        </Box>

        <Box
          sx={{
            height: {
              xs: 420,
              sm: "calc(100vh - 360px)",
              md: "calc(100vh - 340px)",
            },
            width: "100%",
          }}
        >
          <DataGrid
            rows={filteredRows}
            columns={columns}
            columnVisibilityModel={columnVisibilityModel}
            loading={loading}
            disableRowSelectionOnClick
            getRowId={(row) => row.id}
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

              "& .MuiDataGrid-cell": {
                alignItems: "center",
              },

              "& .MuiDataGrid-columnHeaderTitle": {
                fontWeight: 700,
              },

              "& .MuiDataGrid-cellContent": {
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
            }}
          />
        </Box>
      </Paper>

      <CreateTokenDialog
        open={createOpen}
        submitting={submitting}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateToken}
      />

      <RevokeTokenDialog
        open={revokeOpen}
        token={selectedToken}
        submitting={submitting}
        onClose={() => {
          setRevokeOpen(false);
          setSelectedToken(null);
        }}
        onConfirm={handleRevokeToken}
      />

      <TokenCreatedDialog
        open={createdOpen}
        tokenData={createdToken}
        onClose={() => {
          setCreatedOpen(false);
          setCreatedToken(null);
        }}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
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