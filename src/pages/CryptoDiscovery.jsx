// src/pages/CryptoDiscovery.jsx
//
// CDP (Crypto Discovery Plugin). Seven tabs, one question each:
//
//   Dashboard     : ownership funnel, KPIs, expiry timeline against the
//                   PQC deadlines, action list, issuers, hygiene, devices.
//   Roadmap       : systems to migrate, priority, waves, trend, references
//                   (agility blockers, CNSA 2.0, trust anchors to replace).
//   Explore       : distribution by key algorithm/size, where certificates
//                   live (source → store → device) and what lives outside
//                   your devices (imports, connectors).
//   Inventory     : the fleet list — by certificate (deduped by
//                   fingerprint) or by device — with facets and CSV export.
//   Trust anchors, Orphan keys and Access policy complete the set.
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
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
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
// Iconos de pestaña — mismo patrón que Asset Management (icono + etiqueta).
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import ExploreOutlinedIcon from "@mui/icons-material/ExploreOutlined";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import KeyOffOutlinedIcon from "@mui/icons-material/KeyOffOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";

import PageHeader from "../components/common/PageHeader";
import SummaryCard from "../components/common/SummaryCard";
import SectionPaper from "../components/common/SectionPaper";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import {
  ActionRequiredPanel,
  HygienePanel,
  IssuersPanel,
  OverviewCard,
  TopDevicesPanel,
} from "../components/CryptoDiscovery/CdpDashboardPanels";
import CdpSettingsTab from "../components/CryptoDiscovery/CdpSettingsTab";
import CertificateDetailDrawer from "../components/CryptoDiscovery/CertificateDetailDrawer";
import CertIssuanceDialog from "../components/CryptoDiscovery/CertIssuanceDialog";
import OrphanKeysPanel from "../components/CryptoDiscovery/OrphanKeysPanel";
import CdpRoadmapPanel from "../components/CryptoDiscovery/CdpRoadmapPanel";
import CdpCertFacets from "../components/CryptoDiscovery/CdpCertFacets";
import CbomAssetsPanel from "../components/CryptoDiscovery/CbomAssetsPanel";
import { BRAND, DATAGRID_SX, ICON, TEXT, TEXT_MUTED } from "../theme/brand";
import {
  getCdpSummary,
  getCdpDashboard,
  listCdpCertificates,
  listCdpDevices,
  listCdpDeviceCertificates,
  listCdpTrustAnchors,
  distrustAnchor,
  getCdpExposure,
  getCdpFacets,
  getCdpStores,
  getCdpTimeline,
  exportCdpCertificatesCsv
} from "../api/cdp";

/**
 * Índices de pestaña, con nombre — un número suelto (`tab: 2`) es lo que
 * dejó «Access policy» en blanco una vez.
 *
 * Consolidación 2026-09-04: las fases 1–3 del análisis montaron lo nuevo
 * al lado de lo viejo y la página llegó a 10 pestañas con paneles que
 * respondían la misma pregunta dos veces (Where they live vs Stores,
 * Expiry horizon vs Timeline, Post-quantum vs Roadmap/Explore). Ahora
 * cada pregunta tiene UN sitio: Post-quantum se funde en Roadmap, Stores
 * en Explore, y el horizonte de vencimiento es la línea de tiempo.
 *
 * Fase 1, pieza D (2026-09-04): Certificates y Devices eran dos pestañas
 * con dos consultas y dos filtros —la de equipos solo entendía un
 * buscador, así que «equipos con weak_sig» no existía—. Ahora son UNA
 * lista, «Inventory», con el mismo filtro, las mismas facetas y un
 * conmutador de agrupación: por certificado o por equipo (`view` en la
 * URL). Los contadores por equipo son sobre lo que cumple el filtro.
 */
const TAB = {
  dashboard: 0,
  roadmap: 1,
  explore: 2,
  inventory: 3,
  anchors: 4,
  orphans: 5,
  // Repaso UI 2026-09-05: «Access policy» pasa a «Settings» y concentra
  // todo lo que se configura (conectores, import de CBOM, matriz de
  // aprobación, enlace a la policy del agente). Mismo índice.
  settings: 6
};

// Mismo estilo de pestaña que Asset Management (Assets.jsx), para ir
// homologando: icono delante, sin mayúsculas forzadas, indicador teal.
const TAB_SX = {
  textTransform: "none",
  fontWeight: 700,
  minHeight: 62,
  color: "text.secondary",
  "&.Mui-selected": { color: BRAND.dark }
};

// ── helpers ──────────────────────────────────────────────────────────

const STATUS_META = {
  active: { label: "Active", color: BRAND.alert.success, soft: BRAND.alert.successSoft },
  expiring: { label: "Expiring", color: BRAND.alert.warningText, soft: BRAND.alert.warningSoft },
  expired: { label: "Expired", color: BRAND.alert.error, soft: BRAND.alert.errorSoft },
  unknown: { label: "Unknown", color: TEXT_MUTED, soft: BRAND.surfaceMuted },
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

// Tab ↔ panel: el mismo par id/aria para que un lector de pantalla sepa
// qué panel abre cada pestaña. `TabPanel` y `tabA11y` se leen juntos.
const tabId = (index) => `cdp-tab-${index}`;
const panelId = (index) => `cdp-tabpanel-${index}`;
const tabA11y = (index) => ({ id: tabId(index), "aria-controls": panelId(index) });

function TabPanel({ value, index, children }) {
  if (value !== index) return null;
  // role=tabpanel: lo que un lector de pantalla espera bajo un Tabs, y lo
  // que permite al test de la página contar cuántos paneles hay visibles
  // —que es como se caza un índice duplicado.
  return (
    <Box role="tabpanel" id={panelId(index)} aria-labelledby={tabId(index)} sx={{ pt: 2 }}>
      {children}
    </Box>
  );
}

// ── Dashboard tab ────────────────────────────────────────────────────

// Repaso UI 2026-09-05: el Dashboard es un OVERVIEW. Cifras y gráficos
// que llevan a su pestaña; la prosa (modo «explicar») vive en Explore y
// Roadmap, donde se mira con calma.
function CdpDashboard({ refreshNonce, onDrillDown, onOpenDevices, onOpenTab }) {
  const [summary, setSummary] = React.useState(null);
  const [dashboard, setDashboard] = React.useState(null);
  const [error, setError] = React.useState(null);
  // Separado de `error` a propósito: los KPIs y los paneles se piden por
  // separado justamente para que uno sobreviva al otro. Lo que faltaba es
  // que el que cae lo diga — sin esto los paneles se pintaban vacíos, que
  // se lee como "no hay nada que mostrar" en vez de "no pude cargarlo".
  const [panelsError, setPanelsError] = React.useState(null);
  // «Cargando» y «no hay» son cosas distintas: la petición terminó o no.
  const [panelsLoaded, setPanelsLoaded] = React.useState(false);
  // Fase 1: el embudo de propiedad va PRIMERO. Es la cifra que separa lo
  // que el cliente posee de lo que le llega con el sistema.
  const [exposure, setExposure] = React.useState(null);
  // La línea de tiempo SUSTITUYE al «Expiry horizon» antiguo: misma
  // pregunta (cuándo caduca lo que hay), pero apilada por propiedad y
  // contra los plazos PQC. Dos gráficos para una pregunta era deuda.
  const [timeline, setTimeline] = React.useState(null);
  // Qué bloque no cargó. Antes un fallo dejaba `null` y el embudo
  // simplemente NO se pintaba: la primera cifra de la página desaparecía
  // sin decir por qué (revisión UI 2026-09-05).
  const [chartsError, setChartsError] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    setChartsError([]);
    const failed = (what, err) => alive && setChartsError((prev) => [...prev, `${what}: ${err?.message || String(err)}`]);
    getCdpExposure()
      .then((r) => alive && setExposure(r?.exposure ?? null))
      .catch((err) => {
        if (!alive) return;
        setExposure(null);
        failed("exposure funnel", err);
      });
    getCdpTimeline({})
      .then((r) => alive && setTimeline(r ?? null))
      .catch((err) => {
        if (!alive) return;
        setTimeline(null);
        failed("expiry timeline", err);
      });
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
    setPanelsLoaded(false);
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
      })
      .finally(() => alive && setPanelsLoaded(true));
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

  const ov = d.overview ?? {};
  const outside = exposure?.outside;

  return (
    <Stack spacing={2}>
      {chartsError.length > 0 ? (
        <Alert severity="warning">
          <AlertTitle>Part of the dashboard didn&apos;t load</AlertTitle>
          {chartsError.join(" · ")} — the rest of the page is unaffected; use Refresh to retry.
        </Alert>
      ) : null}
      <ExposureFunnel
        exposure={exposure}
        explain={false}
        onSelect={(f) => onDrillDown?.(f, { replace: true })}
        onOpenOutside={() => onOpenTab?.(TAB.explore)}
        onOpenRoadmap={() => onOpenTab?.(TAB.roadmap)}
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

      {/* Row 1 — when does the fleet break (against the deadlines), and what do I do today. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <TimelinePanel timeline={timeline} explain={false} onSelect={(f) => onDrillDown?.(f, { replace: true })} />
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <ActionRequiredPanel
            items={d.urgent}
            onSelect={(row) => onDrillDown?.({ search: row.fingerprint256 })}
          />
        </Grid>
      </Grid>

      {/* Row 2 — one card per tab: the numbers, and a click to get there.
          Issuers moved to Explore (it is a distribution, not a headline). */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <OverviewCard
            title="Roadmap"
            icon={<RouteOutlinedIcon fontSize="small" />}
            onOpen={() => onOpenTab?.(TAB.roadmap)}
            hint={ov.roadmap ? `As of the ${ov.roadmap.snapshotDate} snapshot. The Roadmap tab recomputes live.` : null}
            empty={panelsLoaded ? "No readiness snapshot yet — open the Roadmap to record one." : "Loading…"}
            metrics={
              ov.roadmap
                ? [
                    { label: "systems", value: ov.roadmap.systemsTotal },
                    { label: "with a wave", value: ov.roadmap.systemsPlanned, color: ov.roadmap.systemsPlanned ? BRAND.tealText : undefined },
                    { label: "valid past 2035", value: ov.roadmap.ownBeyondDisallowed, color: ov.roadmap.ownBeyondDisallowed ? BRAND.alert.high : undefined },
                    { label: "can't migrate", value: ov.roadmap.devicesBlocked ?? undefined }
                  ]
                : []
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <OverviewCard
            title="Outside your devices"
            icon={<CloudOutlinedIcon fontSize="small" />}
            onOpen={() => onOpenTab?.(TAB.explore)}
            empty={exposure ? "No connectors or imports yet — add them in Settings." : "Loading…"}
            metrics={
              outside && outside.assets > 0
                ? [
                    { label: "sources", value: outside.sources },
                    { label: "certificates", value: outside.certificates },
                    { label: "quantum-broken", value: outside.quantumBroken, color: outside.quantumBroken ? BRAND.alert.high : undefined },
                    { label: "in use", value: outside.inUse }
                  ]
                : []
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <OverviewCard
            title="Trust anchors"
            icon={<VerifiedUserOutlinedIcon fontSize="small" />}
            onOpen={() => onOpenTab?.(TAB.anchors)}
            empty={panelsLoaded ? "No trust anchors reported yet." : "Loading…"}
            metrics={
              ov.anchors
                ? [
                    { label: "anchors", value: ov.anchors.total },
                    { label: "distrusted", value: ov.anchors.distrusted, color: ov.anchors.distrusted ? BRAND.alert.error : undefined },
                    { label: "on a minority", value: ov.anchors.novel, color: ov.anchors.novel ? BRAND.alert.high : undefined }
                  ]
                : []
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <OverviewCard
            title="Orphan keys"
            icon={<KeyOffOutlinedIcon fontSize="small" />}
            onOpen={() => onOpenTab?.(TAB.orphans)}
            hint="Keys a device generated for a certificate that never arrived. Empty means «none recorded», not «none exist»."
            empty={panelsLoaded ? "None recorded." : "Loading…"}
            metrics={
              ov.orphanKeys && ov.orphanKeys.total > 0
                ? [
                    { label: "without certificate", value: ov.orphanKeys.total },
                    { label: "older than 14 days", value: ov.orphanKeys.stale, color: ov.orphanKeys.stale ? BRAND.alert.error : undefined }
                  ]
                : []
            }
          />
        </Grid>
      </Grid>

      {/* Row 3 — what's unhealthy and which devices carry it. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <HygienePanel flags={d.flags} onSelect={(flag) => onDrillDown?.({ flag })} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TopDevicesPanel devices={d.topDevices} onSelect={(row) => onOpenDevices?.(row)} />
        </Grid>
      </Grid>
    </Stack>
  );
}

// ── Explore tab (fase 1): distribución por clave + línea de tiempo ───

function CdpExploreTab({ refreshNonce, onDrillDown, onOpenSettings }) {
  const [scope, setScope] = React.useState("all");
  const [explain, toggleExplain] = useExplainMode();
  const [facets, setFacets] = React.useState(null);
  // Stores vive aquí: «dónde viven» es una dimensión de la exploración,
  // no una pestaña aparte ni un tercer panel en el Dashboard.
  const [stores, setStores] = React.useState(null);
  // Emisores: era un panel del Dashboard; es una distribución (quién
  // firma), así que vive aquí y obedece el mismo ámbito «solo lo mío».
  const [issuers, setIssuers] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    const filter = scope === "own" ? { hasPrivateKey: true } : {};
    Promise.all([
      getCdpFacets({ by: ["key_algorithm", "key_size_bits"], stack: "ownership", ...filter }),
      getCdpStores(filter),
      getCdpFacets({ by: ["issuer_cn"], limit: 8, ...filter }).catch(() => null)
    ])
      .then(([f, st, iss]) => {
        if (!alive) return;
        setFacets(f ?? null);
        setStores(st ?? null);
        setIssuers(
          iss?.rows
            ? iss.rows.map((r) => ({ issuer: r.keys?.issuer_cn || "Unknown", count: Number(r.certs ?? 0), expiringSoon: 0 }))
            : null
        );
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
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <StoresPanel
            stores={stores?.stores}
            javaOnlyVendorBundles={stores?.javaOnlyVendorBundles === true}
            onSelect={select}
            onOpenPolicy={onOpenSettings}
            explain={explain}
          />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <IssuersPanel issuers={issuers} onSelect={(issuer) => select({ issuer })} />
        </Grid>
      </Grid>
      {/* Fase 4: lo que vive donde no hay agente. Solo lectura; se configura en Settings. */}
      <CbomAssetsPanel refreshNonce={refreshNonce} onSelect={(f) => onDrillDown?.(f, { replace: true })} onOpenSettings={onOpenSettings} />
    </Stack>
  );
}

// ── Certificates tab (fleet, deduped by fingerprint) ─────────────────

function CdpInventoryTab({ refreshNonce }) {
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
  const [filter, patchFilter, replaceFilter] = useCdpFilter();
  // Agrupación: por certificado (defecto) o por equipo. Vive en la URL
  // como el resto, así que un enlace a «equipos con este emisor» existe.
  const view = filter.view === "devices" ? "devices" : "certs";
  // Orden en servidor (la lista está paginada: ordenar la página sería
  // mentir). Solo las columnas que el backend sabe ordenar.
  const [sortModel, setSortModel] = React.useState([{ field: "notAfter", sort: "asc" }]);
  const sort = view === "certs" && sortModel[0] ? { sortBy: sortModel[0].field, sortDir: sortModel[0].sort } : {};
  const sortKey = `${sort.sortBy ?? ""}:${sort.sortDir ?? ""}`;
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
    scope: filter.scope,
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
  // Export CSV con el MISMO filtro que se ve (fase 1, pieza D).
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState(null);
  const listParams = () => ({
    search: search || undefined,
    status: status || undefined,
    flag: flag || undefined,
    issuer: issuer || undefined,
    includeRoots: includeRoots || undefined,
    hasPrivateKey: hasPrivateKey || undefined,
    hasFlags: hasFlags || undefined,
    eku: eku || undefined,
    ...sort,
    ...Object.fromEntries(Object.entries(nav).filter(([, v]) => v != null && v !== ""))
  });
  // Todo filtro activo tiene chip: nunca hay un filtro invisible actuando.
  const activeChips = [
    status ? { key: "status", label: `Status: ${STATUS_META[status]?.label ?? status}` } : null,
    flag ? { key: "flag", label: `Flag: ${FLAG_LABELS[flag] ? FLAG_LABELS[flag].split(" — ")[0].split(" (")[0] : flag}` } : null,
    eku ? { key: "eku", label: `Purpose: ${eku}` } : null,
    issuer ? { key: "issuer", label: `Issuer: ${issuer}` } : null,
    hasPrivateKey ? { key: "hasPrivateKey", label: "With private key" } : null,
    hasFlags ? { key: "hasFlags", label: "Flagged only" } : null,
    includeRoots ? { key: "includeRoots", label: "Including system roots" } : null,
    ...[
      ["keyAlgorithm", "Algorithm"],
      ["keySizeBits", "Key size"],
      ["family", "Family"],
      ["source", "Source"],
      ["scope", "Scope"],
      ["storeName", "Store"],
      ["agentId", "Device"],
      ["notAfterFrom", "Expires from"],
      ["notAfterTo", "Expires before"]
    ].map(([k, label]) => (nav[k] != null && nav[k] !== "" ? { key: k, label: `${label}: ${nav[k]}` } : null))
  ].filter(Boolean);
  const clearFilters = () => {
    replaceFilter({ view: filter.view });
    setPaginationModel((m) => ({ ...m, page: 0 }));
  };
  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportCdpCertificatesCsv(listParams());
    } catch (e) {
      setExportError(e?.message || String(e));
    } finally {
      setExporting(false);
    }
  };
  // The fleet list answers "which certificates"; the drawer answers
  // "and what do I do about this one" — attribution, chain and
  // revocation all live there.
  const [drawerCert, setDrawerCert] = React.useState(null);

  // El drawer de equipo (vista por equipo) y el de certificado (vista
  // por certificado) son estados distintos: cambiar de vista no debe
  // dejar abierto el cajón de la otra.
  const [drawerDevice, setDrawerDevice] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    const paging = { page: paginationModel.page + 1, pageSize: paginationModel.pageSize };
    // MISMOS parámetros en las dos vistas: la agrupación es lo único que
    // cambia. Es la propiedad de la fusión.
    const load = view === "devices" ? listCdpDevices : listCdpCertificates;
    load({ ...paging, ...listParams() })
      .then((resp) => {
        if (!alive) return;
        setRows(
          (resp?.items ?? []).map((item) => ({ id: view === "devices" ? item.agentId : item.fingerprint256, ...item }))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginationModel, view, search, status, flag, issuer, includeRoots, hasPrivateKey, hasFlags, eku, navKey, sortKey, refreshNonce]);

  const certColumns = [
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
      width: 120,
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
    { field: "deviceCount", headerName: "Devices", width: 90, align: "right", headerAlign: "right" },
    {
      field: "flags",
      headerName: "Flags",
      flex: 1,
      minWidth: 140,
      sortable: false,
      renderCell: (params) => <FlagChips flags={params.value} />,
    },
  ];
  // La vista por equipo no ordena en servidor (todavía): sin flechas que
  // prometan lo que no hacen.
  const deviceColumnsBase = (cols) => cols.map((c) => ({ ...c, sortable: false }));

  // Vista por equipo: los contadores son sobre los certificados que
  // cumplen el filtro actual, no sobre todo el equipo. Con
  // `flag=weak_sig`, «Matching» es cuántos con firma débil tiene.
  const countChip = (value, soft, color) =>
    value > 0 ? <Chip size="small" label={value} sx={{ bgcolor: soft, color, fontWeight: 700 }} /> : "0";
  const deviceColumns = [
    {
      field: "host",
      headerName: "Device",
      flex: 1.2,
      minWidth: 180,
      valueGetter: (value, row) => value || row.agentId,
    },
    { field: "platform", headerName: "Platform", width: 110 },
    { field: "certCount", headerName: "Matching", width: 100, description: "Certificates on this device that match the current filters" },
    { field: "withPrivateKey", headerName: "With key", width: 100 },
    {
      field: "expiring",
      headerName: "Expiring",
      width: 100,
      renderCell: (params) => countChip(params.value, BRAND.alert.warningSoft, BRAND.alert.warningText),
    },
    {
      field: "expired",
      headerName: "Expired",
      width: 100,
      renderCell: (params) => countChip(params.value, BRAND.alert.errorSoft, BRAND.alert.error),
    },
    { field: "withFlags", headerName: "Flagged", width: 90 },
    {
      field: "lastSeen",
      headerName: "Last scan",
      width: 120,
      valueFormatter: (value) => formatDate(value),
    },
  ];

  return (
    <Box>
      {/*
        Repaso UI 2026-09-05: la barra tenía 10 controles y los chips en
        una sola fila. Ahora tres filas con un papel cada una: (1) qué lista
        y cómo se busca, (2) los filtros, (3) lo que está activo, con
        «Clear». Cada filtro activo tiene chip: nunca hay uno invisible.
      */}
      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ xs: "stretch", md: "center" }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            aria-label="Group by"
            onChange={(_e, v) => {
              if (v && v !== view) setAndReset({ view: v === "devices" ? "devices" : "" });
            }}
            sx={{ flexShrink: 0 }}
          >
            <ToggleButton value="certs" aria-label="By certificate">By certificate</ToggleButton>
            <ToggleButton value="devices" aria-label="By device">By device</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small"
            label={view === "devices" ? "Search device / subject / issuer" : "Search subject / issuer / fingerprint"}
            value={search}
            onChange={(e) => setAndReset({ search: e.target.value })}
            sx={{ flex: 1, minWidth: 240 }}
          />
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {loading ? "Loading…" : `${rowCount.toLocaleString()} ${view === "devices" ? "device(s)" : "certificate(s)"}`}
          </Typography>
          {view === "certs" ? (
            <Button size="small" variant="outlined" onClick={exportCsv} disabled={exporting || rowCount === 0} sx={{ flexShrink: 0 }}>
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          ) : null}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
          <TextField size="small" select label="Status" value={status} onChange={(e) => setAndReset({ status: e.target.value })} sx={{ minWidth: 130 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="expiring">Expiring</MenuItem>
            <MenuItem value="expired">Expired</MenuItem>
          </TextField>
          {/*
            Los filtros que antes solo se podían fijar desde el Dashboard
            tienen control propio. Se sigue pudiendo llegar por drill-down,
            pero también cambiarlos aquí sin volver atrás.
          */}
          <TextField size="small" select label="Flag" value={flag} onChange={(e) => setAndReset({ flag: e.target.value })} sx={{ minWidth: 190 }}>
            <MenuItem value="">Any</MenuItem>
            {Object.entries(FLAG_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v}</MenuItem>
            ))}
          </TextField>
          <TextField size="small" select label="Purpose (EKU)" value={eku} onChange={(e) => setAndReset({ eku: e.target.value })} sx={{ minWidth: 160 }}>
            <MenuItem value="">Any</MenuItem>
            <MenuItem value="serverAuth">TLS server</MenuItem>
            <MenuItem value="clientAuth">TLS client</MenuItem>
            <MenuItem value="codeSigning">Code signing</MenuItem>
            <MenuItem value="emailProtection">S/MIME</MenuItem>
            <MenuItem value="smartCardLogon">Smart card logon</MenuItem>
            <MenuItem value="remoteDesktopAuth">Remote Desktop</MenuItem>
          </TextField>
          <TextField size="small" label="Issuer" value={issuer} onChange={(e) => setAndReset({ issuer: e.target.value })} sx={{ minWidth: 170 }} />
          <FormControlLabel
            control={<Switch size="small" checked={hasPrivateKey} onChange={(e) => setAndReset({ hasPrivateKey: e.target.checked })} />}
            label={<Typography sx={{ fontSize: TEXT.md }}>With private key</Typography>}
          />
          <FormControlLabel
            control={<Switch size="small" checked={hasFlags} onChange={(e) => setAndReset({ hasFlags: e.target.checked })} />}
            label={<Typography sx={{ fontSize: TEXT.md }}>Flagged only</Typography>}
          />
          <FormControlLabel
            control={<Switch size="small" checked={includeRoots} onChange={(e) => setAndReset({ includeRoots: e.target.checked })} />}
            label={<Typography sx={{ fontSize: TEXT.md }}>Show system roots</Typography>}
          />
        </Stack>

        {activeChips.length > 0 ? (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1, alignItems: "center" }} aria-label="Active filters">
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".06em" }}>Active</Typography>
            {activeChips.map((c) => (
              <Chip
                key={c.key}
                size="small"
                label={c.label}
                onDelete={() => setAndReset({ [c.key]: "" })}
                sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700, maxWidth: 360 }}
              />
            ))}
            <Button size="small" onClick={clearFilters}>Clear filters</Button>
          </Stack>
        ) : null}
      </SectionPaper>
      {exportError ? <Alert severity="error" sx={{ mb: 1.5 }}>Export failed: {exportError}</Alert> : null}

      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          <AlertTitle>Couldn&apos;t load</AlertTitle>
          {loadError} — the table is empty because the query failed, not because
          there is nothing to show.
        </Alert>
      ) : null}
      {!loading && !loadError && rowCount === 0 ? (
        <Alert
          severity="info"
          sx={{ mb: 1.5 }}
          action={activeChips.length > 0 ? <Button color="inherit" size="small" onClick={clearFilters}>Clear filters</Button> : null}
        >
          {activeChips.length > 0 || search
            ? `No ${view === "devices" ? "devices" : "certificates"} match the current filters.`
            : "No certificates reported yet. They appear once devices with the Crypto Discovery plugin check in."}
        </Alert>
      ) : null}

      {/*
        Facetas a la izquierda (fase 1, pieza D): valores con conteo bajo
        el filtro actual, un clic los añade. Es lo que convierte la lista
        en un explorador.
      */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
        <Box sx={{ width: { xs: "100%", md: 220 }, flexShrink: 0 }}>
          <CdpCertFacets filter={filter} refreshNonce={refreshNonce} onSelect={(delta) => setAndReset(delta)} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DataGrid
            autoHeight
            rows={rows}
            columns={view === "devices" ? deviceColumnsBase(deviceColumns) : certColumns}
            loading={loading}
            rowCount={rowCount}
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[10, 25, 50, 100]}
            sortingMode="server"
            sortModel={view === "certs" ? sortModel : []}
            onSortModelChange={(m) => {
              if (view !== "certs") return;
              setSortModel(m.length ? m : [{ field: "notAfter", sort: "asc" }]);
              setPaginationModel((p) => ({ ...p, page: 0 }));
            }}
            disableRowSelectionOnClick
            disableColumnMenu
            onRowClick={(params) =>
              view === "devices"
                ? setDrawerDevice({ agentId: params.row.agentId, host: params.row.host })
                : setDrawerCert(params.row.fingerprint256)
            }
            sx={{ ...DATAGRID_SX, "& .MuiDataGrid-row": { cursor: "pointer" } }}
          />
        </Box>
      </Stack>

      <Drawer
        anchor="right"
        open={Boolean(drawerCert)}
        onClose={() => setDrawerCert(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 560 } } }}
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
            onShowCertificates={() => {
              // La misma lista, filtrada a este equipo y agrupada por
              // certificado: de «qué equipos» a «qué certificados» sin
              // perder el resto del filtro.
              setDrawerDevice(null);
              setAndReset({ agentId: drawerDevice.agentId, view: "" });
            }}
          />
        ) : null}
      </Drawer>
    </Box>
  );
}

// ── Devices tab + drawer ─────────────────────────────────────────────

function CdpDeviceDrawerContent({ agentId, host, onShowCertificates }) {
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
      {onShowCertificates ? (
        <Button size="small" variant="outlined" onClick={onShowCertificates} sx={{ mb: 1.5 }}>
          Show in certificate view
        </Button>
      ) : null}
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
  // Una fila es un certificado: clic = su ficha (cadena, equipos, flags).
  const [drawerCert, setDrawerCert] = React.useState(null);

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
          <Button
            size="small"
            onClick={(e) => {
              // Que el botón no abra además la ficha de la fila.
              e.stopPropagation();
              setDistrustFor(params.row);
            }}
          >
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
          disableColumnMenu
          onRowClick={(params) => setDrawerCert(params.row.fingerprint256)}
          initialState={{ sorting: { sortModel: [{ field: "deviceCount", sort: "desc" }] } }}
          sx={{ ...DATAGRID_SX, "& .MuiDataGrid-row": { cursor: "pointer" } }}
        />
      </Box>

      <Drawer
        anchor="right"
        open={Boolean(drawerCert)}
        onClose={() => setDrawerCert(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 560 } } }}
      >
        <Box sx={{ display: "flex", justifyContent: "flex-end", p: 1, pb: 0 }}>
          <IconButton aria-label="Close certificate details" onClick={() => setDrawerCert(null)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        {drawerCert ? <CertificateDetailDrawer key={drawerCert} fingerprint={drawerCert} flagLabels={FLAG_LABELS} /> : null}
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
  // Refresco como en Asset Management: botón + auto-refresco opcional
  // (RefreshControl), en vez de un IconButton propio.
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const triggerRefresh = React.useCallback(() => {
    setRefreshing(true);
    setRefreshNonce((n) => n + 1);
    window.setTimeout(() => setRefreshing(false), 1200);
  }, []);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(triggerRefresh, "cdpAutoRefresh", "0");
  // Ficha de certificado abierta desde otra pestaña (roadmap, anclas a
  // reemplazar): la ficha es la misma que en Inventory.
  const [pageCert, setPageCert] = React.useState(null);

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
      // `view` no se conserva: un drill-down desde un panel habla de
      // certificados. Quien quiera la vista por equipo la pide (KPI de
      // equipos, panel «Devices needing attention»).
      if (opts?.replace) replaceFilter({ ...delta, tab: TAB.inventory });
      else patchFilter({ ...delta, tab: TAB.inventory, view: delta.view ?? "" });
    },
    [patchFilter, replaceFilter]
  );

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
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
              Issue certificate
            </Button>
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={triggerRefresh}
              loading={refreshing}
            />
          </Stack>
        }
      />

      {/*
        Barra de pestañas con el mismo estilo que Asset Management (icono +
        etiqueta dentro de un panel, indicador teal). `scrollable`: siete
        pestañas no caben en un portátil de 13".
      */}
      <SectionPaper variant="panel" sx={{ mb: 2, p: 0, overflow: "hidden" }}>
        <Tabs
          value={tab}
          onChange={(_e, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Crypto Discovery sections"
          sx={{
            px: { xs: 1, sm: 2 },
            minHeight: 62,
            "& .MuiTabs-indicator": { height: 3, borderRadius: 999, backgroundColor: BRAND.teal }
          }}
        >
          <Tab icon={<DashboardOutlinedIcon fontSize="small" />} iconPosition="start" label="Dashboard" {...tabA11y(TAB.dashboard)} sx={TAB_SX} />
          <Tab icon={<RouteOutlinedIcon fontSize="small" />} iconPosition="start" label="Roadmap" {...tabA11y(TAB.roadmap)} sx={TAB_SX} />
          <Tab icon={<ExploreOutlinedIcon fontSize="small" />} iconPosition="start" label="Explore" {...tabA11y(TAB.explore)} sx={TAB_SX} />
          <Tab icon={<ListAltOutlinedIcon fontSize="small" />} iconPosition="start" label="Inventory" {...tabA11y(TAB.inventory)} sx={TAB_SX} />
          <Tab icon={<VerifiedUserOutlinedIcon fontSize="small" />} iconPosition="start" label="Trust anchors" {...tabA11y(TAB.anchors)} sx={TAB_SX} />
          {/*
            ADR-0011 decisión 9.d. Pestaña propia y no una tarjeta suelta:
            una huérfana es un ítem del inventario, y el punto de la
            decisión es que se mire, no que esté.
          */}
          <Tab icon={<KeyOffOutlinedIcon fontSize="small" />} iconPosition="start" label="Orphan keys" {...tabA11y(TAB.orphans)} sx={TAB_SX} />
          {/* Settings: conectores, import de CBOM, matriz de aprobación
              (ADR-0009: una matriz, filas cdp.*) y enlace a la policy del
              agente. Aquí se configura; en las otras pestañas se mira. */}
          <Tab icon={<SettingsOutlinedIcon fontSize="small" />} iconPosition="start" label="Settings" {...tabA11y(TAB.settings)} sx={TAB_SX} />
        </Tabs>
      </SectionPaper>

      <TabPanel value={tab} index={TAB.dashboard}>
        <CdpDashboard
          refreshNonce={refreshNonce}
          onDrillDown={drillDown}
          onOpenDevices={(row) =>
            replaceFilter({ tab: TAB.inventory, view: "devices", ...(row?.host || row?.agentId ? { search: row.host || row.agentId } : {}) })
          }
          onOpenTab={setTab}
        />
      </TabPanel>
      <TabPanel value={tab} index={TAB.roadmap}>
        <CdpRoadmapPanel
          refreshNonce={refreshNonce}
          onDrillDown={(f) => drillDown(f, { replace: true })}
          // Un sistema-origen (vault, nube, CA, CT) no tiene filas en el
          // inventario de equipos: sus miembros viven en «Outside your
          // devices», en Explore.
          onOpenOutside={() => setTab(TAB.explore)}
          onOpenCertificate={setPageCert}
        />
      </TabPanel>
      <TabPanel value={tab} index={TAB.explore}>
        <CdpExploreTab refreshNonce={refreshNonce} onDrillDown={drillDown} onOpenSettings={() => setTab(TAB.settings)} />
      </TabPanel>
      <TabPanel value={tab} index={TAB.inventory}>
        <CdpInventoryTab refreshNonce={refreshNonce} />
      </TabPanel>
      <TabPanel value={tab} index={TAB.anchors}>
        <CdpTrustAnchorsTab refreshNonce={refreshNonce} />
      </TabPanel>
      <TabPanel value={tab} index={TAB.orphans}>
        <OrphanKeysPanel refreshNonce={refreshNonce} />
      </TabPanel>
      {/*
        ⚠️ Índice 6, no 5. Al añadir «Orphan keys» se dejó este panel
        en el 5 que ocupaba antes, y dos paneles con el mismo índice hacen
        dos cosas malas a la vez: la pestaña de huérfanas pintaba ADEMÁS
        la matriz de aprobación, y «Access policy» quedaba en blanco. El
        test de la página fija que cada Tab tenga exactamente un panel.
      */}
      <TabPanel value={tab} index={TAB.settings}>
        <CdpSettingsTab refreshNonce={refreshNonce} onSourcesChanged={() => setRefreshNonce((n) => n + 1)} />
      </TabPanel>

      <Drawer
        anchor="right"
        open={Boolean(pageCert)}
        onClose={() => setPageCert(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 560 } } }}
      >
        <Box sx={{ display: "flex", justifyContent: "flex-end", p: 1, pb: 0 }}>
          <IconButton aria-label="Close certificate details" onClick={() => setPageCert(null)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        {pageCert ? <CertificateDetailDrawer key={pageCert} fingerprint={pageCert} flagLabels={FLAG_LABELS} /> : null}
      </Drawer>

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
