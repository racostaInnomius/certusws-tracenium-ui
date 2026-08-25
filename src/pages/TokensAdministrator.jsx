import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Chip,
  Alert,
  Stack,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";

import { listTokens, getTokenQuota, createToken, revokeToken } from "../api/tokens";
import { useCachedFetch } from "../hooks/useCachedFetch";
import { formatDate } from "../utils/format";
import CreateTokenDialog from "../components/tokens/CreateTokenDialog";
import TokenCreatedDialog from "../components/tokens/TokenCreatedDialog";
import RevokeTokenDialog from "../components/tokens/RevokeTokenDialog";

import { BRAND, DATAGRID_SX, TEXT } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import BrandSnackbar from "../components/common/BrandSnackbar";
import SectionPaper from "../components/common/SectionPaper";

// Fase 2 homologation — local SummaryCard kept for now because it has
// a color-by-role `accent` for the number (active/expired/revoked
// each use a different tone). The shared <SummaryCard /> assumes a
// single accent+tint per card; instead of retrofitting that contract
// we align the Paper shell to the card tokens and let the caller
// pick the semantic color from BRAND/ROLE.
function SummaryCard({ title, value, accent = BRAND.teal, subtitle }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: "100%",
        minHeight: 102,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(90,159,159,0.035) 100%)",
        minWidth: 0,
      }}
    >
      <Typography
        sx={{
          fontSize: TEXT.sm,
          color: "text.secondary",
          fontWeight: 800,
          letterSpacing: 0.35,
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        noWrap
        title={String(title || "")}
      >
        {title}
      </Typography>

      <Box sx={{ pt: 1.6 }}>
        <Typography
          sx={{
            fontSize: TEXT["3xl"],
            fontWeight: 850,
            color: accent,
            lineHeight: 1.05,
            letterSpacing: -0.2,
          }}
          noWrap
          title={String(value ?? "")}
        >
          {value}
        </Typography>
        {subtitle ? (
          <Typography
            sx={{
              fontSize: TEXT.sm,
              color: "text.secondary",
              mt: 0.6,
              lineHeight: 1.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={subtitle}
          >
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}

function MetricGroup({ title, subtitle, children, accent = BRAND.teal }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2 },
        height: "100%",
        width: "100%",
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        bgcolor: BRAND.surface,
        boxShadow: "0 12px 30px rgba(59,64,77,0.08)",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${BRAND.tealSoft} 0%, rgba(255,255,255,0) 42%)`,
          pointerEvents: "none",
        },
      }}
    >
      <Box sx={{ position: "relative", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 26,
              borderRadius: 999,
              bgcolor: accent,
              boxShadow: `0 0 0 4px ${BRAND.tealSoft}`,
              flexShrink: 0,
            }}
          />

          <Typography sx={{ fontSize: TEXT.base, fontWeight: 900, color: BRAND.dark }}>
            {title}
          </Typography>
        </Box>

        <Typography sx={{ mt: 0.5, fontSize: TEXT.sm, color: "text.secondary", pl: 2.25 }}>
          {subtitle}
        </Typography>
      </Box>

      <Box sx={{ position: "relative" }}>{children}</Box>
    </Paper>
  );
}

// Token rows can arrive with a backend status that represents only one
// terminal reason, for example `exhausted`. For the operator table we render a
// single effective status using this precedence so the UI stays concise:
// Revoked > Expired > Exhausted > Active.
function isPastDate(value) {
  if (!value) return false;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() <= Date.now();
}

function resolveTokenStatus(token = {}) {
  const rawStatus = String(token.status || token.token_status || "").trim().toLowerCase();

  if (rawStatus === "revoked" || token.revoked === true || token.revoked_at) {
    return "revoked";
  }

  if (rawStatus === "expired" || isPastDate(token.expires_at || token.expiresAt)) {
    return "expired";
  }

  const used = toFiniteNumber(token.used_count ?? token.usedCount ?? token.used, 0);
  const maxUses = toFiniteNumber(token.max_uses ?? token.maxUses, 0);
  if (rawStatus === "exhausted" || (maxUses > 0 && used >= maxUses)) {
    return "exhausted";
  }

  if (rawStatus === "active" || !rawStatus) {
    return "active";
  }

  return rawStatus;
}

function getStatusChipMeta(status) {
  switch (String(status || "").toLowerCase()) {
    case "active":
      return {
        label: "Active",
        bgcolor: BRAND.alert.successSoft,
        color: BRAND.alert.success,
      };
    case "expired":
      return {
        label: "Expired",
        bgcolor: BRAND.alert.warningSoft,
        color: BRAND.alert.warning,
      };
    case "exhausted":
      return {
        label: "Exhausted",
        bgcolor: BRAND.surfaceMuted,
        color: BRAND.dark,
      };
    case "revoked":
      return {
        label: "Revoked",
        bgcolor: BRAND.alert.errorSoft,
        color: BRAND.alert.error,
      };
    default:
      return {
        label: status || "Unknown",
        bgcolor: BRAND.darkSoft,
        color: BRAND.dark,
      };
  }
}

function renderStatusChip(status) {
  const meta = getStatusChipMeta(status);

  return (
    <Chip
      label={meta.label}
      size="small"
      sx={{
        bgcolor: meta.bgcolor,
        color: meta.color,
        fontWeight: String(status || "").toLowerCase() === "exhausted" ? 500 : 700,
      }}
    />
  );
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readFirstNumber(source, keys, fallback = 0) {
  if (!source || typeof source !== "object") return fallback;

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return toFiniteNumber(source[key], fallback);
    }
  }

  return fallback;
}

function normalizeQuotaResponse(quota) {
  const maxDevicesRaw = readFirstNumber(
    quota,
    ["maxDevices", "max_devices", "maxDeviceCount", "deviceLimit", "device_limit", "limit"],
    0
  );

  const usedRaw = readFirstNumber(
    quota,
    [
      "used",
      "usedDevices",
      "used_devices",
      "usedDeviceCount",
      "agentCount",
      "agent_count",
      "deviceCount",
      "device_count",
      "devicesUsed",
      "devices_used",
      "used_count",
      "usedCount",
    ],
    0
  );

  const maxDevices = Math.max(0, Math.floor(maxDevicesRaw));
  const used = Math.max(0, Math.floor(usedRaw));

  const warningThreshold = Math.max(
    0,
    Math.floor(
      readFirstNumber(
        quota,
        ["warningThreshold", "warning_threshold", "warningLimit", "warning_limit"],
        Math.floor(maxDevices * 0.8)
      )
    )
  );

  const standardLimit = Math.max(
    0,
    Math.floor(
      readFirstNumber(
        quota,
        ["standardLimit", "standard_limit"],
        maxDevices
      )
    )
  );

  const upperLimit = Math.max(
    standardLimit,
    Math.ceil(
      readFirstNumber(
        quota,
        ["upperLimit", "upper_limit", "hardLimit", "hard_limit"],
        // ADR-0005 D2: cap + 10% grace, additive. Only a fallback — the
        // backend sends upperLimit; this keeps a stale response sane.
        maxDevices + Math.ceil(maxDevices * 0.1)
      )
    )
  );

  const explicitRemaining = readFirstNumber(
    quota,
    ["remaining", "remainingDevices", "remaining_devices", "remaining_count", "remainingCount"],
    Number.NaN
  );

  const remaining = Number.isFinite(explicitRemaining)
    ? Math.floor(explicitRemaining)
    : standardLimit - used;

  const usagePercent = Number(
    readFirstNumber(quota, ["usagePercent", "usage_percent"], standardLimit > 0 ? (used / standardLimit) * 100 : 0).toFixed(1)
  );

  const upperUsagePercent = Number(
    readFirstNumber(quota, ["upperUsagePercent", "upper_usage_percent"], upperLimit > 0 ? (used / upperLimit) * 100 : 0).toFixed(1)
  );

  // ADR-0005 D3 renamed these. Accept both spellings so this page keeps
  // working against a backend on either side of the rollout.
  const rawStatus = String(quota?.status || "").toUpperCase();
  const backendStatus = QUOTA_STATUS_ALIASES[rawStatus] || rawStatus;
  const inferredStatus =
    used >= upperLimit
      ? "GRACE_EXHAUSTED"
      : used >= standardLimit
        ? "OVER_LIMIT"
        : used >= warningThreshold
          ? "APPROACHING_LIMIT"
          : "NORMAL";

  const status = backendStatus || inferredStatus;
  const canCreateToken =
    typeof quota?.canCreateToken === "boolean"
      ? quota.canCreateToken
      : used < upperLimit;

  const creatableRemaining = Math.max(upperLimit - used, 0);

  return {
    tenantId: quota?.tenantId ?? quota?.tenant_id ?? null,
    maxDevices,
    used,
    remaining,
    warningThreshold,
    standardLimit,
    upperLimit,
    usagePercent,
    upperUsagePercent,
    status,
    canCreateToken,
    message: quota?.message || "",
    creatableRemaining,
  };
}

const QUOTA_STATUS_ALIASES = {
  STANDARD_LIMIT_EXCEEDED: "OVER_LIMIT",
  UPPER_LIMIT_REACHED: "GRACE_EXHAUSTED",
};

function getQuotaStatusMeta(status) {
  switch (String(status || "").toUpperCase()) {
    case "APPROACHING_LIMIT":
      return {
        severity: "warning",
        accent: BRAND.alert.warning,
        soft: BRAND.alert.warningSoft,
        title: "Approaching device limit",
        defaultMessage: "You are approaching your tenant device limit. Enrollment is still available.",
      };
    case "OVER_LIMIT":
    case "STANDARD_LIMIT_EXCEEDED":
      return {
        severity: "warning",
        accent: BRAND.alert.warning,
        soft: BRAND.alert.warningSoft,
        title: "Over your license limit",
        defaultMessage: "This tenant is over its licensed device count. Enrollment continues within the grace margin; the overage is reconciled at the next subscription anniversary.",
      };
    case "GRACE_EXHAUSTED":
    case "UPPER_LIMIT_REACHED":
      return {
        severity: "error",
        accent: BRAND.alert.error,
        soft: BRAND.alert.errorSoft,
        title: "License limit reached",
        defaultMessage: "The licensed device count and its grace margin are both used up. Add licenses or remove devices before enrolling more.",
      };
    default:
      return {
        severity: "info",
        accent: BRAND.alert.success,
        soft: BRAND.alert.successSoft,
        title: "Device enrollment capacity is healthy",
        defaultMessage: "This tenant is within its device enrollment capacity.",
      };
  }
}

// `embedded` mirrors the contract of <AgentReleases />: when true, we
// skip the top-level PageHeader and zero out the Box's outer padding so
// the host page (e.g. <DeviceEnrollment />) controls layout. The Create
// token button moves into the embedded host's right slot via the
// `headerAction` we still render via PageHeader's `actions` — to avoid
// losing the action when embedded, we expose it inline in the toolbar.
export default function TokensAdministrator({ embedded = false } = {}) {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));

  // Tokens list + quota: parameterless on-mount fetches (filtering is
  // client-side), routed through useCachedFetch for stale-while-revalidate +
  // dedup + last-known-good on a transient error. `rows`/`quota`/`quotaError`
  // are derived from the cached snapshots (all their setters were loader-only).
  const {
    data: tokenRows,
    loading,
    refetch: reloadData,
  } = useCachedFetch(
    "tokens:list:v1",
    async () => {
      const data = await listTokens();
      const list = Array.isArray(data) ? data : [];
      return list.map((token) => {
        const effectiveStatus = resolveTokenStatus(token);
        return {
          ...token,
          raw_status: token.status,
          status: effectiveStatus,
          effective_status: effectiveStatus,
        };
      });
    },
    { staleMs: 30_000, storageMaxAgeMs: 5 * 60_000, revalidateOnMount: "stale" }
  );
  const rows = React.useMemo(() => tokenRows ?? [], [tokenRows]);

  const {
    data: quotaData,
    loading: quotaLoading,
    error: quotaFetchError,
    refetch: reloadQuota,
  } = useCachedFetch(
    "tokens:quota:v1",
    async () => (await getTokenQuota()) || null,
    { staleMs: 30_000, storageMaxAgeMs: 5 * 60_000, revalidateOnMount: "stale" }
  );
  const quota = quotaData ?? null;
  // A 403 here is not a failure to load — it's "your role can't manage
  // enrollment tokens in this tenant" (the endpoint requires ADMIN/OWNER,
  // or admin_master). Telling that operator to refresh sends them in
  // circles, since refreshing can never change their role. Distinguish it.
  const quotaError = React.useMemo(() => {
    if (!quotaFetchError) return "";
    if (quotaFetchError.status === 403) {
      return "You need the ADMIN or OWNER role in this tenant to manage enrollment tokens. Ask a tenant owner to grant it.";
    }
    return "Failed to load token quota. Refresh the page or try again.";
  }, [quotaFetchError]);
  const quotaForbidden = quotaFetchError?.status === 403;

  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createdOpen, setCreatedOpen] = React.useState(false);
  const [createdToken, setCreatedToken] = React.useState(null);

  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [selectedToken, setSelectedToken] = React.useState(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const refreshAll = React.useCallback(async () => {
    await Promise.all([reloadData(), reloadQuota()]);
  }, [reloadData, reloadQuota]);

const filteredRows = React.useMemo(() => {
  return rows.filter((row) => {
    const matchesStatus =
      status === "all" ||
      String(row.status).toLowerCase() === status.toLowerCase();

    const matchesSearch =
      !search ||
      String(row.token_label || "")
        .toLowerCase()
        .includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });
}, [rows, status, search]);

  const summary = React.useMemo(() => {
    const total = rows.length;
    const active = rows.filter(
      (r) => String(r.status).toLowerCase() === "active"
    ).length;
    const expired = rows.filter(
      (r) => String(r.status).toLowerCase() === "expired"
    ).length;
    const exhausted = rows.filter(
      (r) => String(r.status).toLowerCase() === "exhausted"
    ).length;
    const revoked = rows.filter(
      (r) => String(r.status).toLowerCase() === "revoked"
    ).length;


    return { total, active, expired, exhausted, revoked};
  }, [rows]);

  const quotaSummary = React.useMemo(() => normalizeQuotaResponse(quota), [quota]);
  const quotaStatusMeta = React.useMemo(
    () => getQuotaStatusMeta(quotaSummary.status),
    [quotaSummary.status]
  );

  const canCreateToken = !quotaLoading && !quotaError && quotaSummary.canCreateToken;

  const shouldShowQuotaBanner =
    !quotaLoading &&
    !quotaError &&
    ["APPROACHING_LIMIT", "OVER_LIMIT", "GRACE_EXHAUSTED"].includes(
      quotaSummary.status
    );

  const createTokenDisabledReason = React.useMemo(() => {
    if (quotaLoading) return "Loading tenant enrollment capacity...";
    if (quotaError) return quotaError;
    if (!quotaSummary.canCreateToken) {
      return quotaSummary.message || quotaStatusMeta.defaultMessage;
    }
    return "";
  }, [quotaError, quotaLoading, quotaStatusMeta.defaultMessage, quotaSummary]);

  const handleCreateToken = async (payload) => {
    try {
      setSubmitting(true);
      const created = await createToken(payload);

      setCreatedToken(created);
      setCreateOpen(false);
      setCreatedOpen(true);

      await refreshAll();

      setSnackbar({
        open: true,
        message: "Token created successfully",
        severity: "success",
      });
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: e?.message || "Failed to create token",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!selectedToken?.id) return;

    try {
      setSubmitting(true);
      await revokeToken(selectedToken.id);

      setRevokeOpen(false);
      setSelectedToken(null);

      await refreshAll();

      setSnackbar({
        open: true,
        message: "Token revoked successfully",
        severity: "success",
      });
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to revoke token",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { field: "id", headerName: "ID", width: 40 },
    { field: "name", headerName: "Tenant", minWidth: 110, flex: 0.5 },
    { field: "token_label", headerName: "Label", minWidth: 110, flex: 0.5 },
    {
      field: "status",
      headerName: "Status",
      minWidth: 100,
      flex: 0.5,
      renderCell: (params) => renderStatusChip(params.row?.effective_status || params.value),
    },
    { field: "max_uses", headerName: "Max Uses", minWidth: 83, flex: 0.3 },
    { field: "used_count", headerName: "Used", minWidth: 55, flex: 0.3 },
    {
      field: "expires_at",
      headerName: "Expires At",
      minWidth: 140,
      flex: 1,
      renderCell: (params) => formatDate(params?.value)
    },
    {
      field: "created_at",
      headerName: "Created At",
      minWidth: 140,
      flex: 1,
      renderCell: (params) => formatDate(params?.value)
    },
    {
      field: "last_used_at",
      headerName: "Last Used At",
      minWidth: 140,
      flex: 1,
      renderCell: (params) => formatDate(params?.value)
    },
    { field: "created_by", headerName: "Created By", minWidth: 140, flex: 0.9 },
    {
      field: "actions",
      headerName: "Actions",
      minWidth: 120,
      flex: 0.8,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Button
          size="small"
          color="error"
          disabled={String(params.row?.effective_status || params.row?.status).toLowerCase() !== "active"}
          onClick={() => {
            setSelectedToken(params.row);
            setRevokeOpen(true);
          }}
        >
          Revoke
        </Button>
      ),
    },
  ];

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return {
        name: false,
        created_at: false,
        last_used_at: false,
        created_by: false,
      };
    }

    if (isMdDown) {
      return {
        last_used_at: false,
      };
    }

    return {};
  }, [isMdDown, isSmDown]);

  return (
    <Box
      sx={{
        px: embedded ? 0 : { xs: 2, sm: 0.5 },
        py: embedded ? 0 : { xs: 2, sm: 0.5 },
      }}
    >
      {!embedded && (
        <PageHeader
          title="Tokens Administrator"
          subtitle="Manage enrollment tokens for this tenant"
          icon={<VpnKeyOutlinedIcon />}
          actions={
            <Tooltip title={createTokenDisabledReason} disableHoverListener={canCreateToken}>
              <span style={{ width: isSmDown ? "100%" : "auto" }}>
                <Button
                  variant="contained"
                  onClick={() => setCreateOpen(true)}
                  disabled={!canCreateToken}
                  fullWidth={isSmDown}
                  sx={{
                    bgcolor: BRAND.teal,
                    "&:hover": { bgcolor: BRAND.tealHover },
                    minWidth: { xs: "100%", sm: 170 },
                    alignSelf: { xs: "stretch", sm: "center" },
                    textTransform: "none",
                    fontWeight: 700,
                  }}
                >
                  {quotaLoading ? "Loading capacity..." : "+ Create token"}
                </Button>
              </span>
            </Tooltip>
          }
        />
      )}

      {/* When embedded, the host page owns the page chrome — but the
          "+ Create token" action still has to live SOMEWHERE accessible
          on this view. We render a right-aligned button row so the
          embedded layout doesn't lose the primary CTA. */}
      {embedded && (
        <Stack
          alignItems="center"
          sx={{
            mb: 1.5,
            width: "100%",
          }}
        >
          <Tooltip title={createTokenDisabledReason} disableHoverListener={canCreateToken}>
            <span style={{ width: isSmDown ? "100%" : "auto" }}>
              <Button
                variant="contained"
                onClick={() => setCreateOpen(true)}
                disabled={!canCreateToken}
                fullWidth={isSmDown}
                sx={{
                  bgcolor: BRAND.teal,
                  "&:hover": { bgcolor: BRAND.tealHover },
                  minWidth: { xs: "100%", sm: 170 },
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                {quotaLoading ? "Loading capacity..." : "+ Create token"}
              </Button>
            </span>
          </Tooltip>
        </Stack>
      )}

      {quotaError && (
        <Alert
          // A permissions problem is expected-and-explained, not a fault:
          // "warning" so it doesn't read as something the operator broke.
          severity={quotaForbidden ? "warning" : "error"}
          sx={{
            mb: 2,
            borderRadius: 2,
            bgcolor: quotaForbidden ? BRAND.alert.warningSoft : BRAND.alert.errorSoft,
            color: BRAND.dark,
            "& .MuiAlert-icon": {
              color: quotaForbidden ? BRAND.alert.warning : BRAND.alert.error,
            },
          }}
        >
          {quotaError}
        </Alert>
      )}

      {shouldShowQuotaBanner && (
        <Alert
          severity={quotaStatusMeta.severity}
          sx={{
            mb: 2,
            borderRadius: 2,
            bgcolor: quotaStatusMeta.soft,
            color: BRAND.dark,
            alignItems: "flex-start",
            "& .MuiAlert-icon": { color: quotaStatusMeta.accent },
          }}
        >
          <Typography sx={{ fontWeight: 900, color: BRAND.dark, mb: 0.25 }}>
            {quotaStatusMeta.title}
          </Typography>
          <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
            {quotaSummary.message || quotaStatusMeta.defaultMessage}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5 }}>
            Used agents: {quotaSummary.used} · Standard limit: {quotaSummary.standardLimit} · Upper limit: {quotaSummary.upperLimit} · Available capacity: {quotaSummary.creatableRemaining}
          </Typography>
        </Alert>
      )}

      {/* KPI strip — semantic colors come from BRAND/ROLE now.
          "Active" uses the success green (not a custom teal-dark),
          "Expired" the caution amber, "Revoked" the critical red.
          Device quota cards are tenant-level capacity metrics used to
          safely cap the Max Uses value when creating a new enrollment token. */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 7 }} sx={{ display: "flex", minWidth: 0 }}>
            <MetricGroup
              title="Token lifecycle"
              subtitle="Operational status of enrollment tokens in this tenant"
              accent={BRAND.teal}
            >
              <Grid container spacing={1.5} alignItems="stretch">
                <Grid size={{ xs: 3 }}>
                  <SummaryCard
                    title="Total Tokens"
                    value={summary.total}
                    subtitle="Created in this tenant"
                  />
                </Grid>

                <Grid size={{ xs: 3 }}>
                  <SummaryCard
                    title="Active"
                    value={summary.active}
                    accent={BRAND.alert.success}
                    subtitle="Ready for enrollment"
                  />
                </Grid>

                <Grid size={{ xs: 3 }}>
                  <SummaryCard
                    title="Expired"
                    value={summary.expired}
                    accent={BRAND.alert.warning}
                    subtitle="Past validity window"
                  />
                </Grid>

                <Grid size={{ xs: 3 }}>
                  <SummaryCard
                    title="Revoked"
                    value={summary.revoked}
                    accent={BRAND.alert.error}
                    subtitle="Disabled from use"
                  />
                </Grid>
              </Grid>
            </MetricGroup>
          </Grid>

          <Grid size={{ xs: 5 }} sx={{ display: "flex", minWidth: 0 }}>
            <MetricGroup
              title="Tenant capacity"
              subtitle="Real enrolled devices compared with standard and upper limits"
              accent={quotaStatusMeta.accent}
            >
              <Grid container spacing={1.5} alignItems="stretch">
                <Grid size={{ xs: 4 }}>
                  <SummaryCard
                    title="Max Devices"
                    value={quotaLoading ? "..." : quotaSummary.maxDevices}
                    accent={BRAND.dark}
                    subtitle="Subscription device limit"
                  />
                </Grid>

                <Grid size={{ xs: 4 }}>
                  <SummaryCard
                    title="Used Agents"
                    value={quotaLoading ? "..." : quotaSummary.used}
                    accent={BRAND.tealText}
                    subtitle="Real enrolled devices"
                  />
                </Grid>

                <Grid size={{ xs: 4 }}>
                  <SummaryCard
                    title="Remaining"
                    value={quotaLoading ? "..." : quotaSummary.remaining}
                    accent={quotaSummary.remaining >= 0 ? BRAND.alert.success : BRAND.alert.warning}
                    subtitle="Before subscription limit"
                  />
                </Grid>
              </Grid>
            </MetricGroup>
          </Grid>
        </Grid>
      </Box>

      <SectionPaper
        variant="panel"
        sx={{ p: { xs: 1.5, sm: 1.5 } }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            gap: 2,
            mb: 0,
            flexWrap: "wrap",
          }}
        >
          <TextField
            label="Search by Label"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              width: { xs: "100%", sm: 220 },
            }}
          />
          <TextField
            select
            label="Status"
            size="small"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{
              width: { xs: "100%", sm: 180 },
            }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="expired">Expired</MenuItem>
            <MenuItem value="exhausted">Exhausted</MenuItem>
            <MenuItem value="revoked">Revoked</MenuItem>
          </TextField>

          <Button
            onClick={refreshAll}
            variant="outlined"
            sx={{
              width: { xs: "100%", sm: "auto" },
              minHeight: 40,
            }}
          >
            REFRESH
          </Button>
        </Box>

        <Box
          sx={{
            height: {
              xs: 420,
              sm: "calc(100vh - 360px)",
              md: "calc(100vh - 340px)",
            },
            width: "100%",
          }}
        >
          <DataGrid
            rows={filteredRows}
            columns={columns}
            columnVisibilityModel={columnVisibilityModel}
            loading={loading}
            disableRowSelectionOnClick
            getRowId={(row) => row.id}
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 10, page: 0 },
              },
            }}
            sx={{
              ...DATAGRID_SX,
              width: "100%",
              "& .MuiDataGrid-cell": {
                ...DATAGRID_SX["& .MuiDataGrid-cell"],
                alignItems: "center",
              },
              "& .MuiDataGrid-cellContent": {
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
            }}
          />
        </Box>
      </SectionPaper>

      <CreateTokenDialog
        open={createOpen}
        submitting={submitting}
        quota={quotaSummary}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateToken}
      />

      <RevokeTokenDialog
        open={revokeOpen}
        token={selectedToken}
        submitting={submitting}
        onClose={() => {
          setRevokeOpen(false);
          setSelectedToken(null);
        }}
        onConfirm={handleRevokeToken}
      />

      <TokenCreatedDialog
        open={createdOpen}
        tokenData={createdToken}
        onClose={() => {
          setCreatedOpen(false);
          setCreatedToken(null);
        }}
      />

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}