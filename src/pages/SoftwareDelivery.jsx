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
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { DataGrid } from "@mui/x-data-grid";

import { useAuthContext } from "../auth/AuthContext";
import {
  listSoftwareDelivery,
  createSoftwareDelivery,
  updateSoftwareDelivery,
  deleteSoftwareDelivery,
  resolveSoftwareDeliveryDownload,
} from "../api/softwareDelivery";

import SoftwarePackageDialog from "../components/software-delivery/SoftwarePackageDialog";
import DeleteSoftwarePackageDialog from "../components/software-delivery/DeleteSoftwarePackageDialog";

const PLATFORM_OPTIONS = ["all", "windows", "macos", "linux"];
const ARCH_OPTIONS = ["all", "x64", "arm64", "x86"];
const FORMAT_OPTIONS = ["all", "exe", "msi", "pkg", "dmg", "deb", "rpm", "tar.gz"];
const CHANNEL_OPTIONS = ["all", "stable", "beta", "rc"];
const ACTIVE_OPTIONS = ["all", "true", "false"];

function SummaryCard({ title, value, accent = "#1ba6a6" }) {
  return (
    <Paper
      sx={{
        p: 2,
        height: "75%",
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

function renderActiveChip(value) {
  return value ? (
    <Chip
      label="Active"
      size="small"
      sx={{
        bgcolor: "rgba(27,166,166,0.12)",
        color: "#0f6b72",
        fontWeight: 700,
      }}
    />
  ) : (
    <Chip
      label="Inactive"
      size="small"
      sx={{
        bgcolor: "rgba(211,47,47,0.12)",
        color: "#b3261e",
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

export default function SoftwareDelivery() {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();

  const tenantRole = auth?.tenantMember?.role;
  const isActiveMember = auth?.tenantMember?.isActive === true;

  const canEditSoftwareDelivery =
    isActiveMember && String(tenantRole ?? "") === "ADMIN";

  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const [search, setSearch] = React.useState("");
  const [platform, setPlatform] = React.useState("all");
  const [arch, setArch] = React.useState("all");
  const [format, setFormat] = React.useState("all");
  const [channel, setChannel] = React.useState("all");
  const [isActiveFilter, setIsActiveFilter] = React.useState("all");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState("create");
  const [editingItem, setEditingItem] = React.useState(null);

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deletingItem, setDeletingItem] = React.useState(null);

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const loadData = async () => {
    try {
      setLoading(true);

      const response = await listSoftwareDelivery({
        search: search || undefined,
        platform: platform !== "all" ? platform : undefined,
        arch: arch !== "all" ? arch : undefined,
        format: format !== "all" ? format : undefined,
        channel: channel !== "all" ? channel : undefined,
        isActive: isActiveFilter !== "all" ? isActiveFilter : undefined,
      });

      setRows(Array.isArray(response?.items) ? response.items : []);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load software delivery packages",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadData();
  }, [search, platform, arch, format, channel, isActiveFilter]);

  const summary = React.useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => Boolean(r.isActive)).length;
    const platforms = new Set(rows.map((r) => r.platform).filter(Boolean)).size;

    return { total, active, platforms };
  }, [rows]);

  const openCreateDialog = () => {
    setDialogMode("create");
    setEditingItem(null);
    setDialogOpen(true);
  };

  const openEditDialog = (row) => {
    setDialogMode("edit");
    setEditingItem(row);
    setDialogOpen(true);
  };

  const handleSave = async (payload) => {
    try {
      setSubmitting(true);

      if (dialogMode === "edit" && editingItem?.id) {
        await updateSoftwareDelivery(editingItem.id, payload);
        setSnackbar({
          open: true,
          message: "Software package updated successfully",
          severity: "success",
        });
      } else {
        await createSoftwareDelivery(payload);
        setSnackbar({
          open: true,
          message: "Software package created successfully",
          severity: "success",
        });
      }

      setDialogOpen(false);
      await loadData();
    } catch (e) {
      console.error(e);

      const errorMessage = String(e?.message || "");
      const message = errorMessage.includes("SOFTWARE_DELIVERY_DUPLICATE_VARIANT")
        ? "A package with the same platform, architecture, format, version and channel already exists"
        : "Failed to save software package";

      setSnackbar({
        open: true,
        message,
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem?.id) return;

    try {
      setSubmitting(true);
      await deleteSoftwareDelivery(deletingItem.id);

      setDeleteOpen(false);
      setDeletingItem(null);

      setSnackbar({
        open: true,
        message: "Software package deleted successfully",
        severity: "success",
      });

      await loadData();
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to delete software package",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (row) => {
    try {
      const res = await resolveSoftwareDeliveryDownload(row.downloadPath);
      if (res?.downloadUrl) {
        window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
        return;
      }

      throw new Error("Missing downloadUrl");
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to resolve download link",
        severity: "error",
      });
    }
  };

  const columns = [
    { field: "name", headerName: "Name", minWidth: 220, flex: 1.1 },
    { field: "platform", headerName: "Platform", minWidth: 100, flex: 0.5 },
    { field: "arch", headerName: "Arch", minWidth: 100, flex: 0.45 },
    { field: "format", headerName: "Format", minWidth: 100, flex: 0.45 },
    { field: "version", headerName: "Version", minWidth: 100, flex: 0.45 },
    { field: "channel", headerName: "Channel", minWidth: 100, flex: 0.45 },
    {
      field: "isActive",
      headerName: "Status",
      minWidth: 110,
      flex: 0.5,
      renderCell: (params) => renderActiveChip(params.value),
    },
    {
      field: "createdAt",
      headerName: "Created At",
      minWidth: 150,
      flex: 0.7,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "download",
      headerName: "Download",
      minWidth: 140,
      flex: 0.65,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Button
          size="small"
          startIcon={<DownloadOutlinedIcon />}
          onClick={() => handleDownload(params.row)}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          Download
        </Button>
      ),
    },
    ...(canEditSoftwareDelivery
      ? [
          {
            field: "actions",
            headerName: "Actions",
            minWidth: 170,
            flex: 0.9,
            sortable: false,
            filterable: false,
            renderCell: (params) => (
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button size="small" onClick={() => openEditDialog(params.row)}>
                  Edit
                </Button>

                <Button
                  size="small"
                  color="error"
                  onClick={() => {
                    setDeletingItem(params.row);
                    setDeleteOpen(true);
                  }}
                >
                  Delete
                </Button>
              </Box>
            ),
          },
        ]
      : []),
  ];

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return {
        version: false,
        channel: false,
        createdAt: false,
      };
    }

    if (isMdDown) {
      return {
        createdAt: false,
      };
    }

    return {};
  }, [isMdDown, isSmDown]);

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
            Software Delivery
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage supported Tracenium Agent packages and downloads
          </Typography>
        </Box>

        {canEditSoftwareDelivery && (
          <Button
            variant="contained"
            onClick={openCreateDialog}
            fullWidth={isSmDown}
            sx={{
              bgcolor: "#1ba6a6",
              "&:hover": { bgcolor: "#158d8d" },
              minWidth: { xs: "100%", sm: 170 },
              alignSelf: { xs: "stretch", sm: "center" },
            }}
          >
            + ADD PACKAGE
          </Button>
        )}
      </Box>

      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard title="Total Packages" value={summary.total} />
          </Grid>

          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard
              title="Platforms"
              value={summary.platforms}
              accent="#0f6b72"
            />
          </Grid>

          <Grid size={{ xs: 12, md: 2 }}>
            <SummaryCard
              title="Active"
              value={summary.active}
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
            display: "grid",
            gap: 2,
            mb: 1.5,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(6, minmax(0, 1fr))",
            },
          }}
        >
          <TextField
            label="Search"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
          />

          <TextField
            select
            label="Platform"
            size="small"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            fullWidth
          >
            {PLATFORM_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Architecture"
            size="small"
            value={arch}
            onChange={(e) => setArch(e.target.value)}
            fullWidth
          >
            {ARCH_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Format"
            size="small"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            fullWidth
          >
            {FORMAT_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Channel"
            size="small"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            fullWidth
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Status"
            size="small"
            value={isActiveFilter}
            onChange={(e) => setIsActiveFilter(e.target.value)}
            fullWidth
          >
            {ACTIVE_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Box
          sx={{
            height: {
              xs: 480,
              sm: "calc(100vh - 370px)",
              md: "calc(100vh - 350px)",
            },
            minHeight: 480,
            width: "100%",
          }}
        >
          <DataGrid
            rows={rows}
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
              "& .MuiDataGrid-columnHeaderTitle": {
                fontWeight: 700,
              },
            }}
          />
        </Box>
      </Paper>

      <SoftwarePackageDialog
        open={dialogOpen}
        mode={dialogMode}
        item={editingItem}
        submitting={submitting}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSave}
      />

      <DeleteSoftwarePackageDialog
        open={deleteOpen}
        item={deletingItem}
        submitting={submitting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
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