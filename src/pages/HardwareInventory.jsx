import * as React from "react";
import Grid from "@mui/material/Grid";
import BrandSnackbar from "../components/common/BrandSnackbar";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import CloseIcon from "@mui/icons-material/Close";

import {
  getHardwareInventorySummary,
  getHardwareInventoryRankings,
  getHardwareInventoryDetail,
} from "../api/inventoryDashboard";
import { useCachedFetch } from "../hooks/useCachedFetch";

import { BRAND } from "../theme/brand";
import CompositionBars from "../components/common/CompositionBars";
import { formatBytesToGb, formatDate } from "../utils/format";
import { listFrom } from "../api/shape";

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


function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return " - ";
  return `${Number(value).toFixed(1)}%`;
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


const enterpriseDataGridSx = {
  border: `1px solid ${BRAND.border}`,
  borderRadius: 2.5,
  overflow: "hidden",
  width: "100%",
  bgcolor: "background.paper",

  // Match the Devices table: clean surface, horizontal separators only,
  // compact rows, and no vertical grid lines.
  "& .MuiDataGrid-main": {
    borderRadius: 2.5,
  },
  "& .MuiDataGrid-columnHeaders": {
    backgroundColor: `${BRAND.surfaceMuted} !important`,
    borderBottom: `1px solid ${BRAND.border}`,
    minHeight: "44px !important",
    maxHeight: "44px !important",
    lineHeight: "44px !important",
  },
  "& .MuiDataGrid-columnHeader": {
    backgroundColor: `${BRAND.surfaceMuted} !important`,
    outline: "none !important",
    borderRight: "none",
    paddingTop: 0,
    paddingBottom: 0,
  },
  "& .MuiDataGrid-columnSeparator": {
    display: "none",
  },
  "& .MuiDataGrid-columnHeaderTitle": {
    fontWeight: 700,
    fontSize: 14,
    color: BRAND.dark,
    lineHeight: 1.25,
  },
  "& .MuiDataGrid-cell": {
    display: "flex",
    alignItems: "center",
    borderBottom: `1px solid ${BRAND.border}`,
    borderRight: "none",
    fontSize: 14,
    color: BRAND.dark,
    outline: "none !important",
    paddingTop: "0 !important",
    paddingBottom: "0 !important",
    lineHeight: 1.25,
  },
  "& .MuiDataGrid-row": {
    minHeight: "40px !important",
    maxHeight: "40px !important",
    transition: "background-color 160ms ease",
  },
  "& .MuiDataGrid-row:hover": {
    backgroundColor: BRAND.rowHover,
  },
  "& .MuiDataGrid-row.Mui-selected": {
    backgroundColor: `${BRAND.tealSoft} !important`,
  },
  "& .MuiDataGrid-row.Mui-selected:hover": {
    backgroundColor: `${BRAND.tealSoftStrong} !important`,
  },
  "& .MuiDataGrid-virtualScroller": {
    backgroundColor: "background.paper",
  },
  "& .MuiDataGrid-footerContainer": {
    minHeight: 52,
    borderTop: `1px solid ${BRAND.border}`,
    backgroundColor: "background.paper",
  },
  "& .MuiTablePagination-root": {
    color: BRAND.dark,
  },
  "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
    fontSize: 13,
  },
  "& .MuiLinearProgress-root": {
    backgroundColor: "rgba(27,166,166,0.15)",
  },
  "& .MuiLinearProgress-bar": {
    backgroundColor: BRAND.teal,
  },
};


const integratedFilterFieldSx = {
  "& .MuiOutlinedInput-root": {
    minHeight: 40,
    borderRadius: 2,
    bgcolor: "#fff",
    transition: "border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease",
    "& fieldset": {
      borderColor: BRAND.border,
    },
    "&:hover fieldset": {
      borderColor: BRAND.teal,
    },
    "&.Mui-focused": {
      boxShadow: "0 0 0 3px rgba(27, 166, 166, 0.10)",
    },
    "&.Mui-focused fieldset": {
      borderColor: `${BRAND.teal} !important`,
      borderWidth: "1px !important",
    },
    "&.Mui-disabled": {
      bgcolor: "rgba(15, 23, 42, 0.025)",
    },
  },
  "& .MuiInputBase-input": {
    py: 1.05,
    fontSize: 13.5,
    color: BRAND.dark,
  },
  "& .MuiInputBase-input::placeholder": {
    color: BRAND.gray,
    opacity: 0.82,
  },
};

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

export default function HardwareInventory() {
  const theme = useTheme();
  const rankingDialogFullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  // Summary + rankings are parameterless on-mount fetches — routed through
  // useCachedFetch so they get stale-while-revalidate, in-flight dedup, and
  // last-known-good fallback on a transient backend error (each was a
  // hand-rolled setLoading/try/catch triple before). The parameterized detail
  // fetch below stays manual (it keys off search/filter/pagination state).
  const {
    data: summary,
    loading: loadingSummary,
    refetch: reloadSummary,
  } = useCachedFetch(
    "hardware-inventory:summary:v1",
    async () => (await getHardwareInventorySummary()) || null,
    { staleMs: 60_000, storageMaxAgeMs: 10 * 60_000, revalidateOnMount: "stale" }
  );
  const {
    data: rankings,
    loading: loadingRankings,
    refetch: reloadRankings,
  } = useCachedFetch(
    "hardware-inventory:rankings:v1",
    async () => (await getHardwareInventoryRankings()) || null,
    { staleMs: 60_000, storageMaxAgeMs: 10 * 60_000, revalidateOnMount: "stale" }
  );

  const [rankingDialog, setRankingDialog] = React.useState(null);
  const [rankingDialogSearch, setRankingDialogSearch] = React.useState("");
  const [detailRows, setDetailRows] = React.useState([]);
  const [totalRows, setTotalRows] = React.useState(0);
  const [loadingDetail, setLoadingDetail] = React.useState(true);

  const [search, setSearch] = React.useState("");

  const [paginationModel, setPaginationModel] = React.useState({
    page: 0,
    pageSize: 10,
  });

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const loadDetail = async () => {
    try {
      setLoadingDetail(true);
      const res = await getHardwareInventoryDetail({
        search: search || undefined,
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
      });

      setDetailRows(listFrom(res, { context: "hardwareDetail" }));
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
    loadDetail();
  }, [search, paginationModel.page, paginationModel.pageSize]);

  const refreshAll = () => {
    reloadSummary();
    reloadRankings();
    loadDetail();
  };

  const columns = [
    {
      field: "hostname",
      headerName: "Hostname",
      minWidth: 180,
      flex: 0.9,
      renderCell: (params) => params.row?.hostname || params.row?.agentId || " - ",
    },
    {
      field: "serial",
      headerName: "Serial",
      minWidth: 150,
      flex: 0.65,
      renderCell: (params) => {
        const serial = String(params.value || "").trim();
        return serial || "—";
      },
    },
    { field: "platform", headerName: "Platform", minWidth: 100, flex: 0.45 },
    { field: "distro", headerName: "OS", minWidth: 150, flex: 0.7 },
    { field: "manufacturer", headerName: "Manufacturer", minWidth: 140, flex: 0.7 },
    { field: "model", headerName: "Model", minWidth: 160, flex: 0.8 },
    { field: "cpuBrand", headerName: "CPU", minWidth: 180, flex: 0.9 },
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
      field: "collectedAtUtc",
      headerName: "Collected At",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
  ];


  const topManufacturersRows = React.useMemo(
    () =>
      normalizeRankingRows(
        (rankings?.topManufacturers || []).map((item) => ({
          ...item,
          color: BRAND.teal,
        })),
        BRAND.teal
      ),
    [rankings?.topManufacturers]
  );

  const topCpuModelsRows = React.useMemo(
    () =>
      normalizeRankingRows(
        (rankings?.topCpuModels || []).map((item) => ({
          ...item,
          color: BRAND.teal,
        })),
        BRAND.teal
      ),
    [rankings?.topCpuModels]
  );

  const topPlatformsRows = React.useMemo(
    () =>
      normalizeRankingRows(
        (rankings?.topPlatforms || []).map((item) => ({
          ...item,
          color: BRAND.dark,
        })),
        BRAND.dark
      ),
    [rankings?.topPlatforms]
  );

  const highestDiskUsageRows = React.useMemo(
    () =>
      normalizeRankingRows(
        (rankings?.highestDiskUsage || []).map((item) => ({
          ...item,
          value: Number(item.value || 0),
          color: BRAND.alert.error,
          sub: `${Number(item.value || 0).toFixed(1)}% used`,
        })),
        BRAND.alert.error
      ),
    [rankings?.highestDiskUsage]
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

      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Top manufacturers"
                items={topManufacturersRows}
                totalLabel="hosts"
                emptyLabel="No manufacturer data"
                minHeight={260}
                maxItems={5}
                headerExtra={renderViewAllButton({
                  title: "Top manufacturers",
                  subtitle: "Complete manufacturer ranking by reporting hosts.",
                  items: topManufacturersRows,
                  totalLabel: "hosts",
                  labelHeader: "Manufacturer",
                  valueHeader: "Hosts",
                })}
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Top CPU models"
                items={topCpuModelsRows}
                totalLabel="devices"
                emptyLabel="No CPU model data"
                minHeight={260}
                maxItems={5}
                headerExtra={renderViewAllButton({
                  title: "Top CPU models",
                  subtitle: "Complete CPU model ranking by devices.",
                  items: topCpuModelsRows,
                  totalLabel: "devices",
                  labelHeader: "CPU Model",
                  valueHeader: "Devices",
                })}
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Top platforms"
                items={topPlatformsRows}
                totalLabel="devices"
                emptyLabel="No platform data"
                minHeight={260}
                maxItems={5}
                headerExtra={renderViewAllButton({
                  title: "Top platforms",
                  subtitle: "Complete platform ranking by devices.",
                  items: topPlatformsRows,
                  totalLabel: "devices",
                  labelHeader: "Platform",
                  valueHeader: "Devices",
                })}
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <Box sx={{ width: "100%" }}>
              <CompositionBars
                title="Highest disk usage"
                items={highestDiskUsageRows}
                totalLabel="% cumulative"
                emptyLabel="No disk usage data"
                minHeight={260}
                maxItems={5}
                headerExtra={renderViewAllButton({
                  title: "Highest disk usage",
                  subtitle: "Complete device ranking by disk usage percentage.",
                  items: highestDiskUsageRows,
                  totalLabel: "% cumulative",
                  labelHeader: "Device",
                  valueHeader: "Usage %",
                })}
              />
            </Box>
          </Grid>
        </Grid>
      </Box>


      <SectionCard title="Hardware Inventory Detail">
        <Box
          sx={{
            mb: 1.5,
            p: { xs: 1, sm: 1.25 },
            borderRadius: 2.5,
            border: `1px solid ${BRAND.border}`,
            bgcolor: BRAND.surfaceMuted,
            display: "grid",
            gap: 1,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr auto",
            },
            alignItems: "center",
          }}
        >
          <TextField
            size="small"
            placeholder="Search hostname, serial, manufacturer, model, CPU, OS"
            value={search}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setSearch(e.target.value);
            }}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
                </InputAdornment>
              ),
            }}
            sx={integratedFilterFieldSx}
          />

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={refreshAll}
            sx={{
              minHeight: 40,
              px: 2,
              borderRadius: 2,
              borderColor: BRAND.teal,
              color: BRAND.tealText,
              fontWeight: 800,
              textTransform: "none",
              whiteSpace: "nowrap",
              bgcolor: "#fff",
              "&:hover": {
                borderColor: BRAND.tealHover,
                bgcolor: BRAND.tealSoft,
              },
            }}
          >
            Refresh
          </Button>
        </Box>

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
            rowHeight={40}
            columnHeaderHeight={44}
            localeText={{ footerRowsPerPage: "Rows" }}
            sx={enterpriseDataGridSx}
          />
        </Box>
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
                  backgroundColor: `${BRAND.surfaceMuted} !important`,
                  fontWeight: 800,
                },
                "& .MuiDataGrid-columnHeader": {
                  backgroundColor: `${BRAND.surfaceMuted} !important`,
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