// src/pages/AssetsDashboard.jsx
//
// Asset Management — dashboard surface (first tab under the
// `Asset Management` sidebar item). Redesigned to homologate with
// the rest of the app:
//
//   - KPI row uses the shared <SummaryCard> (icon + title caps +
//     value), not the old two-tone <MetricCard> with the loud teal
//     banner. Matches Overview/Jobs/PKI visually.
//   - Charts live inside <SectionPaper variant="panel"> — same
//     borderRadius 3 + BRAND.shadow the Clásicas use.
//   - Bottom section is just the hosts table. The old
//     "Selected Host Detail" panel was removed (the operator can
//     drill through via the hostname link / future row click into a
//     dedicated Host page).
//   - "Total Printers" KPI and "Printers by Vendor" chart removed
//     — the printers view moved to its own card under Hardware
//     Inventory where it belongs.
//
// Data sources (unchanged):
//   * /api/v1/dashboard/summary  → KPI counts + chart aggregates
//   * /api/v1/dashboard/hosts    → host rows for the table
//   * /api/v1/orchestrator/devices-connected → online/offline flag
//     for the new "Online" column (traffic-light dot).

import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Backdrop,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Fade,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AppsRoundedIcon from "@mui/icons-material/AppsRounded";
import ComputerRoundedIcon from "@mui/icons-material/ComputerRounded";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";
import WifiTetheringOutlinedIcon from "@mui/icons-material/WifiTetheringOutlined";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";

import { dashboardApi } from "../api/dashboard";
import { httpGetJson } from "../api/http";
import {
  getHardwareInventoryDetail,
  getSoftwareInventoryHostApps,
} from "../api/inventoryDashboard";
import { getConnectedDevices, getLatestAgentVersions } from "../api/overview";
import { listAssetGroups, listAssetGroupMembers } from "../api/assetGroups";

import HostsTable from "../components/Charts/HostsTable";
import InactiveAssetsTable from "../components/AssetManagement/InactiveAssetsTable";
import SectionPaper from "../components/common/SectionPaper";
import SummaryCard from "../components/common/SummaryCard";
import CompositionBars from "../components/common/CompositionBars";
import { AgentVersionDonut, DonutCard } from "../components/Overview/FleetComposition";
import { useCachedFetch } from "../hooks/useCachedFetch";

import { BRAND, ROLE } from "../theme/brand";

// ---------- deep-link filter helpers -----------------------------------------
//
// The Asset Management page accepts filter params from the Overview's
// fleet-wide donuts (OS platform / Agent versions). Example URLs:
//   ?page=assets&platform=windows
//   ?page=assets&versionBucket=one_behind
//
// Anything the page doesn't recognize is silently ignored — we don't
// trust the query string to set arbitrary state beyond the whitelist
// below.

const ALLOWED_PLATFORMS = new Set(["windows", "macos", "linux"]);
const ALLOWED_VERSION_BUCKETS = new Set([
  "current",
  "one_behind",
  "older",
  "unknown"
]);

function readUrlFilters() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const platform = (params.get("platform") || "").toLowerCase();
  const versionBucket = (params.get("versionBucket") || "").toLowerCase();
  // Phase 4: optional `groupId` deep-link from the Asset Groups tab —
  // operator can click "View devices" on a group and land on the
  // Dashboard pre-scoped to that group's membership. We coerce to a
  // positive integer string; anything else falls back to "".
  const rawGroupId = String(params.get("groupId") || "").trim();
  const groupIdValid = /^[0-9]+$/.test(rawGroupId) && Number(rawGroupId) > 0;
  return {
    platform: ALLOWED_PLATFORMS.has(platform) ? platform : "",
    versionBucket: ALLOWED_VERSION_BUCKETS.has(versionBucket)
      ? versionBucket
      : "",
    groupId: groupIdValid ? rawGroupId : "",
  };
}

// Semver-ish comparison returning a classic -1 / 0 / +1 trichotomy.
// Non-numeric segments become 0 — matches the tolerance of the
// classifyAgentVersions helper used by the Overview donut.
function compareVersions(a, b) {
  const parse = (v) =>
    String(v || "").split(".").map((x) => Number(x) || 0);
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai !== bi) return ai > bi ? 1 : -1;
  }
  return 0;
}

// Mirror of FleetComposition/classifyAgentVersions bucketing. Kept
// local here because AssetsDashboard is in a different component
// subtree and pulling a shared util out for 15 lines wasn't worth
// adding a new shared module.
function bucketOfVersion(version, canonicalLatest) {
  if (!version || !canonicalLatest) return "unknown";
  const cmp = compareVersions(version, canonicalLatest);
  if (cmp >= 0) return "current";
  const v = String(version).split(".").map((x) => Number(x) || 0);
  const l = String(canonicalLatest).split(".").map((x) => Number(x) || 0);
  if (v[0] === l[0] && v[1] === l[1] && Math.abs((l[2] || 0) - (v[2] || 0)) <= 2) {
    return "one_behind";
  }
  return "older";
}

function normalizePlatform(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "windows" || v === "win32" || v.startsWith("win")) return "windows";
  if (v === "macos" || v === "darwin" || v === "osx" || v === "mac os x") return "macos";
  if (v === "linux") return "linux";
  return null;
}

function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getOsVersionDisplayTitle(row) {
  return (
    row?.display_title ||
    row?.commercial_name ||
    row?.os_label ||
    "Unknown OS"
  );
}

function getOsVersionDisplaySubtitle(row) {
  return (
    row?.display_subtitle ||
    row?.technical_version ||
    row?.os_version ||
    ""
  );
}

function formatDetailValue(value, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

function formatDetailDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h24",
  });
}

function formatBytesToGb(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDetailPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${parsed.toFixed(1)}%`;
}

function coalesceValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return value;
  }
  return undefined;
}

const HOST_SORT_FIELDS = new Set([
  "hostname",
  "agentId",
  "osPlatform",
  "osVersion",
  "manufacturer",
  "model",
  "lastLogonUser",
  "localIp",
  "agentVersion",
  "collectedAtUtc",
]);

function normalizeHostRow(row = {}) {
  const agentId = coalesceValue(row.agentId, row.agent_id, row.deviceId, row.device_id);
  const hostname = coalesceValue(row.hostname, row.host, row.deviceName, row.device_name);
  const osPlatform = coalesceValue(row.osPlatform, row.os_platform, row.platform);
  const osVersion = coalesceValue(row.osVersion, row.os_version, row.version);
  const lastLogonUser = coalesceValue(row.lastLogonUser, row.last_logon_user);
  const localIp = coalesceValue(row.localIp, row.local_ip);
  const agentVersion = coalesceValue(row.agentVersion, row.agent_version);
  const collectedAtUtc = coalesceValue(row.collectedAtUtc, row.collected_at_utc);

  return {
    ...row,
    agentId,
    agent_id: agentId,
    hostname,
    osPlatform,
    os_platform: osPlatform,
    osVersion,
    os_version: osVersion,
    lastLogonUser,
    last_logon_user: lastLogonUser,
    localIp,
    local_ip: localIp,
    agentVersion,
    agent_version: agentVersion,
    collectedAtUtc,
    collected_at_utc: collectedAtUtc,
    manufacturer: coalesceValue(row.manufacturer),
    model: coalesceValue(row.model),
  };
}

function buildHostsQuery({ page, pageSize, search, sortBy, sortDir }) {
  const params = new URLSearchParams();
  params.set("page", String(page + 1));
  params.set("pageSize", String(pageSize));

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch.length >= 3) {
    params.set("search", normalizedSearch);
  }

  params.set("sortBy", HOST_SORT_FIELDS.has(sortBy) ? sortBy : "hostname");
  params.set("sortDir", sortDir === "desc" ? "desc" : "asc");

  return params.toString();
}

function normalizeHostDetailPayload(payload, fallbackHost = {}) {
  const source = payload?.agent || payload?.host || payload?.item || payload || {};
  return {
    agentId: coalesceValue(
      source.agentId,
      source.agent_id,
      source.deviceId,
      source.device_id,
      fallbackHost.agent_id,
      fallbackHost.agentId
    ),
    hostname: coalesceValue(
      source.hostname,
      source.host,
      source.deviceName,
      source.device_name,
      fallbackHost.hostname
    ),
    platform: coalesceValue(source.platform, source.os_platform, fallbackHost.os_platform),
    os: coalesceValue(source.distro, source.os, source.os_version, fallbackHost.os_version),
    agentVersion: coalesceValue(source.agentVersion, source.agent_version, fallbackHost.agent_version),
    lastLogonUser: coalesceValue(source.lastLogonUser, source.last_logon_user, fallbackHost.last_logon_user),
    localIp: coalesceValue(source.localIp, source.local_ip, fallbackHost.local_ip),
    lastSeenAt: coalesceValue(source.lastSeenAt, source.last_seen_at, source.lastHeartbeat, source.last_heartbeat),
    raw: source,
  };
}

function normalizeHardwareDetailPayload(payload, agentId) {
  const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
  const exact = items.find((item) => String(item?.agentId || item?.agent_id || "") === String(agentId));
  return exact || items[0] || null;
}

function DetailStatCard({ title, value, icon, accent = BRAND.teal, helper }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: "100%",
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(190,190,190,0.07))",
        boxShadow: "0 6px 18px rgba(59,64,77,0.07)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.25 }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            bgcolor: `${accent}22`,
            color: accent,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Typography sx={{ fontSize: 12, fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.4 }}>
          {title}
        </Typography>
      </Stack>
      <Typography sx={{ fontSize: 20, fontWeight: 900, color: BRAND.dark, lineHeight: 1.15 }} noWrap title={String(value || "—")}>
        {value || "—"}
      </Typography>
      {helper ? (
        <Typography sx={{ mt: 0.75, fontSize: 12, color: "text.secondary" }} noWrap title={helper}>
          {helper}
        </Typography>
      ) : null}
    </Paper>
  );
}

function DetailField({ label, value, mono = false }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.35,
          fontSize: 13,
          fontWeight: 700,
          color: BRAND.dark,
          fontFamily: mono ? "monospace" : "inherit",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={String(value || "—")}
      >
        {value || "—"}
      </Typography>
    </Box>
  );
}

function FieldGrid({ children }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" },
        gap: 1.5,
      }}
    >
      {children}
    </Box>
  );
}

function AgentDetailWorkbench({
  selectedHost,
  connected,
  loading,
  error,
  profile,
  hardware,
  softwareRows,
  softwareTotal,
  softwareLoading = false,
  softwarePaginationModel,
  onSoftwarePaginationModelChange,
  printerRows = [],
  printersLoading = false,
  tab,
  onTabChange,
  onBack,
}) {
  const hostname = formatDetailValue(profile?.hostname || selectedHost?.hostname || selectedHost?.agent_id, "Unknown host");
  const agentId = formatDetailValue(profile?.agentId || selectedHost?.agent_id || selectedHost?.agentId);
  const platform = formatDetailValue(profile?.platform || hardware?.platform);
  const agentVersion = formatDetailValue(profile?.agentVersion || selectedHost?.agent_version);
  const softwareCount = Number.isFinite(Number(softwareTotal)) ? Number(softwareTotal) : softwareRows.length;
  const softwarePage = Number(softwarePaginationModel?.page || 0);
  const softwarePageSize = Number(softwarePaginationModel?.pageSize || 8);

  return (
    <Box>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", md: "flex-start" }}
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ minWidth: 0 }}>
          <IconButton
            aria-label="Back to devices"
            onClick={onBack}
            sx={{
              border: `1px solid ${BRAND.border}`,
              bgcolor: BRAND.surface,
              boxShadow: "0 4px 12px rgba(59,64,77,0.08)",
              "&:hover": { bgcolor: BRAND.tealSoft },
            }}
          >
            <ArrowBackRoundedIcon />
          </IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", gap: 0.75 }}>
              <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 900, color: BRAND.dark }} noWrap title={hostname}>
                {hostname}
              </Typography>
              <Chip
                size="small"
                label={connected ? "Online" : "Offline"}
                sx={{
                  bgcolor: connected ? ROLE.positiveSoft : BRAND.surfaceMuted,
                  color: connected ? ROLE.positive : BRAND.gray,
                  fontWeight: 800,
                }}
              />
              <Chip size="small" label={platform} sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800 }} />
            </Stack>
            <Typography sx={{ mt: 0.5, fontSize: 12, color: "text.secondary", fontFamily: "monospace" }} noWrap title={agentId}>
              {agentId}
            </Typography>
          </Box>
        </Stack>

      </Stack>

      {error ? (
        <Paper elevation={0} sx={{ p: 1.5, mb: 2, borderRadius: 2, border: `1px solid ${ROLE.caution}55`, bgcolor: ROLE.cautionSoft }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>
            Some agent detail data could not be loaded. Showing the available device information.
          </Typography>
        </Paper>
      ) : null}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <DetailStatCard title="Agent version" value={agentVersion} icon={<SystemUpdateAltOutlinedIcon fontSize="small" />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <DetailStatCard title="Serial" value={formatDetailValue(hardware?.serial)} icon={<ComputerRoundedIcon fontSize="small" />} accent={BRAND.tealText} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <DetailStatCard title="Software apps" value={softwareCount} icon={<AppsRoundedIcon fontSize="small" />} accent={ROLE.positive} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <DetailStatCard title="Disk usage" value={formatDetailPercent(hardware?.diskUsagePct)} icon={<StorageRoundedIcon fontSize="small" />} accent={ROLE.critical} helper={formatBytesToGb(hardware?.diskUsedBytes)} />
        </Grid>
      </Grid>

      <Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${BRAND.border}`, overflow: "hidden", bgcolor: BRAND.surface }}>
        <Tabs
          value={tab}
          onChange={onTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 1,
            borderBottom: `1px solid ${BRAND.border}`,
            "& .MuiTab-root": { textTransform: "none", fontWeight: 800, minHeight: 48 },
            "& .MuiTabs-indicator": { bgcolor: BRAND.teal, height: 3, borderRadius: 999 },
          }}
        >
          <Tab label="Agent" />
          <Tab label="Hardware" />
          <Tab label="Software" />
          <Tab label="Printers" />
        </Tabs>

        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {loading ? (
            <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 6 }}>
              <CircularProgress size={28} sx={{ color: BRAND.teal }} />
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Loading agent detail…</Typography>
            </Stack>
          ) : null}

          {!loading && tab === 0 ? (
            <FieldGrid>
              <DetailField label="Hostname" value={hostname} />
              <DetailField label="Agent ID" value={agentId} mono />
              <DetailField label="Platform" value={platform} />
              <DetailField label="OS" value={formatDetailValue(profile?.os || hardware?.distro)} />
              <DetailField label="Agent version" value={agentVersion} mono />
              <DetailField label="Last logon user" value={formatDetailValue(profile?.lastLogonUser)} />
              <DetailField label="Local IP" value={formatDetailValue(profile?.localIp)} mono />
              <DetailField label="Last seen" value={formatDetailDate(profile?.lastSeenAt || hardware?.collectedAtUtc)} />
              <DetailField label="Status" value={connected ? "Online" : "Offline"} />
            </FieldGrid>
          ) : null}

          {!loading && tab === 1 ? (
            <FieldGrid>
              <DetailField label="Serial" value={formatDetailValue(hardware?.serial)} mono />
              <DetailField label="Manufacturer" value={formatDetailValue(hardware?.manufacturer)} />
              <DetailField label="Model" value={formatDetailValue(hardware?.model)} />
              <DetailField label="CPU" value={formatDetailValue(hardware?.cpuBrand)} />
              <DetailField label="Physical cores" value={formatDetailValue(hardware?.physicalCores)} />
              <DetailField label="Memory" value={formatBytesToGb(hardware?.totalMemoryBytes)} />
              <DetailField label="Disk total" value={formatBytesToGb(hardware?.diskTotalBytes)} />
              <DetailField label="Disk used" value={formatBytesToGb(hardware?.diskUsedBytes)} />
              <DetailField label="Disk usage" value={formatDetailPercent(hardware?.diskUsagePct)} />
              <DetailField label="Battery" value={formatDetailPercent(hardware?.batteryPercent)} />
              <DetailField label="Collected at" value={formatDetailDate(hardware?.collectedAtUtc)} />
            </FieldGrid>
          ) : null}

          {!loading && tab === 2 ? (
            <Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }} justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Box>
                  <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
                    Installed applications
                  </Typography>
                  <Typography sx={{ mt: 0.25, fontSize: 12, color: "text.secondary" }}>
                    Paginated software inventory for this device.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}>
                  {softwareLoading ? <CircularProgress size={16} sx={{ color: BRAND.teal }} /> : null}
                  <Chip size="small" label={`${softwareCount} apps detected`} sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800 }} />
                </Stack>
              </Stack>
              <Paper elevation={0} sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 2, overflow: "hidden" }}>
                <TableContainer sx={{ maxHeight: 360 }}>
                  <Table stickyHeader size="small" aria-label="agent software table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Application</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Publisher</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Source</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Detected</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {softwareRows.map((app, index) => (
                        <TableRow key={app.id || `${app.name}-${index}`} hover>
                          <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>{formatDetailValue(app.name)}</TableCell>
                          <TableCell>{formatDetailValue(app.publisher)}</TableCell>
                          <TableCell>{formatDetailValue(app.source)}</TableCell>
                          <TableCell>{formatDetailDate(app.detectedAtUtc || app.detected_at_utc)}</TableCell>
                        </TableRow>
                      ))}
                      {softwareRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} sx={{ color: "text.secondary", py: 3, textAlign: "center" }}>
                            {softwareLoading ? "Loading software inventory…" : "No software inventory found for this device."}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={softwareCount}
                  page={softwarePage}
                  rowsPerPage={softwarePageSize}
                  rowsPerPageOptions={[8, 16, 24, 50]}
                  onPageChange={(_, nextPage) => {
                    onSoftwarePaginationModelChange?.({ page: nextPage, pageSize: softwarePageSize });
                  }}
                  onRowsPerPageChange={(event) => {
                    const nextPageSize = Number(event.target.value || 8);
                    onSoftwarePaginationModelChange?.({ page: 0, pageSize: nextPageSize });
                  }}
                  labelRowsPerPage="Rows per page:"
                  sx={{
                    borderTop: `1px solid ${BRAND.border}`,
                    bgcolor: BRAND.surface,
                    "& .MuiTablePagination-toolbar": {
                      minHeight: 48,
                      px: { xs: 1, sm: 2 },
                    },
                    "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
                      fontSize: 12,
                      color: "text.secondary",
                    },
                  }}
                />
              </Paper>
            </Box>
          ) : null}

          {!loading && tab === 3 ? (
            <Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ xs: "stretch", sm: "center" }}
                justifyContent="space-between"
                sx={{ mb: 1.5 }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
                    Configured printers
                  </Typography>
                  <Typography sx={{ mt: 0.25, fontSize: 12, color: "text.secondary" }}>
                    Print queues this device knows about, ordered with the
                    default first, then network printers, then local.
                  </Typography>
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}
                >
                  {printersLoading ? (
                    <CircularProgress size={16} sx={{ color: BRAND.teal }} />
                  ) : null}
                  <Chip
                    size="small"
                    label={`${printerRows.length} printer${printerRows.length === 1 ? "" : "s"} detected`}
                    sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800 }}
                  />
                </Stack>
              </Stack>
              <Paper
                elevation={0}
                sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 2, overflow: "hidden" }}
              >
                <TableContainer sx={{ maxHeight: 360 }}>
                  <Table stickyHeader size="small" aria-label="agent printers table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Driver</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Port</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {printerRows.map((p, index) => (
                        <TableRow key={p.id || p.installId || `${p.name}-${index}`} hover>
                          <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: "wrap" }}>
                              <span>{formatDetailValue(p.name)}</span>
                              {p.isDefault ? (
                                <Chip
                                  size="small"
                                  label="Default"
                                  sx={{ bgcolor: ROLE.positiveSoft, color: ROLE.positive, fontWeight: 800, height: 18 }}
                                />
                              ) : null}
                              {p.isShared ? (
                                <Chip
                                  size="small"
                                  label="Shared"
                                  sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800, height: 18 }}
                                />
                              ) : null}
                            </Stack>
                          </TableCell>
                          <TableCell>{formatDetailValue(p.driver)}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                            {formatDetailValue(p.port)}
                          </TableCell>
                          <TableCell>{p.isNetwork ? "Network" : "Local"}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={p.status || "unknown"}
                              sx={{
                                bgcolor:
                                  p.status === "online"
                                    ? ROLE.positiveSoft
                                    : p.status === "error"
                                    ? ROLE.criticalSoft || `${ROLE.critical}33`
                                    : p.status === "offline"
                                    ? BRAND.surfaceMuted
                                    : BRAND.surfaceMuted,
                                color:
                                  p.status === "online"
                                    ? ROLE.positive
                                    : p.status === "error"
                                    ? ROLE.critical
                                    : "text.secondary",
                                fontWeight: 800,
                                textTransform: "capitalize",
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                      {printerRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ color: "text.secondary", py: 3, textAlign: "center" }}>
                            {printersLoading
                              ? "Loading printers…"
                              : "No printers configured on this device."}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          ) : null}
        </Box>
      </Paper>
    </Box>
  );
}

// ---------- component --------------------------------------------------------

export default function AssetsDashboard({ onAssetsEmptyStateChange, refreshNonce = 0, onNavigateToHardwareInventory }) {
  // Set<agent_id> of devices currently connected (has an active
  // gRPC session in the last heartbeat window). Drives the "Online
  // now" KPI and the traffic-light dot on each row in the hosts
  // table. Same endpoint the Overview Hero uses.
  const [connectedIds, setConnectedIds] = React.useState(() => new Set());

  // Deep-link filters from the Overview donuts. Read once on mount
  // (stored in state so the user can dismiss them with the chip X
  // without the URL fighting back). Clearing the chip only updates
  // state — the URL param lingers, which is fine because a manual
  // reload would just re-apply the same filter and the user already
  // saw the toggle.
  const initialFilters = React.useMemo(() => readUrlFilters(), []);
  const [platformFilter, setPlatformFilter] = React.useState(
    initialFilters.platform || ""
  );
  const [versionBucketFilter, setVersionBucketFilter] = React.useState(
    initialFilters.versionBucket || ""
  );
  // Phase 4: filter by Asset Group membership. Two pieces of state —
  // the selected group id (as a string so the dropdown plays nicely
  // with empty=""), and the resolved Set of deviceIds for that group.
  // Loaded on demand: empty selection skips the fetch entirely so
  // operators who never use the filter pay zero extra requests.
  const [groupFilter, setGroupFilter] = React.useState(
    initialFilters.groupId || ""
  );
  const [groupCatalog, setGroupCatalog] = React.useState([]);
  const [groupMembers, setGroupMembers] = React.useState(null); // null = not loaded; Set otherwise
  const [groupMembersLoading, setGroupMembersLoading] = React.useState(false);
  const [assetWorkbenchView, setAssetWorkbenchView] = React.useState("devices"); // devices | inactive-assets
  const [hostsSearchInput, setHostsSearchInput] = React.useState("");
  const [hostsSearch, setHostsSearch] = React.useState("");
  const [hostsPaginationModel, setHostsPaginationModel] = React.useState({
    page: 0,
    pageSize: 25,
  });
  const [hostsSortModel, setHostsSortModel] = React.useState([
    { field: "hostname", sort: "asc" },
  ]);

  const [selectedAgent, setSelectedAgent] = React.useState(null);
  const [agentDetailTab, setAgentDetailTab] = React.useState(0);
  const [agentDetailLoading, setAgentDetailLoading] = React.useState(false);
  const [agentDetailError, setAgentDetailError] = React.useState("");
  const [agentProfile, setAgentProfile] = React.useState(null);
  const [agentHardware, setAgentHardware] = React.useState(null);
  const [agentSoftwareRows, setAgentSoftwareRows] = React.useState([]);
  const [agentSoftwareTotal, setAgentSoftwareTotal] = React.useState(0);
  const [agentSoftwareLoading, setAgentSoftwareLoading] = React.useState(false);
  const [agentSoftwarePaginationModel, setAgentSoftwarePaginationModel] = React.useState({
    page: 0,
    pageSize: 8,
  });
  // Printers tab state. Single fetch (no pagination — printer counts
  // per device are typically <10, pathologic <50; the device_printers
  // table indexes (agent_id) for fast retrieval and we render the
  // full list).
  const [agentPrinterRows, setAgentPrinterRows] = React.useState([]);
  const [agentPrintersLoading, setAgentPrintersLoading] = React.useState(false);

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      const normalized = hostsSearchInput.trim();
      const nextSearch = normalized.length === 0 || normalized.length >= 3 ? normalized : "";

      setHostsPaginationModel((prev) => {
        if (hostsSearch === nextSearch) return prev;
        return { ...prev, page: 0 };
      });
      setHostsSearch(nextSearch);
    }, 450);

    return () => window.clearTimeout(id);
  }, [hostsSearchInput, hostsSearch]);

  const activeHostsSort = hostsSortModel?.[0] || { field: "hostname", sort: "asc" };
  const hostsSortBy = HOST_SORT_FIELDS.has(activeHostsSort.field)
    ? activeHostsSort.field
    : "hostname";
  const hostsSortDir = activeHostsSort.sort === "desc" ? "desc" : "asc";

  // Bundled loader: summary + hosts + latestMap fetched together so the
  // cache snapshot is consistent — the table, KPIs and version donut
  // all reflect the same point in time when the page rehydrates.
  // `latestMap` keys "windows:arm64" → "1.1.2" classify each host's
  // agent_version into current / one_behind / older buckets.
  //
  // Important: we keep explicit success/error flags for summary and
  // hosts. This prevents the Welcome sidebar item / empty-state overlay
  // from appearing when the IDP/backend is waking up, timing out, or
  // returning an auth/server error. Empty state should only mean "loaded
  // successfully and there is truly no inventory data".
  const loader = React.useCallback(async () => {
    const hostsQuery = buildHostsQuery({
      page: hostsPaginationModel.page,
      pageSize: hostsPaginationModel.pageSize,
      search: hostsSearch,
      sortBy: hostsSortBy,
      sortDir: hostsSortDir,
    });

    const [sumRes, hostsRes, latestRes] = await Promise.allSettled([
      dashboardApi.getSummary(),
      httpGetJson(`/api/v1/dashboard/hosts?${hostsQuery}`),
      getLatestAgentVersions(),
    ]);

    const summaryOk = sumRes.status === "fulfilled";
    const rawHostsPayload = hostsRes.status === "fulfilled" ? hostsRes.value : null;
    const rawHostItems = Array.isArray(rawHostsPayload)
      ? rawHostsPayload
      : Array.isArray(rawHostsPayload?.items)
      ? rawHostsPayload.items
      : [];
    const hostsOk = hostsRes.status === "fulfilled" && (Array.isArray(rawHostsPayload) || Array.isArray(rawHostsPayload?.items));

    const summary = summaryOk ? sumRes.value : null;
    const hosts = hostsOk ? rawHostItems.map(normalizeHostRow) : [];
    const totalHosts = Number(rawHostsPayload?.total ?? rawHostItems.length ?? 0);
    const calculatedTotalPages = Math.max(
      1,
      Math.ceil(totalHosts / Number(hostsPaginationModel.pageSize || 25))
    );

    const hostsMeta = {
      total: hostsOk ? totalHosts : 0,
      page: hostsOk
        ? Number(rawHostsPayload?.page ?? hostsPaginationModel.page + 1)
        : hostsPaginationModel.page + 1,
      pageSize: hostsOk
        ? Number(rawHostsPayload?.pageSize ?? hostsPaginationModel.pageSize)
        : hostsPaginationModel.pageSize,
      totalPages: hostsOk
        ? Number(rawHostsPayload?.totalPages ?? calculatedTotalPages)
        : 1,
      search: hostsOk ? String(rawHostsPayload?.search ?? hostsSearch ?? "") : hostsSearch,
      sortBy: hostsSortBy,
      sortDir: hostsSortDir,
    };

    const latestMap = {};
    if (latestRes.status === "fulfilled" && Array.isArray(latestRes.value)) {
      for (const e of latestRes.value) {
        if (e?.ok && e.data?.latestVersion) {
          latestMap[`${e.platform}:${e.arch}`] = e.data.latestVersion;
        }
      }
    }

    return {
      summary,
      hosts,
      hostsMeta,
      latestMap,
      loadState: {
        summaryLoaded: summaryOk,
        hostsLoaded: hostsOk,
        summaryError: !summaryOk,
        hostsError: !hostsOk,
      },
    };
  }, [
    hostsPaginationModel.page,
    hostsPaginationModel.pageSize,
    hostsSearch,
    hostsSortBy,
    hostsSortDir,
  ]);

  const hostsCacheKey = `assets:bundle:hosts:${hostsPaginationModel.page}:${hostsPaginationModel.pageSize}:${hostsSearch}:${hostsSortBy}:${hostsSortDir}`;
  const { data, loading, refetch } = useCachedFetch(hostsCacheKey, loader);
  // Memoize the destructured slices so identity is stable across
  // renders — `data?.foo ?? []` would create a fresh fallback every
  // render and invalidate downstream useMemo deps unnecessarily.
  const summary = data?.summary ?? null;
  const hosts = React.useMemo(() => data?.hosts ?? [], [data]);
  const hostsMeta = React.useMemo(
    () =>
      data?.hostsMeta ?? {
        total: 0,
        page: hostsPaginationModel.page + 1,
        pageSize: hostsPaginationModel.pageSize,
        totalPages: 1,
        search: hostsSearch,
        sortBy: hostsSortBy,
        sortDir: hostsSortDir,
      },
    [data, hostsPaginationModel.page, hostsPaginationModel.pageSize, hostsSearch, hostsSortBy, hostsSortDir]
  );
  const latestMap = React.useMemo(() => data?.latestMap ?? {}, [data]);

  const loadState = React.useMemo(
    () =>
      data?.loadState ?? {
        summaryLoaded: false,
        hostsLoaded: false,
        summaryError: false,
        hostsError: false,
      },
    [data]
  );

  // Page-level refresh signal from the Assets wrapper — bumps the
  // cached fetch so the active tab pulls fresh data.
  React.useEffect(() => {
    if (refreshNonce > 0) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  // Connected-devices set (drives the "Online" dot + KPI). Refreshes
  // on a gentle 30s cadence so the table reflects disconnects within
  // ~30s of happening without hammering the backend. Visibility-aware:
  // skips the tick when the tab is hidden.
  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await getConnectedDevices();
        if (cancelled) return;
        // The endpoint shape is `{ ok, tenantId, deviceIds: [...],
        // count }` but we defensively handle `{ items: [...] }` and
        // a bare array too in case an older deployment is still
        // returning one of those legacy shapes.
        const ids =
          (Array.isArray(res?.deviceIds) && res.deviceIds) ||
          (Array.isArray(res?.items) && res.items) ||
          (Array.isArray(res) && res) ||
          [];
        setConnectedIds(new Set(ids.map((id) => String(id))));
      } catch (e) {
        if (cancelled) return;
        // Silent: an auth blip or backend hiccup should leave the
        // dots gray until next tick, not crash the page.
        console.warn("devices-connected fetch failed:", e?.message || e);
        setConnectedIds(new Set());
      }
    };

    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Phase 4: Asset-group filter wiring ─────────────────────────
  //
  // (1) Catalog: load the tenant's groups once. We only need {id, name,
  //     kind, memberCount} to render the dropdown — refresh follows the
  //     page-level refreshNonce so a freshly-created group appears
  //     after the operator hits Refresh.
  React.useEffect(() => {
    let cancelled = false;
    listAssetGroups()
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        setGroupCatalog(items);
      })
      .catch((err) => {
        if (cancelled) return;
        // Soft-fail: dashboard works without the filter dropdown if the
        // backend doesn't return groups (e.g. older deployment).
        console.warn("asset-groups list failed:", err?.message || err);
        setGroupCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  // (2) Members for the selected group. Refetched whenever the
  //     selection or the page-level refresh nonce changes — dynamic
  //     groups especially benefit, since "Refresh" should re-evaluate.
  React.useEffect(() => {
    if (!groupFilter) {
      setGroupMembers(null);
      setGroupMembersLoading(false);
      return undefined;
    }
    let cancelled = false;
    setGroupMembersLoading(true);
    listAssetGroupMembers(groupFilter)
      .then((res) => {
        if (cancelled) return;
        const ids = Array.isArray(res?.items) ? res.items.map((m) => String(m.deviceId)) : [];
        setGroupMembers(new Set(ids));
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("asset-group members fetch failed:", err?.message || err);
        // Empty set rather than null on error — the table shows zero
        // rows under the chip, which signals "filter is active and
        // matched nothing" instead of silently bypassing the filter.
        setGroupMembers(new Set());
      })
      .finally(() => {
        if (!cancelled) setGroupMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupFilter, refreshNonce]);


  const handleAgentSelect = React.useCallback((host) => {
    setSelectedAgent(host || null);
    setAgentDetailTab(0);
    setAgentDetailError("");
    setAgentSoftwarePaginationModel({ page: 0, pageSize: 8 });
  }, []);

  const handleCloseAgentDetail = React.useCallback(() => {
    setSelectedAgent(null);
    setAgentDetailTab(0);
    setAgentDetailError("");
    setAgentProfile(null);
    setAgentHardware(null);
    setAgentSoftwareRows([]);
    setAgentSoftwareTotal(0);
    setAgentSoftwareLoading(false);
    setAgentSoftwarePaginationModel({ page: 0, pageSize: 8 });
  }, []);

  const openInactiveAssetsWorkbench = React.useCallback(() => {
    handleCloseAgentDetail();
    setAssetWorkbenchView("inactive-assets");
  }, [handleCloseAgentDetail]);

  const openDevicesWorkbench = React.useCallback(() => {
    handleCloseAgentDetail();
    setAssetWorkbenchView("devices");
  }, [handleCloseAgentDetail]);

  React.useEffect(() => {
    const agentId = selectedAgent?.agent_id || selectedAgent?.agentId;
    if (!agentId) return undefined;

    let cancelled = false;
    setAgentDetailLoading(true);
    setAgentDetailError("");
    setAgentProfile(normalizeHostDetailPayload(null, selectedAgent));
    setAgentHardware(null);

    Promise.allSettled([
      dashboardApi.getHostDetail(agentId),
      getHardwareInventoryDetail({ search: agentId, page: 1, pageSize: 10 }),
    ])
      .then(([profileRes, hardwareRes]) => {
        if (cancelled) return;

        if (profileRes.status === "fulfilled") {
          setAgentProfile(normalizeHostDetailPayload(profileRes.value, selectedAgent));
        } else {
          setAgentProfile(normalizeHostDetailPayload(null, selectedAgent));
        }

        if (hardwareRes.status === "fulfilled") {
          setAgentHardware(normalizeHardwareDetailPayload(hardwareRes.value, agentId));
        }

        const failed = [profileRes, hardwareRes].some((res) => res.status === "rejected");
        if (failed) {
          setAgentDetailError("partial");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("agent detail load failed:", err?.message || err);
        setAgentDetailError("full");
      })
      .finally(() => {
        if (!cancelled) setAgentDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAgent]);

  React.useEffect(() => {
    const agentId = selectedAgent?.agent_id || selectedAgent?.agentId;
    if (!agentId) return undefined;

    let cancelled = false;
    setAgentSoftwareLoading(true);

    getSoftwareInventoryHostApps(agentId, {
      page: agentSoftwarePaginationModel.page + 1,
      pageSize: agentSoftwarePaginationModel.pageSize,
    })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.items) ? res.items : [];
        setAgentSoftwareRows(rows);
        setAgentSoftwareTotal(Number(res?.total ?? rows.length));
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("agent software inventory load failed:", err?.message || err);
        setAgentSoftwareRows([]);
        setAgentSoftwareTotal(0);
        setAgentDetailError((prev) => prev || "partial");
      })
      .finally(() => {
        if (!cancelled) setAgentSoftwareLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAgent, agentSoftwarePaginationModel.page, agentSoftwarePaginationModel.pageSize]);

  // Printers loader. Single fetch when selectedAgent changes (no
  // pagination needed — small list per device). Failure does NOT
  // surface as a hard error on the detail view (just keeps empty
  // array + sets the soft "partial" flag), so a pre-1.1.18 agent or
  // a tenant whose backend is still mid-deploy don't break the
  // whole detail experience.
  React.useEffect(() => {
    const agentId = selectedAgent?.agent_id || selectedAgent?.agentId;
    if (!agentId) {
      setAgentPrinterRows([]);
      return undefined;
    }

    let cancelled = false;
    setAgentPrintersLoading(true);

    dashboardApi
      .getHostPrinters(agentId)
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : [];
        setAgentPrinterRows(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("agent printers load failed:", err?.message || err);
        setAgentPrinterRows([]);
        setAgentDetailError((prev) => prev || "partial");
      })
      .finally(() => {
        if (!cancelled) setAgentPrintersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAgent]);

  const selectedGroup = React.useMemo(
    () => groupCatalog.find((g) => String(g.id) === String(groupFilter)) || null,
    [groupCatalog, groupFilter]
  );

  const dashboardLoadedSuccessfully =
    !loading &&
    loadState.summaryLoaded &&
    loadState.hostsLoaded &&
    !loadState.summaryError &&
    !loadState.hostsError;

  const hasNoAssetsData =
    dashboardLoadedSuccessfully &&
    !hostsSearch &&
    !platformFilter &&
    !versionBucketFilter &&
    !groupFilter &&
    Number(hostsMeta.total || 0) === 0 &&
    Number(summary?.activeHosts ?? 0) === 0;

  React.useEffect(() => {
    onAssetsEmptyStateChange?.(hasNoAssetsData);
  }, [hasNoAssetsData, onAssetsEmptyStateChange]);

  // Canonical "latest" version across platforms — we pick the max so
  // a tenant with only macOS targets still classifies correctly. Kept
  // as a derived value (not state) so it updates live when the
  // metadata fetch lands.
  const canonicalLatest = React.useMemo(() => {
    const values = Object.values(latestMap || {}).filter(Boolean);
    if (values.length === 0) return null;
    return values.sort((a, b) => compareVersions(b, a))[0];
  }, [latestMap]);

  // Client-side filter applied over the raw hosts list. Two concerns:
  //   * platformFilter → match on host.os_platform (normalized).
  //   * versionBucketFilter → compute bucket per host against
  //     canonicalLatest, keep matches only.
  // Filtering is deliberately additive (AND): chips can combine so a
  // user can deep-link "Windows devices one-behind" in the future.
  const filteredHosts = React.useMemo(() => {
    const groupFilterActive = !!groupFilter;
    if (!platformFilter && !versionBucketFilter && !groupFilterActive) return hosts;
    // While the member set is still loading, hide rows so the operator
    // doesn't briefly see the unfiltered fleet under an active chip.
    if (groupFilterActive && groupMembers === null) return [];
    return hosts.filter((h) => {
      if (platformFilter) {
        const p = normalizePlatform(h.os_platform);
        if (p !== platformFilter) return false;
      }
      if (versionBucketFilter) {
        const bucket = bucketOfVersion(h.agent_version, canonicalLatest);
        if (bucket !== versionBucketFilter) return false;
      }
      if (groupFilterActive && groupMembers) {
        if (!groupMembers.has(String(h.agent_id))) return false;
      }
      return true;
    });
  }, [
    hosts,
    platformFilter,
    versionBucketFilter,
    canonicalLatest,
    groupFilter,
    groupMembers,
  ]);

  // ── Data shaped for the composition charts ─────────────────────────
  //
  // All three breakdown charts (OS Platform, Top Manufacturer, OS
  // Versions) consume the shared `<CompositionBars>` component, which
  // expects `items: [{ label, value, color?, sub? }]`. We derive
  // client-side from the dashboard summary so the categorical colors
  // match what the rest of the app uses for each platform family —
  // and so we don't have to change the backend to change a palette.

  // Color palette keyed by normalized platform. Matches the chips the
  // HostsTable uses so the two surfaces read as a single language.
  const platformColors = React.useMemo(
    () => ({
      windows: BRAND.dark,
      macos: BRAND.teal,
      linux: "#ed6c02",
    }),
    []
  );

  // Donut-shaped data for the shared OS platform chart from Overview's
  // FleetComposition. Same palette as the bar items above so swapping
  // visual idioms doesn't change which slice maps to which platform.
  // Cycles through teal/dark/cyan/gray for any tail beyond the keyed
  // platforms — matches the Overview donut's color sequence.
  function formatPlatformLabel(value) {
    return String(value || "Unknown")
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  const osDonutData = React.useMemo(() => {
    const cycleColors = [BRAND.teal, BRAND.dark, BRAND.cyan, BRAND.gray];
    const rows = Array.isArray(summary?.osPlatform) ? summary.osPlatform : [];
    return rows
      .map((r, i) => {
        const rawName = String(r?.os_platform ?? r?.name ?? "Unknown");
        const normalized = normalizePlatform(rawName);
        return {
          name: formatPlatformLabel(rawName),
          value: Number(r?.host_count ?? r?.count ?? 0),
          color: normalized ? platformColors[normalized] : cycleColors[i % cycleColors.length],
        };
      })
      .filter((d) => d.value > 0);
  }, [summary, platformColors]);

const osVersionItems = React.useMemo(() => {
  const rows = Array.isArray(summary?.osVersions) ? summary.osVersions : [];

  return rows.map((r, rowIndex) => {
    const platform = String(r?.os_platform ?? "").toLowerCase();
    const normalized = normalizePlatform(platform);
    const color = normalized ? platformColors[normalized] : BRAND.gray;
    const parentValue = toSafeNumber(r?.host_count ?? r?.count);
    const children = Array.isArray(r?.children)
      ? r.children
          .map((child, childIndex) => ({
            id: `${getOsVersionDisplayTitle(r)}-${child?.technical_version || child?.version_label || childIndex}`,
            label:
              child?.display_title ||
              (child?.version_label ? `Version ${child.version_label}` : null) ||
              child?.technical_version ||
              child?.os_version ||
              "Unknown version",
            sub:
              child?.display_subtitle ||
              (child?.build_number ? `Build ${child.build_number}` : null) ||
              child?.technical_version ||
              "",
            value: toSafeNumber(child?.host_count ?? child?.count),
            percentage:
              child?.percentage != null
                ? Number(child.percentage)
                : parentValue > 0
                ? (toSafeNumber(child?.host_count ?? child?.count) / parentValue) * 100
                : 0,
            color,
            raw: child,
          }))
          .filter((child) => Number(child.value || 0) > 0)
      : [];

    return {
      id: `${getOsVersionDisplayTitle(r)}-${r?.technical_version || r?.version_label || rowIndex}`,
      label: getOsVersionDisplayTitle(r),
      sub: getOsVersionDisplaySubtitle(r),
      value: parentValue,
      color,
      children,
      raw: r,
    };
  });
}, [summary, platformColors]);

  // `byVersion` for the AgentVersionDonut. The Overview endpoint
  // (/dashboard/agent-versions) would return this directly, but we
  // can reconstruct it from the hosts list without an extra call.
  const byVersion = React.useMemo(() => {
    const counts = new Map();
    for (const h of hosts) {
      const v = String(h?.agent_version || "").trim();
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([version, count]) => ({
      version,
      count,
    }));
  }, [hosts]);

  // KPI values derived from the loaded data. `onlineCount` is the
  // intersection of connected IDs and the raw hosts list so a
  // connected device that isn't in the dashboard/hosts response
  // (shouldn't happen, but belt-and-suspenders) doesn't inflate the
  // number. OS-platform + agent-version cardinality come straight
  // from the summary + hosts aggregates.
  const kpis = React.useMemo(() => {
    const activeHosts = Number(summary?.activeHosts ?? hosts.length ?? 0);
    const platformBuckets = Array.isArray(summary?.osPlatform)
      ? summary.osPlatform.length
      : new Set(
          hosts
            .map((h) => normalizePlatform(h.os_platform))
            .filter(Boolean)
        ).size;
    const versionSet = new Set(
      hosts
        .map((h) => String(h.agent_version || "").trim())
        .filter(Boolean)
    );
    const onlineCount = hosts.reduce(
      (acc, h) => acc + (connectedIds.has(String(h.agent_id)) ? 1 : 0),
      0
    );
    return {
      activeHosts,
      onlineCount,
      inactiveAssets7d: Number(summary?.inactiveAssets7d ?? 0),
      versionCount: versionSet.size,
    };
  }, [summary, hosts, connectedIds]);

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "calc(100dvh - 220px)",
        pb: 1,
      }}
    >
      {/* Row 1 — KPI strip. Matches the 2.4/3/3/3 layout used by
          Jobs/Audit/PKI hero rows: 4 shared SummaryCards, each with
          its own icon and semantic accent. */}
      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Active hosts"
            value={kpis.activeHosts}
            icon={<DevicesOtherOutlinedIcon />}
            titleHint="Devices that have communicated with Tracenium in the last 24 hours. Use this metric to understand recent activity across your enrolled environment."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Online now"
            value={kpis.onlineCount}
            icon={<WifiTetheringOutlinedIcon />}
            accent={ROLE.positive}
            tint={ROLE.positiveSoft}
            titleHint="Devices with an active gRPC session in the last heartbeat window. Refreshes every 30s."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Inactive assets"
            value={kpis.inactiveAssets7d}
            icon={<ReportProblemOutlinedIcon />}
            accent={ROLE.caution}
            tint={ROLE.cautionSoft}
            titleHint="Devices that have not reported inventory or telemetry in more than 7 days."
            onClick={openInactiveAssetsWorkbench}
            sx={
              assetWorkbenchView === "inactive-assets"
                ? { borderColor: ROLE.caution, boxShadow: "0 4px 12px rgba(166, 83, 27, 0.12)" }
                : null
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Agent versions"
            value={kpis.versionCount}
            icon={<SystemUpdateAltOutlinedIcon />}
          />
        </Grid>
      </Grid>

      {/* Row 2 — Fleet composition (4 cards in one row at md+):
          Agent versions · OS platform · Top manufacturers · OS versions.
          Previously OS versions was on its own full-width row below;
          consolidated here so the four breakdowns are scannable
          side by side. At md the columns are tight (md:3 each) so
          long version labels in the OS versions list ellipsize —
          that's an acceptable trade for the at-a-glance comparison.
          On lg+ each column gets more room. */}
      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
        <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            {/* AgentVersionDonut uses its own <Paper> wrapper via
                DonutCard — no SectionPaper around it or we'd double
                the border. */}
            <AgentVersionDonut
              byVersion={byVersion}
              latestMap={latestMap}
              loading={loading}
            />
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            {/* Reuses the same OS platform donut Overview shows in
                FleetComposition so the two surfaces stay visually
                consistent. */}
            <DonutCard
              title="OS platform"
              data={osDonutData}
              loading={loading}
              totalLabel="devices"
              fallbackLabel="No platform breakdown available"
            />
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            <CompositionBars
              title="OS versions"
              items={osVersionItems}
              totalLabel="hosts"
              emptyLabel="No version data"
              minHeight={280}
              maxItems={6}
              onClick={onNavigateToHardwareInventory}
              actionLabel="Open Hardware Inventory"
            />
          </Box>
        </Grid>
      </Grid>

      {/* Row 4 — Devices table. No more "Selected Host Detail"
          panel below — the table stands on its own. Deep-link
          filter chips render above when any filter is applied. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
            {selectedAgent ? (
              <AgentDetailWorkbench
                selectedHost={selectedAgent}
                connected={connectedIds.has(String(selectedAgent.agent_id || selectedAgent.agentId))}
                loading={agentDetailLoading}
                error={agentDetailError}
                profile={agentProfile}
                hardware={agentHardware}
                softwareRows={agentSoftwareRows}
                softwareTotal={agentSoftwareTotal}
                softwareLoading={agentSoftwareLoading}
                softwarePaginationModel={agentSoftwarePaginationModel}
                onSoftwarePaginationModelChange={setAgentSoftwarePaginationModel}
                printerRows={agentPrinterRows}
                printersLoading={agentPrintersLoading}
                tab={agentDetailTab}
                onTabChange={(_, nextTab) => setAgentDetailTab(nextTab)}
                onBack={handleCloseAgentDetail}
              />
            ) : assetWorkbenchView === "inactive-assets" ? (
              <InactiveAssetsTable
                assetGroups={groupCatalog}
                initialInactiveDays={7}
                onBack={openDevicesWorkbench}
                onRowClick={handleAgentSelect}
              />
            ) : (
              <>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  alignItems={{ xs: "stretch", md: "flex-start" }}
                  justifyContent="space-between"
                  sx={{ mb: 1.5, gap: 1.5 }}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    alignItems={{ xs: "stretch", sm: "flex-start" }}
                    spacing={1.5}
                    sx={{ minWidth: 0, flex: 1 }}
                  >
                    <Typography
                      sx={{
                        pt: { xs: 0, sm: "10px" },
                        fontSize: 16,
                        fontWeight: 800,
                        color: BRAND.dark,
                        flexShrink: 0,
                        lineHeight: 1.25,
                      }}
                    >
                      Devices
                    </Typography>

                    <TextField
                      size="small"
                      value={hostsSearchInput}
                      onChange={(e) => setHostsSearchInput(e.target.value)}
                      placeholder="Search devices..."
                      helperText={
                        hostsSearchInput.trim().length > 0 && hostsSearchInput.trim().length < 3
                          ? "Type at least 3 characters to search"
                          : " "
                      }
                      sx={{
                        width: { xs: "100%", sm: 300, md: 320 },
                        flexShrink: 0,
                        "& .MuiOutlinedInput-root": {
                          height: 40,
                          borderRadius: 1,
                          bgcolor: "background.paper",
                        },
                        "& .MuiInputBase-input": {
                          py: 0,
                          fontSize: 14,
                        },
                        "& .MuiFormHelperText-root": {
                          minHeight: 16,
                          mx: 0,
                          mt: 0.35,
                          fontSize: 11,
                          color: "text.secondary",
                          lineHeight: 1.25,
                        },
                      }}
                    />

                    {groupCatalog.length > 0 ? (
                      <TextField
                        select
                        size="small"
                        value={groupFilter}
                        onChange={(e) => setGroupFilter(e.target.value)}
                        helperText=" "
                        sx={{
                          width: { xs: "100%", sm: 220, md: 240 },
                          flexShrink: 0,
                          "& .MuiOutlinedInput-root": {
                            height: 40,
                            borderRadius: 1,
                            bgcolor: "background.paper",
                          },
                          "& .MuiInputBase-input": {
                            py: 0,
                            fontSize: 14,
                          },
                          "& .MuiFormHelperText-root": {
                            minHeight: 16,
                            mx: 0,
                            mt: 0.35,
                            fontSize: 11,
                            lineHeight: 1.25,
                          },
                        }}
                        SelectProps={{ displayEmpty: true }}
                      >
                        <MenuItem value="">
                          <Typography sx={{ fontSize: 14, color: BRAND.gray }}>
                            Filter by group…
                          </Typography>
                        </MenuItem>
                        {groupCatalog.map((g) => (
                          <MenuItem key={g.id} value={String(g.id)}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                                {g.name}
                              </Typography>
                              <Typography sx={{ fontSize: 11, color: BRAND.gray }}>
                                {g.kind === "dynamic" ? "dyn" : "static"}
                                {Number.isFinite(g.memberCount)
                                  ? ` · ${g.memberCount}`
                                  : ""}
                              </Typography>
                            </Stack>
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : null}
                  </Stack>
                  <Typography
                    sx={{
                      pt: { xs: 0, md: "10px" },
                      fontSize: 12,
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                      textAlign: { xs: "left", md: "right" },
                    }}
                  >
                    {filteredHosts.length} shown · {Number(hostsMeta.total || 0)} total · {kpis.onlineCount} online
                  </Typography>
                </Stack>

                {(platformFilter || versionBucketFilter || groupFilter) ? (
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ mb: 1.5, flexWrap: "wrap", gap: 0.5, alignItems: "center" }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: BRAND.gray, fontWeight: 600, mr: 0.5 }}
                    >
                      Filtered
                    </Typography>
                    {platformFilter ? (
                      <Chip
                        size="small"
                        label={`Platform: ${platformFilter}`}
                        onDelete={() => setPlatformFilter("")}
                        sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 600 }}
                      />
                    ) : null}
                    {versionBucketFilter ? (
                      <Chip
                        size="small"
                        label={`Version: ${versionBucketFilter.replace("_", " ")}`}
                        onDelete={() => setVersionBucketFilter("")}
                        sx={{ bgcolor: ROLE.cautionSoft, color: ROLE.caution, fontWeight: 600 }}
                      />
                    ) : null}
                    {groupFilter ? (
                      <Chip
                        size="small"
                        label={
                          groupMembersLoading
                            ? `Group: ${selectedGroup?.name || groupFilter}…`
                            : `Group: ${selectedGroup?.name || groupFilter} (${
                                groupMembers ? groupMembers.size : 0
                              })`
                        }
                        onDelete={() => setGroupFilter("")}
                        sx={{
                          bgcolor: BRAND.cyanSoft || BRAND.tealSoft,
                          color: BRAND.tealText,
                          fontWeight: 600,
                        }}
                      />
                    ) : null}
                  </Stack>
                ) : null}

                <HostsTable
                  rows={filteredHosts}
                  connectedIds={connectedIds}
                  selectedAgentId={selectedAgent?.agent_id || selectedAgent?.agentId}
                  onRowClick={handleAgentSelect}
                  loading={loading}
                  page={hostsPaginationModel.page}
                  pageSize={hostsPaginationModel.pageSize}
                  rowCount={Number(hostsMeta.total || 0)}
                  sortModel={hostsSortModel}
                  onPageChange={(nextPage) => setHostsPaginationModel((prev) => ({ ...prev, page: nextPage }))}
                  onPageSizeChange={(nextPageSize) =>
                    setHostsPaginationModel({ page: 0, pageSize: nextPageSize })
                  }
                  onSortChange={(field) => {
                    if (!HOST_SORT_FIELDS.has(field)) return;
                    setHostsPaginationModel((prev) => ({ ...prev, page: 0 }));
                    setHostsSortModel((prev) => {
                      const current = prev?.[0] || { field: "hostname", sort: "asc" };
                      const nextSort = current.field === field && current.sort === "asc" ? "desc" : "asc";
                      return [{ field, sort: nextSort }];
                    });
                  }}
                />
              </>
            )}
          </SectionPaper>
        </Grid>
      </Grid>

      {hasNoAssetsData && (
        <Backdrop
          open
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            borderRadius: 2,
            backgroundColor: "rgba(15, 23, 42, 0.20)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            pt: { xs: "26vh", sm: "24vh", md: "22vh" },
          }}
        >
          <Fade in={hasNoAssetsData} timeout={{ enter: 320, exit: 200 }}>
            <Paper
              elevation={0}
              sx={{
                width: "100%",
                maxWidth: 520,
                mx: 2,
                px: { xs: 3, sm: 4 },
                py: { xs: 3, sm: 4 },
                borderRadius: 3,
                textAlign: "center",
                border: `1px solid ${BRAND.border}`,
                // The empty-state dialog floats over a blurred backdrop,
                // so it gets a slightly deeper shadow than the standard
                // panel to separate it from the frosted layer behind.
                boxShadow: "0 18px 45px rgba(59,64,77,0.18)",
                transform: hasNoAssetsData
                  ? "scale(1) translateY(0)"
                  : "scale(0.96) translateY(12px)",
                opacity: hasNoAssetsData ? 1 : 0,
                transition: "transform 320ms ease, opacity 320ms ease",
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, color: BRAND.dark, mb: 1.5 }}
              >
                Aún no hay información disponible
              </Typography>
              <Typography
                sx={{
                  color: "text.secondary",
                  fontSize: 16,
                  lineHeight: 1.6,
                  mb: 3,
                }}
              >
                No tienes agentes instalados o tus agentes no han reportado datos todavía.
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                <Inventory2OutlinedIcon
                  sx={{
                    fontSize: 48,
                    color: BRAND.tealSoftStrong,
                    animation: "pulse 2s infinite",
                    "@keyframes pulse": {
                      "0%": { opacity: 0.4 },
                      "50%": { opacity: 1 },
                      "100%": { opacity: 0.4 },
                    },
                  }}
                />
              </Box>
            </Paper>
          </Fade>
        </Backdrop>
      )}
    </Box>
  );
}