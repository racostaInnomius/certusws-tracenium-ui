// src/pages/CryptoDiscovery.jsx
//
// CDP (Crypto Discovery Plugin) — Phase A surface. Three tabs:
//
//   Dashboard    : KPI row from /api/v1/cdp/summary.
//   Certificates : fleet view deduped by fingerprint (server-side
//                  pagination), system roots hidden behind a toggle.
//   Devices      : per-device counters → right Drawer with that
//                  device's certificate list.
//
// This page reads the CDP inventory (certs discovered ON devices).
// The PKI page covers the agent's own mTLS identity certs — different
// API, different concern.

import * as React from "react";
import {
  Box,
  Chip,
  Drawer,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import WorkspacePremiumOutlinedIcon from "@mui/icons-material/WorkspacePremiumOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";

import PageHeader from "../components/common/PageHeader";
import SummaryCard from "../components/common/SummaryCard";
import {
  ExpiryHorizonPanel,
  ActionRequiredPanel,
  HygienePanel,
  IssuersPanel,
  DistributionPanel,
  TopDevicesPanel,
} from "../components/CryptoDiscovery/CdpDashboardPanels";
import { BRAND, DATAGRID_SX } from "../theme/brand";
import {
  getCdpSummary,
  getCdpDashboard,
  listCdpCertificates,
  listCdpDevices,
  listCdpDeviceCertificates,
} from "../api/cdp";

// ── helpers ──────────────────────────────────────────────────────────

const STATUS_META = {
  active: { label: "Active", color: BRAND.alert.success, soft: BRAND.alert.successSoft },
  expiring: { label: "Expiring", color: BRAND.alert.warningText, soft: BRAND.alert.warningSoft },
  expired: { label: "Expired", color: BRAND.alert.error, soft: BRAND.alert.errorSoft },
  unknown: { label: "Unknown", color: BRAND.gray, soft: BRAND.surfaceMuted },
};

function CertStatusChip({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  return (
    <Chip
      size="small"
      label={meta.label}
      sx={{ bgcolor: meta.soft, color: meta.color, fontWeight: 700, fontSize: 11 }}
    />
  );
}

const FLAG_LABELS = {
  weak_sig: "Weak signature (MD5/SHA-1)",
  weak_key: "Weak key (<2048 RSA / <256 EC)",
  self_signed_leaf: "Self-signed leaf",
  long_validity: "Validity > 398 days",
  nonstandard_root:
    "Nonstandard root — trusted by only a small minority of comparable devices",
  shared_private_key:
    "Shared private key — the same private key is present on more than one device",
  reused_key: "Reused key — another certificate already uses this key pair",
  chain_incomplete:
    "Incomplete chain — served without intermediates; clients without them will fail",
  chain_untrusted: "Untrusted chain — the device's own trust store rejects it",
};

function FlagChips({ flags }) {
  if (!Array.isArray(flags) || flags.length === 0) return null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
      {flags.map((flag) => (
        <Tooltip key={flag} title={FLAG_LABELS[flag] ?? flag} arrow>
          <Chip
            size="small"
            label={flag}
            sx={{
              bgcolor: BRAND.alert.highSoft,
              color: BRAND.alert.high,
              fontWeight: 700,
              fontSize: 10,
            }}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function TabPanel({ value, index, children }) {
  if (value !== index) return null;
  return <Box sx={{ pt: 2 }}>{children}</Box>;
}

// ── Dashboard tab ────────────────────────────────────────────────────

function CdpDashboard({ refreshNonce, onDrillDown, onOpenDevices }) {
  const [summary, setSummary] = React.useState(null);
  const [dashboard, setDashboard] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    // Two calls, not one: /summary is the cheap KPI read shared with
    // other surfaces; /dashboard runs six aggregates and only the
    // panels below need it. Failing the panels must not blank the KPIs.
    getCdpSummary()
      .then((resp) => {
        if (alive) setSummary(resp?.summary ?? null);
      })
      .catch((err) => {
        if (alive) setError(err?.message || String(err));
      });
    getCdpDashboard()
      .then((resp) => {
        if (alive) setDashboard(resp?.dashboard ?? null);
      })
      .catch(() => {
        if (alive) setDashboard(null);
      });
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  if (error) {
    return (
      <Typography color="error" sx={{ py: 2 }}>
        Failed to load summary: {error}
      </Typography>
    );
  }

  const s = summary ?? {};
  const cards = [
    { title: "Certificates", value: s.totalCerts ?? "…", icon: <BadgeOutlinedIcon /> },
    {
      title: "With private key",
      value: s.withPrivateKey ?? "…",
      icon: <KeyOutlinedIcon />,
      hint: "Certificates the device holds a private key for — the ones the operator has to renew.",
    },
    {
      title: "Expiring ≤30d",
      value: s.expiring30d ?? "…",
      icon: <ScheduleOutlinedIcon />,
      accent: BRAND.alert.warningText,
      tint: BRAND.alert.warningSoft,
    },
    {
      title: "Expired",
      value: s.expired ?? "…",
      icon: <EventBusyOutlinedIcon />,
      accent: BRAND.alert.error,
      tint: BRAND.alert.errorSoft,
    },
    {
      title: "Hygiene flags",
      value: s.withFlags ?? "…",
      icon: <ReportProblemOutlinedIcon />,
      accent: BRAND.alert.high,
      tint: BRAND.alert.highSoft,
      hint: "Weak signature/key, self-signed leaves and >398-day validity.",
    },
    {
      title: "Devices reporting",
      value: s.devicesReporting ?? "…",
      icon: <ComputerOutlinedIcon />,
    },
  ];

  const d = dashboard ?? {};

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid key={card.title} size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <SummaryCard
              title={card.title}
              value={card.value}
              icon={card.icon}
              accent={card.accent}
              tint={card.tint}
              titleHint={card.hint ?? null}
              stretch
            />
          </Grid>
        ))}
      </Grid>

      {/* Row 1 — when does the fleet break, and what do I do today. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <ExpiryHorizonPanel data={d.expiryHorizon} noExpiryDate={d.noExpiryDate ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <ActionRequiredPanel
            items={d.urgent}
            onSelect={(row) => onDrillDown?.({ search: row.fingerprint256 })}
          />
        </Grid>
      </Grid>

      {/* Row 2 — posture: who signs, what's unhealthy, where they live. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <IssuersPanel
            issuers={d.topIssuers}
            onSelect={(issuer) => onDrillDown?.({ issuer })}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <HygienePanel flags={d.flags} onSelect={(flag) => onDrillDown?.({ flag })} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <DistributionPanel distribution={d.distribution} />
        </Grid>
      </Grid>

      {/* Row 3 — worst devices, straight into the Devices tab. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TopDevicesPanel devices={d.topDevices} onSelect={() => onOpenDevices?.()} />
        </Grid>
      </Grid>
    </Stack>
  );
}

// ── Certificates tab (fleet, deduped by fingerprint) ─────────────────

function CdpCertificatesTab({ refreshNonce, externalFilter }) {
  const [rows, setRows] = React.useState([]);
  const [rowCount, setRowCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [paginationModel, setPaginationModel] = React.useState({ page: 0, pageSize: 25 });
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [includeRoots, setIncludeRoots] = React.useState(false);
  // Set by dashboard drill-down. The backend has supported these two
  // filters since Phase A; the grid had no control for them, so they
  // are surfaced as removable chips rather than yet more dropdowns.
  const [flag, setFlag] = React.useState("");
  const [issuer, setIssuer] = React.useState("");

  // Apply a drill-down coming from the Dashboard tab. Keyed on the
  // filter object identity — the page mints a new one per click, so
  // clicking the same issuer twice still re-applies.
  React.useEffect(() => {
    if (!externalFilter) return;
    setSearch(externalFilter.search ?? "");
    setStatus(externalFilter.status ?? "");
    setFlag(externalFilter.flag ?? "");
    setIssuer(externalFilter.issuer ?? "");
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  }, [externalFilter]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    listCdpCertificates({
      page: paginationModel.page + 1,
      pageSize: paginationModel.pageSize,
      search: search || undefined,
      status: status || undefined,
      flag: flag || undefined,
      issuer: issuer || undefined,
      includeRoots: includeRoots || undefined,
    })
      .then((resp) => {
        if (!alive) return;
        setRows(
          (resp?.items ?? []).map((item) => ({ id: item.fingerprint256, ...item }))
        );
        setRowCount(Number(resp?.total ?? 0));
      })
      .catch(() => {
        if (alive) {
          setRows([]);
          setRowCount(0);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [paginationModel, search, status, flag, issuer, includeRoots, refreshNonce]);

  const columns = [
    {
      field: "subjectCN",
      headerName: "Subject",
      flex: 1.4,
      minWidth: 180,
      renderCell: (params) => (
        <Tooltip title={params.row.fingerprint256} arrow>
          <span>{params.value || `${params.row.fingerprint256?.slice(0, 16)}…`}</span>
        </Tooltip>
      ),
    },
    { field: "issuerCN", headerName: "Issuer", flex: 1.2, minWidth: 160 },
    {
      field: "notAfter",
      headerName: "Expires",
      width: 110,
      valueFormatter: (value) => formatDate(value),
    },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      sortable: false,
      renderCell: (params) => <CertStatusChip status={params.value} />,
    },
    {
      field: "keyAlgorithm",
      headerName: "Key",
      width: 110,
      sortable: false,
      valueGetter: (value, row) =>
        value ? `${value}${row.keySizeBits ? ` ${row.keySizeBits}` : ""}` : "—",
    },
    {
      field: "hasPrivateKey",
      headerName: "Private key",
      width: 100,
      sortable: false,
      renderCell: (params) => (params.value ? <KeyOutlinedIcon fontSize="small" /> : null),
    },
    { field: "deviceCount", headerName: "Devices", width: 90 },
    {
      field: "flags",
      headerName: "Flags",
      flex: 1,
      minWidth: 140,
      sortable: false,
      renderCell: (params) => <FlagChips flags={params.value} />,
    },
  ];

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          label="Search subject / issuer / fingerprint"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPaginationModel((m) => ({ ...m, page: 0 }));
          }}
          sx={{ minWidth: 280 }}
        />
        <TextField
          size="small"
          select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPaginationModel((m) => ({ ...m, page: 0 }));
          }}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="expiring">Expiring</MenuItem>
          <MenuItem value="expired">Expired</MenuItem>
        </TextField>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={includeRoots}
              onChange={(e) => {
                setIncludeRoots(e.target.checked);
                setPaginationModel((m) => ({ ...m, page: 0 }));
              }}
            />
          }
          label={<Typography sx={{ fontSize: 13 }}>Show system roots</Typography>}
        />

        {/* Drill-down filters arriving from the Dashboard tab. */}
        {flag && (
          <Chip
            size="small"
            label={`Flag: ${FLAG_LABELS[flag] ?? flag}`}
            onDelete={() => {
              setFlag("");
              setPaginationModel((m) => ({ ...m, page: 0 }));
            }}
            sx={{ bgcolor: BRAND.alert.highSoft, color: BRAND.alert.high, fontWeight: 700 }}
          />
        )}
        {issuer && (
          <Chip
            size="small"
            label={`Issuer: ${issuer}`}
            onDelete={() => {
              setIssuer("");
              setPaginationModel((m) => ({ ...m, page: 0 }));
            }}
            sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }}
          />
        )}
      </Stack>

      <DataGrid
        autoHeight
        rows={rows}
        columns={columns}
        loading={loading}
        rowCount={rowCount}
        paginationMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[10, 25, 50]}
        disableRowSelectionOnClick
        disableColumnMenu
        sx={DATAGRID_SX}
      />
    </Box>
  );
}

// ── Devices tab + drawer ─────────────────────────────────────────────

function CdpDeviceDrawerContent({ agentId, host }) {
  const [items, setItems] = React.useState(null);
  const [includeRoots, setIncludeRoots] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setItems(null);
    listCdpDeviceCertificates(agentId, { includeRoots: includeRoots || undefined })
      .then((resp) => {
        if (alive) setItems(resp?.items ?? []);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [agentId, includeRoots]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography sx={{ fontWeight: 800, fontSize: 16, color: BRAND.dark }}>
        {host || agentId}
      </Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>
        Certificates discovered on this device
      </Typography>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={includeRoots}
            onChange={(e) => setIncludeRoots(e.target.checked)}
          />
        }
        label={<Typography sx={{ fontSize: 13 }}>Show system roots</Typography>}
        sx={{ mb: 1 }}
      />
      {items === null ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Loading…</Typography>
      ) : items.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          No certificates reported.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {items.map((cert) => (
            <Box
              key={cert.certUid}
              sx={{
                border: `1px solid ${BRAND.border}`,
                borderRadius: 1.5,
                p: 1.25,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography sx={{ fontWeight: 700, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cert.subjectCN || `${cert.fingerprint256?.slice(0, 16)}…`}
                </Typography>
                <CertStatusChip status={cert.status} />
              </Stack>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {cert.issuerCN ? `Issued by ${cert.issuerCN}` : "Self-issued"} ·{" "}
                {cert.storeName || cert.storeScope}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap" }}>
                <Typography sx={{ fontSize: 12 }}>
                  Expires {formatDate(cert.notAfter)}
                </Typography>
                {cert.hasPrivateKey ? (
                  <Tooltip title="Device holds the private key" arrow>
                    <KeyOutlinedIcon sx={{ fontSize: 14 }} />
                  </Tooltip>
                ) : null}
                <FlagChips flags={cert.flags} />
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function CdpDevicesTab({ refreshNonce }) {
  const [rows, setRows] = React.useState([]);
  const [rowCount, setRowCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [paginationModel, setPaginationModel] = React.useState({ page: 0, pageSize: 25 });
  const [search, setSearch] = React.useState("");
  const [drawerDevice, setDrawerDevice] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    listCdpDevices({
      page: paginationModel.page + 1,
      pageSize: paginationModel.pageSize,
      search: search || undefined,
    })
      .then((resp) => {
        if (!alive) return;
        setRows((resp?.items ?? []).map((item) => ({ id: item.agentId, ...item })));
        setRowCount(Number(resp?.total ?? 0));
      })
      .catch(() => {
        if (alive) {
          setRows([]);
          setRowCount(0);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [paginationModel, search, refreshNonce]);

  const columns = [
    {
      field: "host",
      headerName: "Device",
      flex: 1.2,
      minWidth: 180,
      valueGetter: (value, row) => value || row.agentId,
    },
    { field: "platform", headerName: "Platform", width: 110 },
    { field: "certCount", headerName: "Certs", width: 90 },
    {
      field: "withPrivateKey",
      headerName: "With key",
      width: 100,
    },
    {
      field: "expiring",
      headerName: "Expiring",
      width: 100,
      renderCell: (params) =>
        params.value > 0 ? (
          <Chip
            size="small"
            label={params.value}
            sx={{ bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText, fontWeight: 700 }}
          />
        ) : (
          "0"
        ),
    },
    {
      field: "expired",
      headerName: "Expired",
      width: 100,
      renderCell: (params) =>
        params.value > 0 ? (
          <Chip
            size="small"
            label={params.value}
            sx={{ bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.error, fontWeight: 700 }}
          />
        ) : (
          "0"
        ),
    },
    { field: "withFlags", headerName: "Flags", width: 90 },
    {
      field: "lastSeen",
      headerName: "Last scan",
      width: 120,
      valueFormatter: (value) => formatDate(value),
    },
  ];

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search device"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPaginationModel((m) => ({ ...m, page: 0 }));
          }}
          sx={{ minWidth: 240 }}
        />
      </Stack>

      <DataGrid
        autoHeight
        rows={rows}
        columns={columns}
        loading={loading}
        rowCount={rowCount}
        paginationMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[10, 25, 50]}
        disableRowSelectionOnClick
        disableColumnMenu
        onRowClick={(params) => setDrawerDevice({ agentId: params.row.agentId, host: params.row.host })}
        sx={{ ...DATAGRID_SX, "& .MuiDataGrid-row": { cursor: "pointer" } }}
      />

      <Drawer
        anchor="right"
        open={Boolean(drawerDevice)}
        onClose={() => setDrawerDevice(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 440 } } }}
      >
        <Box sx={{ display: "flex", justifyContent: "flex-end", p: 1, pb: 0 }}>
          <IconButton aria-label="Close device details" onClick={() => setDrawerDevice(null)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        {drawerDevice ? (
          // keyed by agentId so internal state resets when switching devices
          <CdpDeviceDrawerContent
            key={drawerDevice.agentId}
            agentId={drawerDevice.agentId}
            host={drawerDevice.host}
          />
        ) : null}
      </Drawer>
    </Box>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function CryptoDiscovery() {
  const [tab, setTab] = React.useState(0);
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  // Dashboard → Certificates drill-down. A fresh object per click so
  // the child re-applies even when the same filter is picked twice.
  const [certFilter, setCertFilter] = React.useState(null);

  const drillDown = React.useCallback((filter) => {
    setCertFilter({ ...filter });
    setTab(1);
  }, []);

  return (
    <Box>
      <PageHeader
        title="Crypto Discovery"
        subtitle="X.509 certificates discovered on managed devices — inventory, expiry and hygiene"
        icon={<WorkspacePremiumOutlinedIcon />}
        actions={
          <Tooltip title="Refresh" arrow>
            <IconButton aria-label="Refresh" onClick={() => setRefreshNonce((n) => n + 1)}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        }
      />

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ borderBottom: `1px solid ${BRAND.border}` }}>
        <Tab label="Dashboard" />
        <Tab label="Certificates" />
        <Tab label="Devices" />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <CdpDashboard
          refreshNonce={refreshNonce}
          onDrillDown={drillDown}
          onOpenDevices={() => setTab(2)}
        />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <CdpCertificatesTab refreshNonce={refreshNonce} externalFilter={certFilter} />
      </TabPanel>
      <TabPanel value={tab} index={2}>
        <CdpDevicesTab refreshNonce={refreshNonce} />
      </TabPanel>
    </Box>
  );
}
