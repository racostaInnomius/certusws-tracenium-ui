// src/pages/Alerts.jsx
//
// Tenant-scoped alerts page. Three UI sections:
//
//   1. Hero KPI strip  — unread count, active rules, matched-24h, last match.
//   2. Filter bar + feed table — what's happening right now.
//   3. Manage Rules drawer (right-side) — the tenant's rule instances,
//      opt-in from the global template catalog with per-rule overrides.
//
// The feed itself doesn't live in a dedicated table — the backend
// composes it on demand from the enabled rules. See
// /api/v1/alerts/events in alerts.service.ts.

import { searchForPage, getSearchParam, updateSearchParams } from "../utils/browserState";
import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import GoToReportButton from "../components/common/GoToReportButton";

// El informe PROPIO de la página: qué alertó en el mes, cuánto tardó en
// arreglarse, qué reglas hacen ruido y a quién se avisó. Hasta que existió,
// este botón abría el rastro de auditoría en CSV — el material del que salen
// las alertas, pero otra pregunta.
//
// Sin gate de rol aquí, como antes: el informe exige ADMIN/OWNER y la
// capacidad `alerts`, y de eso se encarga el catálogo de Reports — a quien no
// los tenga, el informe no le aparece.
const ALERTS_REPORT_KEY = "alerts.activity";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useCachedFetch } from "../hooks/useCachedFetch";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import DoneAllOutlinedIcon from "@mui/icons-material/DoneAllOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";

import { BRAND, ROLE, TEXT } from "../theme/brand";
import { formatOpenFor } from "../utils/alertAge";
import { severityMeta } from "../theme/severity";
import NotifyProfilesPanel from "../components/Alerts/NotifyProfilesPanel";
import AlertRulesPanel from "../components/Alerts/AlertRulesPanel";
import { usePluginCatalog } from "../hooks/usePluginCatalog";
import { useNotifyProfiles } from "../components/Alerts/useNotifyProfiles";
import { describeTargets, describeNotifyError, hasAnyTarget } from "../components/Alerts/notifyHelpers";
import {
  getAlertRules,
  createAlertRule,
  patchAlertRule,
  deleteAlertRule,
  getAlertEvents,
  markAllAlertsSeen
} from "../api/alerts";

import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { listFrom } from "../api/shape";
import { SOURCE_LABEL } from "../components/Alerts/alertSources";
import SiemDestinationsDrawer from "../components/Alerts/SiemDestinationsDrawer";

// ---------- presentational helpers ------------------------------------------

// Canonical severity scale (theme/severity.js) — High was red here (same as
// Critical); it's now orange, distinct from Critical, and consistent everywhere.
const SEVERITY_META = {
  critical: { label: "Critical", color: severityMeta("critical").fg, soft: severityMeta("critical").bg },
  high:     { label: "High",     color: severityMeta("high").fg,     soft: severityMeta("high").bg },
  medium:   { label: "Medium",   color: severityMeta("medium").fg,   soft: severityMeta("medium").bg },
  low:      { label: "Low",      color: severityMeta("low").fg,      soft: severityMeta("low").bg }
};

const SEVERITY_ORDER = ["low", "medium", "high", "critical"];

function formatRelativeTime(iso) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  if (delta < 0) return "in the future";
  const mins = Math.round(delta / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/**
 * Desde cuándo lleva abierta una alerta.
 *
 * Tres estados, y el tercero importa tanto como los otros dos:
 *
 *   · con edad — lo normal;
 *   · vieja — pasado el umbral, en ámbar: el dato por el que existe la
 *     columna es "esto lleva tres semanas y nadie lo ha mirado";
 *   · SIN edad — el barrido horario aún no la ha visto. Se pinta "—" con
 *     su explicación y no un "0m", porque no saberlo no es lo mismo que
 *     saber que acaba de abrirse. Es también el estado de todo el feed
 *     durante la primera hora tras desplegar.
 */
function OpenForCell({ firstSeenAt }) {
  const age = formatOpenFor(firstSeenAt);

  if (!age) {
    return (
      <Typography
        variant="body2"
        sx={{ color: BRAND.gray }}
        title="Not recorded yet — the hourly sweep hasn't seen this alert."
      >
        —
      </Typography>
    );
  }

  return (
    <Typography
      variant="body2"
      sx={{
        color: age.stale ? BRAND.alert.high : BRAND.dark,
        fontWeight: age.stale ? 700 : 600
      }}
      title={
        age.stale
          ? `Open for ${age.days} days — first seen ${new Date(firstSeenAt).toLocaleString()}`
          : `First seen ${new Date(firstSeenAt).toLocaleString()}`
      }
    >
      {age.text}
    </Typography>
  );
}

function SeverityChip({ severity }) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.low;
  return (
    <Chip
      label={meta.label}
      size="small"
      sx={{
        bgcolor: meta.soft,
        color: meta.color,
        fontWeight: 700,
        border: `1px solid ${meta.color}55`
      }}
    />
  );
}

function SummaryCard({ title, value, icon, accent = BRAND.teal, tint = BRAND.tealSoft, subtext }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        minHeight: 96,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        display: "flex",
        alignItems: "center",
        gap: 1.75
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          bgcolor: tint,
          color: accent,
          display: "grid",
          placeItems: "center",
          flexShrink: 0
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {subtext ? (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {subtext}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}

// ---------- page ------------------------------------------------------------

const TIME_WINDOWS = [
  { label: "Last 1h",  hours: 1 },
  { label: "Last 24h", hours: 24 },
  { label: "Last 7 days",  hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 }
];

const DEFAULT_WINDOW_HOURS = 24 * 7; // product decision: 7 days default

const ALERTS_TABS = ["alerts", "rules", "profiles", "destinations"];
const MANAGE_ONLY_TABS = ["profiles", "destinations"];

// Mismo estilo que Patch Management, Security Compliance, Crypto Discovery y
// Reports (cada una tiene su copia de TAB_SX; ver la deuda anotada allí).
const TAB_SX = {
  textTransform: "none",
  fontWeight: 700,
  minHeight: 62,
  color: "text.secondary",
  "&.Mui-selected": { color: BRAND.dark },
};

/**
 * A refused switch-on says WHY: the plugin is not in the plan (402) or it is
 * turned off in Agent Settings (403 PLUGIN_DISABLED). The Rules tab already
 * locks those switches; this covers a stale screen after a plan change.
 */
function describeRuleError(err, fallback) {
  const code = String(err?.body?.error || err?.code || "").toUpperCase();
  const plugin = String(err?.body?.plugin || "").toUpperCase();
  if (code === "PLUGIN_NOT_ENTITLED") {
    const tier = err?.body?.tierRequired;
    return `${plugin || "This plugin"} is not in your plan${tier ? ` — it requires the ${tier} plan` : ""}.`;
  }
  if (code === "PLUGIN_DISABLED") return `${plugin || "This plugin"} is turned off in Agent Settings.`;
  return fallback;
}

export default function Alerts({ onNavigate }) {
  const [windowHours, setWindowHours] = React.useState(DEFAULT_WINDOW_HOURS);
  const [minSeverity, setMinSeverity] = React.useState(""); // "" = all
  const [sourceFilter, setSourceFilter] = React.useState(""); // "" = all
  const [searchText, setSearchText] = React.useState("");

  // Pestañas, como el resto de páginas grandes: la configuración ya no vive
  // en dos drawers. Enlazable con ?alertsTab= (mismo patrón que ?pmTab=).
  const [tab, setTab] = React.useState(() => {
    const wanted = getSearchParam("alertsTab", "");
    return ALERTS_TABS.includes(wanted) ? wanted : "alerts";
  });
  React.useEffect(() => {
    updateSearchParams({ alertsTab: tab === "alerts" ? null : tab });
  }, [tab]);
  // Perfiles y destinos exigen la capacidad `alerts` (lectura incluida);
  // sin ella sus pestañas no existen y no se pide nada que dé 403.
  const np = useNotifyProfiles();
  const canManage = Boolean(np.access?.canManage);
  const visibleTabs = ALERTS_TABS.filter((k) => canManage || !MANAGE_ONLY_TABS.includes(k));
  // Una URL que pide una pestaña que este usuario no puede ver cae al feed —
  // pero sólo cuando ya se SABE que no puede: mientras cargan los permisos,
  // no se le cambia la pestaña a nadie.
  React.useEffect(() => {
    if (np.access && !visibleTabs.includes(tab)) setTab("alerts");
  }, [np.access, tab, visibleTabs]);
  const { catalog: pluginCatalog } = usePluginCatalog();
  const [detailEvent, setDetailEvent] = React.useState(null);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "info" });

  const notify = (severity, message) => setSnackbar({ open: true, severity, message });

  // Feed loader — cache key includes the user-controlled filters so
  // each combo gets its own snapshot (returning to a previously-viewed
  // window/severity combo is instant). The fetch only runs when the
  // key changes.
  const feedLoader = React.useCallback(async () => {
    const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const res = await getAlertEvents({
      since,
      severity: minSeverity || undefined,
      source: sourceFilter || undefined,
      limit: 200,
    });
    return {
      events: listFrom(res, { context: "alertEvents" }),
      total: Number(res?.total ?? 0),
      lastSeenAt: res?.lastSeenAt ?? null,
    };
  }, [windowHours, minSeverity, sourceFilter]);

  const feedKey = `alerts:feed:${windowHours}:${minSeverity || "all"}:${sourceFilter || "all"}`;
  const {
    data: feedData,
    loading: loadingFeed,
    refreshing: refreshingFeed,
    refetch: refetchFeed,
  } = useCachedFetch(feedKey, feedLoader);
  // Stable fallback for `events` so downstream useMemo deps don't see
  // a new `[]` reference each render before the feed lands.
  const events = React.useMemo(() => feedData?.events ?? [], [feedData]);
  const total = feedData?.total ?? 0;

  // lastSeenAt is the tenant's "last cursor" for the alerts feed. It
  // reads from the feed's first response, but mutations (mark-all-seen,
  // mark-event-seen) advance it independently — so it lives in its own
  // state instead of derived from the cached feed.
  const [lastSeenAt, setLastSeenAt] = React.useState(null);
  React.useEffect(() => {
    if (feedData?.lastSeenAt) setLastSeenAt(feedData.lastSeenAt);
  }, [feedData?.lastSeenAt]);

  const rulesLoader = React.useCallback(async () => {
    const res = await getAlertRules();
    return {
      rules: Array.isArray(res?.rules) ? res.rules : [],
      templates: Array.isArray(res?.templates) ? res.templates : [],
      // null = el backend no pudo saberlo (o es anterior al gate): no se bloquea nada.
      pluginAvailability:
        res?.pluginAvailability && typeof res.pluginAvailability === "object" ? res.pluginAvailability : null,
    };
  }, []);

  const {
    data: rulesData,
    loading: loadingRules,
    refreshing: refreshingRules,
    refetch: refetchRules,
  } = useCachedFetch("alerts:rules", rulesLoader);
  const rules = rulesData?.rules ?? [];
  const templates = rulesData?.templates ?? [];

  const refreshAll = React.useCallback(() => {
    refetchFeed();
    refetchRules();
  }, [refetchFeed, refetchRules]);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refreshAll, "alertsAutoRefresh");

  // Mark-all-seen: hitting the bell (or the Alerts page) moves the
  // tenant's cursor forward. We do it once on first successful feed
  // load so the badge clears promptly. Subsequent explicit "Mark all
  // seen" clicks also invoke it.
  React.useEffect(() => {
    if (loadingFeed || events.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await markAllAlertsSeen();
        if (!cancelled && res?.lastSeenAt) setLastSeenAt(res.lastSeenAt);
      } catch (err) {
        // Non-fatal — the cursor will update on the next mark-all-seen.
        console.warn("[alerts] mark-all-seen failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingFeed]);

  // Client-side text search across summary + deviceId. Keeps the
  // primary filter concerns on the backend (time window + severity +
  // source) while letting the operator drill in.
  const filteredEvents = React.useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      // Por los DOS: se busca por nombre porque es lo que se recuerda, pero
      // quien pega un id sacado de un log o de una URL tiene que seguir
      // encontrando su alerta.
      const haystack = `${e.summary || ""} ${e.hostname || ""} ${e.deviceId || ""} ${e.rule?.name || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [events, searchText]);

  // Hero card numbers.
  const matched24h = React.useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return events.filter((e) => Date.parse(e.occurredAt) >= cutoff).length;
  }, [events]);

  const lastMatchAt = events.length > 0 ? events[0].occurredAt : null;

  // Una regla pausada (su plugin no está disponible) NO está activa: el
  // backend no la evalúa. Contarla aquí sería decir que avisa cuando no.
  const activeRuleCount = rules.filter((r) => r.enabled && !r.paused).length;
  const pausedRuleCount = rules.filter((r) => r.paused).length;

  /**
   * ⚠️ Se cuenta por la EDAD (`firstSeenAt`), no por `occurredAt`.
   *
   * Las fuentes de estado —anclas de confianza, cripto débil, hoja de ruta
   * PQC, cumplimiento rancio— no son eventos: el backend las sella con la
   * hora de la CONSULTA, así que su `occurredAt` es siempre "ahora mismo".
   * Comparado con el cursor eso da siempre "no leído", y era la mitad de
   * cliente del motivo por el que "Mark all seen" no apagaba nada.
   *
   * `firstSeenAt` viene de `alert_occurrences` y contesta desde cuándo pasa
   * esto de verdad. Sin fila en el histórico se cae a `occurredAt` y cuenta:
   * un contador que se calla por no saber es peor que uno que avisa de más.
   */
  const unreadInWindow = React.useMemo(() => {
    if (!lastSeenAt) return 0;
    const cutoff = Date.parse(lastSeenAt);
    if (!Number.isFinite(cutoff)) return 0;
    return events.filter((e) => {
      const t = Date.parse(e.firstSeenAt ?? e.occurredAt);
      return Number.isFinite(t) ? t > cutoff : true;
    }).length;
  }, [events, lastSeenAt]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Header -------------------------------------------------------- */}
      <PageHeader
        title="Alerts"
        subtitle="Tenant-configurable notifications derived from audit events, compliance findings, and device lifecycle."
        icon={<NotificationsOutlinedIcon />}
        actions={
          <>
            <GoToReportButton
              onNavigate={onNavigate}
              reportKey={ALERTS_REPORT_KEY}
              tooltip="Alert activity report"
            />
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={refreshAll}
              loading={loadingFeed || loadingRules || refreshingFeed || refreshingRules}
            />
          </>
        }
      />

      {/* Hero KPIs ----------------------------------------------------- */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Unread"
            value={unreadInWindow}
            icon={<NotificationsActiveOutlinedIcon />}
            accent={unreadInWindow > 0 ? ROLE.critical : BRAND.teal}
            tint={unreadInWindow > 0 ? BRAND.alert.errorSoft : BRAND.tealSoft}
            subtext="since last visit"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Active rules"
            value={activeRuleCount}
            icon={<RuleOutlinedIcon />}
            subtext={pausedRuleCount ? `${rules.length} total · ${pausedRuleCount} paused` : `${rules.length} total`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Last 24h"
            value={matched24h}
            icon={<BoltOutlinedIcon />}
            accent={ROLE.caution}
            tint={BRAND.alert.warningSoft}
            subtext="matching events"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard
            title="Last match"
            value={formatRelativeTime(lastMatchAt)}
            icon={<AccessTimeOutlinedIcon />}
            subtext={lastMatchAt ? new Date(lastMatchAt).toLocaleString() : "no matches yet"}
          />
        </Grid>
      </Grid>

      {/* Tab bar — su propio panel, como en las otras páginas: la navegación
          no comparte caja con lo que navega. ------------------------------ */}
      <SectionPaper variant="panel" sx={{ p: 0, overflow: "hidden" }}>
        <Tabs
          value={tab}
          onChange={(_e, next) => setTab(next)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Alerts sections"
          sx={{
            px: { xs: 1, sm: 2 },
            minHeight: 62,
            "& .MuiTabs-indicator": { height: 3, borderRadius: 999, backgroundColor: BRAND.teal },
          }}
        >
          <Tab value="alerts" label="Alerts" icon={<NotificationsOutlinedIcon fontSize="small" />} iconPosition="start" sx={TAB_SX} />
          <Tab value="rules" label="Rules" icon={<TuneOutlinedIcon fontSize="small" />} iconPosition="start" sx={TAB_SX} />
          {canManage ? (
            <Tab
              value="profiles"
              label={np.profiles?.length ? `Notification profiles (${np.profiles.length})` : "Notification profiles"}
              icon={<GroupsOutlinedIcon fontSize="small" />}
              iconPosition="start"
              sx={TAB_SX}
            />
          ) : null}
          {canManage ? (
            <Tab value="destinations" label="Destinations" icon={<HubOutlinedIcon fontSize="small" />} iconPosition="start" sx={TAB_SX} />
          ) : null}
        </Tabs>
      </SectionPaper>

      {/* Alerts tab: filter bar + feed ---------------------------------- */}
      {tab === "alerts" ? (
      <SectionPaper variant="panel" sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 1.5, alignItems: { md: "center" } }}>
          <TextField
            size="small"
            placeholder="Search device, summary, rule…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            sx={{ minWidth: 220, flex: 1 }}
          />
          <Select
            size="small"
            displayEmpty
            value={minSeverity}
            onChange={(e) => setMinSeverity(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All severities</MenuItem>
            {SEVERITY_ORDER.slice().reverse().map((s) => (
              <MenuItem key={s} value={s}>{SEVERITY_META[s].label} and above</MenuItem>
            ))}
          </Select>
          <Select
            size="small"
            displayEmpty
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All sources</MenuItem>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v}</MenuItem>
            ))}
          </Select>
          <Select
            size="small"
            value={windowHours}
            onChange={(e) => setWindowHours(Number(e.target.value))}
            sx={{ minWidth: 160 }}
          >
            {TIME_WINDOWS.map((w) => (
              <MenuItem key={w.hours} value={w.hours}>{w.label}</MenuItem>
            ))}
          </Select>
          {loadingFeed ? <CircularProgress size={18} sx={{ color: BRAND.teal }} /> : null}
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
                {/*
                  Columna aparte y no un añadido a "When": son dos datos
                  distintos. "When" viene de la condición —la fecha de
                  caducidad del certificado, por ejemplo—, y "Open for"
                  dice desde cuándo la vemos. Una alerta puede llevar tres
                  semanas abierta y traer un "When" de hace un rato.
                */}
                <TableCell sx={{ fontWeight: 700 }} title="How long this alert has been open — first seen by the hourly sweep, not the condition's own timestamp.">
                  Open for
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Source</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Device</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Summary</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Rule</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ color: BRAND.gray, py: 4 }}>
                    {rules.some((r) => r.enabled)
                      ? "No matching events in the selected window."
                      : "No rules enabled — open Manage Rules to pick what you want to be notified about."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((e, idx) => (
                  <TableRow
                    key={`${e.source}:${e.sourceEventId}:${idx}`}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => setDetailEvent(e)}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
                        {formatRelativeTime(e.occurredAt)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: BRAND.gray }}>
                        {new Date(e.occurredAt).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <OpenForCell firstSeenAt={e.firstSeenAt} />
                    </TableCell>
                    <TableCell>
                      <SeverityChip severity={e.severity} />
                    </TableCell>
                    <TableCell>{SOURCE_LABEL[e.source] || e.source}</TableCell>
                    {/* El NOMBRE del equipo, no su UUID: nadie recuerda
                        `a3f1…` pero todo el mundo reconoce `MSIG-WSUS`. El id
                        sigue estando —en el tooltip y en la ficha— porque es
                        la clave con la que se navega y lo único estable si a
                        un equipo lo renombran; lo que cambia es cuál de los
                        dos se lee de un vistazo.

                        Sin hostname se cae al id: el inventario puede no
                        conocer todavía a ese agente, y un UUID es peor de leer
                        pero nunca miente. La tipografía monoespaciada se queda
                        SÓLO para ese caso — un hostname en monoespaciada
                        parece un identificador y vuelve a costar leerlo. */}
                    <TableCell>
                      <Typography
                        variant="body2"
                        title={e.hostname && e.deviceId ? e.deviceId : undefined}
                        sx={{
                          fontFamily: e.hostname ? "inherit" : "monospace",
                          fontWeight: e.hostname ? 600 : 400,
                          color: e.deviceId ? BRAND.dark : BRAND.gray,
                          fontSize: TEXT.sm
                        }}
                      >
                        {e.hostname || e.deviceId || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 360 }}>
                      <Typography variant="body2" sx={{ color: BRAND.dark }} noWrap title={e.summary}>
                        {e.summary}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ color: BRAND.gray }}>
                        {e.rule?.name || "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Showing {filteredEvents.length} of {total} events · window resolves server-side.
          </Typography>
          <Button
            size="small"
            startIcon={<DoneAllOutlinedIcon fontSize="small" />}
            onClick={async () => {
              try {
                const res = await markAllAlertsSeen();
                if (res?.lastSeenAt) setLastSeenAt(res.lastSeenAt);
                notify("success", "Marked all seen");
              } catch (err) {
                console.error(err);
                notify("error", "Could not mark seen");
              }
            }}
            sx={{ textTransform: "none", color: BRAND.teal }}
          >
            Mark all seen
          </Button>
        </Stack>
      </SectionPaper>

      ) : null}

      {/* Rules tab — el catálogo agrupado por plugin ----------------------- */}
      {tab === "rules" ? (
        <SectionPaper variant="panel" sx={{ p: 2 }}>
          <AlertRulesPanel
            templates={templates}
            rules={rules}
            availability={rulesData?.pluginAvailability ?? null}
            catalog={pluginCatalog}
            loading={loadingRules}
            onNavigate={onNavigate}
            renderSeverity={(severity) => <SeverityChip severity={severity} />}
            profileNames={np.profileNames}
            editorProps={{
              profiles: np.profiles,
              onManageProfiles: () => setTab("profiles"),
              roleOptions: np.roleOptions,
            }}
            onToggle={async (rule, enabled) => {
              try {
                await patchAlertRule(rule.id, { enabled });
                notify("success", `${rule.name} ${enabled ? "enabled" : "disabled"}`);
                refetchRules();
              } catch (err) {
                console.error(err);
                notify("error", describeRuleError(err, "Rule toggle failed"));
              }
            }}
            onEnableTemplate={async (template) => {
              try {
                await createAlertRule({
                  templateId: template.templateId,
                  name: template.name,
                  severity: template.defaultSeverity,
                  source: template.source,
                  criteria: template.defaultCriteria ?? {},
                  enabled: true
                });
                notify("success", `${template.name} enabled`);
                refetchRules();
                refetchFeed();
              } catch (err) {
                console.error(err);
                notify("error", describeRuleError(err, "Could not enable template"));
              }
            }}
            onSaveNotify={async (rule, notifyConfig) => {
              try {
                await patchAlertRule(rule.id, { notify: notifyConfig });
                // Cuenta todas las vías, no sólo `email`: una regla que avisa
                // a un perfil decía «email delivery off».
                notify(
                  "success",
                  hasAnyTarget(notifyConfig)
                    ? `${rule.name}: delivery saved — ${describeTargets(notifyConfig)}`
                    : `${rule.name}: email delivery off`
                );
                refetchRules();
              } catch (err) {
                console.error(err);
                // The backend rejects bad recipients by name — show it, so a
                // typo is fixed instead of saving "successfully" and never
                // delivering.
                notify("error", describeNotifyError(err, "Could not save email delivery — check the recipients"));
              }
            }}
            onDeleteRule={async (rule) => {
              try {
                await deleteAlertRule(rule.id);
                notify("success", `${rule.name} removed`);
                refetchRules();
                refetchFeed();
              } catch (err) {
                console.error(err);
                notify("error", "Delete failed");
              }
            }}
          />
        </SectionPaper>
      ) : null}

      {/* Notification profiles tab (ADR-0025) ------------------------------ */}
      {tab === "profiles" && canManage ? (
        <SectionPaper variant="panel" sx={{ p: 2 }}>
          <NotifyProfilesPanel
            profiles={np.profiles ?? []}
            loading={np.loadingProfiles && !np.profiles}
            members={np.members}
            canListMembers={Boolean(np.access?.canListMembers)}
            roleOptions={np.roleOptions}
            notify={notify}
            onChanged={() => {
              np.reload();
              // Borrar o renombrar un perfil cambia los badges de las reglas.
              refetchRules();
            }}
          />
        </SectionPaper>
      ) : null}

      {/* Destinations tab — ADR-0028, SIEM del cliente o de su MSP ---------- */}
      {tab === "destinations" && canManage ? (
        <SectionPaper variant="panel" sx={{ p: 2 }}>
          <SiemDestinationsDrawer embedded notify={notify} />
        </SectionPaper>
      ) : null}

      {/* Event detail drawer ------------------------------------------- */}
      <Drawer
        anchor="right"
        open={Boolean(detailEvent)}
        onClose={() => setDetailEvent(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 520, md: 600 }, maxWidth: "100%" } }}
      >
        <EventDetailDrawer event={detailEvent} onClose={() => setDetailEvent(null)} />
      </Drawer>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </Box>
  );
}

// ---------- Event detail drawer body ----------------------------------------

function EventDetailDrawer({ event, onClose }) {
  if (!event) return null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: `1px solid ${BRAND.border}` }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND.dark, lineHeight: 1.2 }} noWrap>
            {event.summary}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: "center" }}>
            <SeverityChip severity={event.severity} />
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              {SOURCE_LABEL[event.source] || event.source}
            </Typography>
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              · {formatRelativeTime(event.occurredAt)}
            </Typography>
          </Stack>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
        <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }}>
          <Typography
            variant="caption"
            sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 0.5 }}
          >
            Identity
          </Typography>
          <Stack spacing={0.5}>
            {/* En la ficha caben los dos, y hacen falta los dos: el nombre
                para saber de qué máquina se habla, el id para pegarlo en una
                consulta o en un ticket. */}
            {event.hostname ? <DetailRow label="Device" value={event.hostname} /> : null}
            <DetailRow label={event.hostname ? "Agent ID" : "Device"} value={event.deviceId || "—"} mono />
            <DetailRow label="Occurred" value={new Date(event.occurredAt).toLocaleString()} />
            {/*
              Dos filas y no una: "Occurred" es cuándo pasó según la
              condición, "Open for" desde cuándo la vemos. En una alerta
              vieja los dos valores se contradicen a propósito, y verlos
              juntos es lo que explica por qué.
            */}
            <DetailRow
              label="Open for"
              value={(() => {
                const age = formatOpenFor(event.firstSeenAt);
                if (!age) return "not recorded yet";
                return `${age.text} · first seen ${new Date(event.firstSeenAt).toLocaleString()}`;
              })()}
            />
            <DetailRow label="Source ID" value={event.sourceEventId} mono />
            <DetailRow label="Rule" value={event.rule?.name || "—"} />
          </Stack>
        </Paper>

        <CorrelationSection correlation={event.details?.correlation} />

        <Typography
          variant="caption"
          sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
        >
          Details
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1.5,
            bgcolor: BRAND.surfaceMuted,
            borderRadius: 2,
            fontSize: TEXT.xs,
            fontFamily: "monospace",
            color: BRAND.dark,
            overflowX: "auto",
            maxHeight: "60vh"
          }}
        >
          {JSON.stringify(event.details, null, 2)}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Lo que la alerta ya sabe del contexto: quién, qué grupos, si hay regla y
 * qué hacer. Sólo aparece si el backend lo resolvió (hoy, las fuentes de
 * navegador). ⚠️ Los grupos son los ESTÁTICOS; los dinámicos no se resuelven
 * por evento y se dice.
 */
export function CorrelationSection({ correlation }) {
  if (!correlation || typeof correlation !== "object") return null;
  const who = [correlation.who?.osUser, correlation.who?.profile].filter(Boolean).join(" · ");
  const groups = Array.isArray(correlation.groups) ? correlation.groups : [];
  const action = correlation.action;
  return (
    <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }}>
      <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 0.5 }}>
        Correlation
      </Typography>
      <Stack spacing={0.5}>
        <DetailRow label="Who" value={who || "—"} />
        <DetailRow
          label="Groups"
          value={
            groups.length > 0
              ? `${groups.map((g) => g.name).join(", ")}${correlation.dynamicGroupsResolved === false ? " (static groups only)" : ""}`
              : correlation.dynamicGroupsResolved === false ? "No static group" : "—"
          }
        />
        {correlation.rule ? <DetailRow label="Rule" value={correlation.rule.action === "block" ? "Blocked" : "Approved"} /> : null}
        {correlation.allowOnlyMode ? <DetailRow label="Mode" value="Only approved extensions" /> : null}
      </Stack>
      {action?.kind === "block_extension" ? (
        <Button
          size="small"
          variant="outlined"
          color="error"
          sx={{ mt: 1 }}
          onClick={() => {
            const pathname = window.location.pathname.replace(/^\/+/, "/") || "/";
            // Blocking is remediation: Patch Management → Security configuration → Browsers.
            const search = searchForPage("patch", { pmTab: "browsers", extension: `${action.browser}|${action.extensionId}` });
            window.history.pushState({}, "", `${pathname}${search}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        >
          Review and block {action.name || "extension"}
        </Button>
      ) : null}
    </Paper>
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
          minWidth: 82,
          textTransform: "uppercase",
          letterSpacing: 0.3
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
          flex: 1
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
