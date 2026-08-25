// src/components/AssetGroups/UngroupedDevicesDrawer.jsx
//
// Right-side drilldown drawer listing devices with no static/dynamic group
// assignment, extracted from the AssetGroups god-component. Owns its own
// server-paginated + sorted + debounced-search fetch (listUngroupedDevices)
// and a DataGrid. Props: {open, onClose, notify}. Raised above dialogs on
// purpose so it can be launched from inside the New-group dialog.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { BRAND, DATAGRID_SX, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { listUngroupedDevices } from "../../api/assetGroups";
import { listFrom } from "../../api/shape";

export default function UngroupedDevicesDrawer({ open, onClose, notify }) {
  const drawerContentRef = React.useRef(null);
  const [rows, setRows] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [paginationModel, setPaginationModel] = React.useState({ page: 0, pageSize: 25 });
  const [sortModel, setSortModel] = React.useState([{ field: "hostname", sort: "asc" }]);

  React.useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      const trimmed = search.trim();
      setDebouncedSearch(trimmed.length >= 3 || trimmed.length === 0 ? trimmed : "");
    }, 400);
    return () => clearTimeout(handle);
  }, [open, search]);

  const loadRows = React.useCallback(async () => {
    if (!open) return;
    const currentSort = sortModel?.[0] || { field: "hostname", sort: "asc" };
    try {
      setLoading(true);
      setError("");
      const res = await listUngroupedDevices({
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        search: debouncedSearch || undefined,
        platform: platform || undefined,
        sortBy: currentSort.field || "hostname",
        sortDir: currentSort.sort || "asc",
      });
      setRows(listFrom(res, { context: "ungroupedDevices" }));
      setTotal(Number(res?.total ?? 0));
    } catch (err) {
      const message = err?.body?.message || err?.message || "Failed to load ungrouped devices";
      setRows([]);
      setTotal(0);
      setError(message);
      notify?.("error", message);
    } finally {
      setLoading(false);
    }
  }, [open, paginationModel.page, paginationModel.pageSize, debouncedSearch, platform, sortModel, notify]);

  React.useEffect(() => {
    loadRows();
  }, [loadRows]);

  React.useEffect(() => {
    if (!open) return;
    setPaginationModel({ page: 0, pageSize: 25 });
    setSortModel([{ field: "hostname", sort: "asc" }]);
    setSearch("");
    setDebouncedSearch("");
    setPlatform("");
    setError("");
  }, [open]);

  const columns = React.useMemo(
    () => [
      {
        field: "hostname",
        headerName: "Hostname",
        minWidth: 220,
        flex: 1,
        renderCell: (params) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {params.row?.hostname || params.row?.deviceId || "—"}
            </Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {params.row?.deviceId || "—"}
            </Typography>
          </Box>
        ),
      },
      {
        field: "platform",
        headerName: "Platform",
        width: 120,
        renderCell: (params) => (
          params.value ? (
            <Chip size="small" label={params.value} sx={{ height: 22, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800 }} />
          ) : "—"
        ),
      },
      {
        field: "serial",
        headerName: "Serial",
        minWidth: 150,
        flex: 0.65,
        renderCell: (params) => params.value || "—",
      },
      {
        field: "agentVersion",
        headerName: "Agent",
        width: 120,
        renderCell: (params) => params.value || "—",
      },
      {
        field: "lastSeenAt",
        headerName: "Last seen",
        minWidth: 160,
        flex: 0.7,
        renderCell: (params) => formatDate(params.value),
      },
    ],
    []
  );

  const searchHelper = search.trim().length > 0 && search.trim().length < 3
    ? "Type at least 3 characters to search"
    : "Search hostname, device ID, serial, platform, or agent version";

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{
        keepMounted: true,
      }}
      sx={{
        // This drawer can be launched from inside the "New asset group"
        // dialog. MUI Drawers normally sit below Dialogs in the z-index
        // stack, which made the ungrouped list render behind the modal.
        // Raise only this operational drilldown drawer above dialogs so
        // the operator can inspect devices without closing the group form.
        zIndex: (theme) => theme.zIndex.modal + 30,
        "& .MuiBackdrop-root": {
          zIndex: (theme) => theme.zIndex.modal + 29,
          backgroundColor: "rgba(15, 23, 42, 0.34)",
          backdropFilter: "blur(1px)",
        },
        "& .MuiDrawer-paper": {
          zIndex: (theme) => theme.zIndex.modal + 31,
        },
      }}
      slotProps={{
        paper: {
          sx: {
            width: { xs: "100%", md: 820, xl: 920 },
            p: { xs: 1.5, sm: 2 },
            bgcolor: "#fff",
            borderLeft: { xs: "none", md: `1px solid ${BRAND.border}` },
            boxShadow: "-18px 0 44px rgba(15, 23, 42, 0.18)",
          },
        },
      }}
    >
      <Box ref={drawerContentRef} sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: BRAND.tealSoft,
                  color: BRAND.tealText,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Inventory2OutlinedIcon fontSize="small" />
              </Box>
              <Box>
                <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark, lineHeight: 1.2 }}>
                  Ungrouped devices
                </Typography>
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 0.25 }}>
                  Devices not assigned to any static or dynamic asset group.
                </Typography>
              </Box>
            </Stack>
          </Box>
          <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
            <CloseOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 180px auto" },
            gap: 1,
            alignItems: "flex-start",
          }}
        >
          <TextField
            size="small"
            placeholder="Search ungrouped devices…"
            value={search}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setSearch(e.target.value);
            }}
            helperText={searchHelper}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            size="small"
            label="Platform"
            value={platform}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setPlatform(e.target.value);
            }}
            helperText=" "
            SelectProps={{
              MenuProps: {
                // Keep the menu inside the raised drawer instead of
                // portaling it back to the page. When this drawer is
                // launched from the New group dialog, the default Menu
                // portal can render behind the drawer/dialog stack and
                // trigger aria-hidden focus warnings.
                disablePortal: true,
                disableScrollLock: true,
                container: () => drawerContentRef.current,
                PaperProps: {
                  sx: {
                    mt: 0.5,
                    borderRadius: 2,
                    border: `1px solid ${BRAND.border}`,
                    boxShadow: BRAND.shadow,
                    zIndex: (theme) => theme.zIndex.modal + 60,
                    "& .MuiMenuItem-root": {
                      fontSize: TEXT.md,
                      minHeight: 38,
                      "&.Mui-selected": {
                        bgcolor: BRAND.tealSoft,
                        color: BRAND.dark,
                      },
                      "&.Mui-selected:hover": {
                        bgcolor: BRAND.tealSoft,
                      },
                    },
                  },
                },
                MenuListProps: {
                  dense: true,
                },
              },
            }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="windows">Windows</MenuItem>
            <MenuItem value="windows-server">Windows Server</MenuItem>
            <MenuItem value="macos">macOS</MenuItem>
            <MenuItem value="linux">Linux</MenuItem>
            <MenuItem value="unknown">Unknown</MenuItem>
          </TextField>
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={14} sx={{ color: BRAND.teal }} /> : <RefreshOutlinedIcon />}
            onClick={loadRows}
            sx={{
              minHeight: 40,
              textTransform: "none",
              borderColor: BRAND.border,
              color: BRAND.dark,
              "&:hover": { borderColor: BRAND.teal, bgcolor: BRAND.tealSoft },
            }}
          >
            Refresh
          </Button>
        </Box>

        {error ? (
          <Alert severity="error" variant="outlined">
            {error}
          </Alert>
        ) : null}

        <Box sx={{ flex: 1, minHeight: 360, overflow: "hidden" }}>
          <DataGrid
            rows={rows}
            columns={columns}
            density="compact"
            disableRowSelectionOnClick
            loading={loading}
            getRowId={(row) => row.deviceId}
            rowCount={total}
            paginationMode="server"
            sortingMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            sortModel={sortModel}
            onSortModelChange={(model) => {
              const nextModel = model.length > 0 ? model : [{ field: "hostname", sort: "asc" }];
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setSortModel(nextModel);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
            sx={DATAGRID_SX}
          />
        </Box>
      </Box>
    </Drawer>
  );
}
