// src/components/AssetManagement/InactiveAssetsTable.jsx
//
// Enterprise drilldown for Asset Management > Inactive Assets. The
// backend owns filtering/sorting/pagination through:
//   GET /api/v1/dashboard/inactive-assets
//
// This component intentionally mirrors the compact Devices table visual
// language: white surface, horizontal row rules, sticky header, teal
// hover, server-side pagination and responsive toolbars.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import { getInactiveAssets } from "../../api/inventoryDashboard";
import { BRAND, ROLE } from "../../theme/brand";

const SORT_FIELDS = new Set([
  "hostname",
  "platform",
  "serial",
  "lastSeenAt",
  "inactiveDays",
  "agentVersion",
  "manufacturer",
  "model",
]);

const PLATFORM_OPTIONS = [
  { value: "", label: "All platforms" },
  { value: "windows", label: "Windows" },
  { value: "windows server", label: "Windows Server" },
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
  { value: "unknown", label: "Unknown" },
];

const INACTIVE_DAYS_OPTIONS = [7, 14, 30, 60, 90];

const PLATFORM_STYLE = {
  windows: { bg: BRAND.darkSoft, fg: BRAND.dark },
  "windows server": { bg: BRAND.darkSoft, fg: BRAND.dark },
  macos: { bg: BRAND.tealSoft, fg: BRAND.tealText },
  linux: { bg: "rgba(237,108,2,0.12)", fg: "#8a4400" },
  ios: { bg: BRAND.tealSoft, fg: BRAND.tealText },
  android: { bg: "rgba(61,220,132,0.14)", fg: "#1b7a45" },
  unknown: { bg: BRAND.surfaceMuted, fg: BRAND.gray },
};

function coalesceValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return value;
  }
  return undefined;
}

function displayText(value, fallback = "—") {
  const next = coalesceValue(value);
  return next === undefined ? fallback : String(next);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatInactiveDays(value) {
  const days = Number(value || 0);
  if (!Number.isFinite(days) || days <= 0) return "—";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function normalizePlatform(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "unknown";
  if (value === "darwin" || value === "osx" || value === "mac os x") return "macos";
  if (value.startsWith("win") && value !== "windows server") return "windows";
  return value;
}

function PlatformChip({ platform }) {
  const normalized = normalizePlatform(platform);
  const style = PLATFORM_STYLE[normalized] || { bg: BRAND.surfaceMuted, fg: BRAND.dark };

  const fixedLabel = normalized === "macos" ? "macOS" : normalized === "ios" ? "iOS" : null;
  const useFixedCase = fixedLabel !== null;

  return (
    <Chip
      size="small"
      label={fixedLabel ?? normalized}
      sx={{
        height: 20,
        fontWeight: 800,
        fontSize: 11,
        textTransform: useFixedCase ? "none" : "capitalize",
        bgcolor: style.bg,
        color: style.fg,
        border: `1px solid ${style.fg}33`,
      }}
    />
  );
}

function InactiveSeverityChip({ inactiveDays }) {
  const days = Number(inactiveDays || 0);
  const palette = days >= 30
    ? { bg: ROLE.criticalSoft, fg: ROLE.critical, label: "30+ days" }
    : days >= 14
    ? { bg: ROLE.cautionSoft, fg: ROLE.caution, label: "14+ days" }
    : { bg: BRAND.tealSoft, fg: BRAND.tealText, label: "7+ days" };

  return (
    <Tooltip title={`Inactive for ${formatInactiveDays(days)}`} arrow>
      <Chip
        size="small"
        label={palette.label}
        sx={{
          height: 22,
          bgcolor: palette.bg,
          color: palette.fg,
          fontWeight: 900,
          fontSize: 11,
        }}
      />
    </Tooltip>
  );
}

function StatusChip({ status }) {
  const label = displayText(status, "INACTIVE").toUpperCase();
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 22,
        bgcolor: ROLE.cautionSoft,
        color: ROLE.caution,
        fontWeight: 900,
        fontSize: 11,
        letterSpacing: 0.2,
      }}
    />
  );
}

function SortableHeadCell({ field, label, sortModel, onSortChange, sx }) {
  const activeSort = sortModel?.[0] || { field: "lastSeenAt", sort: "asc" };
  const active = activeSort.field === field;

  return (
    <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap", ...sx }}>
      <TableSortLabel
        active={active}
        direction={active ? activeSort.sort || "asc" : "asc"}
        onClick={() => onSortChange?.(field)}
        sx={{
          "& .MuiTableSortLabel-icon": {
            color: `${BRAND.tealText} !important`,
          },
        }}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

function normalizeInactiveRow(row = {}, index = 0) {
  const agentId = coalesceValue(row.agentId, row.agent_id, row.deviceId, row.device_id);
  const hostname = coalesceValue(row.hostname, row.host, row.deviceName, row.device_name, agentId);
  const platform = coalesceValue(row.platform, row.osPlatform, row.os_platform);
  const agentVersion = coalesceValue(row.agentVersion, row.agent_version);
  const lastSeenAt = coalesceValue(row.lastSeenAt, row.last_seen_at, row.lastHeartbeat, row.last_heartbeat);

  return {
    ...row,
    id: String(agentId || hostname || index),
    agentId,
    agent_id: agentId,
    hostname,
    osPlatform: platform,
    os_platform: platform,
    platform,
    serial: coalesceValue(row.serial, row.serialNumber, row.serial_number),
    lastSeenAt,
    last_seen_at: lastSeenAt,
    inactiveDays: Number(row.inactiveDays ?? row.inactive_days ?? 0),
    agentVersion,
    agent_version: agentVersion,
    manufacturer: coalesceValue(row.manufacturer),
    model: coalesceValue(row.model),
    assetGroup: coalesceValue(row.assetGroup, row.asset_group),
    status: coalesceValue(row.status, "INACTIVE"),
  };
}

export default function InactiveAssetsTable({
  assetGroups = [],
  onBack,
  onRowClick,
  initialInactiveDays = 7,
}) {
  const [rows, setRows] = React.useState([]);
  const [totalRows, setTotalRows] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [assetGroupId, setAssetGroupId] = React.useState("");
  const [inactiveDays, setInactiveDays] = React.useState(initialInactiveDays);
  const [paginationModel, setPaginationModel] = React.useState({ page: 0, pageSize: 25 });
  const [sortModel, setSortModel] = React.useState([{ field: "lastSeenAt", sort: "asc" }]);

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      const normalized = searchInput.trim();
      const nextSearch = normalized.length === 0 || normalized.length >= 3 ? normalized : "";

      setPaginationModel((prev) => {
        if (search === nextSearch) return prev;
        return { ...prev, page: 0 };
      });
      setSearch(nextSearch);
    }, 450);

    return () => window.clearTimeout(id);
  }, [searchInput, search]);

  const activeSort = sortModel?.[0] || { field: "lastSeenAt", sort: "asc" };
  const sortBy = SORT_FIELDS.has(activeSort.field) ? activeSort.field : "lastSeenAt";
  const sortDir = activeSort.sort === "desc" ? "desc" : "asc";

  const loadInactiveAssets = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await getInactiveAssets({
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        search: search || undefined,
        platform: platform || undefined,
        assetGroupId: assetGroupId || undefined,
        inactiveDays,
        sortBy,
        sortDir,
      });

      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setRows(items.map(normalizeInactiveRow));
      setTotalRows(Number(res?.total ?? items.length ?? 0));
    } catch (err) {
      console.error("inactive assets load failed:", err);
      setRows([]);
      setTotalRows(0);
      setError("Inactive assets could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [assetGroupId, inactiveDays, paginationModel.page, paginationModel.pageSize, platform, search, sortBy, sortDir]);

  React.useEffect(() => {
    loadInactiveAssets();
  }, [loadInactiveAssets]);

  const handleSortChange = React.useCallback((field) => {
    if (!SORT_FIELDS.has(field)) return;
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setSortModel((prev) => {
      const current = prev?.[0] || { field: "lastSeenAt", sort: "asc" };
      const nextSort = current.field === field && current.sort === "asc" ? "desc" : "asc";
      return [{ field, sort: nextSort }];
    });
  }, []);

  const assetGroupOptions = Array.isArray(assetGroups) ? assetGroups : [];

  return (
    <Box sx={{ width: "100%" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", md: "flex-start" }}
        sx={{ mb: 2 }}
      >
        <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
          <Button
            variant="outlined"
            onClick={onBack}
            startIcon={<ArrowBackRoundedIcon />}
            sx={{ borderRadius: 999, fontWeight: 800, flexShrink: 0 }}
          >
            Back
          </Button>

          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", gap: 0.75 }}>
              <ReportProblemOutlinedIcon sx={{ color: ROLE.caution, fontSize: 24 }} />
              <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 900, color: BRAND.dark }}>
                Inactive Assets
              </Typography>
              <Chip
                size="small"
                label={`${Number(totalRows || 0)} total`}
                sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 900 }}
              />
              <Chip
                size="small"
                label={`${inactiveDays}+ days`}
                sx={{ bgcolor: ROLE.cautionSoft, color: ROLE.caution, fontWeight: 900 }}
              />
            </Stack>
            <Typography sx={{ mt: 0.4, fontSize: 13, color: "text.secondary" }}>
              Devices that have not communicated with Tracenium for more than {inactiveDays} days.
            </Typography>
          </Box>
        </Stack>

        <Button
          variant="outlined"
          startIcon={<RefreshRoundedIcon />}
          onClick={loadInactiveAssets}
          disabled={loading}
          sx={{ borderRadius: 999, fontWeight: 800, alignSelf: { xs: "flex-start", md: "center" } }}
        >
          Refresh
        </Button>
      </Stack>

      {error ? (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          bgcolor: BRAND.surface,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: assetGroupOptions.length > 0
                ? "2fr 1fr 1fr 1fr"
                : "2fr 1fr 1fr",
            },
            alignItems: "start",
          }}
        >
          <TextField
            size="small"
            label="Search inactive assets"
            placeholder="Search inactive assets..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            helperText={
              searchInput.trim().length > 0 && searchInput.trim().length < 3
                ? "Type at least 3 characters to search"
                : " "
            }
            fullWidth
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
            fullWidth
          >
            {PLATFORM_OPTIONS.map((option) => (
              <MenuItem key={option.value || "all"} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Inactive for"
            value={inactiveDays}
            onChange={(e) => {
              setPaginationModel((prev) => ({ ...prev, page: 0 }));
              setInactiveDays(Number(e.target.value));
            }}
            helperText=" "
            fullWidth
          >
            {INACTIVE_DAYS_OPTIONS.map((days) => (
              <MenuItem key={days} value={days}>
                {days}+ days
              </MenuItem>
            ))}
          </TextField>

          {assetGroupOptions.length > 0 ? (
            <TextField
              select
              size="small"
              label="Asset group"
              value={assetGroupId}
              onChange={(e) => {
                setPaginationModel((prev) => ({ ...prev, page: 0 }));
                setAssetGroupId(e.target.value);
              }}
              helperText=" "
              fullWidth
            >
              <MenuItem value="">All groups</MenuItem>
              {assetGroupOptions.map((group) => (
                <MenuItem key={group.id} value={String(group.id)}>
                  {group.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
        </Box>
      </Paper>

      <TableContainer
        sx={{
          maxHeight: { xs: 520, md: 620 },
          border: `1px solid ${BRAND.border}`,
          borderRadius: 2.5,
          overflow: "auto",
          position: "relative",
          bgcolor: BRAND.surface,
        }}
      >
        {loading ? (
          <LinearProgress
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 4,
              height: 3,
              bgcolor: "rgba(27,166,166,0.15)",
              "& .MuiLinearProgress-bar": { bgcolor: BRAND.teal },
            }}
          />
        ) : null}

        <Table stickyHeader size="small" aria-label="inactive assets table">
          <TableHead>
            <TableRow>
              <SortableHeadCell field="hostname" label="Host" sortModel={sortModel} onSortChange={handleSortChange} sx={{ minWidth: 220 }} />
              <SortableHeadCell field="platform" label="Platform" sortModel={sortModel} onSortChange={handleSortChange} sx={{ minWidth: 120 }} />
              <SortableHeadCell field="serial" label="Serial Number" sortModel={sortModel} onSortChange={handleSortChange} sx={{ minWidth: 150 }} />
              <SortableHeadCell field="lastSeenAt" label="Last Seen" sortModel={sortModel} onSortChange={handleSortChange} sx={{ minWidth: 190 }} />
              <SortableHeadCell field="inactiveDays" label="Inactive Days" sortModel={sortModel} onSortChange={handleSortChange} sx={{ minWidth: 145 }} />
              <SortableHeadCell field="agentVersion" label="Agent Version" sortModel={sortModel} onSortChange={handleSortChange} sx={{ minWidth: 140 }} />
              <TableCell sx={{ fontWeight: 800, minWidth: 220 }}>Manufacturer / Model</TableCell>
              <TableCell sx={{ fontWeight: 800, minWidth: 150 }}>Asset Group</TableCell>
              <TableCell sx={{ fontWeight: 800, minWidth: 120 }}>Status</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                hover
                onClick={() => onRowClick?.(row)}
                sx={{
                  cursor: onRowClick ? "pointer" : "default",
                  "&:hover": { backgroundColor: BRAND.rowHover },
                  "& > td": { borderBottom: `1px solid ${BRAND.border}`, py: 1.1 },
                }}
              >
                <TableCell sx={{ fontWeight: 800, color: BRAND.dark, minWidth: 220 }}>
                  {displayText(row.hostname)}
                </TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  <PlatformChip platform={row.platform} />
                </TableCell>
                <TableCell sx={{ fontFamily: "monospace", fontSize: 12, minWidth: 150 }}>
                  {displayText(row.serial)}
                </TableCell>
                <TableCell sx={{ minWidth: 190 }}>
                  {formatDate(row.lastSeenAt)}
                </TableCell>
                <TableCell sx={{ minWidth: 145 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>
                      {formatInactiveDays(row.inactiveDays)}
                    </Typography>
                    <InactiveSeverityChip inactiveDays={row.inactiveDays} />
                  </Stack>
                </TableCell>
                <TableCell sx={{ fontFamily: "monospace", fontSize: 12, minWidth: 140 }}>
                  {displayText(row.agentVersion)}
                </TableCell>
                <TableCell sx={{ minWidth: 220 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }} noWrap title={`${displayText(row.manufacturer)} / ${displayText(row.model)}`}>
                    {displayText(row.manufacturer)} / {displayText(row.model)}
                  </Typography>
                </TableCell>
                <TableCell sx={{ minWidth: 150 }}>{displayText(row.assetGroup)}</TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  <StatusChip status={row.status} />
                </TableCell>
              </TableRow>
            ))}

            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={9} sx={{ color: "text.secondary", py: 5 }}>
                  <Stack spacing={0.75} alignItems="center">
                    <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
                      No inactive assets found
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                      Try changing the inactive-days threshold, platform filter, or search term.
                    </Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          borderLeft: `1px solid ${BRAND.border}`,
          borderRight: `1px solid ${BRAND.border}`,
          borderBottom: `1px solid ${BRAND.border}`,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          overflow: "hidden",
          bgcolor: BRAND.surface,
        }}
      >
        <TablePagination
          component="div"
          count={Number(totalRows || 0)}
          page={Number(paginationModel.page || 0)}
          rowsPerPage={Number(paginationModel.pageSize || 25)}
          onPageChange={(_, nextPage) => setPaginationModel((prev) => ({ ...prev, page: nextPage }))}
          onRowsPerPageChange={(event) =>
            setPaginationModel({ page: 0, pageSize: Number(event.target.value) })
          }
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="Rows"
          sx={{
            border: 0,
            "& .MuiTablePagination-toolbar": { flexWrap: "wrap", rowGap: 1 },
            "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
              fontSize: 12,
              color: "text.secondary",
            },
          }}
        />
      </Box>
    </Box>
  );
}
