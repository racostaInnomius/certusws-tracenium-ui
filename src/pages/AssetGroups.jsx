// src/pages/AssetGroups.jsx
//
// Asset Groups — Phase 1 (static groups only).
//
// Operators with 50+ devices use this surface to organize their fleet
// into named buckets ("Call Center", "TI", "Boardroom Macs"). A device
// can belong to many groups; jobs and policy pushes (Phase 3) target
// groups instead of typing device IDs one by one.
//
// Visibility model: any active tenant member can read groups; only
// ADMIN/OWNER can create/edit/delete (the page hides the create &
// destructive buttons for non-admins, and the API would reject them
// anyway with 403).
//
// Phase 2 (dynamic / criteria-based) and Phase 3 (job dispatch by
// group) attach to this same page — the create dialog already has the
// "kind" radio with a disabled "Dynamic" option to telegraph what's
// coming.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import GroupWorkOutlinedIcon from "@mui/icons-material/GroupWorkOutlined";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

import { BRAND, ROLE, DATAGRID_SX } from "../theme/brand";
import SectionPaper from "../components/common/SectionPaper";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useConfirm } from "../components/common/ConfirmDialog";
import { useAuthContext } from "../auth/AuthContext";
import {
  listAssetGroups,
  createAssetGroup,
  updateAssetGroup,
  deleteAssetGroup,
  listAssetGroupMembers,
  addAssetGroupMembers,
  removeAssetGroupMember,
  getCriteriaCatalog,
  getAssetGroupCoverage,
  listUngroupedDevices,
  previewAssetGroupCriteria,
  dispatchAssetGroupJob,
} from "../api/assetGroups";
import { listKnownDevices, listJobTypes } from "../api/jobs";
import { formatDate } from "../utils/format";
import {
  formatPercent,
  formatNumber,
  getCoverageTone,
  getCoveragePalette,
  KindChip,
} from "../components/AssetGroups/coverageDisplay";
import CriteriaBuilder from "../components/AssetGroups/CriteriaBuilder";





// ── Server-side known devices picker ─────────────────────────────
//
// Asset Groups used to receive every known device when the page loaded
// and then filtered locally. That worked for small tenants, but it does
// not scale. This picker now talks directly to:
//   GET /api/v1/orchestrator/known-devices?page=1&pageSize=25&search=...
// Search is debounced, pagination is server-side, and selections are
// maintained locally across pages so operators can add devices from
// different result pages before submitting the group.

function normalizeKnownDeviceGroupAssignments(d) {
  const rawCollections = [
    d?.groups,
    d?.assetGroups,
    d?.asset_groups,
    d?.groupMemberships,
    d?.group_memberships,
    d?.memberships,
  ];

  const names = [];

  rawCollections.forEach((collection) => {
    if (!Array.isArray(collection)) return;
    collection.forEach((item) => {
      const name =
        typeof item === "string"
          ? item
          : item?.name || item?.groupName || item?.group_name || item?.assetGroupName;
      const trimmed = String(name || "").trim();
      if (trimmed) names.push(trimmed);
    });
  });

  const rawGroupNames = d?.groupNames || d?.group_names || d?.assetGroupNames || d?.asset_group_names;
  if (Array.isArray(rawGroupNames)) {
    rawGroupNames.forEach((name) => {
      const trimmed = String(name || "").trim();
      if (trimmed) names.push(trimmed);
    });
  } else if (typeof rawGroupNames === "string") {
    rawGroupNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => names.push(name));
  }

  const singleGroupName = String(d?.groupName || d?.group_name || d?.assetGroup || d?.asset_group || "").trim();
  if (singleGroupName && singleGroupName !== "—") names.push(singleGroupName);

  const uniqueNames = Array.from(new Set(names));
  const rawCount = Number(
    d?.groupCount ??
      d?.group_count ??
      d?.groupsCount ??
      d?.groups_count ??
      d?.assetGroupCount ??
      d?.asset_group_count ??
      uniqueNames.length
  );
  const groupCount = Number.isFinite(rawCount) ? rawCount : uniqueNames.length;

  const explicitGrouped =
    d?.isGrouped === true ||
    d?.is_grouped === true ||
    d?.grouped === true ||
    d?.hasGroup === true ||
    d?.has_group === true;

  const isGrouped = explicitGrouped || groupCount > 0 || uniqueNames.length > 0;

  return {
    isGrouped,
    groupCount: isGrouped ? Math.max(groupCount, uniqueNames.length, 1) : 0,
    groupCoverage: isGrouped ? "grouped" : "ungrouped",
    groupNames: uniqueNames,
  };
}

function normalizeKnownDevice(d) {
  const groupInfo = normalizeKnownDeviceGroupAssignments(d || {});

  return {
    deviceId: String(d?.deviceId || "").trim(),
    hostname: String(d?.hostname || "").trim(),
    platform: String(d?.platform || d?.osPlatform || "").trim(),
    agentVersion: String(d?.agentVersion || d?.agent_version || "").trim(),
    connected: d?.connected === true,
    ...groupInfo,
  };
}

function KnownDevicesPicker({
  open,
  selectedIds,
  onToggleDevice,
  excludeIds,
  selectedLabel = "selected",
  emptyLabel = "No devices match.",
}) {
  const [rows, setRows] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize] = React.useState(25);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setPage(0);
      setSearch("");
      setRows([]);
      setTotal(0);
      setError("");
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");

        const res = await listKnownDevices({
          page: page + 1,
          pageSize,
          search: search.trim() || undefined,
          includeGroups: true,
        });

        if (cancelled) return;

        const items = Array.isArray(res?.items) ? res.items : [];
        setRows(
          items
            .map(normalizeKnownDevice)
            .filter((d) => d.deviceId && !excludeIds?.has(d.deviceId))
        );
        setTotal(Number(res?.total ?? res?.count ?? 0));
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError(err?.body?.message || err?.message || "Failed to load devices");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, page, pageSize, search, excludeIds]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: BRAND.gray,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Members
        </Typography>
        <Typography sx={{ fontSize: 12, color: BRAND.dark }}>
          <strong>{selectedIds.size}</strong> {selectedLabel} · {total} known
        </Typography>
      </Box>

      <TextField
        size="small"
        placeholder="Search hostname / device ID / platform / agent version…"
        value={search}
        onChange={(e) => {
          setPage(0);
          setSearch(e.target.value);
        }}
        fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
            </InputAdornment>
          ),
          endAdornment: loading ? (
            <InputAdornment position="end">
              <CircularProgress size={16} sx={{ color: BRAND.teal }} />
            </InputAdornment>
          ) : null,
        }}
        sx={{ mb: 1 }}
      />

      {error ? (
        <Alert severity="error" variant="outlined" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}

      <Box
        sx={{
          border: `1px solid ${BRAND.border}`,
          borderRadius: 2,
          maxHeight: 320,
          overflowY: "auto",
          bgcolor: BRAND.surface,
        }}
      >
        {rows.length === 0 && !loading ? (
          <Box sx={{ p: 2, textAlign: "center", color: BRAND.gray }}>
            <Typography variant="body2">{emptyLabel}</Typography>
          </Box>
        ) : (
          rows.map((d) => {
            const checked = selectedIds.has(d.deviceId);
            const groupNamesText = d.groupNames.length > 0 ? d.groupNames.join(", ") : "Assigned to an existing group";
            const groupChipLabel = d.isGrouped
              ? d.groupCount > 1
                ? `${d.groupCount} groups`
                : "Grouped"
              : "Ungrouped";

            return (
              <Box
                key={d.deviceId}
                onClick={() => onToggleDevice(d.deviceId)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 0.9,
                  cursor: "pointer",
                  bgcolor: checked ? BRAND.tealSoft : "transparent",
                  borderBottom: `1px solid ${BRAND.border}`,
                  "&:hover": { bgcolor: BRAND.rowHover },
                }}
              >
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: 0.5,
                    border: `2px solid ${checked ? BRAND.teal : BRAND.gray}`,
                    bgcolor: checked ? BRAND.teal : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {checked ? "✓" : ""}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack
                    direction="row"
                    spacing={0.75}
                    alignItems="center"
                    sx={{ minWidth: 0, flexWrap: "wrap", rowGap: 0.4 }}
                  >
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: BRAND.dark,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: { xs: "100%", sm: 320 },
                      }}
                    >
                      {d.hostname || d.deviceId}
                    </Typography>
                    <Tooltip
                      arrow
                      title={
                        d.isGrouped
                          ? `Already in: ${groupNamesText}`
                          : "This device is not assigned to any asset group yet."
                      }
                    >
                      <Chip
                        size="small"
                        label={groupChipLabel}
                        sx={{
                          height: 20,
                          fontSize: 10.5,
                          fontWeight: 800,
                          border: `1px solid ${d.isGrouped ? `${BRAND.teal}66` : BRAND.border}`,
                          bgcolor: d.isGrouped ? BRAND.tealSoft : BRAND.surface,
                          color: d.isGrouped ? BRAND.tealText : BRAND.gray,
                          "& .MuiChip-label": { px: 0.85 },
                        }}
                      />
                    </Tooltip>
                  </Stack>

                  <Typography
                    sx={{
                      mt: 0.15,
                      fontSize: 11,
                      color: BRAND.gray,
                      fontFamily: "monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.deviceId}
                  </Typography>

                  {d.isGrouped ? (
                    <Typography
                      sx={{
                        mt: 0.25,
                        fontSize: 11,
                        color: BRAND.tealText,
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={groupNamesText}
                    >
                      Already in: {groupNamesText}
                    </Typography>
                  ) : null}
                </Box>

                <Stack
                  direction="row"
                  spacing={0.5}
                  alignItems="center"
                  justifyContent="flex-end"
                  sx={{ flexShrink: 0, flexWrap: "wrap", maxWidth: { xs: 120, sm: 220 } }}
                >
                  {d.platform ? (
                    <Chip
                      size="small"
                      label={d.platform}
                      sx={{
                        height: 18,
                        fontSize: 10.5,
                        bgcolor: BRAND.darkSoft,
                        color: BRAND.dark,
                        fontWeight: 700,
                      }}
                    />
                  ) : null}
                  {d.connected ? (
                    <Chip
                      size="small"
                      label="online"
                      sx={{
                        height: 18,
                        fontSize: 10.5,
                        bgcolor: ROLE.positiveSoft,
                        color: ROLE.positive,
                        fontWeight: 700,
                      }}
                    />
                  ) : null}
                </Stack>
              </Box>
            );
          })
        )}
      </Box>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        sx={{ mt: 1 }}
      >
        <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
          Page {page + 1} of {totalPages}
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button
            size="small"
            variant="outlined"
            disabled={loading || page <= 0}
            onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
            sx={{ textTransform: "none", borderColor: BRAND.border, color: BRAND.dark }}
          >
            Previous
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={loading || page + 1 >= totalPages}
            onClick={() => setPage((prev) => prev + 1)}
            sx={{ textTransform: "none", borderColor: BRAND.border, color: BRAND.dark }}
          >
            Next
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}


function GroupCoverageNotice({ coverage, loading, error, compact = false, onRefresh, onViewUngrouped }) {
  const totalDevices = Number(coverage?.totalDevices || 0);
  const groupedDevices = Number(coverage?.groupedDevices || 0);
  const ungroupedDevices = Number(coverage?.ungroupedDevices || 0);
  const coveragePercent = Number(coverage?.coveragePercent || 0);
  const tone = getCoverageTone(coverage);
  const palette = getCoveragePalette(tone);
  const hasUngrouped = ungroupedDevices > 0;

  if (error) {
    return (
      <Alert
        severity="warning"
        variant="outlined"
        sx={{
          borderColor: BRAND.border,
          bgcolor: BRAND.surfaceMuted,
          color: BRAND.dark,
          "& .MuiAlert-icon": { color: ROLE.caution },
        }}
        action={
          onRefresh ? (
            <Button size="small" onClick={onRefresh} sx={{ color: BRAND.tealText, textTransform: "none", fontWeight: 700 }}>
              Retry
            </Button>
          ) : null
        }
      >
        Group coverage could not be loaded right now.
      </Alert>
    );
  }

  return (
    <Box
      sx={{
        position: "relative",
        p: compact ? 1.25 : 1.5,
        borderRadius: 2,
        border: `1px solid ${BRAND.teal}`,
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.94) 58%, rgba(90,159,159,0.09) 100%)",
        boxShadow: "0 10px 24px rgba(59,64,77,0.06)",
        display: "grid",
        gap: 1.25,
        gridTemplateColumns: { xs: "1fr", md: compact ? "1fr" : "auto 1fr auto" },
        alignItems: "center",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 0% 50%, rgba(90,159,159,0.10), transparent 34%), radial-gradient(circle at 100% 50%, rgba(143,253,255,0.09), transparent 30%)",
        },
        "& > *": {
          position: "relative",
          zIndex: 1,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
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
            flexShrink: 0,
            border: `1px solid ${BRAND.border}`,
          }}
        >
          <Inventory2OutlinedIcon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: BRAND.dark, lineHeight: 1.25 }}>
            {loading
              ? "Checking group coverage…"
              : hasUngrouped
              ? `${formatNumber(ungroupedDevices)} device${ungroupedDevices === 1 ? "" : "s"} not assigned to any group`
              : "All known devices are assigned to at least one group"}
          </Typography>
          <Typography sx={{ fontSize: 12, color: BRAND.gray, lineHeight: 1.45, mt: 0.25 }}>
            {loading
              ? "Validating static and dynamic asset group coverage."
              : hasUngrouped
              ? "These devices are outside static and dynamic group coverage. Review them before targeting jobs, policies, or reporting by group."
              : "Your fleet has complete asset group coverage based on the latest backend evaluation."}
          </Typography>
        </Box>
      </Box>

      <Stack
        direction="row"
        spacing={0.75}
        sx={{
          flexWrap: "wrap",
          gap: 0.75,
          justifyContent: { xs: "flex-start", md: compact ? "flex-start" : "center" },
        }}
      >
        <Chip
          size="small"
          label={`${formatPercent(coveragePercent)} covered`}
          sx={{
            bgcolor: "rgba(255,255,255,0.92)",
            color: palette.color,
            fontWeight: 900,
            border: `1px solid ${BRAND.border}`,
            boxShadow: "0 3px 10px rgba(59,64,77,0.05)",
            "& .MuiChip-label": { px: 1.25 },
          }}
        />
        <Chip
          size="small"
          label={`${formatNumber(groupedDevices)} grouped`}
          sx={{
            bgcolor: "rgba(255,255,255,0.92)",
            color: BRAND.tealText,
            fontWeight: 800,
            border: `1px solid ${BRAND.border}`,
            boxShadow: "0 3px 10px rgba(59,64,77,0.04)",
            "& .MuiChip-label": { px: 1.25 },
          }}
        />
        <Chip
          size="small"
          label={`${formatNumber(totalDevices)} total`}
          sx={{
            bgcolor: "rgba(255,255,255,0.92)",
            color: BRAND.gray,
            fontWeight: 800,
            border: `1px solid ${BRAND.border}`,
            boxShadow: "0 3px 10px rgba(59,64,77,0.04)",
            "& .MuiChip-label": { px: 1.25 },
          }}
        />
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        justifyContent={{ xs: "flex-start", md: compact ? "flex-start" : "flex-end" }}
        sx={{ minWidth: { md: compact ? 0 : 220 } }}
      >
        {hasUngrouped ? (
          <Button
            size="small"
            variant="contained"
            startIcon={<VisibilityOutlinedIcon />}
            onClick={onViewUngrouped}
            disabled={loading}
            sx={{
              textTransform: "none",
              fontWeight: 800,
              bgcolor: BRAND.teal,
              "&:hover": { bgcolor: BRAND.tealHover },
            }}
          >
            View devices
          </Button>
        ) : null}
        {onRefresh ? (
          <IconButton
            size="small"
            onClick={onRefresh}
            disabled={loading}
            sx={{
              bgcolor: "#fff",
              color: BRAND.tealText,
              border: `1px solid ${BRAND.border}`,
              "&:hover": { bgcolor: BRAND.tealSoft },
            }}
            title="Refresh group coverage"
          >
            {loading ? <CircularProgress size={16} sx={{ color: BRAND.teal }} /> : <RefreshOutlinedIcon fontSize="small" />}
          </IconButton>
        ) : null}
      </Stack>
    </Box>
  );
}

function UngroupedDevicesDrawer({ open, onClose, notify }) {
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
      setRows(Array.isArray(res?.items) ? res.items : []);
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
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {params.row?.hostname || params.row?.deviceId || "—"}
            </Typography>
            <Typography sx={{ fontSize: 11, color: BRAND.gray, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
            <Chip size="small" label={params.value} sx={{ height: 22, fontSize: 11, bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800 }} />
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
                <Typography sx={{ fontSize: 18, fontWeight: 800, color: BRAND.dark, lineHeight: 1.2 }}>
                  Ungrouped devices
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: BRAND.gray, mt: 0.25 }}>
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
                      fontSize: 13,
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

// ── Create / edit dialog ──────────────────────────────────────────

function CreateGroupDialog({ open, onClose, onCreated, coverage, coverageLoading, coverageError, onRefreshCoverage, onViewUngrouped }) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [kind, setKind] = React.useState("static");
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  // Phase 2: dynamic group state.
  const [criteriaCatalog, setCriteriaCatalog] = React.useState(null);
  const [predicates, setPredicates] = React.useState([]);
  const [previewState, setPreviewState] = React.useState({
    loading: false,
    count: null,
    sample: [],
    error: null,
  });

  // Reset whenever the dialog opens — operators expect a clean slate.
  React.useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setKind("static");
      setSelectedIds(new Set());
      setSubmitting(false);
      setErrorMessage("");
      setPredicates([]);
      setPreviewState({ loading: false, count: null, sample: [], error: null });
    }
  }, [open]);

  // Lazy-load the criteria catalog the first time someone opens the
  // dialog. Static across a session — we don't refetch on every open.
  React.useEffect(() => {
    if (!open || criteriaCatalog) return;
    let cancelled = false;
    getCriteriaCatalog()
      .then((res) => {
        if (cancelled) return;
        setCriteriaCatalog(res || { fields: [] });
      })
      .catch(() => {
        if (cancelled) return;
        // Soft-fail: dynamic will just have no fields available.
        // Static path keeps working.
        setCriteriaCatalog({ fields: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, criteriaCatalog]);

  // Debounced live preview when in dynamic mode + at least one
  // predicate is present + all values are non-empty. We don't want
  // to fire previews against half-typed values that would error out
  // on every keystroke.
  React.useEffect(() => {
    if (kind !== "dynamic") {
      setPreviewState({ loading: false, count: null, sample: [], error: null });
      return;
    }
    if (predicates.length === 0) {
      setPreviewState({ loading: false, count: 0, sample: [], error: null });
      return;
    }
    const allValuesPresent = predicates.every((p) => {
      if (Array.isArray(p.value)) return p.value.length > 0;
      return typeof p.value === "string" && p.value.trim().length > 0;
    });
    if (!allValuesPresent) {
      setPreviewState({ loading: false, count: null, sample: [], error: null });
      return;
    }

    setPreviewState((prev) => ({ ...prev, loading: true, error: null }));
    const handle = setTimeout(async () => {
      try {
        const res = await previewAssetGroupCriteria({ all: predicates }, 5);
        setPreviewState({
          loading: false,
          count: Number(res?.count ?? 0),
          sample: Array.isArray(res?.sample) ? res.sample : [],
          error: null,
        });
      } catch (err) {
        setPreviewState({
          loading: false,
          count: null,
          sample: [],
          error: err?.body?.message || err?.message || "Preview failed",
        });
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [kind, predicates]);

  const toggleDevice = (deviceId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorMessage("Group name is required");
      return;
    }
    if (kind === "dynamic" && predicates.length === 0) {
      setErrorMessage("Add at least one predicate to define the dynamic group");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        kind,
      };
      if (kind === "static") {
        payload.deviceIds = Array.from(selectedIds);
      } else {
        payload.criteriaJson = { all: predicates };
      }
      const res = await createAssetGroup(payload);
      onCreated(res?.group ?? null);
      onClose();
    } catch (err) {
      const code = err?.body?.error;
      const field = err?.body?.field;
      const msg = err?.body?.message || err?.message || "Failed to create group";
      if (code === "ASSET_GROUP_CONFLICT") {
        setErrorMessage(msg);
      } else if (field) {
        setErrorMessage(`${field}: ${msg}`);
      } else {
        setErrorMessage(msg);
      }
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadow,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          color: BRAND.dark,
          fontWeight: 800,
          fontSize: 18,
          pr: 5,
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 2,
            bgcolor: BRAND.tealSoft,
            color: BRAND.tealText,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GroupAddOutlinedIcon fontSize="small" />
        </Box>
        New asset group
        <IconButton
          aria-label="close"
          onClick={onClose}
          disabled={submitting}
          size="small"
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            color: BRAND.gray,
            "&:hover": { color: BRAND.dark },
          }}
        >
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 1.5 }}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            fullWidth
            inputProps={{ maxLength: 80 }}
          />
          <TextField
            label="Description (optional)"
            size="small"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            fullWidth
            multiline
            minRows={2}
            inputProps={{ maxLength: 280 }}
          />

          <GroupCoverageNotice
            coverage={coverage}
            loading={coverageLoading}
            error={coverageError}
            compact
            onRefresh={onRefreshCoverage}
            onViewUngrouped={onViewUngrouped}
          />

          <FormControl disabled={submitting}>
            <Typography
              variant="caption"
              sx={{
                color: BRAND.gray,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                mb: 0.5,
              }}
            >
              Group type
            </Typography>
            <RadioGroup row value={kind} onChange={(e) => setKind(e.target.value)}>
              <FormControlLabel
                value="static"
                control={<Radio sx={{ color: BRAND.teal, "&.Mui-checked": { color: BRAND.teal } }} />}
                label={
                  <Box>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Static</Typography>
                    <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
                      Pick devices manually below.
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="dynamic"
                control={<Radio sx={{ color: BRAND.teal, "&.Mui-checked": { color: BRAND.teal } }} />}
                label={
                  <Box>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Dynamic</Typography>
                    <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
                      Defined by criteria — membership auto-updates.
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>

          {kind === "dynamic" && (
            <Box>
              <CriteriaBuilder
                catalog={criteriaCatalog}
                predicates={predicates}
                onChange={setPredicates}
                error={previewState.error}
              />
              {/* Live preview — count + 5-row sample. The count is the
                  primary signal ("does my filter match what I think
                  it matches?"); the sample is reassurance the right
                  hosts come back. Sample is read-only. */}
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.25,
                  bgcolor: BRAND.tealSoft,
                  borderRadius: 2,
                  border: `1px solid ${BRAND.teal}55`,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: BRAND.tealText,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Preview
                  </Typography>
                  {previewState.loading ? (
                    <CircularProgress size={12} sx={{ color: BRAND.tealText }} />
                  ) : null}
                  <Typography sx={{ fontSize: 13, color: BRAND.dark, ml: "auto" }}>
                    {previewState.count === null
                      ? "complete the predicates to evaluate"
                      : (
                        <>
                          <strong>{previewState.count}</strong> device(s) match
                        </>
                      )}
                  </Typography>
                </Box>
                {previewState.sample.length > 0 ? (
                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.5 }}
                  >
                    {previewState.sample.map((d) => (
                      <Chip
                        key={d.deviceId}
                        size="small"
                        label={d.hostname || d.deviceId.slice(0, 12)}
                        sx={{
                          height: 20,
                          fontSize: 11,
                          bgcolor: "#fff",
                          border: `1px solid ${BRAND.border}`,
                          color: BRAND.dark,
                        }}
                      />
                    ))}
                    {previewState.count !== null && previewState.count > previewState.sample.length ? (
                      <Typography sx={{ fontSize: 11, color: BRAND.gray, alignSelf: "center" }}>
                        + {previewState.count - previewState.sample.length} more
                      </Typography>
                    ) : null}
                  </Stack>
                ) : null}
              </Box>
            </Box>
          )}

          {kind === "static" && (
            <KnownDevicesPicker
              open={open}
              selectedIds={selectedIds}
              onToggleDevice={toggleDevice}
              selectedLabel="selected"
              emptyLabel="No devices match."
            />
          )}

          {errorMessage ? (
            <Alert severity="error" variant="outlined">
              {errorMessage}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1, borderTop: `1px solid ${BRAND.border}`, bgcolor: BRAND.surfaceMuted }}>
        <Button
          onClick={onClose}
          disabled={submitting}
          variant="text"
          sx={{ textTransform: "none", color: BRAND.dark, fontWeight: 600 }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          variant="contained"
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          {submitting ? "Creating…" : "Create group"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Rename dialog (in-place edit of name + description) ──────────

function RenameGroupDialog({ open, group, onClose, onUpdated }) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    if (open && group) {
      setName(group.name || "");
      setDescription(group.description || "");
      setErrorMessage("");
      setSubmitting(false);
    }
  }, [open, group]);

  const handleSubmit = async () => {
    if (!group) return;
    if (!name.trim()) {
      setErrorMessage("Group name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await updateAssetGroup(group.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      onUpdated(res?.group ?? null);
      onClose();
    } catch (err) {
      setErrorMessage(err?.body?.message || err?.message || "Update failed");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: BRAND.dark, fontWeight: 800 }}>
        Rename group
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            fullWidth
            inputProps={{ maxLength: 80 }}
          />
          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            fullWidth
            multiline
            minRows={2}
            inputProps={{ maxLength: 280 }}
          />
          {errorMessage ? <Alert severity="error" variant="outlined">{errorMessage}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none", color: BRAND.dark }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          variant="contained"
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          {submitting ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dispatch-job dialog ───────────────────────────────────────────
//
// Phase 3: fires a job at every member of the group. Backend resolves
// membership at request time (static via DB, dynamic via criteria),
// so we don't pre-fetch the device list here — the dialog is just a
// thin wrapper around `POST /asset-groups/:id/jobs`.
//
// Job-type catalog is loaded lazily when the dialog opens (cached in
// the parent across opens to avoid repeating the request). Payload
// fields are rendered per known type — kept tight on purpose: this
// dialog targets fleet operations, not arbitrary one-off jobs. If the
// operator needs more advanced control they can still hit individual
// devices through the existing Jobs page.

const FACT_TYPES = ["inventory", "compliance", "all"];
const PATCH_INSTALL_MODES = ["install", "download"];

function defaultPayloadFor(jobType) {
  switch (jobType) {
    case "facts_snapshot":
      return { factType: "all" };
    case "agent_update":
      return { version: "" };
    case "patch_scan":
      return {};
    case "patch_install":
      return { mode: "install", kbArticleIds: [] };
    default:
      return {};
  }
}

function payloadFieldsValid(jobType, payload) {
  switch (jobType) {
    case "facts_snapshot":
      return FACT_TYPES.includes(payload.factType);
    case "agent_update":
      return typeof payload.version === "string" && payload.version.trim().length > 0;
    case "patch_scan":
      return true;
    case "patch_install":
      return PATCH_INSTALL_MODES.includes(payload.mode);
    default:
      // Unknown job types: backend will reject — don't pre-block.
      return true;
  }
}

function DispatchJobDialog({ open, group, onClose, onDispatched, notify }) {
  const [jobTypes, setJobTypes] = React.useState([]);
  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [jobType, setJobType] = React.useState("");
  const [payload, setPayload] = React.useState({});
  const [submitting, setSubmitting] = React.useState(false);

  // Reset on open + lazy-load catalog. We don't gate the dialog on
  // catalog load — if the request fails the operator sees an empty
  // dropdown and a notify error; backend would reject the dispatch
  // anyway, so this is just UX polish.
  React.useEffect(() => {
    if (!open) return;
    setJobType("");
    setPayload({});
    if (jobTypes.length > 0) return;
    setCatalogLoading(true);
    listJobTypes()
      .then((res) => {
        const items = Array.isArray(res?.items) ? res.items : [];
        setJobTypes(items);
      })
      .catch((err) => {
        notify?.("error", err?.body?.message || err?.message || "Failed to load job types");
      })
      .finally(() => setCatalogLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleTypeChange = (newType) => {
    setJobType(newType);
    setPayload(defaultPayloadFor(newType));
  };

  const canSubmit =
    !!group &&
    !!jobType &&
    payloadFieldsValid(jobType, payload) &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Normalize patch_install kb list (comma-separated string in UI →
      // string[] on the wire). Trim + drop empties so blank "KB123, ,
      // KB456" doesn't reach the backend.
      let outboundPayload = payload;
      if (jobType === "patch_install" && typeof payload.kbArticleIdsRaw === "string") {
        outboundPayload = {
          mode: payload.mode,
          kbArticleIds: payload.kbArticleIdsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        };
      }
      const res = await dispatchAssetGroupJob(group.id, {
        jobType,
        payload: outboundPayload,
      });
      notify?.(
        "success",
        `Dispatched ${res?.count ?? 0} job(s) to "${res?.groupName || group.name}"`
      );
      onDispatched?.(res);
      onClose?.();
    } catch (err) {
      notify?.("error", err?.body?.message || err?.error || err?.message || "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        Dispatch job to {group?.name || "group"}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert
            severity="info"
            sx={{
              bgcolor: BRAND.alert?.infoSoft || BRAND.tealSoft,
              color: BRAND.dark,
              "& .MuiAlert-icon": { color: BRAND.teal },
            }}
          >
            One job will be created per member device. {group?.kind === "dynamic"
              ? "Membership is evaluated now from the group's criteria."
              : "Current membership is read at request time."}
          </Alert>

          <TextField
            select
            size="small"
            fullWidth
            label="Job type"
            value={jobType}
            onChange={(e) => handleTypeChange(e.target.value)}
            disabled={catalogLoading}
            helperText={catalogLoading ? "Loading job types…" : ""}
          >
            {jobTypes.map((t) => (
              <MenuItem key={t.jobType} value={t.jobType}>
                {t.label || t.jobType}
              </MenuItem>
            ))}
          </TextField>

          {jobType === "facts_snapshot" ? (
            <TextField
              select
              size="small"
              fullWidth
              label="Fact type"
              value={payload.factType || ""}
              onChange={(e) => setPayload({ factType: e.target.value })}
            >
              {FACT_TYPES.map((v) => (
                <MenuItem key={v} value={v}>{v}</MenuItem>
              ))}
            </TextField>
          ) : null}

          {jobType === "agent_update" ? (
            <TextField
              size="small"
              fullWidth
              label="Target version"
              placeholder="e.g. 1.1.11"
              value={payload.version || ""}
              onChange={(e) => setPayload({ version: e.target.value })}
              helperText="The agent fetches the matching binary for its platform/arch."
            />
          ) : null}

          {jobType === "patch_install" ? (
            <>
              <TextField
                select
                size="small"
                fullWidth
                label="Mode"
                value={payload.mode || ""}
                onChange={(e) => setPayload({ ...payload, mode: e.target.value })}
              >
                {PATCH_INSTALL_MODES.map((v) => (
                  <MenuItem key={v} value={v}>{v}</MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                fullWidth
                label="KB article IDs (optional)"
                placeholder="KB5034123, KB5034439"
                value={payload.kbArticleIdsRaw || ""}
                onChange={(e) =>
                  setPayload({ ...payload, kbArticleIdsRaw: e.target.value })
                }
                helperText="Comma-separated. Leave blank to install all pending."
              />
            </>
          ) : null}

          {jobType === "patch_scan" ? (
            <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
              No additional parameters — agents will scan and report.
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ color: BRAND.gray, textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          variant="contained"
          startIcon={submitting ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <RocketLaunchOutlinedIcon />}
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          {submitting ? "Dispatching…" : "Dispatch"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Detail drawer (members list + add/remove) ────────────────────

function GroupDetailDrawer({ open, group, onClose, devices, canManage, notify, onMembersChanged }) {
  const [members, setMembers] = React.useState([]);
  const [membersTotal, setMembersTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [addPickerOpen, setAddPickerOpen] = React.useState(false);
  const [dispatchOpen, setDispatchOpen] = React.useState(false);
  const [memberSearch, setMemberSearch] = React.useState("");
  const [memberPaginationModel, setMemberPaginationModel] = React.useState({
    page: 0,
    pageSize: 25,
  });
  const [memberSortModel, setMemberSortModel] = React.useState([
    { field: "hostname", sort: "asc" },
  ]);
  const confirm = useConfirm();

  const loadMembers = React.useCallback(async () => {
    if (!group) return;
    setLoading(true);
    try {
      const currentSort = memberSortModel?.[0] || { field: "hostname", sort: "asc" };
      const res = await listAssetGroupMembers(group.id, {
        page: memberPaginationModel.page + 1,
        pageSize: memberPaginationModel.pageSize,
        search: memberSearch || undefined,
        sortBy: currentSort.field,
        sortDir: currentSort.sort || "asc",
      });

      setMembers(Array.isArray(res?.items) ? res.items : []);
      setMembersTotal(Number(res?.total ?? res?.count ?? 0));
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Failed to load members");
      setMembers([]);
      setMembersTotal(0);
    } finally {
      setLoading(false);
    }
  }, [group, memberPaginationModel.page, memberPaginationModel.pageSize, memberSearch, memberSortModel, notify]);

  React.useEffect(() => {
    if (open && group) {
      const handle = setTimeout(() => {
        loadMembers();
      }, memberSearch ? 350 : 0);
      return () => clearTimeout(handle);
    }

    setMembers([]);
    setMembersTotal(0);
    setAddPickerOpen(false);
    setDispatchOpen(false);
  }, [open, group, loadMembers, memberSearch]);

  React.useEffect(() => {
    if (!open || !group) return;
    setMemberSearch("");
    setMemberPaginationModel({ page: 0, pageSize: 25 });
    setMemberSortModel([{ field: "hostname", sort: "asc" }]);
  }, [open, group?.id]);

  // Decorate device IDs with hostnames using the known-devices index.
  const deviceIndex = React.useMemo(() => {
    const m = new Map();
    for (const d of devices) m.set(d.deviceId, d);
    return m;
  }, [devices]);

  const memberRows = React.useMemo(() => {
    return members.map((m) => {
      const deviceId = String(m?.deviceId ?? m?.device_id ?? "").trim();
      const dev = deviceIndex.get(deviceId);
      const connected =
        m?.connected === true ||
        String(m?.status || "").toLowerCase() === "online" ||
        dev?.connected === true;

      return {
        id: deviceId,
        deviceId,
        hostname: m?.hostname || dev?.hostname || null,
        connected,
        status: m?.status || (connected ? "online" : "offline"),
        addedAt: m?.addedAt || m?.added_at,
        addedBy: m?.addedBy || m?.added_by,
      };
    }).filter((m) => m.deviceId);
  }, [members, deviceIndex]);

  const handleRemove = async (deviceId) => {
    const ok = await confirm({
      title: "Remove device from group?",
      body: `${deviceId} will no longer be a member of "${group?.name}".`,
      confirmText: "Remove",
      danger: true,
    });
    if (!ok || !group) return;
    try {
      await removeAssetGroupMember(group.id, deviceId);
      notify("success", "Device removed from group");
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Remove failed");
    }
  };

  const handleAddMembers = async (deviceIds) => {
    if (!group || deviceIds.length === 0) {
      setAddPickerOpen(false);
      return;
    }
    try {
      const res = await addAssetGroupMembers(group.id, deviceIds);
      notify(
        "success",
        `${res?.added ?? deviceIds.length} device(s) added to ${group.name}`
      );
      setAddPickerOpen(false);
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Add failed");
    }
  };

  const memberIds = React.useMemo(
    () => new Set(members.map((m) => m.deviceId)),
    [members]
  );

  const columns = [
    {
      field: "hostname",
      headerName: "Hostname",
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.dark }}>
            {params.row.hostname || params.row.deviceId.slice(0, 12)}
          </Typography>
          <Typography sx={{ fontSize: 11, color: BRAND.gray, fontFamily: "monospace" }}>
            {params.row.deviceId}
          </Typography>
        </Box>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      width: 100,
      renderCell: (params) =>
        params.row.connected ? (
          <Chip
            size="small"
            label="online"
            sx={{
              height: 20,
              fontSize: 11,
              bgcolor: ROLE.positiveSoft,
              color: ROLE.positive,
              fontWeight: 700,
            }}
          />
        ) : (
          <Chip
            size="small"
            label="offline"
            sx={{
              height: 20,
              fontSize: 11,
              bgcolor: BRAND.darkSoft,
              color: BRAND.gray,
              fontWeight: 700,
            }}
          />
        ),
    },
    {
      // For static groups this is when the operator manually added the
      // device. For dynamic groups the same column shows "Evaluated"
      // with the cache snapshot time — not a meaningful per-device
      // datum (membership is computed, not stamped). The header label
      // adapts so operators don't read it as "this device joined the
      // group at that timestamp".
      field: "addedAt",
      headerName: group?.kind === "dynamic" ? "Evaluated" : "Added",
      flex: 0.7,
      minWidth: 140,
      renderCell: (params) => formatDate(params.value),
    },
    // Manual remove only makes sense on static groups. Dynamic
    // members are computed; removing one would just reappear on the
    // next evaluation. We hide the action entirely to avoid the
    // operator wondering why the row keeps coming back.
    canManage && group?.kind === "static"
      ? {
          field: "actions",
          headerName: "",
          width: 60,
          sortable: false,
          renderCell: (params) => (
            <IconButton
              size="small"
              onClick={() => handleRemove(params.row.deviceId)}
              sx={{ color: BRAND.gray, "&:hover": { color: ROLE.critical } }}
              title="Remove from group"
            >
              <RemoveCircleOutlineOutlinedIcon fontSize="small" />
            </IconButton>
          ),
        }
      : null,
  ].filter(Boolean);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: "100%", sm: 560, lg: 640 },
            p: 2,
            bgcolor: "#fff",
          },
        },
      }}
    >
      {group ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
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
                  flexShrink: 0,
                }}
              >
                <GroupWorkOutlinedIcon fontSize="small" />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 800, color: BRAND.dark, lineHeight: 1.2 }}>
                  {group.name}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                  <KindChip kind={group.kind} />
                  <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
                    {memberRows.length} member(s)
                  </Typography>
                </Stack>
              </Box>
            </Box>
            <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
              <CloseOutlinedIcon fontSize="small" />
            </IconButton>
          </Box>

          {group.description ? (
            <Typography sx={{ fontSize: 13, color: BRAND.dark, lineHeight: 1.55 }}>
              {group.description}
            </Typography>
          ) : null}

          <Divider sx={{ borderColor: BRAND.border }} />

          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: BRAND.gray,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Members
              </Typography>
              <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
                {membersTotal} total · sorted by hostname
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              {/* Dispatch is available for both static and dynamic
                  groups (admin-gated). For dynamic the backend
                  re-evaluates criteria at request time, so the count
                  shown in the dialog matches what gets fanned out. */}
              {canManage ? (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<RocketLaunchOutlinedIcon />}
                  onClick={() => setDispatchOpen(true)}
                  disabled={memberRows.length === 0}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    bgcolor: BRAND.teal,
                    "&:hover": { bgcolor: BRAND.tealHover },
                  }}
                  title={
                    memberRows.length === 0
                      ? "Group is empty — nothing to dispatch to"
                      : "Run a job on every member of this group"
                  }
                >
                  Dispatch job
                </Button>
              ) : null}
              {canManage && group.kind === "static" ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddOutlinedIcon />}
                  onClick={() => setAddPickerOpen(true)}
                  sx={{
                    textTransform: "none",
                    borderColor: BRAND.teal,
                    color: BRAND.teal,
                    "&:hover": { bgcolor: BRAND.tealSoft, borderColor: BRAND.tealHover },
                  }}
                >
                  Add devices
                </Button>
              ) : null}
            </Stack>
          </Box>

          <Stack spacing={1} sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <TextField
              size="small"
              placeholder="Search hostname / device ID…"
              value={memberSearch}
              onChange={(e) => {
                setMemberPaginationModel((prev) => ({ ...prev, page: 0 }));
                setMemberSearch(e.target.value);
              }}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
                  </InputAdornment>
                ),
              }}
            />

            <Box sx={{ flex: 1, minHeight: 360, overflow: "hidden" }}>
              <DataGrid
                rows={memberRows}
                columns={columns}
                density="compact"
                disableRowSelectionOnClick
                loading={loading}
                rowCount={membersTotal}
                paginationMode="server"
                sortingMode="server"
                paginationModel={memberPaginationModel}
                onPaginationModelChange={setMemberPaginationModel}
                sortModel={memberSortModel}
                onSortModelChange={(model) => {
                  const nextModel =
                    model.length > 0 ? model : [{ field: "hostname", sort: "asc" }];
                  setMemberPaginationModel((prev) => ({ ...prev, page: 0 }));
                  setMemberSortModel(nextModel);
                }}
                pageSizeOptions={[10, 25, 50, 100]}
                sx={DATAGRID_SX}
              />
            </Box>
          </Stack>
        </Box>
      ) : null}

      {/* Inline add-device picker reuses the create dialog's UI shape
          so the operator's mental model stays consistent. We keep it
          inside the drawer (not as a sibling Dialog of the page) so
          closing the drawer unmounts both. */}
      <AddMembersDialog
        open={addPickerOpen}
        onClose={() => setAddPickerOpen(false)}
        onConfirm={handleAddMembers}
        excludeIds={memberIds}
        groupName={group?.name || ""}
      />

      <DispatchJobDialog
        open={dispatchOpen}
        group={group}
        onClose={() => setDispatchOpen(false)}
        onDispatched={() => {
          // No member-list refetch needed — dispatch doesn't change
          // membership. We still close the dialog and let the
          // operator follow the jobs in the Jobs page.
        }}
        notify={notify}
      />
    </Drawer>
  );
}

function AddMembersDialog({ open, onClose, onConfirm, excludeIds, groupName }) {
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());

  React.useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: BRAND.dark, fontWeight: 800 }}>
        Add devices to {groupName}
      </DialogTitle>
      <DialogContent>
        <KnownDevicesPicker
          open={open}
          selectedIds={selectedIds}
          excludeIds={excludeIds}
          selectedLabel="selected"
          emptyLabel="No devices available to add."
          onToggleDevice={(deviceId) => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(deviceId)) next.delete(deviceId);
              else next.add(deviceId);
              return next;
            });
          }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: "none", color: BRAND.dark }}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(Array.from(selectedIds))}
          variant="contained"
          disabled={selectedIds.size === 0}
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          Add ({selectedIds.size})
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main page component ──────────────────────────────────────────

export default function AssetGroups() {
  const { auth } = useAuthContext();
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [groups, setGroups] = React.useState([]);
  const [devices, setDevices] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState(null);
  const [drawerGroup, setDrawerGroup] = React.useState(null);
  const [ungroupedOpen, setUngroupedOpen] = React.useState(false);
  const [coverage, setCoverage] = React.useState(null);
  const [coverageLoading, setCoverageLoading] = React.useState(false);
  const [coverageError, setCoverageError] = React.useState("");
  const [snackbar, setSnackbar] = React.useState({ open: false, severity: "success", message: "" });
  const confirm = useConfirm();

  const notify = React.useCallback((severity, message) => {
    setSnackbar({ open: true, severity, message });
  }, []);

  const loadGroups = React.useCallback(async () => {
    try {
      const res = await listAssetGroups();
      setGroups(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Failed to load groups");
    }
  }, [notify]);

  const loadDevices = React.useCallback(async () => {
    try {
      // Lightweight lookup cache for decorating existing group members.
      // Device pickers themselves use server-side search/pagination and
      // do not depend on this page-level list.
      const res = await listKnownDevices({ page: 1, pageSize: 100, includeGroups: true });
      const items = Array.isArray(res?.items) ? res.items : [];
      setDevices(
        items.map((d) => ({
          deviceId: String(d?.deviceId || "").trim(),
          hostname: String(d?.hostname || "").trim(),
          connected: d?.connected === true,
        })).filter((d) => d.deviceId)
      );
    } catch {
      // Devices list isn't critical for the groups page itself; just
      // means the picker / hostname decoration shows IDs only.
      notify("error", "Failed to load device list");
    }
  }, [notify]);


  const loadCoverage = React.useCallback(async () => {
    try {
      setCoverageLoading(true);
      setCoverageError("");
      const res = await getAssetGroupCoverage();
      setCoverage(res || null);
    } catch (err) {
      const message = err?.body?.message || err?.message || "Failed to load group coverage";
      setCoverage(null);
      setCoverageError(message);
    } finally {
      setCoverageLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([loadGroups(), loadDevices(), loadCoverage()]).finally(() => setLoading(false));
  }, [loadGroups, loadDevices, loadCoverage]);

  const handleDelete = async (group) => {
    const ok = await confirm({
      title: "Delete group?",
      body: `"${group.name}" will be removed permanently. Devices will not be affected, just their membership in this group.`,
      confirmText: "Delete group",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAssetGroup(group.id);
      notify("success", `Group "${group.name}" deleted`);
      // If the drawer was open on this group, close it before refresh
      // — the next loadGroups won't include it anymore.
      if (drawerGroup?.id === group.id) setDrawerGroup(null);

      // Deleting either a static or dynamic group can immediately change
      // fleet coverage, so refresh the groups list and the coverage summary
      // together. This keeps the Group coverage notice in sync without
      // requiring a full page reload.
      await Promise.all([loadGroups(), loadCoverage()]);
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Delete failed");
    }
  };

  const columns = [
    {
      field: "name",
      headerName: "Name",
      flex: 1.2,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.dark }}>
            {params.row.name}
          </Typography>
          {params.row.description ? (
            <Typography
              sx={{
                fontSize: 12,
                color: BRAND.gray,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {params.row.description}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    {
      field: "kind",
      headerName: "Type",
      width: 110,
      renderCell: (params) => <KindChip kind={params.value} />,
    },
    {
      field: "memberCount",
      headerName: "Members",
      width: 110,
      // Dynamic groups whose member count hasn't been evaluated yet
      // come back with `memberCount: null` — render as em-dash with a
      // tooltip so operators know what's going on instead of seeing
      // "0" and assuming the criteria match nothing.
      renderCell: (params) => {
        if (params.value == null) {
          return (
            <Tooltip title="Open the group to evaluate its dynamic membership">
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.gray }}>
                —
              </Typography>
            </Tooltip>
          );
        }
        return (
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.dark }}>
            {params.value}
          </Typography>
        );
      },
    },
    {
      field: "updatedAt",
      headerName: "Last update",
      flex: 0.7,
      minWidth: 140,
      renderCell: (params) => (
        <Typography sx={{ fontSize: 12.5, color: BRAND.dark }}>
          {formatDate(params.value)}
        </Typography>
      ),
    },
    canManage
      ? {
          field: "actions",
          headerName: "",
          width: 96,
          sortable: false,
          align: "right",
          renderCell: (params) => (
            <Stack direction="row" spacing={0.5}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameTarget(params.row);
                }}
                sx={{ color: BRAND.gray, "&:hover": { color: BRAND.dark } }}
                title="Rename"
              >
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(params.row);
                }}
                sx={{ color: BRAND.gray, "&:hover": { color: ROLE.critical } }}
                title="Delete"
              >
                <DeleteOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          ),
        }
      : null,
  ].filter(Boolean);

  return (
    <Box sx={{ pb: 4 }}>
      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            mb: 1.5,
            flexWrap: "wrap",
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
              Asset Groups
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: BRAND.gray, mt: 0.25 }}>
              Organize the fleet into named buckets for filtering and bulk operations.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshOutlinedIcon />}
              onClick={() => {
                setLoading(true);
                Promise.all([loadGroups(), loadDevices(), loadCoverage()]).finally(() => setLoading(false));
              }}
              sx={{
                textTransform: "none",
                borderColor: BRAND.border,
                color: BRAND.dark,
                "&:hover": { borderColor: BRAND.teal, bgcolor: BRAND.tealSoft },
              }}
            >
              Refresh
            </Button>
            {canManage ? (
              <Button
                variant="contained"
                startIcon={<GroupAddOutlinedIcon />}
                onClick={() => setCreateOpen(true)}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  bgcolor: BRAND.teal,
                  "&:hover": { bgcolor: BRAND.tealHover },
                }}
              >
                New group
              </Button>
            ) : null}
          </Stack>
        </Box>

        {!canManage ? (
          <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
            Asset Groups are read-only for your role. Contact a tenant admin to create or edit groups.
          </Alert>
        ) : null}

        <Box sx={{ mb: 2 }}>
          <GroupCoverageNotice
            coverage={coverage}
            loading={coverageLoading}
            error={coverageError}
            onRefresh={loadCoverage}
            onViewUngrouped={() => setUngroupedOpen(true)}
          />
        </Box>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : groups.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center", color: BRAND.gray }}>
            <GroupWorkOutlinedIcon sx={{ fontSize: 48, color: BRAND.gray, mb: 1 }} />
            <Typography variant="body2">
              No asset groups yet. {canManage ? 'Click "New group" to create your first one.' : ""}
            </Typography>
          </Box>
        ) : (
          <DataGrid
            rows={groups}
            columns={columns}
            density="compact"
            disableRowSelectionOnClick
            onRowClick={(params) => setDrawerGroup(params.row)}
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={{ ...DATAGRID_SX, cursor: "pointer" }}
            autoHeight
          />
        )}
      </SectionPaper>

      <CreateGroupDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        coverage={coverage}
        coverageLoading={coverageLoading}
        coverageError={coverageError}
        onRefreshCoverage={loadCoverage}
        onViewUngrouped={() => setUngroupedOpen(true)}
        onCreated={(group) => {
          notify("success", `Group "${group?.name || ""}" created`);
          loadGroups();
          loadCoverage();
        }}
      />

      <RenameGroupDialog
        open={Boolean(renameTarget)}
        group={renameTarget}
        onClose={() => setRenameTarget(null)}
        onUpdated={(g) => {
          notify("success", `Group renamed to "${g?.name || ""}"`);
          loadGroups();
          if (drawerGroup?.id === g?.id) setDrawerGroup(g);
        }}
      />

      <GroupDetailDrawer
        open={Boolean(drawerGroup)}
        group={drawerGroup}
        onClose={() => setDrawerGroup(null)}
        devices={devices}
        canManage={canManage}
        notify={notify}
        onMembersChanged={() => { loadGroups(); loadCoverage(); }}
      />

      <UngroupedDevicesDrawer
        open={ungroupedOpen}
        onClose={() => setUngroupedOpen(false)}
        notify={notify}
      />

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </Box>
  );
}
