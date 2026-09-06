import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";

import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useConfirm } from "../components/common/ConfirmDialog";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WorkspacePremiumOutlinedIcon from "@mui/icons-material/WorkspacePremiumOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import GppMaybeOutlinedIcon from "@mui/icons-material/GppMaybeOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import BlockIcon from "@mui/icons-material/Block";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";

import {
  getCertificateActivity,
  getCertificateDetail,
  getCertificateSummary,
  listCertificateDevices,
  listDeviceCertificates,
  listDevicesWithoutActiveCertificates,
  listExpiringCertificates,
  revokeCertificate,
} from "../api/certificates";
import { listKnownDevices } from "../api/jobs";
import { useAuthContext } from "../auth/AuthContext";
import { useEffectiveTenantId } from "../hooks/useEffectiveTenantId";
import {
  downloadTextFile,
  getSearchParam,
  toCsv,
  updateSearchParams,
} from "../utils/browserState";

import { BRAND, DATAGRID_SX, ICON, NEUTRAL, TEXT } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import BackToSettings from "../components/common/BackToSettings";
import SectionPaper from "../components/common/SectionPaper";
import SummaryCard from "../components/common/SummaryCard";
import { formatDate } from "../utils/format";
import { listFrom } from "../api/shape";
import { getMyCapabilities } from "../api/roles";


function shortFp(fp) {
  if (!fp) return "—";
  const s = String(fp);
  return s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
}

function StatusChip({ status }) {
  const value = String(status || "").toLowerCase();
  if (value === "active" || value === "ok") {
    return (
      <Chip
        label={value === "ok" ? "OK" : "Active"}
        size="small"
        sx={{
          bgcolor: BRAND.tealSoft,
          color: BRAND.tealText,
          fontWeight: 700,
          border: `1px solid ${BRAND.teal}55`,
        }}
      />
    );
  }
  if (value === "pending") {
    return (
      <Chip
        label="Pending"
        size="small"
        sx={{
          bgcolor: "rgba(199,121,43,0.14)",
          color: BRAND.alert.high,
          fontWeight: 700,
          border: "1px solid rgba(199,121,43,0.4)",
        }}
      />
    );
  }
  if (value === "rotated") {
    return (
      <Chip
        label="Rotated"
        size="small"
        sx={{
          bgcolor: BRAND.cyanSoft,
          color: BRAND.dark,
          fontWeight: 700,
          border: `1px solid ${BRAND.cyan}88`,
        }}
      />
    );
  }
  if (value === "revoked") {
    return (
      <Chip
        label="Revoked"
        size="small"
        sx={{
          bgcolor: BRAND.alert.errorSoft,
          color: BRAND.alert.error,
          fontWeight: 700,
          border: `1px solid ${BRAND.alert.error}55`,
        }}
      />
    );
  }
  if (value === "expired") {
    return (
      <Chip
        label="Expired"
        size="small"
        sx={{
          bgcolor: BRAND.darkSoft,
          color: BRAND.dark,
          fontWeight: 700,
          border: `1px solid ${BRAND.border}`,
        }}
      />
    );
  }
  return (
    <Chip
      label={status || "Unknown"}
      size="small"
      sx={{ bgcolor: BRAND.darkSoft, color: BRAND.dark, fontWeight: 700 }}
    />
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
      <Typography
        sx={{
          fontSize: TEXT.sm,
          color: "text.secondary",
          fontWeight: 600,
          minWidth: 120,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: TEXT.md,
          color: BRAND.dark,
          fontFamily: mono ? "monospace" : "inherit",
          wordBreak: "break-all",
          flex: 1,
        }}
      >
        {value || "—"}
      </Typography>
    </Box>
  );
}

export default function PKI({ onNavigate } = {}) {
  const confirm = useConfirm();
  const initialParamsRef = React.useRef({
    days: getSearchParam("pkiDays", "30"),
    deviceSearch: getSearchParam("pkiDeviceSearch", ""),
    missingSearch: getSearchParam("pkiMissingSearch", ""),
    deviceStatus: getSearchParam("pkiDeviceStatus", ""),
    deviceId: getSearchParam("pkiDeviceId", ""),
    fingerprint: getSearchParam("pkiFingerprint", ""),
    tab: getSearchParam("pkiTab", "overview"),
    devicePage: Math.max(Number(getSearchParam("pkiDevicePage", "0")) || 0, 0),
    devicePageSize: Math.max(Number(getSearchParam("pkiDevicePageSize", "10")) || 10, 1),
    missingPage: Math.max(Number(getSearchParam("pkiMissingPage", "0")) || 0, 0),
    missingPageSize: Math.max(Number(getSearchParam("pkiMissingPageSize", "5")) || 5, 1),
  });
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();

  // ⚠️ NOT `auth?.tenantId` — see useEffectiveTenantId. During vendor/MSP
  // portfolio navigation the selected tenant lives in the MSP context and
  // `auth` does not carry it, so this read silently resolved to nothing.
  const tenantId = useEffectiveTenantId();
  const tenantMemberIsActive = auth?.tenantMember?.isActive === true;

  // ADR-0011 Phase 3: gate on the "pki" capability (custom or built-in
  // role) instead of a hardcoded OWNER/ADMIN name check — see the same
  // fix already applied to Jobs.jsx/Audit.jsx. BUILTIN_ROLE_SEED_PERMISSIONS
  // grants OWNER/ADMIN this capability and withholds it from USER, so
  // built-in-role behavior is unchanged.
  const [myPermissions, setMyPermissions] = React.useState(null);

  React.useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    getMyCapabilities(tenantId)
      .then((resp) => {
        if (!alive) return;
        setMyPermissions(new Set(Array.isArray(resp?.permissions) ? resp.permissions : []));
      })
      .catch(() => {
        if (!alive) return;
        setMyPermissions(new Set());
      });
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const capabilitiesLoading = tenantMemberIsActive && myPermissions === null;
  const canAccess = tenantMemberIsActive && Boolean(myPermissions?.has("pki"));

  const [tab, setTab] = React.useState(initialParamsRef.current.tab);

  // device_id → hostname map, loaded once from known-devices and used to
  // render hostnames instead of raw UUIDs across all PKI tables and panels.
  const [deviceIndex, setDeviceIndex] = React.useState(() => new Map());

  const [summary, setSummary] = React.useState(null);
  const [expiring, setExpiring] = React.useState([]);
  const [missingActive, setMissingActive] = React.useState({ items: [], total: 0 });
  const [devices, setDevices] = React.useState({ items: [], total: 0 });
  const [deviceCertificates, setDeviceCertificates] = React.useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState(initialParamsRef.current.deviceId);
  const [selectedFingerprint, setSelectedFingerprint] = React.useState(initialParamsRef.current.fingerprint);
  const [selectedCertificate, setSelectedCertificate] = React.useState(null);
  const [certificateActivity, setCertificateActivity] = React.useState([]);

  const [days, setDays] = React.useState(initialParamsRef.current.days);
  const [deviceSearch, setDeviceSearch] = React.useState(initialParamsRef.current.deviceSearch);
  const [missingSearch, setMissingSearch] = React.useState(initialParamsRef.current.missingSearch);
  const [deviceStatus, setDeviceStatus] = React.useState(initialParamsRef.current.deviceStatus);
  const [revokeReason, setRevokeReason] = React.useState("");
  const [devicePagination, setDevicePagination] = React.useState({
    page: initialParamsRef.current.devicePage,
    pageSize: initialParamsRef.current.devicePageSize,
  });
  const [missingPagination, setMissingPagination] = React.useState({
    page: initialParamsRef.current.missingPage,
    pageSize: initialParamsRef.current.missingPageSize,
  });
  const [overviewLoading, setOverviewLoading] = React.useState(true);
  const [devicesLoading, setDevicesLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [revokeLoading, setRevokeLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const deferredDeviceSearch = React.useDeferredValue(deviceSearch);
  const deferredMissingSearch = React.useDeferredValue(missingSearch);

  const showMessage = React.useCallback((message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const loadOverview = React.useCallback(async () => {
    if (!canAccess) return;
    try {
      setOverviewLoading(true);
      const [summaryResponse, expiringResponse, missingResponse] = await Promise.all([
        getCertificateSummary(),
        listExpiringCertificates({ days }),
        listDevicesWithoutActiveCertificates({
          page: missingPagination.page + 1,
          pageSize: missingPagination.pageSize,
          search: deferredMissingSearch,
        }),
      ]);
      setSummary(summaryResponse?.summary ?? null);
      setExpiring(Array.isArray(expiringResponse?.certificates) ? expiringResponse.certificates : []);
      setMissingActive({
        items: Array.isArray(missingResponse?.items) ? missingResponse.items : [],
        total: Number(missingResponse?.total ?? 0),
      });
    } catch (err) {
      console.error(err);
      showMessage("Failed to load PKI overview", "error");
    } finally {
      setOverviewLoading(false);
    }
  }, [canAccess, days, missingPagination.page, missingPagination.pageSize, deferredMissingSearch, showMessage]);

  const loadDevices = React.useCallback(async () => {
    if (!canAccess) return;
    try {
      setDevicesLoading(true);
      const response = await listCertificateDevices({
        page: devicePagination.page + 1,
        pageSize: devicePagination.pageSize,
        search: deferredDeviceSearch,
        status: deviceStatus,
      });
      setDevices({
        items: Array.isArray(response?.items) ? response.items : [],
        total: Number(response?.total ?? 0),
      });
    } catch (err) {
      console.error(err);
      showMessage("Failed to load certificate coverage", "error");
    } finally {
      setDevicesLoading(false);
    }
  }, [canAccess, devicePagination.page, devicePagination.pageSize, deferredDeviceSearch, deviceStatus, showMessage]);

  const loadCertificateDetail = React.useCallback(async (fingerprint, deviceId) => {
    if (!canAccess || !fingerprint) return;
    try {
      setDetailLoading(true);
      const [detailResponse, activityResponse, deviceResponse] = await Promise.all([
        getCertificateDetail(fingerprint),
        getCertificateActivity(fingerprint, { limit: 25 }),
        deviceId ? listDeviceCertificates(deviceId) : Promise.resolve(null),
      ]);
      setSelectedFingerprint(fingerprint);
      if (deviceId) setSelectedDeviceId(deviceId);
      setSelectedCertificate(detailResponse?.certificate ?? null);
      setCertificateActivity(Array.isArray(activityResponse?.items) ? activityResponse.items : []);
      if (deviceResponse?.certificates) setDeviceCertificates(deviceResponse.certificates);
    } catch (err) {
      console.error(err);
      showMessage("Failed to load certificate detail", "error");
    } finally {
      setDetailLoading(false);
    }
  }, [canAccess, showMessage]);

  const selectDevice = React.useCallback(async (deviceId, preferredFingerprint = "") => {
    if (!canAccess || !deviceId) return;
    try {
      setDetailLoading(true);
      const response = await listDeviceCertificates(deviceId);
      const certificates = Array.isArray(response?.certificates) ? response.certificates : [];
      setSelectedDeviceId(deviceId);
      setDeviceCertificates(certificates);

      const preferred =
        certificates.find((item) => String(item.fingerprint_sha256) === String(preferredFingerprint || "")) ||
        certificates.find((item) => String(item.status).toLowerCase() === "active") ||
        certificates[0];

      if (preferred?.fingerprint_sha256) {
        await loadCertificateDetail(preferred.fingerprint_sha256, deviceId);
      } else {
        setSelectedFingerprint("");
        setSelectedCertificate(null);
        setCertificateActivity([]);
      }
    } catch (err) {
      console.error(err);
      showMessage("Failed to load device certificates", "error");
    } finally {
      setDetailLoading(false);
    }
  }, [canAccess, loadCertificateDetail, showMessage]);

  const handleJumpToInspector = React.useCallback((deviceId, fingerprint) => {
    if (fingerprint) {
      loadCertificateDetail(fingerprint, deviceId);
    } else if (deviceId) {
      selectDevice(deviceId);
    }
    setTab("inspector");
  }, [loadCertificateDetail, selectDevice]);

  const handleRevoke = React.useCallback(async () => {
    if (!selectedCertificate?.fingerprint_sha256) return;
    const normalizedReason = String(revokeReason || "").trim();
    if (!normalizedReason) {
      showMessage("Revocation reason is required", "error");
      return;
    }
    const confirmed = await confirm({
      title: "Revoke this certificate?",
      body: `Certificate ${shortFp(selectedCertificate.fingerprint_sha256)} will be added to the CRL and the device will be disconnected from the gRPC stream. This action cannot be undone.\n\nReason: ${normalizedReason}`,
      confirmText: "Revoke certificate",
      danger: true,
    });
    if (!confirmed) return;

    try {
      setRevokeLoading(true);
      await revokeCertificate(selectedCertificate.fingerprint_sha256, { reason: normalizedReason });
      showMessage("Certificate revoked");
      setRevokeReason("");
      await Promise.all([
        loadOverview(),
        loadDevices(),
        loadCertificateDetail(selectedCertificate.fingerprint_sha256, selectedCertificate.device_id),
      ]);
    } catch (err) {
      console.error(err);
      showMessage("Failed to revoke certificate", "error");
    } finally {
      setRevokeLoading(false);
    }
  }, [confirm, loadCertificateDetail, loadDevices, loadOverview, revokeReason, selectedCertificate, showMessage]);

  const handleRefresh = React.useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        loadOverview(),
        loadDevices(),
        selectedDeviceId ? selectDevice(selectedDeviceId, selectedFingerprint) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadDevices, loadOverview, selectDevice, selectedDeviceId, selectedFingerprint]);

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(handleRefresh, "pkiAutoRefresh");

  React.useEffect(() => { loadOverview(); }, [loadOverview]);
  React.useEffect(() => { loadDevices(); }, [loadDevices]);

  // Load the device catalog once to render hostnames instead of UUIDs.
  React.useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    listKnownDevices()
      .then((res) => {
        if (cancelled) return;
        const items = listFrom(res, { context: "pki" });
        const map = new Map();
        items.forEach((it) => {
          const id = String(it?.deviceId || "").trim();
          const host = String(it?.hostname || "").trim();
          if (id) map.set(id, host || id);
        });
        setDeviceIndex(map);
      })
      .catch(() => { /* non-fatal — fall back to device ids */ });
    return () => { cancelled = true; };
  }, [canAccess]);

  const getHostname = React.useCallback(
    (deviceIdValue) => {
      const id = String(deviceIdValue || "").trim();
      if (!id) return "—";
      return deviceIndex.get(id) || id;
    },
    [deviceIndex]
  );
  React.useEffect(() => {
    if (!canAccess || !selectedDeviceId) return;
    selectDevice(selectedDeviceId, selectedFingerprint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, selectedDeviceId]);

  React.useEffect(() => {
    updateSearchParams({
      pkiTab: tab,
      pkiDays: days,
      pkiDeviceSearch: deviceSearch,
      pkiMissingSearch: missingSearch,
      pkiDeviceStatus: deviceStatus,
      pkiDeviceId: selectedDeviceId,
      pkiFingerprint: selectedFingerprint,
      pkiDevicePage: devicePagination.page,
      pkiDevicePageSize: devicePagination.pageSize,
      pkiMissingPage: missingPagination.page,
      pkiMissingPageSize: missingPagination.pageSize,
    });
  }, [
    tab, days,
    devicePagination.page, devicePagination.pageSize,
    deviceSearch, deviceStatus,
    missingPagination.page, missingPagination.pageSize,
    missingSearch, selectedDeviceId, selectedFingerprint,
  ]);

  const handleExportCoverageCsv = React.useCallback(() => {
    const csv = toCsv(devices.items);
    downloadTextFile(
      `pki-device-coverage-${new Date().toISOString()}.csv`,
      csv || "device_id\n",
      "text/csv;charset=utf-8"
    );
  }, [devices.items]);

  const handleExportEvidenceJson = React.useCallback(() => {
    if (!selectedCertificate) return;
    const payload = {
      exportedAtUtc: new Date().toISOString(),
      summary,
      selectedDeviceId,
      selectedFingerprint,
      certificate: selectedCertificate,
      deviceCertificates,
      activity: certificateActivity,
    };
    downloadTextFile(
      `pki-evidence-${selectedCertificate.fingerprint_sha256}.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }, [certificateActivity, deviceCertificates, selectedCertificate, selectedDeviceId, selectedFingerprint, summary]);

  // ── Columns ────────────────────────────────────────────────────────────
  const deviceColumns = [
    {
      field: "device_id",
      headerName: "Host",
      minWidth: 220,
      flex: 1,
      valueGetter: (_v, row) => getHostname(row.device_id),
    },
    { field: "active_certs", headerName: "Active", minWidth: 80, flex: 0.3 },
    { field: "pending_certs", headerName: "Pending", minWidth: 85, flex: 0.3 },
    { field: "expired_certs", headerName: "Expired", minWidth: 85, flex: 0.3 },
    { field: "revoked_certs", headerName: "Revoked", minWidth: 85, flex: 0.3 },
    {
      field: "latest_expires_at",
      headerName: "Latest expiry",
      minWidth: 150,
      flex: 0.55,
      renderCell: (params) => formatDate(params.value),
    },
  ];

  const expiringColumns = [
    {
      field: "device_id",
      headerName: "Host",
      minWidth: 200,
      flex: 1,
      valueGetter: (_v, row) => getHostname(row.device_id),
    },
    {
      field: "status",
      headerName: "Status",
      minWidth: 110,
      flex: 0.4,
      renderCell: (params) => <StatusChip status={params.value} />,
    },
    {
      field: "not_after",
      headerName: "Expires",
      minWidth: 140,
      flex: 0.55,
      renderCell: (params) => formatDate(params.value),
    },
    { field: "days_to_expiry", headerName: "Days left", minWidth: 85, flex: 0.3 },
    {
      field: "fingerprint_sha256",
      headerName: "Fingerprint",
      minWidth: 170,
      flex: 0.8,
      renderCell: (params) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: TEXT.sm }}>
          {shortFp(params.value)}
        </Typography>
      ),
    },
  ];

  const missingColumns = [
    {
      field: "device_id",
      headerName: "Host",
      minWidth: 200,
      flex: 1,
      valueGetter: (_v, row) => getHostname(row.device_id),
    },
    { field: "agent_version", headerName: "Agent", minWidth: 90, flex: 0.35 },
    {
      field: "last_seen_at",
      headerName: "Last seen",
      minWidth: 140,
      flex: 0.55,
      renderCell: (params) => formatDate(params.value),
    },
    { field: "cert_count", headerName: "Certs", minWidth: 60, flex: 0.2 },
    {
      field: "current_not_after",
      headerName: "Tracked expiry",
      minWidth: 140,
      flex: 0.55,
      renderCell: (params) => formatDate(params.value),
    },
  ];

  const deviceCertColumns = [
    {
      field: "status",
      headerName: "Status",
      minWidth: 110,
      flex: 0.4,
      renderCell: (params) => <StatusChip status={params.value} />,
    },
    { field: "serial", headerName: "Serial", minWidth: 160, flex: 0.7 },
    {
      field: "created_at",
      headerName: "Issued",
      minWidth: 140,
      flex: 0.55,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "not_after",
      headerName: "Expires",
      minWidth: 140,
      flex: 0.55,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "fingerprint_sha256",
      headerName: "Fingerprint",
      minWidth: 170,
      flex: 0.8,
      renderCell: (params) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: TEXT.sm }}>
          {shortFp(params.value)}
        </Typography>
      ),
    },
  ];

  const activityColumns = [
    {
      field: "occurred_at_utc",
      headerName: "When",
      minWidth: 140,
      flex: 0.5,
      renderCell: (params) => formatDate(params.value),
    },
    { field: "event_type", headerName: "Event", minWidth: 150, flex: 0.7 },
    {
      field: "outcome",
      headerName: "Outcome",
      minWidth: 100,
      flex: 0.35,
      renderCell: (params) => (
        <StatusChip status={params.value === "ok" ? "active" : params.value} />
      ),
    },
    { field: "reason", headerName: "Reason", minWidth: 160, flex: 0.7 },
  ];

  if (capabilitiesLoading) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Typography sx={{ color: "text.secondary" }}>Loading…</Typography>
      </Box>
    );
  }

  if (!canAccess) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          You don't have permission to view PKI. Ask a tenant admin to grant the PKI capability.
        </Alert>
      </Box>
    );
  }

  const overviewSelected = tab === "overview";
  const inspectorSelected = tab === "inspector";
  const certStatus = String(selectedCertificate?.status || "").toLowerCase();
  const canRevoke =
    selectedCertificate &&
    !["revoked", "expired", "rotated"].includes(certStatus);

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      {/* Header */}
      <PageHeader
        title="PKI"
        subtitle="Certificate coverage, lifecycle, activity and remediation for the current tenant."
        icon={<VpnKeyOutlinedIcon />}
        back={<BackToSettings onNavigate={onNavigate} />}
        actions={
          <>
            {/* Auto-refresh was moved to the Overview page (a single,
                tenant-wide cadence control there keeps the pattern
                consistent and avoids per-page widgets that nobody finds). */}
            <Button
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={handleExportCoverageCsv}
              disabled={devices.items.length === 0}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderColor: BRAND.teal,
                color: BRAND.teal,
                "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
              }}
            >
              CSV
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={handleExportEvidenceJson}
              disabled={!selectedCertificate}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderColor: BRAND.teal,
                color: BRAND.teal,
                "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
              }}
            >
              JSON
            </Button>
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={handleRefresh}
              loading={refreshing}
            />
          </>
        }
      />

      {/* Summary cards */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="Total"
              value={summary?.total ?? 0}
              icon={<WorkspacePremiumOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.darkSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="Active"
              value={summary?.active ?? 0}
              icon={<VerifiedUserOutlinedIcon />}
              accent={BRAND.tealText}
              tint={BRAND.tealSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="Pending"
              value={summary?.pending ?? 0}
              icon={<HourglassEmptyOutlinedIcon />}
              accent={BRAND.alert.high}
              tint="rgba(199,121,43,0.14)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="Revoked"
              value={summary?.revoked ?? 0}
              icon={<BlockOutlinedIcon />}
              accent={BRAND.alert.error}
              tint={BRAND.alert.errorSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="Expiring 30d"
              value={summary?.expiring_30d ?? 0}
              icon={<ScheduleOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.cyanSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title="No active cert"
              value={summary?.devices_without_active_cert ?? 0}
              icon={<GppMaybeOutlinedIcon />}
              accent={BRAND.alert.error}
              tint={BRAND.alert.errorSoft}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Tabs container */}
      <SectionPaper
        variant="panel"
        sx={{ p: 0, overflow: "hidden", mb: 2 }}
      >
        <Tabs
          value={tab}
          onChange={(_e, next) => setTab(next)}
          sx={{
            borderBottom: `1px solid ${BRAND.border}`,
            bgcolor: BRAND.darkSoft,
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 700,
              color: BRAND.dark,
              minHeight: 48,
              outline: "none",
              "&:focus": { outline: "none" },
              "&.Mui-focusVisible": { backgroundColor: BRAND.cyanSoft },
            },
            "& .Mui-selected": { color: `${BRAND.teal} !important` },
            "& .MuiTabs-indicator": { backgroundColor: BRAND.teal, height: 3 },
          }}
        >
          <Tab value="overview" label="Fleet overview" icon={<AssessmentOutlinedIcon />} iconPosition="start" sx={{ gap: 0.75 }} />
          <Tab value="inspector" label="Certificate inspector" icon={<BadgeOutlinedIcon />} iconPosition="start" sx={{ gap: 0.75 }} />
        </Tabs>

        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {overviewSelected ? (
            <OverviewTab
              devices={devices}
              devicesLoading={devicesLoading}
              devicePagination={devicePagination}
              setDevicePagination={setDevicePagination}
              deviceSearch={deviceSearch}
              setDeviceSearch={setDeviceSearch}
              deviceStatus={deviceStatus}
              setDeviceStatus={setDeviceStatus}
              deviceColumns={deviceColumns}
              expiring={expiring}
              overviewLoading={overviewLoading}
              expiringColumns={expiringColumns}
              days={days}
              setDays={setDays}
              missingActive={missingActive}
              missingPagination={missingPagination}
              setMissingPagination={setMissingPagination}
              missingSearch={missingSearch}
              setMissingSearch={setMissingSearch}
              missingColumns={missingColumns}
              onJumpToInspector={handleJumpToInspector}
              isSmDown={isSmDown}
            />
          ) : null}
          {inspectorSelected ? (
            <InspectorTab
              selectedDeviceId={selectedDeviceId}
              selectedFingerprint={selectedFingerprint}
              selectedCertificate={selectedCertificate}
              deviceCertificates={deviceCertificates}
              certificateActivity={certificateActivity}
              deviceCertColumns={deviceCertColumns}
              activityColumns={activityColumns}
              detailLoading={detailLoading}
              revokeReason={revokeReason}
              setRevokeReason={setRevokeReason}
              canRevoke={canRevoke}
              revokeLoading={revokeLoading}
              onRevoke={handleRevoke}
              onPickCert={loadCertificateDetail}
              getHostname={getHostname}
            />
          ) : null}
        </Box>
      </SectionPaper>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}

// ── Overview tab ────────────────────────────────────────────────────────

function OverviewTab(props) {
  const {
    devices, devicesLoading, devicePagination, setDevicePagination,
    deviceSearch, setDeviceSearch, deviceStatus, setDeviceStatus, deviceColumns,
    expiring, overviewLoading, expiringColumns, days, setDays,
    missingActive, missingPagination, setMissingPagination,
    missingSearch, setMissingSearch, missingColumns,
    onJumpToInspector,
  } = props;

  return (
    <Grid container spacing={2}>
      {/* Coverage */}
      <Grid size={{ xs: 12, xl: 7 }}>
        <SectionPaper
          variant="panel"
          sx={{ minWidth: 0, overflow: "hidden" }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
              Certificate coverage by device
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              {devices.total} devices · click row to inspect
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              mb: 1.5,
              gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" },
            }}
          >
            <TextField
              label="Search"
              size="small"
              value={deviceSearch}
              onChange={(e) => {
                setDeviceSearch(e.target.value);
                setDevicePagination((prev) => ({ ...prev, page: 0 }));
              }}
              placeholder="device id…"
              InputProps={{
                startAdornment: <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray, mr: 1 }} />,
              }}
              fullWidth
            />
            <TextField
              select
              label="Coverage"
              size="small"
              value={deviceStatus}
              onChange={(e) => {
                setDeviceStatus(e.target.value);
                setDevicePagination((prev) => ({ ...prev, page: 0 }));
              }}
              fullWidth
            >
              <MenuItem value="">All devices</MenuItem>
              <MenuItem value="active">Has active</MenuItem>
              <MenuItem value="pending">Has pending</MenuItem>
              <MenuItem value="expired">Has expired</MenuItem>
              <MenuItem value="revoked">Has revoked</MenuItem>
            </TextField>
          </Box>

          <DataGrid
            autoHeight
            disableRowSelectionOnClick
            rows={devices.items}
            rowCount={devices.total}
            loading={devicesLoading}
            columns={deviceColumns}
            paginationMode="server"
            paginationModel={devicePagination}
            onPaginationModelChange={setDevicePagination}
            pageSizeOptions={[10, 25, 50]}
            getRowId={(row) => row.device_id}
            onRowClick={(params) => onJumpToInspector(params.row.device_id)}
            sx={DATAGRID_SX}
          />
        </SectionPaper>
      </Grid>

      {/* Expiring + Missing */}
      <Grid size={{ xs: 12, xl: 5 }}>
        <SectionPaper
          variant="panel"
          sx={{ minWidth: 0, overflow: "hidden", mb: 2 }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
                Expiring certificates
              </Typography>
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                Active certs expiring within the selected window.
              </Typography>
            </Box>
            <TextField
              select
              label="Window"
              size="small"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="7">7 days</MenuItem>
              <MenuItem value="30">30 days</MenuItem>
              <MenuItem value="60">60 days</MenuItem>
              <MenuItem value="90">90 days</MenuItem>
            </TextField>
          </Box>

          <DataGrid
            autoHeight
            disableRowSelectionOnClick
            rows={expiring}
            loading={overviewLoading}
            columns={expiringColumns}
            getRowId={(row) => `${row.device_id}-${row.fingerprint_sha256}`}
            initialState={{ pagination: { paginationModel: { pageSize: 5, page: 0 } } }}
            pageSizeOptions={[5, 10, 25]}
            onRowClick={(params) =>
              onJumpToInspector(params.row.device_id, params.row.fingerprint_sha256)
            }
            sx={DATAGRID_SX}
          />
        </SectionPaper>

        <SectionPaper
          variant="panel"
          sx={{ minWidth: 0, overflow: "hidden" }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
                Devices without active certificate
              </Typography>
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                Enrolled devices whose current certificate is not active.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ mb: 1.5 }}>
            <TextField
              label="Search"
              size="small"
              value={missingSearch}
              onChange={(e) => {
                setMissingSearch(e.target.value);
                setMissingPagination((prev) => ({ ...prev, page: 0 }));
              }}
              placeholder="device id…"
              InputProps={{
                startAdornment: <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray, mr: 1 }} />,
              }}
              fullWidth
            />
          </Box>

          <DataGrid
            autoHeight
            disableRowSelectionOnClick
            rows={missingActive.items}
            rowCount={missingActive.total}
            loading={overviewLoading}
            columns={missingColumns}
            paginationMode="server"
            paginationModel={missingPagination}
            onPaginationModelChange={setMissingPagination}
            pageSizeOptions={[5, 10, 25]}
            getRowId={(row) => row.device_id}
            onRowClick={(params) => onJumpToInspector(params.row.device_id)}
            sx={DATAGRID_SX}
          />
        </SectionPaper>
      </Grid>
    </Grid>
  );
}

// ── Inspector tab ───────────────────────────────────────────────────────

function InspectorTab(props) {
  const {
    selectedDeviceId, selectedFingerprint, selectedCertificate,
    deviceCertificates, certificateActivity,
    deviceCertColumns, activityColumns,
    detailLoading, revokeReason, setRevokeReason,
    canRevoke, revokeLoading, onRevoke, onPickCert,
    getHostname,
  } = props;

  if (!selectedDeviceId) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 4,
          borderRadius: 2,
          borderColor: BRAND.border,
          borderStyle: "dashed",
          bgcolor: BRAND.darkSoft,
          textAlign: "center",
          color: "text.secondary",
        }}
      >
        <InfoOutlinedIcon sx={{ fontSize: ICON["2xl"], color: BRAND.gray, mb: 1.5 }} />
        <Typography variant="body1" sx={{ fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
          No device selected
        </Typography>
        <Typography variant="body2">
          Open <strong>Fleet overview</strong> and click any row on Coverage, Expiring, or Missing
          to inspect its certificates.
        </Typography>
      </Paper>
    );
  }

  return (
    <Grid container spacing={2}>
      {/* Certificate detail */}
      <Grid size={{ xs: 12, lg: 5 }}>
        <SectionPaper
          variant="panel"
          sx={{ minWidth: 0 }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5, flexWrap: "wrap", gap: 1 }}>
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
              Certificate
            </Typography>
            {selectedCertificate ? <StatusChip status={selectedCertificate.status} /> : null}
          </Box>

          {detailLoading && !selectedCertificate ? (
            <Typography color="text.secondary">Loading certificate…</Typography>
          ) : !selectedCertificate ? (
            <Typography color="text.secondary">No certificate found for this device.</Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
              <Box>
                <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                  Identity
                </Typography>
                <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                  <DetailRow label="Host" value={getHostname(selectedCertificate.device_id)} />
                  <DetailRow label="Device ID" value={selectedCertificate.device_id} mono />
                  <DetailRow label="Serial" value={selectedCertificate.serial} mono />
                  <DetailRow label="Fingerprint" value={selectedCertificate.fingerprint_sha256} mono />
                </Box>
              </Box>

              <Divider sx={{ borderColor: BRAND.border }} />

              <Box>
                <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                  Lifecycle
                </Typography>
                <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                  <DetailRow label="Issued" value={formatDate(selectedCertificate.created_at)} />
                  <DetailRow label="Activated" value={formatDate(selectedCertificate.activated_at)} />
                  <DetailRow label="Expires" value={formatDate(selectedCertificate.not_after)} />
                  <DetailRow label="Revoked" value={formatDate(selectedCertificate.revoked_at)} />
                  <DetailRow label="Revoke reason" value={selectedCertificate.revoked_reason} />
                </Box>
              </Box>

              <Divider sx={{ borderColor: BRAND.border }} />

              <Box>
                <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                  Renewal chain
                </Typography>
                <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                  <DetailRow
                    label="Renewed from"
                    value={shortFp(selectedCertificate.renewal_of_fingerprint_sha256)}
                    mono
                  />
                  <DetailRow
                    label="Renewed by"
                    value={shortFp(selectedCertificate.renewed_by_fingerprint_sha256)}
                    mono
                  />
                </Box>
              </Box>

              <Divider sx={{ borderColor: BRAND.border }} />

              <Box>
                <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                  Agent
                </Typography>
                <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                  <DetailRow label="Enrollment" value={selectedCertificate.enrollment_status} />
                  <DetailRow label="Agent version" value={selectedCertificate.agent_version} />
                  <DetailRow label="Last seen" value={formatDate(selectedCertificate.last_seen_at)} />
                </Box>
              </Box>

              <Divider sx={{ borderColor: BRAND.border }} />

              <Box>
                <Typography variant="overline" sx={{ color: BRAND.alert.error, fontWeight: 800, letterSpacing: 1.2 }}>
                  Revocation
                </Typography>
                <TextField
                  label="Reason"
                  size="small"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="e.g. device decommissioned"
                  helperText="Required when revoking."
                  fullWidth
                  sx={{ mt: 1 }}
                />
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<BlockIcon />}
                  onClick={onRevoke}
                  disabled={revokeLoading || !canRevoke}
                  sx={{ textTransform: "none", fontWeight: 700, mt: 1.5 }}
                >
                  {revokeLoading ? "Revoking…" : "Revoke certificate"}
                </Button>
                {selectedCertificate && !canRevoke ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                    Certificate is already{" "}
                    <strong>{String(selectedCertificate.status || "—").toLowerCase()}</strong>{" "}
                    — revocation is not applicable.
                  </Typography>
                ) : null}
              </Box>
            </Box>
          )}
        </SectionPaper>
      </Grid>

      {/* Chain + Activity */}
      <Grid size={{ xs: 12, lg: 7 }}>
        <SectionPaper
          variant="panel"
          sx={{ minWidth: 0, overflow: "hidden", mb: 2 }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5, flexWrap: "wrap", gap: 1 }}>
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
              Device certificate chain
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              {deviceCertificates.length} cert{deviceCertificates.length === 1 ? "" : "s"} · click to switch
            </Typography>
          </Box>
          <DataGrid
            autoHeight
            disableRowSelectionOnClick
            rows={deviceCertificates}
            columns={deviceCertColumns}
            loading={detailLoading}
            hideFooter
            getRowId={(row) => row.fingerprint_sha256}
            onRowClick={(params) => onPickCert(params.row.fingerprint_sha256, params.row.device_id)}
            // MUI X v8 changed `rowSelectionModel` from array to
            // `{ type: 'include'|'exclude', ids: Set }`. Passing the old
            // array shape under the free DataGrid throws
            // "rowSelectionModel can only contain 1 item" during mount
            // and blanks the Inspector tab. Use the object form.
            rowSelectionModel={{
              type: "include",
              ids: new Set(selectedFingerprint ? [selectedFingerprint] : []),
            }}
            sx={DATAGRID_SX}
          />
        </SectionPaper>

        <SectionPaper
          variant="panel"
          sx={{ minWidth: 0, overflow: "hidden" }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5, flexWrap: "wrap", gap: 1 }}>
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
              Activity
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              {certificateActivity.length} event{certificateActivity.length === 1 ? "" : "s"}
            </Typography>
          </Box>
          <DataGrid
            autoHeight
            disableRowSelectionOnClick
            rows={certificateActivity}
            columns={activityColumns}
            loading={detailLoading}
            hideFooter
            getRowId={(row) => row.id}
            sx={DATAGRID_SX}
          />

          {selectedCertificate && certificateActivity.length > 0 ? (
            <>
              <Divider sx={{ my: 1.5, borderColor: BRAND.border }} />
              <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                Last event details
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  mt: 0.5,
                  p: 1.25,
                  bgcolor: BRAND.dark,
                  color: NEUTRAL[100],
                  borderColor: BRAND.dark,
                  overflow: "auto",
                  maxHeight: 220,
                  fontFamily: "monospace",
                  fontSize: TEXT.sm,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(certificateActivity[0]?.details ?? {}, null, 2)}
              </Paper>
            </>
          ) : null}
        </SectionPaper>
      </Grid>
    </Grid>
  );
}
