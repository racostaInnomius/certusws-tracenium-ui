import * as React from "react";
import Grid from "@mui/material/Grid";
import BrandSnackbar from "../components/common/BrandSnackbar";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Snackbar,
  Alert,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RefreshIcon from "@mui/icons-material/Refresh";

import {
  getHardwareInventorySummary,
  getHardwareInventoryRankings,
  getHardwareInventoryDetail,
} from "../api/inventoryDashboard";

import { BRAND } from "../theme/brand";

function SummaryCard({ title, value, accent = BRAND.teal, subtitle }) {
  return (
    <Paper
      sx={{
        p: 2,
        minHeight: 120,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        {title}
      </Typography>

      <Box>
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

        {subtitle ? (
          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.75 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}

function SectionCard({ title, children, action }) {
  return (
    <Paper
        elevation={0}
        sx={{
            p: 2,
            borderRadius: 3,
            border: `1px solid ${BRAND.border}`,
            boxShadow: BRAND.shadow,
            minHeight: 320,
            height: "auto",
            display: "flex",
            flexDirection: "column",
        }}
    >
      <Box
        sx={{
          mb: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

function RankedBars({ items, valueFormatter = (v) => String(v), color = BRAND.teal }) {
  const max = Math.max(...items.map((i) => Number(i.value || 0)), 0);

  return (
    <Box sx={{ display: "grid", gap: 1.25 }}>
      {items.length === 0 ? (
        <Typography color="text.secondary">No data available.</Typography>
      ) : (
        items.map((item) => (
          <Box key={`${item.label}-${item.value}`}>
            <Box
              sx={{
                mb: 0.5,
                display: "flex",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: BRAND.dark,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </Typography>

              <Typography
                sx={{
                  fontSize: 13,
                  color: "text.secondary",
                  flexShrink: 0,
                }}
              >
                {valueFormatter(Number(item.value || 0))}
              </Typography>
            </Box>

            <Box
              sx={{
                height: 10,
                borderRadius: 999,
                bgcolor: "rgba(15, 23, 42, 0.08)",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  width: `${max > 0 ? (Number(item.value || 0) / max) * 100 : 0}%`,
                  height: "100%",
                  borderRadius: 999,
                  bgcolor: color,
                }}
              />
            </Box>
          </Box>
        ))
      )}
    </Box>
  );
}

function formatBytesToGb(bytes) {
  if (!bytes) return "0 GB";
  return `${(Number(bytes) / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return " - ";
  return `${Number(value).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return " - ";

  return new Date(value).toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h24",
  });
}

export default function HardwareInventory() {
  const [summary, setSummary] = React.useState(null);
  const [rankings, setRankings] = React.useState(null);
  const [detailRows, setDetailRows] = React.useState([]);
  const [totalRows, setTotalRows] = React.useState(0);

  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [loadingRankings, setLoadingRankings] = React.useState(true);
  const [loadingDetail, setLoadingDetail] = React.useState(true);

  const [search, setSearch] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [manufacturer, setManufacturer] = React.useState("");

  const [paginationModel, setPaginationModel] = React.useState({
    page: 0,
    pageSize: 10,
  });

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const loadSummary = async () => {
    try {
      setLoadingSummary(true);
      const res = await getHardwareInventorySummary();
      setSummary(res || null);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load hardware summary",
        severity: "error",
      });
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadRankings = async () => {
    try {
      setLoadingRankings(true);
      const res = await getHardwareInventoryRankings();
      setRankings(res || null);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load hardware rankings",
        severity: "error",
      });
    } finally {
      setLoadingRankings(false);
    }
  };

  const loadDetail = async () => {
    try {
      setLoadingDetail(true);
      const res = await getHardwareInventoryDetail({
        search: search || undefined,
        platform: platform || undefined,
        manufacturer: manufacturer || undefined,
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
      });

      setDetailRows(Array.isArray(res?.items) ? res.items : []);
      setTotalRows(Number(res?.total || 0));
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load hardware detail",
        severity: "error",
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  React.useEffect(() => {
    loadSummary();
    loadRankings();
  }, []);

  React.useEffect(() => {
    loadDetail();
  }, [search, platform, manufacturer, paginationModel.page, paginationModel.pageSize]);

  const refreshAll = () => {
    loadSummary();
    loadRankings();
    loadDetail();
  };

  const columns = [
    { field: "hostname", headerName: "Hostname", minWidth: 180, flex: 0.9, renderCell: (params) => params.row?.hostname || params.row?.agentId || " - ", },
    { field: "platform", headerName: "Platform", minWidth: 100, flex: 0.45 },
    { field: "distro", headerName: "OS", minWidth: 150, flex: 0.7 },
    { field: "manufacturer", headerName: "Manufacturer", minWidth: 140, flex: 0.7 },
    { field: "model", headerName: "Model", minWidth: 160, flex: 0.8 },
    { field: "cpuBrand", headerName: "CPU", minWidth: 180, flex: 0.9 },
    { field: "physicalCores", headerName: "Cores", minWidth: 90, flex: 0.35 },
    {
      field: "totalMemoryBytes",
      headerName: "Memory",
      minWidth: 110,
      flex: 0.45,
      renderCell: (params) => formatBytesToGb(params.value),
    },
    {
      field: "diskUsagePct",
      headerName: "Disk Usage",
      minWidth: 110,
      flex: 0.45,
      renderCell: (params) => formatPercent(params.value),
    },
    {
      field: "batteryPercent",
      headerName: "Battery",
      minWidth: 100,
      flex: 0.4,
      renderCell: (params) => formatPercent(params.value),
    },
    {
      field: "collectedAtUtc",
      headerName: "Collected At",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
  ];

  return (
    <Box sx={{ px: 0, py: 0 }}>
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, lg: 6 }}>
            <SummaryCard
              title="Devices"
              value={loadingSummary ? "..." : Number(summary?.devices || 0)}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, lg: 6 }}>
            <SummaryCard
              title="Avg Memory"
              value={loadingSummary ? "..." : `${Number(summary?.avgMemoryGb || 0).toFixed(1)} GB`}
              accent={BRAND.tealText}
            />
          </Grid>

        </Grid>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadow,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "2fr 1fr 1fr auto",
            },
          }}
        >
          <TextField
            label="Search devices"
            size="small"
            value={search}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setSearch(e.target.value);
            }}
            fullWidth
          />

          <TextField
            label="Platform"
            size="small"
            value={platform}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setPlatform(e.target.value);
            }}
            fullWidth
          />

          <TextField
            label="Manufacturer"
            size="small"
            value={manufacturer}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setManufacturer(e.target.value);
            }}
            fullWidth
          />

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={refreshAll}
            sx={{ minHeight: 40 }}
          >
            Refresh
          </Button>
        </Box>
      </Paper>

      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, lg: 3 }}>
            <SectionCard title="Top Manufacturers">
              <RankedBars
                items={rankings?.topManufacturers || []}
                color={BRAND.teal}
              />
            </SectionCard>
          </Grid>

          <Grid size={{ xs: 12, lg: 3 }}>
            <SectionCard title="Top CPU Models">
              <RankedBars
                items={rankings?.topCpuModels || []}
                color={BRAND.tealText}
              />
            </SectionCard>
          </Grid>

          <Grid size={{ xs: 12, lg: 3 }}>
            <SectionCard title="Top Platforms">
              <RankedBars
                items={rankings?.topPlatforms || []}
                color="#4f46e5"
              />
            </SectionCard>
          </Grid>

          <Grid size={{ xs: 12, lg: 3 }}>
            <SectionCard title="Highest Disk Usage">
              <RankedBars
                items={rankings?.highestDiskUsage || []}
                valueFormatter={(v) => `${Number(v).toFixed(1)}%`}
                color="#b45309"
              />
            </SectionCard>
          </Grid>
        </Grid>
      </Box>

      <SectionCard title="Hardware Inventory Detail">
        <Box sx={{ height: { xs: 420, md: 560 }, width: "100%" }}>
          <DataGrid
            rows={detailRows}
            columns={columns}
            loading={loadingDetail || loadingRankings}
            disableRowSelectionOnClick
            getRowId={(row) => row.agentId}
            rowCount={totalRows}
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[10, 25, 50]}
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
      </SectionCard>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}