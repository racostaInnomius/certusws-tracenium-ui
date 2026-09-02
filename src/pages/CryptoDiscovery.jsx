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
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";

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
import CertificateDetailDrawer from "../components/CryptoDiscovery/CertificateDetailDrawer";
import CertIssuanceDialog from "../components/CryptoDiscovery/CertIssuanceDialog";
import {
  PqcHorizonPanel,
  PqcFamilyPanel,
  TrustAnchorsPanel,
  AgilityBlockersPanel,
  CnsaPanel,
} from "../components/CryptoDiscovery/PqcReadinessPanels";
import { BRAND, DATAGRID_SX, ICON, TEXT, TEXT_MUTED } from "../theme/brand";
import {
  getCdpSummary,
  getCdpDashboard,
  getCdpPqcReadiness,
  listCdpCertificates,
  listCdpDevices,
  listCdpDeviceCertificates,
  listCdpTrustAnchors,
  distrustAnchor,
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
      sx={{ bgcolor: meta.soft, color: meta.color, fontWeight: 700, fontSize: TEXT.xs }}
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
  revoked: "REVOKED by its issuer but still installed",
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
              fontSize: TEXT.xs,
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
  // Separado de `error` a propósito: los KPIs y los paneles se piden por
  // separado justamente para que uno sobreviva al otro. Lo que faltaba es
  // que el que cae lo diga — sin esto los paneles se pintaban vacíos, que
  // se lee como "no hay nada que mostrar" en vez de "no pude cargarlo".
  const [panelsError, setPanelsError] = React.useState(null);

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
        if (alive) {
          setDashboard(resp?.dashboard ?? null);
          setPanelsError(null);
        }
      })
      .catch((err) => {
        if (alive) {
          setDashboard(null);
          setPanelsError(err?.message || String(err));
        }
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
    {
      title: "End-entity certificates",
      value: s.totalCerts ?? "…",
      icon: <BadgeOutlinedIcon />,
      hint: `The certificates that expire and take a service down with them. CA certificates (${
        (s.caCerts ?? 0).toLocaleString()
      }) are counted separately — you review those under Trust anchors, you don't renew them.`,
    },
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
    // Caducado-con-clave va DELANTE de caducado a secas, y no es cosmética:
    // son 7 sobre 549. Un certificado caducado sin clave privada rara vez
    // es una incidencia; con clave es una identidad viva que ya no vale.
    {
      title: "Expired, with private key",
      value: s.expiredWithKey ?? "…",
      icon: <EventBusyOutlinedIcon />,
      accent: BRAND.alert.error,
      tint: BRAND.alert.errorSoft,
      hint: `A live identity that stopped being valid — the shortest actionable list on this page. ${
        (s.expired ?? 0).toLocaleString()
      } end-entity certificates are expired in total.`,
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

      {panelsError ? (
        // Después de los KPIs, no antes: los KPIs vienen de otra petición y
        // siguen siendo válidos. Lo que hay que decir es exactamente qué
        // parte de la pantalla no es de fiar.
        <Alert severity="warning">
          <AlertTitle>The detail panels didn&apos;t load</AlertTitle>
          {panelsError} — the indicators above are still accurate; the panels
          below are empty because of the failure, not for lack of data.
        </Alert>
      ) : null}

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

// ── PQC readiness tab ────────────────────────────────────────────────

function CdpPqcTab({ refreshNonce }) {
  const [pqc, setPqc] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    getCdpPqcReadiness()
      .then((resp) => {
        if (alive) {
          setPqc(resp?.pqc ?? null);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) setError(err?.message || String(err));
      });
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  if (error) {
    return (
      <Typography color="error" sx={{ py: 2 }}>
        Failed to load post-quantum readiness: {error}
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      <PqcHorizonPanel pqc={pqc} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <PqcFamilyPanel pqc={pqc} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TrustAnchorsPanel pqc={pqc} />
        </Grid>
      </Grid>
      <AgilityBlockersPanel pqc={pqc} />
      <CnsaPanel pqc={pqc} />
    </Stack>
  );
}

// ── Certificates tab (fleet, deduped by fingerprint) ─────────────────

function CdpCertificatesTab({ refreshNonce, externalFilter }) {
  const [loadError, setLoadError] = React.useState(null);
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
  // The fleet list answers "which certificates"; the drawer answers
  // "and what do I do about this one" — attribution, chain and
  // revocation all live there.
  const [drawerCert, setDrawerCert] = React.useState(null);

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
      .catch((err) => {
        if (alive) {
          // Vaciar la tabla sin más decía "cero certificados", que es una
          // afirmación sobre la flota. La verdad era "no pude leerlos".
          setRows([]);
          setRowCount(0);
          setLoadError(err?.message || String(err));
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
          label={<Typography sx={{ fontSize: TEXT.md }}>Show system roots</Typography>}
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

      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          <AlertTitle>Couldn&apos;t load</AlertTitle>
          {loadError} — the table is empty because the query failed, not because
          there is nothing to show.
        </Alert>
      ) : null}

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
        onRowClick={(params) => setDrawerCert(params.row.fingerprint256)}
        sx={{ ...DATAGRID_SX, "& .MuiDataGrid-row": { cursor: "pointer" } }}
      />

      <Drawer
        anchor="right"
        open={Boolean(drawerCert)}
        onClose={() => setDrawerCert(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 480 } } }}
      >
        <Box sx={{ display: "flex", justifyContent: "flex-end", p: 1, pb: 0 }}>
          <IconButton aria-label="Close certificate details" onClick={() => setDrawerCert(null)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        {drawerCert ? (
          // keyed by fingerprint so internal state resets between certs
          <CertificateDetailDrawer
            key={drawerCert}
            fingerprint={drawerCert}
            flagLabels={FLAG_LABELS}
          />
        ) : null}
      </Drawer>
    </Box>
  );
}

// ── Devices tab + drawer ─────────────────────────────────────────────

function CdpDeviceDrawerContent({ agentId, host }) {
  const [loadError, setLoadError] = React.useState(null);
  const [items, setItems] = React.useState(null);
  const [includeRoots, setIncludeRoots] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setItems(null);
    setLoadError(null);
    listCdpDeviceCertificates(agentId, { includeRoots: includeRoots || undefined })
      .then((resp) => {
        if (alive) setItems(resp?.items ?? []);
      })
      .catch((err) => {
        // Ojo: `items = []` pinta "No certificates reported.", que le dice
        // al operador algo falso sobre SU equipo y lo manda a revisar una
        // máquina que está bien.
        if (alive) setLoadError(err?.message || String(err));
      });
    return () => {
      alive = false;
    };
  }, [agentId, includeRoots]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography sx={{ fontWeight: 800, fontSize: TEXT.lg, color: BRAND.dark }}>
        {host || agentId}
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
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
        label={<Typography sx={{ fontSize: TEXT.md }}>Show system roots</Typography>}
        sx={{ mb: 1 }}
      />
      {loadError ? (
        <Alert severity="error">
          <AlertTitle>Couldn&apos;t load</AlertTitle>
          {loadError}
        </Alert>
      ) : items === null ? (
        <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>Loading…</Typography>
      ) : items.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>
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
                <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cert.subjectCN || `${cert.fingerprint256?.slice(0, 16)}…`}
                </Typography>
                <CertStatusChip status={cert.status} />
              </Stack>
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                {cert.issuerCN ? `Issued by ${cert.issuerCN}` : "Self-issued"} ·{" "}
                {cert.storeName || cert.storeScope}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap" }}>
                <Typography sx={{ fontSize: TEXT.sm }}>
                  Expires {formatDate(cert.notAfter)}
                </Typography>
                {cert.hasPrivateKey ? (
                  <Tooltip title="Device holds the private key" arrow>
                    <KeyOutlinedIcon sx={{ fontSize: ICON.sm }} />
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


/**
 * Anclas de confianza.
 *
 * Un ancla es una CA en la que el equipo CREE: todo lo que firme se
 * acepta. Es lo mas sensible que inventaria CDP, y hasta ahora un
 * hallazgo sobre anclas solo aparecia como una linea en el feed de
 * alertas, que es efimero. Aqui el administrador las ve todas.
 *
 * Solo lectura a proposito. Quitar la confianza a una raiz es una
 * capacidad de ESCRITURA con alcance de flota —desconfiar de la CA
 * equivocada rompe TLS en todos los equipos a la vez— y tiene su propia
 * puerta en ADR-0011 decision 10. Un boton aqui seria saltarsela.
 */

/**
 * Quitar la confianza a un ancla. ADR-0011 decisión 10.
 *
 * ⚠️ UN EQUIPO POR VEZ, a propósito. Desconfiar de la raíz equivocada
 * —la que firma Windows Update, o la nuestra— rompe TLS en todos los
 * equipos a la vez. Una acción masiva merece su propia decisión de
 * producto, no colarse por la puerta de una individual.
 *
 * El expediente (motivo + ticket) es obligatorio como en cualquier
 * capacidad privilegiada, y la respuesta puede ser 202 "pendiente de
 * visto bueno" si la política del tenant lo exige: eso NO es un error.
 */
function DistrustAnchorDialog({ anchor, onClose, onDone }) {
  const [deviceId, setDeviceId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [ticketRef, setTicketRef] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  React.useEffect(() => {
    if (anchor) {
      setDeviceId(anchor.agentIds?.[0] || "");
      setReason("");
      setTicketRef("");
      setMsg(null);
    }
  }, [anchor]);

  const puede = deviceId && reason.trim().length >= 10 && ticketRef.trim().length >= 3;

  const enviar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await distrustAnchor({
        deviceId,
        thumbprint: anchor.fingerprint256,
        reason: reason.trim(),
        ticketRef: ticketRef.trim()
      });
      if (r?.status === "pending_approval") {
        setMsg({ sev: "info", text: `En cola: ${r.message || "requiere visto bueno"}` });
      } else if (r?.ok) {
        setMsg({ sev: "success", text: "Enviado al equipo. El inventario lo confirmará." });
        onDone?.();
      } else {
        setMsg({ sev: "error", text: r?.message || "No se pudo enviar" });
      }
    } catch (e) {
      setMsg({ sev: "error", text: e?.message || "No se pudo enviar" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(anchor)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Dejar de confiar en «{anchor?.subjectCN}»</DialogTitle>
      <DialogContent>
        {/*
          Se dice lo que HACE de verdad. "Eliminar" sería mentir: en
          Windows el certificado sigue en Root y se añade a Disallowed,
          porque el trust store se repuebla bajo demanda y un borrado se
          desharía solo.
        */}
        <Alert severity="warning" sx={{ mb: 2 }}>
          El certificado no se borra: se marca como <strong>no confiable</strong>.
          En Windows entra en <code>Disallowed</code>; en macOS se le pone una
          denegación de confianza. Es reversible.
        </Alert>

        <TextField
          select fullWidth margin="dense" label="Equipo"
          value={deviceId} onChange={(e) => setDeviceId(e.target.value)}
          helperText={`Un equipo por petición · ${anchor?.deviceCount ?? 0} lo tienen`}
        >
          {(anchor?.agentIds || []).map((id) => (
            <MenuItem key={id} value={id}>{id}</MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth multiline minRows={2} margin="dense" label="Motivo"
          value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Por qué esta CA no debe ser de confianza en este equipo"
        />
        <TextField
          fullWidth margin="dense" label="Ticket"
          value={ticketRef} onChange={(e) => setTicketRef(e.target.value)}
        />
        {msg && <Alert severity={msg.sev} sx={{ mt: 2 }}>{msg.text}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="contained" color="warning" disabled={!puede || busy} onClick={enviar}>
          Dejar de confiar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CdpTrustAnchorsTab({ refreshNonce }) {
  const [loadError, setLoadError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState({ items: [], counts: {} });
  const [onlyFindings, setOnlyFindings] = React.useState(true);
  const [distrustFor, setDistrustFor] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    listCdpTrustAnchors()
      .then((resp) => { if (alive) { setData(resp || { items: [], counts: {} }); setLoadError(null); } })
      .catch((err) => { if (alive) setLoadError(err?.message || "No se pudieron cargar las anclas"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshNonce]);

  const counts = data.counts || {};
  const isFinding = (r) =>
    Boolean(r.distrusted) ||
    (r.actionable && r.novelDeviceCount > 0 && r.novelDeviceCount * 2 <= r.deviceCount);

  const rows = (data.items || [])
    .filter((r) => (onlyFindings ? isFinding(r) : true))
    .map((r) => ({ id: r.fingerprint256, ...r }));

  const columns = [
    {
      field: "subjectCN",
      headerName: "Autoridad certificadora",
      flex: 2,
      minWidth: 260,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: params.row.distrusted ? 600 : 400 }}>
            {params.row.subjectCN || "(sin nombre)"}
          </Typography>
          {params.row.distrusted && (
            <Chip size="small" label="Desconfiada" sx={{ bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.error }} />
          )}
          {!params.row.actionable && (
            <Chip size="small" variant="outlined" label="Bundle del fabricante" />
          )}
        </Box>
      ),
    },
    {
      field: "deviceCount",
      headerName: "Equipos",
      description:
        "Equipos que confían en esta CA hoy. Si hay una segunda línea, dice en cuántos de ESOS mismos equipos apareció después de que el equipo ya estuviera inventariado.",
      width: 130,
      // ⚠️ El recuento "nuevo" es un SUBCONJUNTO del total, no un
      // añadido: sale de un FILTER sobre las mismas filas que cuentan el
      // total, así que nunca puede superarlo (comprobado en los 3
      // tenants: 0 anclas con nueva > total).
      //
      // Se pintaba "11 (1 nueva)", que se lee igual de bien como "11, de
      // los cuales 1" que como "11 y además 1" — y con la segunda
      // lectura el número deja de significar nada. Va en dos líneas y
      // diciendo "de ellos" para que no quepa la duda.
      renderCell: (params) => (
        <Box sx={{ lineHeight: 1.25, py: 0.5 }}>
          <Typography variant="body2">{params.row.deviceCount}</Typography>
          {params.row.novelDeviceCount > 0 && (
            <Typography variant="caption" sx={{ color: TEXT_MUTED, display: "block" }}>
              {params.row.novelDeviceCount} de ellos reciente
              {params.row.novelDeviceCount > 1 ? "s" : ""}
            </Typography>
          )}
        </Box>
      ),
    },
    { field: "signatureAlgorithm", headerName: "Firma", width: 170 },
    {
      field: "accion",
      headerName: "",
      width: 130,
      sortable: false,
      renderCell: (params) =>
        // Solo donde la presencia significa confianza. En el bundle que
        // envía Apple no hay nada que retirar: el sistema operativo
        // decide su estado por separado.
        params.row.actionable ? (
          <Button size="small" onClick={() => setDistrustFor(params.row)}>
            No confiar
          </Button>
        ) : null,
    },
    {
      field: "distrusted",
      headerName: "Por qué importa",
      flex: 3,
      minWidth: 300,
      renderCell: (params) =>
        params.row.distrusted ? (
          <Typography variant="caption" sx={{ color: BRAND.alert.error }}>
            {params.row.distrusted}
          </Typography>
        ) : params.row.novelDeviceCount > 0 ? (
          // "de los N equipos que ya la tenían" cierra la lectura
          // aditiva: el subconjunto queda explícito en la propia frase,
          // no sólo en la columna de al lado.
          <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
            Ya estaba en {params.row.deviceCount - params.row.novelDeviceCount} equipo
            {params.row.deviceCount - params.row.novelDeviceCount === 1 ? "" : "s"} desde su
            inventariado; en {params.row.novelDeviceCount} de los {params.row.deviceCount} apareció
            después
          </Typography>
        ) : null,
    },
  ];

  return (
    <Box>
      <DistrustAnchorDialog
        anchor={distrustFor}
        onClose={() => setDistrustFor(null)}
        onDone={() => setDistrustFor(null)}
      />
      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2, flexWrap: "wrap" }}>
        <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
          {counts.total ?? 0} anclas · <strong>{counts.distrusted ?? 0}</strong> desconfiadas ·{" "}
          {counts.novel ?? 0} aparecidas en una minoria de equipos
        </Typography>
        <Button size="small" variant="outlined" onClick={() => setOnlyFindings((v) => !v)}>
          {onlyFindings ? "Ver todas" : "Ver solo hallazgos"}
        </Button>
      </Box>

      {/*
        Se explica por que hay anclas que no son accionables, en vez de
        esconderlas: en el bundle que envia Apple conviven a proposito CAs
        que Apple ya desconfia, y la confianza real vive en trust settings
        que no recolectamos. Ocultarlas dejaria al administrador buscando
        una CA que sabe que esta ahi.
      */}
      {(counts.vendorBundleOnly ?? 0) > 0 && !onlyFindings && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {counts.vendorBundleOnly} anclas aparecen solo en bundles que envia el fabricante
          (el llavero de raices de Apple, o el <code>cacerts</code> de una JVM). Ahi la presencia
          no significa confianza: el sistema operativo las trae y decide su estado por separado.
        </Alert>
      )}

      <Box sx={{ height: 560 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          initialState={{ sorting: { sortModel: [{ field: "deviceCount", sort: "desc" }] } }}
        />
      </Box>
    </Box>
  );
}

function CdpDevicesTab({ refreshNonce }) {
  const [loadError, setLoadError] = React.useState(null);
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
      .catch((err) => {
        if (alive) {
          // Vaciar la tabla sin más decía "cero certificados", que es una
          // afirmación sobre la flota. La verdad era "no pude leerlos".
          setRows([]);
          setRowCount(0);
          setLoadError(err?.message || String(err));
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

      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          <AlertTitle>Couldn&apos;t load</AlertTitle>
          {loadError} — the table is empty because the query failed, not because
          there is nothing to show.
        </Alert>
      ) : null}

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

  // ADR-0011 fase 3 — emisión e instalación.
  const [issuanceOpen, setIssuanceOpen] = React.useState(false);
  const [issuanceDevices, setIssuanceDevices] = React.useState([]);

  // Los equipos se cargan al ABRIR, no al montar la página: es una
  // acción puntual y la lista solo la necesita el desplegable. Cargarla
  // siempre sería una consulta por cada visita a Crypto Discovery para
  // algo que casi nadie va a usar.
  React.useEffect(() => {
    if (!issuanceOpen) return;
    let vivo = true;
    listCdpDevices({ page: 1, pageSize: 500 })
      .then((r) => {
        if (!vivo) return;
        const items = r?.items || r?.devices || [];
        setIssuanceDevices(
          items.map((d) => ({ id: d.agentId ?? d.agent_id, name: d.host ?? d.hostname }))
            .filter((d) => d.id)
        );
      })
      .catch(() => {
        // Sin lista el operador puede seguir: el diálogo acepta un id
        // escrito. Un fallo al poblar un desplegable no bloquea la
        // operación.
        if (vivo) setIssuanceDevices([]);
      });
    return () => {
      vivo = false;
    };
  }, [issuanceOpen]);

  const drillDown = React.useCallback((filter) => {
    setCertFilter({ ...filter });
    // Certificates moved to index 2 when the Post-quantum tab landed.
    setTab(2);
  }, []);

  return (
    <Box>
      <PageHeader
        title="Crypto Discovery"
        subtitle="X.509 certificates discovered on managed devices — inventory, expiry and hygiene"
        icon={<WorkspacePremiumOutlinedIcon />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {/*
              ADR-0011 fase 3. Va en la cabecera y no dentro de una
              pestaña porque no pertenece a ninguna: emitir cruza los
              certificados (lo que se crea) y los equipos (dónde), y
              esconderla en una de las dos la haría invisible desde la
              otra.
            */}
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddCircleOutlineIcon />}
              onClick={() => setIssuanceOpen(true)}
            >
              Emitir certificado
            </Button>
            <Tooltip title="Refresh" arrow>
              <IconButton aria-label="Refresh" onClick={() => setRefreshNonce((n) => n + 1)}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        }
      />

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ borderBottom: `1px solid ${BRAND.border}` }}>
        <Tab label="Dashboard" />
        <Tab label="Post-quantum" />
        <Tab label="Certificates" />
        <Tab label="Devices" />
        <Tab label="Trust anchors" />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <CdpDashboard
          refreshNonce={refreshNonce}
          onDrillDown={drillDown}
          onOpenDevices={() => setTab(3)}
        />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <CdpPqcTab refreshNonce={refreshNonce} />
      </TabPanel>
      <TabPanel value={tab} index={2}>
        <CdpCertificatesTab refreshNonce={refreshNonce} externalFilter={certFilter} />
      </TabPanel>
      <TabPanel value={tab} index={3}>
        <CdpDevicesTab refreshNonce={refreshNonce} />
      </TabPanel>
      <TabPanel value={tab} index={4}>
        <CdpTrustAnchorsTab refreshNonce={refreshNonce} />
      </TabPanel>

      <CertIssuanceDialog
        open={issuanceOpen}
        devices={issuanceDevices}
        onClose={() => {
          setIssuanceOpen(false);
          // El inventario es quien confirma que el certificado llegó, así
          // que se refresca al cerrar.
          setRefreshNonce((n) => n + 1);
        }}
      />
    </Box>
  );
}
