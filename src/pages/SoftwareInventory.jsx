import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Snackbar,
  Alert,
  Tooltip,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RefreshIcon from "@mui/icons-material/Refresh";

import {
  getSoftwareInventorySummary,
  getSoftwareInventoryRankings,
  getSoftwareInventoryDetail,
} from "../api/inventoryDashboard";

function SummaryCard({ title, value, accent = "#1ba6a6", subtitle }) {
  return (
    <Paper
      sx={{
        p: 2,
        width: "100%",
        minHeight: 132,
        height: "100%",
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Typography
        sx={{
          fontSize: 13,
          color: "text.secondary",
          lineHeight: 1.4,
        }}
      >
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
          <Typography
            sx={{
              fontSize: 12,
              color: "text.secondary",
              mt: 0.75,
              lineHeight: 1.45,
            }}
          >
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}

function SectionCard({ title, children }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        width: "100%",
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
        minHeight: 360,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
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
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}

function RankedBars({
  items,
  valueFormatter = (v) => String(v),
  color = "#1ba6a6",
}) {
  const max = Math.max(...items.map((i) => Number(i.value || 0)), 0);

  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.25,
        alignContent: "start",
        minHeight: 180,
        maxHeight: 260,
        overflowY: "auto",
        pr: 0.5,
      }}
    >
      {items.length === 0 ? (
        <Typography color="text.secondary">No data available.</Typography>
      ) : (
        items.map((item, index) => (
          <Box
            key={`${item.label || item.agentId || "unknown"}-${item.value}-${index}`}
            sx={{ minWidth: 0 }}
          >
            <Box
              sx={{
                mb: 0.5,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 1.5,
                minWidth: 0,
              }}
            >
              <Tooltip title={item.agentId || item.label || ""} arrow>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#16324f",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label || item.agentId || "Unknown"}
                </Typography>
              </Tooltip>

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
                width: "100%",
                borderRadius: 999,
                bgcolor: "rgba(15, 23, 42, 0.08)",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  width: `${max > 0 ? (Number(item.value || 0) / max) * 100 : 0}%`,
                  maxWidth: "100%",
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

export default function SoftwareInventory() {
  const [summary, setSummary] = React.useState(null);
  const [rankings, setRankings] = React.useState(null);
  const [detailRows, setDetailRows] = React.useState([]);
  const [totalRows, setTotalRows] = React.useState(0);

  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [loadingRankings, setLoadingRankings] = React.useState(true);
  const [loadingDetail, setLoadingDetail] = React.useState(true);

  const [search, setSearch] = React.useState("");
  const [source, setSource] = React.useState("");
  const [publisher, setPublisher] = React.useState("");

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
      const res = await getSoftwareInventorySummary();
      setSummary(res || null);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load software summary",
        severity: "error",
      });
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadRankings = async () => {
    try {
      setLoadingRankings(true);
      const res = await getSoftwareInventoryRankings();
      setRankings(res || null);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load software rankings",
        severity: "error",
      });
    } finally {
      setLoadingRankings(false);
    }
  };

  const loadDetail = async () => {
    try {
      setLoadingDetail(true);
      const res = await getSoftwareInventoryDetail({
        search: search || undefined,
        source: source || undefined,
        publisher: publisher || undefined,
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
      });

      setDetailRows(Array.isArray(res?.items) ? res.items : []);
      setTotalRows(Number(res?.total || 0));
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load software detail",
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
  }, [search, source, publisher, paginationModel.page, paginationModel.pageSize]);

  const refreshAll = () => {
    loadSummary();
    loadRankings();
    loadDetail();
  };

  const columns = [
    {
      field: "hostname",
      headerName: "Hostname",
      minWidth: 180,
      flex: 0.8,
      renderCell: (params) => params.row?.hostname || " - ",
    },
    { field: "agentId", headerName: "Agent ID", minWidth: 160, flex: 0.75 },
    { field: "name", headerName: "Application", minWidth: 220, flex: 1 },
    { field: "publisher", headerName: "Publisher", minWidth: 180, flex: 0.8 },
    { field: "source", headerName: "Source", minWidth: 120, flex: 0.45 },
    { field: "installLocation", headerName: "Install Location", minWidth: 220, flex: 1 },
    { field: "packageFamilyName", headerName: "Package Family", minWidth: 180, flex: 0.7 },
    {
      field: "detectedAtUtc",
      headerName: "Detected At",
      minWidth: 150,
      flex: 0.55,
      renderCell: (params) => formatDate(params.value),
    },
  ];

  return (
    <Box sx={{ px: 0, py: 0 }}>
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, lg: 3 }} sx={{ display: "flex" }}>
            <SummaryCard
              title="Devices Reporting Software"
              value={loadingSummary ? "..." : Number(summary?.devicesReportingSoftware || 0)}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, lg: 3 }} sx={{ display: "flex" }}>
            <SummaryCard
              title="Installed Apps"
              value={loadingSummary ? "..." : Number(summary?.installedApps || 0)}
              accent="#0f6b72"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, lg: 3 }} sx={{ display: "flex" }}>
            <SummaryCard
              title="Unique App Names"
              value={loadingSummary ? "..." : Number(summary?.uniqueAppNames || 0)}
              accent="#b45309"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, lg: 3 }} sx={{ display: "flex" }}>
            <SummaryCard
              title="Publishers"
              value={loadingSummary ? "..." : Number(summary?.publishers || 0)}
              accent="#b3261e"
              subtitle={
                loadingSummary
                  ? ""
                  : `${Number(summary?.sources || 0)} software sources detected`
              }
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
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
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
            label="Search apps"
            size="small"
            value={search}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setSearch(e.target.value);
            }}
            fullWidth
          />

          <TextField
            label="Source"
            size="small"
            value={source}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setSource(e.target.value);
            }}
            fullWidth
          />

          <TextField
            label="Publisher"
            size="small"
            value={publisher}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setPublisher(e.target.value);
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

      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: 6, xl: 3 }} sx={{ display: "flex" }}>
            <SectionCard title="Top Installed Apps">
              <RankedBars
                items={rankings?.topInstalledApps || []}
                color="#1ba6a6"
              />
            </SectionCard>
          </Grid>

          <Grid size={{ xs: 12, md: 6, xl: 3 }} sx={{ display: "flex" }}>
            <SectionCard title="Top Publishers">
              <RankedBars
                items={rankings?.topPublishers || []}
                color="#0f6b72"
              />
            </SectionCard>
          </Grid>

          <Grid size={{ xs: 12, md: 6, xl: 3 }} sx={{ display: "flex" }}>
            <SectionCard title="Top Sources">
              <RankedBars
                items={rankings?.topSources || []}
                color="#4f46e5"
              />
            </SectionCard>
          </Grid>

          <Grid size={{ xs: 12, md: 6, xl: 3 }} sx={{ display: "flex" }}>
            <SectionCard title="Apps per Device">
              <RankedBars
                items={rankings?.appsPerDevice || []}
                color="#b3261e"
              />
            </SectionCard>
          </Grid>
        </Grid>
      </Box>

      <SectionCard title="Software Inventory Detail">
        <Box sx={{ height: { xs: 420, md: 560 }, width: "100%" }}>
          <DataGrid
            rows={detailRows}
            columns={columns}
            loading={loadingDetail || loadingRankings}
            disableRowSelectionOnClick
            getRowId={(row) => row.id}
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