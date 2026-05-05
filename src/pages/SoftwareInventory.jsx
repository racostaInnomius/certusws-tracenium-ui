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
  Switch,
  FormControlLabel,
  Chip,
  IconButton,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import {
  getSoftwareInventorySummary,
  getSoftwareInventoryRankings,
  getSoftwareInventoryDetail,
  getSoftwareInventoryHosts,
  getSoftwareInventoryHostApps,
} from "../api/inventoryDashboard";

import { BRAND } from "../theme/brand";
import CompositionBars from "../components/common/CompositionBars";

function SummaryCard({ title, value, accent = BRAND.teal, subtitle }) {
  return (
    <Paper
      sx={{
        p: 2,
        width: "100%",
        minHeight: 132,
        height: "100%",
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.4 }}>
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
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        minHeight: 360,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {title ? (
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
      ) : null}

      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</Box>
    </Paper>
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

  const [hostRows, setHostRows] = React.useState([]);
  const [hostTotalRows, setHostTotalRows] = React.useState(0);

  const [hostAppsRows, setHostAppsRows] = React.useState([]);
  const [hostAppsTotalRows, setHostAppsTotalRows] = React.useState(0);

  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [loadingRankings, setLoadingRankings] = React.useState(true);
  const [loadingDetail, setLoadingDetail] = React.useState(true);
  const [loadingHosts, setLoadingHosts] = React.useState(false);
  const [loadingHostApps, setLoadingHostApps] = React.useState(false);

  const [search, setSearch] = React.useState("");
  const [source, setSource] = React.useState("");
  const [publisher, setPublisher] = React.useState("");

  const [hostSearch, setHostSearch] = React.useState("");
  const [hostAppsSearch, setHostAppsSearch] = React.useState("");

  const [appLevelDetail, setAppLevelDetail] = React.useState(false);
  const [selectedHost, setSelectedHost] = React.useState(null);

  const [paginationModel, setPaginationModel] = React.useState({
    page: 0,
    pageSize: 10,
  });

  const [hostPaginationModel, setHostPaginationModel] = React.useState({
    page: 0,
    pageSize: 10,
  });

  const [hostAppsPaginationModel, setHostAppsPaginationModel] = React.useState({
    page: 0,
    pageSize: 10,
  });
  // new change
  const [hostSortModel, setHostSortModel] = React.useState([
    { field: "hostname", sort: "asc" },
  ]);

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

  const loadHosts = async () => {
    try {
      setLoadingHosts(true);

      const currentSort = hostSortModel?.[0] || {
        field: "hostname",
        sort: "asc",
      };

      const res = await getSoftwareInventoryHosts({
        search: hostSearch || undefined,
        page: hostPaginationModel.page + 1,
        pageSize: hostPaginationModel.pageSize,
        sortBy: currentSort.field,
        sortDir: currentSort.sort || "asc",
      });

      setHostRows(Array.isArray(res?.items) ? res.items : []);
      setHostTotalRows(Number(res?.total || 0));
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load software hosts",
        severity: "error",
      });
    } finally {
      setLoadingHosts(false);
    }
  };

  const loadHostApps = async () => {
    if (!selectedHost?.agentId) return;

    try {
      setLoadingHostApps(true);
      const res = await getSoftwareInventoryHostApps(selectedHost.agentId, {
        search: hostAppsSearch || undefined,
        source: source || undefined,
        publisher: publisher || undefined,
        page: hostAppsPaginationModel.page + 1,
        pageSize: hostAppsPaginationModel.pageSize,
      });

      setHostAppsRows(Array.isArray(res?.items) ? res.items : []);
      setHostAppsTotalRows(Number(res?.total || 0));
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to load host software detail",
        severity: "error",
      });
    } finally {
      setLoadingHostApps(false);
    }
  };

  React.useEffect(() => {
    loadSummary();
    loadRankings();
  }, []);

  React.useEffect(() => {
    if (!appLevelDetail) return;
    loadDetail();
  }, [appLevelDetail, search, source, publisher, paginationModel.page, paginationModel.pageSize]);

  React.useEffect(() => {
    if (appLevelDetail || selectedHost) return;
    loadHosts();
  }, [
    appLevelDetail,
    selectedHost,
    hostSearch,
    hostPaginationModel.page,
    hostPaginationModel.pageSize,
    hostSortModel,
  ]);

  React.useEffect(() => {
    if (!selectedHost || appLevelDetail) return;
    loadHostApps();
  }, [
    selectedHost,
    appLevelDetail,
    hostAppsSearch,
    source,
    publisher,
    hostAppsPaginationModel.page,
    hostAppsPaginationModel.pageSize,
  ]);

  const refreshAll = () => {
    loadSummary();
    loadRankings();

    if (appLevelDetail) {
      loadDetail();
    } else if (selectedHost) {
      loadHostApps();
    } else {
      loadHosts();
    }
  };

  const appColumns = [
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

  const hostAppColumns = appColumns.filter(
    (column) => column.field !== "hostname" && column.field !== "agentId"
  );

  const hostColumns = [
    {
      field: "hostname",
      headerName: "Hostname",
      minWidth: 220,
      flex: 1,
      renderCell: (params) => params.row?.hostname || " - ",
    },
    { field: "agentId", headerName: "Agent ID", minWidth: 220, flex: 1 },
    { field: "installedApps", headerName: "Installed Apps", minWidth: 140, flex: 0.5 },
    { field: "uniqueAppNames", headerName: "Unique App Names", minWidth: 160, flex: 0.6 },
    { field: "publishers", headerName: "Publishers", minWidth: 120, flex: 0.5 },
  ];

  const TraceniumSwitch = (props) => (
    <Switch
      {...props}
      disableRipple
      sx={{
        width: 46,
        height: 26,
        padding: 0,

        "& .MuiSwitch-switchBase": {
          padding: 0,
          margin: "3px",
          transitionDuration: "300ms",

          "&.Mui-checked": {
            transform: "translateX(20px)",
            color: "#fff",

            "& + .MuiSwitch-track": {
              backgroundColor: BRAND.teal,
              opacity: 1,
            },
          },
        },

        "& .MuiSwitch-thumb": {
          boxSizing: "border-box",
          width: 20,
          height: 20,
          boxShadow: "0 2px 6px rgba(0,0,0,0.25)", // efecto premium
        },

        "& .MuiSwitch-track": {
          borderRadius: 26 / 2,
          backgroundColor: "rgba(0,0,0,0.25)",
          opacity: 1,
          transition: "all 0.3s ease",
        },
      }}
    />
  );

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
              accent={BRAND.tealText}
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
              accent={BRAND.alert.error}
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
            label={appLevelDetail ? "Search apps" : selectedHost ? "Search apps for selected host" : "Search hosts"}
            size="small"
            value={appLevelDetail ? search : selectedHost ? hostAppsSearch : hostSearch}
            onChange={(e) => {
              if (appLevelDetail) {
                setPaginationModel((prev) => ({ ...prev, page: 0 }));
                setSearch(e.target.value);
                return;
              }

              if (selectedHost) {
                setHostAppsPaginationModel((prev) => ({ ...prev, page: 0 }));
                setHostAppsSearch(e.target.value);
                return;
              }

              setHostPaginationModel((prev) => ({ ...prev, page: 0 }));
              setHostSearch(e.target.value);
            }}
            fullWidth
          />

          <TextField
            label="Source"
            size="small"
            value={source}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setHostAppsPaginationModel((prev) => ({ ...prev, page: 0 }));
              setSource(e.target.value);
            }}
            fullWidth
            disabled={!appLevelDetail && !selectedHost}
          />

          <TextField
            label="Publisher"
            size="small"
            value={publisher}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setHostAppsPaginationModel((prev) => ({ ...prev, page: 0 }));
              setPublisher(e.target.value);
            }}
            fullWidth
            disabled={!appLevelDetail && !selectedHost}
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
          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Top installed apps"
                items={(rankings?.topInstalledApps || []).map((item) => ({
                  ...item,
                  color: BRAND.teal,
                }))}
                totalLabel="installs"
                emptyLabel="No installed apps data"
                minHeight={260}
                maxItems={6}
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Top publishers"
                items={(rankings?.topPublishers || []).map((item) => ({
                  ...item,
                  color: BRAND.teal,
                }))}
                totalLabel="apps"
                emptyLabel="No publisher data"
                minHeight={260}
                maxItems={6}
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Top sources"
                items={(rankings?.topSources || []).map((item) => ({
                  ...item,
                  color: BRAND.dark,
                }))}
                totalLabel="apps"
                emptyLabel="No source data"
                minHeight={260}
                maxItems={6}
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Apps per device"
                items={(rankings?.appsPerDevice || []).map((item) => ({
                  ...item,
                  color: BRAND.alert.error,
                }))}
                totalLabel="apps"
                emptyLabel="No device app data"
                minHeight={260}
                maxItems={6}
              />
            </Box>
          </Grid>
        </Grid>
      </Box>

      <SectionCard title="">
        <Box
          sx={{
            mb: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "center" },
            gap: 2,
            flexWrap: "wrap",
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {selectedHost && !appLevelDetail && (
              <IconButton
                onClick={() => {
                  setSelectedHost(null);
                  setHostAppsSearch("");
                  setHostAppsPaginationModel({ page: 0, pageSize: 10 });
                }}
                sx={{
                  border: `1px solid ${BRAND.border}`,
                  bgcolor: "white",
                }}
              >
                <ArrowBackIcon />
              </IconButton>
            )}

            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {appLevelDetail
                  ? "Software Inventory Detail"
                  : selectedHost
                  ? "Host Software Detail"
                  : "Software by Host"}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                {appLevelDetail
                  ? "Application-level view across all devices"
                  : selectedHost
                  ? `${selectedHost.hostname || selectedHost.agentId} software inventory`
                  : "Click a host to review its installed applications"}
              </Typography>
            </Box>

            {selectedHost && !appLevelDetail && (
              <Chip
                label={selectedHost.hostname || selectedHost.agentId}
                size="small"
                sx={{
                  bgcolor: "rgba(27,166,166,0.12)",
                  color: BRAND.tealText,
                  fontWeight: 700,
                }}
              />
            )}
          </Box>

          <FormControlLabel
            control={
              <TraceniumSwitch
                checked={appLevelDetail}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAppLevelDetail(checked);
                  setSelectedHost(null);
                  setSearch("");
                  setHostSearch("");
                  setHostAppsSearch("");
                  setSource("");
                  setPublisher("");
                  setPaginationModel({ page: 0, pageSize: 10 });
                  setHostPaginationModel({ page: 0, pageSize: 10 });
                  setHostAppsPaginationModel({ page: 0, pageSize: 10 });
                }}
              />
            }
            label="App-level detail"
          />
        </Box>

        {!appLevelDetail && !selectedHost && (
          <Box sx={{ height: { xs: 420, md: 560 }, width: "100%" }}>
            <DataGrid
              rows={hostRows}
              columns={hostColumns}
              loading={loadingHosts}
              disableRowSelectionOnClick
              getRowId={(row) => row.agentId}
              rowCount={hostTotalRows}
              paginationMode="server"
              sortingMode="server"
              sortModel={hostSortModel}
              onSortModelChange={(model) => {
                const nextModel =
                  model.length > 0 ? model : [{ field: "hostname", sort: "asc" }];

                setHostPaginationModel((prev) => ({ ...prev, page: 0 }));
                setHostSortModel(nextModel);
              }}
              paginationModel={hostPaginationModel}
              onPaginationModelChange={setHostPaginationModel}
              pageSizeOptions={[10, 25, 50]}
              onRowClick={(params) => {
                setSelectedHost(params.row);
                setHostAppsSearch("");
                setHostAppsPaginationModel({ page: 0, pageSize: 10 });
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
                "& .MuiDataGrid-row": {
                  cursor: "pointer",
                },
                "& .MuiDataGrid-row:hover": {
                  backgroundColor: "rgba(27,166,166,0.08)",
                },
                "& .MuiDataGrid-row.Mui-selected": {
                  backgroundColor: "rgba(27,166,166,0.16) !important",
                },
                "& .MuiDataGrid-row.Mui-selected:hover": {
                  backgroundColor: "rgba(27,166,166,0.22) !important",
                },
                "& .MuiLinearProgress-root": {
                  backgroundColor: "rgba(27,166,166,0.15)",
                },
                "& .MuiLinearProgress-bar": {
                  backgroundColor: BRAND.teal,  
                },
              }}
            />
          </Box>
        )}

        {!appLevelDetail && selectedHost && (
          <Box sx={{ height: { xs: 420, md: 560 }, width: "100%" }}>
            <DataGrid
              rows={hostAppsRows}
              columns={hostAppColumns}
              loading={loadingHostApps}
              disableRowSelectionOnClick
              getRowId={(row) => row.id}
              rowCount={hostAppsTotalRows}
              paginationMode="server"
              paginationModel={hostAppsPaginationModel}
              onPaginationModelChange={setHostAppsPaginationModel}
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
                "& .MuiLinearProgress-root": {
                  backgroundColor: "rgba(27,166,166,0.15)",
                },
                "& .MuiLinearProgress-bar": {
                  backgroundColor: BRAND.teal,
                },
              }}
            />
          </Box>
        )}

        {appLevelDetail && (
          <Box sx={{ height: { xs: 420, md: 560 }, width: "100%" }}>
            <DataGrid
              rows={detailRows}
              columns={appColumns}
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
                "& .MuiLinearProgress-root": {
                  backgroundColor: "rgba(27,166,166,0.15)",
                },
                "& .MuiLinearProgress-bar": {
                  backgroundColor: BRAND.teal,
                },
              }}
            />
          </Box>
        )}
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