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

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useCachedFetch } from "../hooks/useCachedFetch";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import DoneAllOutlinedIcon from "@mui/icons-material/DoneAllOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";

import { BRAND, ROLE } from "../theme/brand";
import { severityMeta } from "../theme/severity";
import RuleNotifyEditor, { NotifyBadge } from "../components/Alerts/RuleNotifyEditor";
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

// ---------- presentational helpers ------------------------------------------

// Canonical severity scale (theme/severity.js) — High was red here (same as
// Critical); it's now orange, distinct from Critical, and consistent everywhere.
const SEVERITY_META = {
  critical: { label: "Critical", color: severityMeta("critical").fg, soft: severityMeta("critical").bg },
  high:     { label: "High",     color: severityMeta("high").fg,     soft: severityMeta("high").bg },
  medium:   { label: "Medium",   color: severityMeta("medium").fg,   soft: severityMeta("medium").bg },
  low:      { label: "Low",      color: severityMeta("low").fg,      soft: severityMeta("low").bg }
};

// Must stay in step with the backend's handler map (ALERT_SOURCES in
// modules/alerts/alerts.service.ts). This list feeds the feed's source
// filter, so a missing entry means that source cannot be filtered on —
// which is how compliance_stale, software_change and both CDP sources
// went unreachable here for a while.
const SOURCE_LABEL = {
  security_event:     "Security event",
  compliance_finding: "Compliance finding",
  compliance_score:   "Compliance score",
  compliance_stale:   "Compliance stale",
  device_offline:     "Device offline",
  cert_expiry:        "Agent cert expiry",
  job_failure:        "Job failure",
  device_enrollment:  "Device enrolled",
  software_change:    "Software change",
  cdp_cert_expiry:    "Endpoint cert expiry",
  cdp_weak_crypto:    "Certificate hygiene"
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
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 26, fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>
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

export default function Alerts() {
  const [windowHours, setWindowHours] = React.useState(DEFAULT_WINDOW_HOURS);
  const [minSeverity, setMinSeverity] = React.useState(""); // "" = all
  const [sourceFilter, setSourceFilter] = React.useState(""); // "" = all
  const [searchText, setSearchText] = React.useState("");

  const [rulesDrawerOpen, setRulesDrawerOpen] = React.useState(false);
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
      const haystack = `${e.summary || ""} ${e.deviceId || ""} ${e.rule?.name || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [events, searchText]);

  // Hero card numbers.
  const matched24h = React.useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return events.filter((e) => Date.parse(e.occurredAt) >= cutoff).length;
  }, [events]);

  const lastMatchAt = events.length > 0 ? events[0].occurredAt : null;

  const activeRuleCount = rules.filter((r) => r.enabled).length;

  const unreadInWindow = React.useMemo(() => {
    if (!lastSeenAt) return 0;
    const cutoff = Date.parse(lastSeenAt);
    if (!Number.isFinite(cutoff)) return 0;
    return events.filter((e) => Date.parse(e.occurredAt) > cutoff).length;
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
            <Button
              variant="outlined"
              startIcon={<TuneOutlinedIcon />}
              onClick={() => setRulesDrawerOpen(true)}
              sx={{ borderColor: BRAND.border, color: BRAND.dark, "&:hover": { borderColor: BRAND.teal, bgcolor: BRAND.tealSoft } }}
            >
              Manage rules
            </Button>
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
            subtext={`${rules.length} total`}
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

      {/* Filter bar + feed --------------------------------------------- */}
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
                  <TableCell colSpan={6} align="center" sx={{ color: BRAND.gray, py: 4 }}>
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
                      <SeverityChip severity={e.severity} />
                    </TableCell>
                    <TableCell>{SOURCE_LABEL[e.source] || e.source}</TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: "monospace",
                          color: e.deviceId ? BRAND.dark : BRAND.gray,
                          fontSize: 12
                        }}
                      >
                        {e.deviceId || "—"}
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

      {/* Manage Rules drawer ------------------------------------------- */}
      <Drawer
        anchor="right"
        open={rulesDrawerOpen}
        onClose={() => setRulesDrawerOpen(false)}
        PaperProps={{
          sx: { width: { xs: "100%", sm: 520, md: 600 }, maxWidth: "100%" }
        }}
      >
        <ManageRulesDrawer
          templates={templates}
          rules={rules}
          loading={loadingRules}
          onClose={() => setRulesDrawerOpen(false)}
          onRefresh={refetchRules}
          onToggle={async (rule, enabled) => {
            try {
              await patchAlertRule(rule.id, { enabled });
              notify("success", `${rule.name} ${enabled ? "enabled" : "disabled"}`);
              refetchRules();
            } catch (err) {
              console.error(err);
              notify("error", "Rule toggle failed");
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
              notify("error", "Could not enable template");
            }
          }}
          onSaveNotify={async (rule, notifyConfig) => {
            try {
              await patchAlertRule(rule.id, { notify: notifyConfig });
              const count = notifyConfig?.email?.length ?? 0;
              notify(
                "success",
                count > 0
                  ? `${rule.name}: emailing ${count} recipient${count === 1 ? "" : "s"}`
                  : `${rule.name}: email delivery off`
              );
              refetchRules();
            } catch (err) {
              console.error(err);
              // The backend rejects malformed recipients outright, which is
              // what keeps a typo from saving "successfully" and silently
              // never delivering.
              notify("error", "Could not save email delivery — check the addresses");
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
      </Drawer>

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

// ---------- Manage Rules drawer body ----------------------------------------

function ManageRulesDrawer({
  templates,
  rules,
  loading,
  onClose,
  onRefresh,
  onToggle,
  onEnableTemplate,
  onDeleteRule,
  onSaveNotify
}) {
  // Which rule has its delivery editor open. One at a time — the drawer
  // is narrow and the editor is two full-width fields.
  const [notifyOpenFor, setNotifyOpenFor] = React.useState(null);
  // Group: which templates already have a tenant rule, which don't.
  // A template may have multiple instances (future-proof) so we look up
  // by templateId → count.
  const ruleByTemplate = React.useMemo(() => {
    const map = new Map();
    for (const r of rules) {
      if (!r.templateId) continue;
      if (!map.has(r.templateId)) map.set(r.templateId, []);
      map.get(r.templateId).push(r);
    }
    return map;
  }, [rules]);

  // Rules without a template are "custom".
  const customRules = React.useMemo(
    () => rules.filter((r) => !r.templateId),
    [rules]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: `1px solid ${BRAND.border}` }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND.dark }}>
            Manage alert rules
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Catalog is global. Toggle a template to create an instance for this tenant.
          </Typography>
        </Box>
        <IconButton aria-label="Refresh alerts" onClick={onRefresh} size="small" sx={{ mr: 0.5 }}>
          <RefreshOutlinedIcon fontSize="small" />
        </IconButton>
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={20} sx={{ color: BRAND.teal }} />
          </Stack>
        ) : null}

        <Typography
          variant="caption"
          sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
        >
          Catalog
        </Typography>

        <Stack spacing={1.25}>
          {templates.map((t) => {
            const instances = ruleByTemplate.get(t.templateId) || [];
            const primary = instances[0];
            const enabled = Boolean(primary?.enabled);

            return (
              <Paper
                key={t.templateId}
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid ${BRAND.border}`,
                  opacity: t.deprecated ? 0.5 : 1
                }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={1.25}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark }}>
                        {t.name}
                      </Typography>
                      <SeverityChip severity={primary?.severity || t.defaultSeverity} />
                      <Chip
                        size="small"
                        label={SOURCE_LABEL[t.source] || t.source}
                        sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.tealText }}
                      />
                    </Stack>
                    <Typography variant="body2" sx={{ color: BRAND.gray, fontSize: 13 }}>
                      {t.description}
                    </Typography>
                    {/* Delivery config only exists once the template has a
                        tenant rule to hang it off. */}
                    {primary ? (
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                        <NotifyBadge notify={primary.notify} />
                        <Button
                          size="small"
                          onClick={() =>
                            setNotifyOpenFor(notifyOpenFor === primary.id ? null : primary.id)
                          }
                          sx={{ textTransform: "none", fontSize: 12, color: BRAND.tealText, minWidth: 0 }}
                        >
                          {notifyOpenFor === primary.id ? "Hide" : "Email…"}
                        </Button>
                      </Stack>
                    ) : null}
                  </Box>
                  <Tooltip title={primary ? (enabled ? "Disable" : "Enable") : "Enable for this tenant"}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={enabled}
                          onChange={(e) => {
                            if (primary) {
                              onToggle(primary, e.target.checked);
                            } else if (e.target.checked) {
                              onEnableTemplate(t);
                            }
                          }}
                        />
                      }
                      label=""
                      sx={{ m: 0 }}
                    />
                  </Tooltip>
                </Stack>

                {primary && notifyOpenFor === primary.id ? (
                  <RuleNotifyEditor
                    rule={primary}
                    onSave={(notify) => onSaveNotify(primary, notify)}
                  />
                ) : null}
              </Paper>
            );
          })}
        </Stack>

        {customRules.length > 0 ? (
          <>
            <Typography
              variant="caption"
              sx={{
                color: BRAND.gray,
                fontWeight: 700,
                textTransform: "uppercase",
                display: "block",
                mt: 3,
                mb: 1
              }}
            >
              Custom rules
            </Typography>
            <Stack spacing={1.25}>
              {customRules.map((r) => (
                <Paper
                  key={r.id}
                  elevation={0}
                  sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}` }}
                >
                  <Stack direction="row" alignItems="flex-start" spacing={1.25}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark }}>
                          {r.name}
                        </Typography>
                        <SeverityChip severity={r.severity} />
                        <Chip
                          size="small"
                          label={SOURCE_LABEL[r.source] || r.source}
                          sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.tealText }}
                        />
                      </Stack>
                      <Typography
                        variant="caption"
                        sx={{ color: BRAND.gray, fontFamily: "monospace" }}
                      >
                        {JSON.stringify(r.criteria)}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                        <NotifyBadge notify={r.notify} />
                        <Button
                          size="small"
                          onClick={() => setNotifyOpenFor(notifyOpenFor === r.id ? null : r.id)}
                          sx={{ textTransform: "none", fontSize: 12, color: BRAND.tealText, minWidth: 0 }}
                        >
                          {notifyOpenFor === r.id ? "Hide" : "Email…"}
                        </Button>
                      </Stack>
                    </Box>
                    <Switch
                      checked={r.enabled}
                      onChange={(e) => onToggle(r, e.target.checked)}
                    />
                    <Tooltip title="Delete custom rule">
                      <IconButton aria-label="Delete rule" size="small" onClick={() => onDeleteRule(r)}>
                        <CloseOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>

                  {notifyOpenFor === r.id ? (
                    <RuleNotifyEditor rule={r} onSave={(notify) => onSaveNotify(r, notify)} />
                  ) : null}
                </Paper>
              ))}
            </Stack>
          </>
        ) : null}

        <Typography
          variant="caption"
          sx={{ display: "block", color: BRAND.gray, mt: 3, fontStyle: "italic" }}
        >
          Custom rule builder lands in Phase 2. For now, enable templates from the catalog above.
        </Typography>
      </Box>
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
            <DetailRow label="Device" value={event.deviceId || "—"} mono />
            <DetailRow label="Occurred" value={new Date(event.occurredAt).toLocaleString()} />
            <DetailRow label="Source ID" value={event.sourceEventId} mono />
            <DetailRow label="Rule" value={event.rule?.name || "—"} />
          </Stack>
        </Paper>

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
            fontSize: 11,
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

function DetailRow({ label, value, mono = false }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
      <Typography
        sx={{
          fontSize: 12,
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
          fontSize: 13,
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
