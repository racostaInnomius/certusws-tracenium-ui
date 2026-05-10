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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Stack,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import CloseIcon from "@mui/icons-material/Close";

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

function normalizeRankingRows(items = [], fallbackColor = BRAND.teal) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => Number(item?.value || 0) > 0)
    .map((item, index) => ({
      ...item,
      id: `${String(item?.label || "item")}-${index}`,
      rank: index + 1,
      label: item?.label || "Unknown",
      value: Number(item?.value || 0),
      color: item?.color || fallbackColor,
    }))
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
}

function RankingViewAllButton({ disabled = false, onClick }) {
  return (
    <Tooltip title={disabled ? "No ranking data available" : "View complete ranking"}>
      <span>
        <Button
          size="small"
          variant="text"
          startIcon={<FormatListBulletedIcon sx={{ fontSize: 16 }} />}
          disabled={disabled}
          onClick={onClick}
          sx={{
            px: 1,
            py: 0.25,
            minWidth: "auto",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 800,
            color: BRAND.tealText,
            whiteSpace: "nowrap",
            "&:hover": {
              bgcolor: BRAND.tealSoft,
            },
          }}
        >
          View all
        </Button>
      </span>
    </Tooltip>
  );
}

export default function SoftwareInventory() {
  const theme = useTheme();
  const rankingDialogFullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [summary, setSummary] = React.useState(null);
  const [rankings, setRankings] = React.useState(null);
  const [rankingDialog, setRankingDialog] = React.useState(null);
  const [rankingDialogSearch, setRankingDialogSearch] = React.useState("");

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

  const topInstalledAppsRows = React.useMemo(
    () => normalizeRankingRows(rankings?.topInstalledApps, BRAND.teal),
    [rankings?.topInstalledApps]
  );

  const topPublishersRows = React.useMemo(
    () => normalizeRankingRows(rankings?.topPublishers, BRAND.teal),
    [rankings?.topPublishers]
  );

  const topSourcesRows = React.useMemo(
    () => normalizeRankingRows(rankings?.topSources, BRAND.dark),
    [rankings?.topSources]
  );

  const appsPerDeviceRows = React.useMemo(
    () => normalizeRankingRows(rankings?.appsPerDevice, BRAND.alert.error),
    [rankings?.appsPerDevice]
  );

  const openRankingDialog = React.useCallback((config) => {
    setRankingDialog(config);
    setRankingDialogSearch("");
  }, []);

  const closeRankingDialog = React.useCallback(() => {
    setRankingDialog(null);
    setRankingDialogSearch("");
  }, []);

  const rankingDialogRows = React.useMemo(() => {
    const rows = Array.isArray(rankingDialog?.items) ? rankingDialog.items : [];
    const query = rankingDialogSearch.trim().toLowerCase();

    if (!query) return rows;

    return rows.filter((row) => {
      const label = String(row?.label || "").toLowerCase();
      const sub = String(row?.sub || "").toLowerCase();
      return label.includes(query) || sub.includes(query);
    });
  }, [rankingDialog?.items, rankingDialogSearch]);

  const rankingDialogTotal = React.useMemo(
    () => rankingDialogRows.reduce((acc, row) => acc + Number(row?.value || 0), 0),
    [rankingDialogRows]
  );

  const rankingDialogColumns = React.useMemo(
    () => [
      {
        field: "rank",
        headerName: "#",
        width: 74,
        sortable: false,
        align: "center",
        headerAlign: "center",
        renderCell: (params) => (
          <Chip
            label={params.value}
            size="small"
            sx={{
              width: 34,
              height: 24,
              fontWeight: 800,
              bgcolor: BRAND.tealSoft,
              color: BRAND.tealText,
            }}
          />
        ),
      },
      {
        field: "label",
        headerName: rankingDialog?.labelHeader || "Name",
        minWidth: 220,
        flex: 1,
        renderCell: (params) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                color: BRAND.dark,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={params.value}
            >
              {params.value || "Unknown"}
            </Typography>
            {params.row?.sub ? (
              <Typography
                sx={{
                  fontSize: 11,
                  color: "text.secondary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={params.row.sub}
              >
                {params.row.sub}
              </Typography>
            ) : null}
          </Box>
        ),
      },
      {
        field: "value",
        headerName: rankingDialog?.valueHeader || "Total",
        width: 130,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => (
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: BRAND.dark }}>
            {Number(params.value || 0)}
          </Typography>
        ),
      },
    ],
    [rankingDialog?.labelHeader, rankingDialog?.valueHeader]
  );

  const renderViewAllButton = React.useCallback(
    (config) => {
      const itemsCount = Array.isArray(config.items) ? config.items.length : 0;

      if (itemsCount <= 5) {
        return null;
      }

      return (
        <RankingViewAllButton
          disabled={itemsCount === 0}
          onClick={() => openRankingDialog(config)}
        />
      );
    },
    [openRankingDialog]
  );

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

      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Top installed apps"
                items={topInstalledAppsRows}
                totalLabel="installs"
                emptyLabel="No installed apps data"
                minHeight={260}
                maxItems={5}
                headerExtra={renderViewAllButton({
                  title: "Top installed apps",
                  subtitle: "Complete application ranking by detected installs.",
                  items: topInstalledAppsRows,
                  totalLabel: "installs",
                  labelHeader: "Application",
                  valueHeader: "Installs",
                })}
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Top publishers"
                items={topPublishersRows}
                totalLabel="apps"
                emptyLabel="No publisher data"
                minHeight={260}
                maxItems={5}
                headerExtra={renderViewAllButton({
                  title: "Top publishers",
                  subtitle: "Complete publisher ranking by detected applications.",
                  items: topPublishersRows,
                  totalLabel: "apps",
                  labelHeader: "Publisher",
                  valueHeader: "Apps",
                })}
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Top sources"
                items={topSourcesRows}
                totalLabel="apps"
                emptyLabel="No source data"
                minHeight={260}
                maxItems={5}
                headerExtra={renderViewAllButton({
                  title: "Top sources",
                  subtitle: "Complete software source ranking.",
                  items: topSourcesRows,
                  totalLabel: "apps",
                  labelHeader: "Source",
                  valueHeader: "Apps",
                })}
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Apps per device"
                items={appsPerDeviceRows}
                totalLabel="apps"
                emptyLabel="No device app data"
                minHeight={260}
                maxItems={5}
                headerExtra={renderViewAllButton({
                  title: "Apps per device",
                  subtitle: "Complete device ranking by installed applications.",
                  items: appsPerDeviceRows,
                  totalLabel: "apps",
                  labelHeader: "Device",
                  valueHeader: "Apps",
                })}
              />
            </Box>
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

      <Dialog
        open={Boolean(rankingDialog)}
        onClose={closeRankingDialog}
        fullWidth
        maxWidth="md"
        fullScreen={rankingDialogFullScreen}
        PaperProps={{
          sx: {
            borderRadius: { xs: 0, sm: 3 },
            border: { xs: "none", sm: `1px solid ${BRAND.border}` },
            boxShadow: BRAND.shadow,
            overflow: "hidden",
          },
        }}
      >
        <DialogTitle
          sx={{
            p: { xs: 2, sm: 2.5 },
            pb: 1.5,
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "stretch", sm: "flex-start" }}
            justifyContent="space-between"
            spacing={2}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND.dark }}>
                {rankingDialog?.title || "Ranking"}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
                {rankingDialog?.subtitle || "Complete ranking list"}
              </Typography>
            </Box>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent={{ xs: "space-between", sm: "flex-end" }}
              sx={{ flexShrink: 0 }}
            >
              <Chip
                size="small"
                label={`${rankingDialogRows.length} rows`}
                sx={{
                  bgcolor: BRAND.tealSoft,
                  color: BRAND.tealText,
                  fontWeight: 800,
                }}
              />
              <Chip
                size="small"
                label={`${rankingDialogTotal} ${rankingDialog?.totalLabel || "items"}`}
                sx={{
                  bgcolor: "rgba(15, 23, 42, 0.06)",
                  color: BRAND.dark,
                  fontWeight: 800,
                }}
              />
              <IconButton
                aria-label="Close ranking dialog"
                onClick={closeRankingDialog}
                sx={{
                  border: `1px solid ${BRAND.border}`,
                  bgcolor: "white",
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </DialogTitle>

        <Divider />

        <DialogContent
          sx={{
            p: { xs: 2, sm: 2.5 },
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <TextField
            label="Search ranking"
            size="small"
            value={rankingDialogSearch}
            onChange={(e) => setRankingDialogSearch(e.target.value)}
            fullWidth
            autoFocus={!rankingDialogFullScreen}
          />

          <Box sx={{ height: { xs: "calc(100vh - 236px)", sm: 460 }, width: "100%" }}>
            <DataGrid
              rows={rankingDialogRows}
              columns={rankingDialogColumns}
              disableRowSelectionOnClick
              getRowId={(row) => row.id}
              pageSizeOptions={[10, 25, 50, 100]}
              initialState={{
                pagination: {
                  paginationModel: { page: 0, pageSize: 10 },
                },
              }}
              sx={{
                border: `1px solid ${BRAND.border}`,
                borderRadius: 2,
                overflow: "hidden",
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: "rgba(27,166,166,0.08)",
                  fontWeight: 800,
                },
                "& .MuiDataGrid-columnHeaderTitle": {
                  fontWeight: 800,
                },
                "& .MuiDataGrid-cell": {
                  alignItems: "center",
                },
              }}
            />
          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            px: { xs: 2, sm: 2.5 },
            pb: { xs: 2, sm: 2.5 },
            pt: 0,
          }}
        >
          <Button
            variant="contained"
            onClick={closeRankingDialog}
            sx={{
              borderRadius: 999,
              px: 2.5,
              fontWeight: 800,
              bgcolor: BRAND.teal,
              "&:hover": { bgcolor: BRAND.tealText },
            }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}