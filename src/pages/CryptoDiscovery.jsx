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
import AccessPolicyMatrix from "../components/common/AccessPolicyMatrix";
import useCdpFilter from "../hooks/useCdpFilter";
import {
  ExposureFunnel,
  ExplainToggle,
  KeyDistributionPanel,
  OwnershipScopeToggle,
  StoresPanel,
  TimelinePanel,
  useExplainMode
} from "../components/CryptoDiscovery/CdpExplorePanels";

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
import OrphanKeysPanel from "../components/CryptoDiscovery/OrphanKeysPanel";
import CdpRoadmapPanel from "../components/CryptoDiscovery/CdpRoadmapPanel";
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
  getCdpExposure,
  getCdpFacets,
  getCdpStores,
  getCdpTimeline
} from "../api/cdp";

/**
 * Índices de pestaña, con nombre. Fase 1 insertó «Explore» y «Stores»
 * tras Post-quantum y desplazó el resto; un número suelto (`tab: 2`) es
 * exactamente lo que dejó «Access policy» en blanco la última vez.
 */
const TAB = {
  dashboard: 0,
  pqc: 1,
  roadmap: 2,
  explore: 3,
  stores: 4,
  certificates: 5,
  devices: 6,
  anchors: 7,
  orphans: 8,
  policy: 9
};

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
  // role=tabpanel: lo que un lector de pantalla espera bajo un Tabs, y lo
  // que permite al test de la página contar cuántos paneles hay visibles
  // —que es como se caza un índice duplicado.
  return (
    <Box role="tabpanel" sx={{ pt: 2 }}>
      {children}
    </Box>
  );
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
  // Fase 1: el embudo de propiedad va PRIMERO. Es la cifra que separa lo
  // que el cliente posee de lo que le llega con el sistema.
  const [exposure, setExposure] = React.useState(null);
  const [explain, toggleExplain] = useExplainMode();
  React.useEffect(() => {
    let alive = true;
    getCdpExposure()
      .then((r) => alive && setExposure(r?.exposure ?? null))
      .catch(() => alive && setExposure(null));
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

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
      filter: {},
      icon: <BadgeOutlinedIcon />,
      hint: `The certificates that expire and take a service down with them. CA certificates (${
        (s.caCerts ?? 0).toLocaleString()
      }) are counted separately — you review those under Trust anchors, you don't renew them.`,
    },
    {
      title: "With private key",
      value: s.withPrivateKey ?? "…",
      filter: { hasPrivateKey: true },
      icon: <KeyOutlinedIcon />,
      hint: "Certificates the device holds a private key for — the ones the operator has to renew.",
    },
    {
      title: "Expiring ≤30d",
      value: s.expiring30d ?? "…",
      filter: { status: "expiring" },
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
      filter: { status: "expired", hasPrivateKey: true },
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
      filter: { hasFlags: true },
      icon: <ReportProblemOutlinedIcon />,
      accent: BRAND.alert.high,
      tint: BRAND.alert.highSoft,
      hint: "Weak signature/key, self-signed leaves and >398-day validity.",
    },
    {
      title: "Devices reporting",
      value: s.devicesReporting ?? "…",
      icon: <ComputerOutlinedIcon />,
      devices: true,
    },
  ];

  const d = dashboard ?? {};

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <ExplainToggle on={explain} onToggle={toggleExplain} />
      </Stack>
      <ExposureFunnel
        exposure={exposure}
        explain={explain}
        onSelect={(f) => onDrillDown?.(f, { replace: true })}
      />
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
              // Análisis de madurez 2026-09: los seis KPI eran inertes
              // aunque SummaryCard soporta onClick desde siempre. Un
              // número que no lleva a su lista es un adorno.
              onClick={
                card.devices
                  ? () => onOpenDevices?.()
                  : card.filter
                    ? () => onDrillDown?.(card.filter, { replace: true })
                    : undefined
              }
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

// ── Explore tab (fase 1): distribución por clave + línea de tiempo ───

function CdpExploreTab({ refreshNonce, onDrillDown }) {
  const [scope, setScope] = React.useState("all");
  const [explain, toggleExplain] = useExplainMode();
  const [facets, setFacets] = React.useState(null);
  const [timeline, setTimeline] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    const filter = scope === "own" ? { hasPrivateKey: true } : {};
    Promise.all([
      getCdpFacets({ by: ["key_algorithm", "key_size_bits"], stack: "ownership", ...filter }),
      getCdpTimeline(filter)
    ])
      .then(([f, t]) => {
        if (!alive) return;
        setFacets(f ?? null);
        setTimeline(t ?? null);
      })
      .catch((err) => alive && setError(err?.message || String(err)));
    return () => {
      alive = false;
    };
  }, [refreshNonce, scope]);

  // El filtro que se navega FUNDE el ámbito elegido: «solo lo mío» + un
  // segmento = esa lista con clave privada.
  const select = (f) => onDrillDown?.(scope === "own" ? { hasPrivateKey: true, ...f } : f, { replace: true });

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
        <OwnershipScopeToggle value={scope} onChange={setScope} />
        <ExplainToggle on={explain} onToggle={toggleExplain} />
      </Stack>
      {error ? (
        <Alert severity="error">
          <AlertTitle>Couldn&apos;t load</AlertTitle>
          {error}
        </Alert>
      ) : null}
      <KeyDistributionPanel facets={facets} onSelect={select} explain={explain} />
      <TimelinePanel timeline={timeline} onSelect={select} explain={explain} ownOnly={scope === "own"} />
    </Stack>
  );
}

// ── Stores tab (fase 1): fuente → almacén → equipo ───────────────────

function CdpStoresTab({ refreshNonce, onDrillDown }) {
  const [explain, toggleExplain] = useExplainMode();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    getCdpStores()
      .then((r) => alive && setData(r ?? null))
      .catch((err) => alive && setError(err?.message || String(err)));
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <ExplainToggle on={explain} onToggle={toggleExplain} />
      </Stack>
      {error ? (
        <Alert severity="error">
          <AlertTitle>Couldn&apos;t load</AlertTitle>
          {error}
        </Alert>
      ) : null}
      <StoresPanel
        stores={data?.stores}
        javaOnlyVendorBundles={data?.javaOnlyVendorBundles === true}
        onSelect={(f) => onDrillDown?.(f, { replace: true })}
        explain={explain}
      />
    </Stack>
  );
}

// ── Certificates tab (fleet, deduped by fingerprint) ─────────────────

function CdpCertificatesTab({ refreshNonce }) {
  const [loadError, setLoadError] = React.useState(null);
  const [rows, setRows] = React.useState([]);
  const [rowCount, setRowCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [paginationModel, setPaginationModel] = React.useState({ page: 0, pageSize: 25 });
  // ── El filtro vive en la URL, no aquí ──────────────────────────────
  //
  // Antes había dos estados para el mismo filtro: el de la página (el
  // drill-down) y el de esta pestaña. El drill-down PISABA la búsqueda
  // escrita y se reaplicaba al volver aunque se hubieran borrado los
  // chips; `flag` e `issuer` solo se podían fijar desde el Dashboard.
  // Con una sola fuente de verdad, cada control de abajo lee y escribe
  // la misma cosa, y un enlace copiado conserva la vista.
  const [filter, patchFilter] = useCdpFilter();
  const search = filter.search ?? "";
  const status = filter.status ?? "";
  const includeRoots = filter.includeRoots === true;
  const flag = filter.flag ?? "";
  const issuer = filter.issuer ?? "";
  const hasPrivateKey = filter.hasPrivateKey === true;
  const hasFlags = filter.hasFlags === true;
  const eku = filter.eku ?? "";
  // Filtros de navegación (fase 1): llegan desde Explore / Stores. No
  // tienen control propio aquí —se eligen en su panel— pero sí chip
  // borrable, para que nunca haya un filtro invisible actuando.
  const nav = {
    keyAlgorithm: filter.keyAlgorithm,
    keySizeBits: filter.keySizeBits ? Number(filter.keySizeBits) : undefined,
    family: filter.family,
    source: filter.source,
    storeName: filter.storeName,
    agentId: filter.agentId,
    notAfterFrom: filter.notAfterFrom,
    notAfterTo: filter.notAfterTo
  };
  const navKey = JSON.stringify(nav);
  const setAndReset = (delta) => {
    patchFilter(delta);
    setPaginationModel((m) => ({ ...m, page: 0 }));
  };
  // The fleet list answers "which certificates"; the drawer answers
  // "and what do I do about this one" — attribution, chain and
  // revocation all live there.
  const [drawerCert, setDrawerCert] = React.useState(null);

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
      hasPrivateKey: hasPrivateKey || undefined,
      hasFlags: hasFlags || undefined,
      eku: eku || undefined,
      ...Object.fromEntries(Object.entries(nav).filter(([, v]) => v != null && v !== "")),
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
  }, [paginationModel, search, status, flag, issuer, includeRoots, hasPrivateKey, hasFlags, eku, navKey, refreshNonce]);

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
          onChange={(e) => setAndReset({ search: e.target.value })}
          sx={{ minWidth: 280 }}
        />
        <TextField
          size="small"
          select
          label="Status"
          value={status}
          onChange={(e) => setAndReset({ status: e.target.value })}
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
              onChange={(e) => setAndReset({ includeRoots: e.target.checked })}
            />
          }
          label={<Typography sx={{ fontSize: TEXT.md }}>Show system roots</Typography>}
        />
        {/*
          Los filtros que antes solo se podían fijar desde el Dashboard
          tienen control propio. Se sigue pudiendo llegar por drill-down,
          pero también cambiarlos aquí sin volver atrás.
        */}
        <TextField
          size="small"
          select
          label="Flag"
          value={flag}
          onChange={(e) => setAndReset({ flag: e.target.value })}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">Any</MenuItem>
          {Object.entries(FLAG_LABELS).map(([k, v]) => (
            <MenuItem key={k} value={k}>{v}</MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          select
          label="Purpose (EKU)"
          value={eku}
          onChange={(e) => setAndReset({ eku: e.target.value })}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="serverAuth">TLS server</MenuItem>
          <MenuItem value="clientAuth">TLS client</MenuItem>
          <MenuItem value="codeSigning">Code signing</MenuItem>
          <MenuItem value="emailProtection">S/MIME</MenuItem>
          <MenuItem value="smartCardLogon">Smart card logon</MenuItem>
          <MenuItem value="remoteDesktopAuth">Remote Desktop</MenuItem>
        </TextField>
        <TextField
          size="small"
          label="Issuer"
          value={issuer}
          onChange={(e) => setAndReset({ issuer: e.target.value })}
          sx={{ minWidth: 180 }}
        />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={hasPrivateKey}
              onChange={(e) => setAndReset({ hasPrivateKey: e.target.checked })}
            />
          }
          label={<Typography sx={{ fontSize: TEXT.md }}>With private key</Typography>}
        />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={hasFlags}
              onChange={(e) => setAndReset({ hasFlags: e.target.checked })}
            />
          }
          label={<Typography sx={{ fontSize: TEXT.md }}>Flagged only</Typography>}
        />
        {[
          ["keyAlgorithm", "Algorithm"],
          ["keySizeBits", "Key size"],
          ["family", "Family"],
          ["source", "Source"],
          ["storeName", "Store"],
          ["agentId", "Device"],
          ["notAfterFrom", "Expires from"],
          ["notAfterTo", "Expires before"]
        ].map(([k, label]) =>
          nav[k] != null && nav[k] !== "" ? (
            <Chip
              key={k}
              size="small"
              label={`${label}: ${nav[k]}`}
              onDelete={() => setAndReset({ [k]: "" })}
              sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700, maxWidth: 360 }}
            />
          ) : null
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
        setMsg({ sev: "info", text: `Queued: ${r.message || "waiting for approval"}` });
      } else if (r?.ok) {
        setMsg({ sev: "success", text: "Sent to the device. The next inventory will confirm it." });
        onDone?.();
      } else {
        setMsg({ sev: "error", text: r?.message || "Couldn't send" });
      }
    } catch (e) {
      setMsg({ sev: "error", text: e?.message || "Couldn't send" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(anchor)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Stop trusting “{anchor?.subjectCN}”</DialogTitle>
      <DialogContent>
        {/*
          Se dice lo que HACE de verdad. "Eliminar" sería mentir: en
          Windows el certificado sigue en Root y se añade a Disallowed,
          porque el trust store se repuebla bajo demanda y un borrado se
          desharía solo.
        */}
        <Alert severity="warning" sx={{ mb: 2 }}>
          The certificate is not deleted — it is marked <strong>untrusted</strong>.
          On Windows it goes into <code>Disallowed</code>; on macOS it gets a
          trust denial. This is reversible.
        </Alert>

        <TextField
          select fullWidth margin="dense" label="Device"
          value={deviceId} onChange={(e) => setDeviceId(e.target.value)}
          helperText={`One device per request · ${anchor?.deviceCount ?? 0} trust this CA`}
        >
          {(anchor?.agentIds || []).map((id) => (
            <MenuItem key={id} value={id}>{id}</MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth multiline minRows={2} margin="dense" label="Reason"
          value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Why this CA should not be trusted on this device"
          helperText="At least 10 characters"
        />
        <TextField
          fullWidth margin="dense" label="Ticket"
          value={ticketRef} onChange={(e) => setTicketRef(e.target.value)}
          helperText="At least 3 characters"
        />
        {msg && <Alert severity={msg.sev} sx={{ mt: 2 }}>{msg.text}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" color="warning" disabled={!puede || busy} onClick={enviar}>
          Stop trusting
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
      .catch((err) => { if (alive) setLoadError(err?.message || "Couldn't load trust anchors"); })
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
      headerName: "Certificate authority",
      flex: 2,
      minWidth: 260,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: params.row.distrusted ? 600 : 400 }}>
            {params.row.subjectCN || "(no name)"}
          </Typography>
          {params.row.distrusted && (
            <Chip size="small" label="Distrusted" sx={{ bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.error }} />
          )}
          {!params.row.actionable && (
            <Chip size="small" variant="outlined" label="Vendor bundle" />
          )}
        </Box>
      ),
    },
    {
      field: "deviceCount",
      headerName: "Devices",
      description:
        "Devices that trust this CA today. A second line, when present, says on how many of THOSE SAME devices it appeared after the device was already inventoried.",
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
              {params.row.novelDeviceCount} of them recent
            </Typography>
          )}
        </Box>
      ),
    },
    { field: "signatureAlgorithm", headerName: "Signature", width: 170 },
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
            Stop trusting
          </Button>
        ) : null,
    },
    {
      field: "distrusted",
      headerName: "Why it matters",
      flex: 3,
      minWidth: 300,
      renderCell: (params) =>
        params.row.distrusted ? (
          <Typography variant="caption" sx={{ color: BRAND.alert.error }}>
            {params.row.distrusted}
          </Typography>
        ) : params.row.novelDeviceCount > 0 ? (
          // Los dos sumandos, y que sumen el total, es lo que cierra la
          // lectura aditiva: el subconjunto queda explícito en la propia
          // frase y no sólo en la columna de al lado.
          <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
            Already on {params.row.deviceCount - params.row.novelDeviceCount} device
            {params.row.deviceCount - params.row.novelDeviceCount === 1 ? "" : "s"} since they were
            inventoried; on {params.row.novelDeviceCount} of the {params.row.deviceCount} it
            appeared later
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
          {counts.total ?? 0} anchors · <strong>{counts.distrusted ?? 0}</strong> distrusted ·{" "}
          {counts.novel ?? 0} appeared on a minority of devices
        </Typography>
        <Button size="small" variant="outlined" onClick={() => setOnlyFindings((v) => !v)}>
          {onlyFindings ? "Show all" : "Show findings only"}
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
          {counts.vendorBundleOnly} anchors appear only in vendor-shipped bundles (Apple&apos;s
          root keychain, or a JVM&apos;s <code>cacerts</code>). Presence there does not mean
          trust: the OS ships them and decides their state separately.
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
  // Pestaña y filtro viven en la URL (ver hooks/useCdpFilter.js).
  const [filter, patchFilter, replaceFilter] = useCdpFilter();
  const tab = filter.tab ?? 0;
  const setTab = React.useCallback((v) => patchFilter({ tab: v }), [patchFilter]);
  const [refreshNonce, setRefreshNonce] = React.useState(0);

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

  // Dashboard → Certificates. FUNDE por defecto: un clic en «weak_sig»
  // no borra la búsqueda que el usuario tenía escrita. Los KPI piden
  // `replace` porque son una vista entera, no un refinamiento.
  const drillDown = React.useCallback(
    (delta, opts) => {
      if (opts?.replace) replaceFilter({ ...delta, tab: TAB.certificates });
      else patchFilter({ ...delta, tab: TAB.certificates });
    },
    [patchFilter, replaceFilter]
  );

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
        <Tab label="Roadmap" />
        <Tab label="Explore" />
        <Tab label="Stores" />
        <Tab label="Certificates" />
        <Tab label="Devices" />
        <Tab label="Trust anchors" />
        {/*
          ADR-0011 decisión 9.d. Pestaña propia y no una tarjeta suelta:
          una huérfana es un ítem del inventario, y el punto de la
          decisión es que se mire, no que esté.
        */}
        <Tab label="Claves huérfanas" />
        {/* ADR-0009 phase 2 keeps ONE approval matrix for every privileged
            capability, so cdp.cert.install and cdp.anchor.distrust used to be
            rendered inside Remote Control alongside rcp.* — somebody else's
            settings on your screen. Shared data, separate screens. */}
        <Tab label="Access policy" />
      </Tabs>

      <TabPanel value={tab} index={TAB.dashboard}>
        <CdpDashboard
          refreshNonce={refreshNonce}
          onDrillDown={drillDown}
          onOpenDevices={() => setTab(TAB.devices)}
        />
      </TabPanel>
      <TabPanel value={tab} index={TAB.pqc}>
        <CdpPqcTab refreshNonce={refreshNonce} />
      </TabPanel>
      <TabPanel value={tab} index={TAB.roadmap}>
        <CdpRoadmapPanel refreshNonce={refreshNonce} onDrillDown={(f) => drillDown(f, { replace: true })} />
      </TabPanel>
      <TabPanel value={tab} index={TAB.explore}>
        <CdpExploreTab refreshNonce={refreshNonce} onDrillDown={drillDown} />
      </TabPanel>
      <TabPanel value={tab} index={TAB.stores}>
        <CdpStoresTab refreshNonce={refreshNonce} onDrillDown={drillDown} />
      </TabPanel>
      <TabPanel value={tab} index={TAB.certificates}>
        <CdpCertificatesTab refreshNonce={refreshNonce} />
      </TabPanel>
      <TabPanel value={tab} index={TAB.devices}>
        <CdpDevicesTab refreshNonce={refreshNonce} />
      </TabPanel>
      <TabPanel value={tab} index={TAB.anchors}>
        <CdpTrustAnchorsTab refreshNonce={refreshNonce} />
      </TabPanel>
      <TabPanel value={tab} index={TAB.orphans}>
        <OrphanKeysPanel refreshNonce={refreshNonce} />
      </TabPanel>
      {/*
        ⚠️ Índice 6, no 5. Al añadir «Claves huérfanas» se dejó este panel
        en el 5 que ocupaba antes, y dos paneles con el mismo índice hacen
        dos cosas malas a la vez: la pestaña de huérfanas pintaba ADEMÁS
        la matriz de aprobación, y «Access policy» quedaba en blanco. El
        test de la página fija que cada Tab tenga exactamente un panel.
      */}
      <TabPanel value={tab} index={TAB.policy}>
        <AccessPolicyMatrix
          prefix="cdp."
          title="Privileged access policy"
          description="Which crypto discovery capabilities need a second person’s approval before they can be used. Installing a certificate and distrusting a trust anchor both change what a machine will accept."
        />
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
