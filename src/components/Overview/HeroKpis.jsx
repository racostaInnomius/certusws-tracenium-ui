// src/components/Overview/HeroKpis.jsx
//
// Six KPI cards sitting at the top of the Overview. Reuses the
// SummaryCard visual pattern from Audit.jsx but carries its own
// implementation here to avoid a cross-page refactor while the Audit
// page still owns its own BRAND object.
//
// Each KPI answers a single executive question ("is the fleet healthy?"
// "does anything need my attention today?"). Cards fade in with skeleton
// while data loads and show a neutral zero-state if a backing endpoint
// failed — partial data is better than a blank dashboard.

import { Box, Grid, Paper, Skeleton, Stack, Typography, Tooltip } from "@mui/material";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import WorkOutlineOutlinedIcon from "@mui/icons-material/WorkOutlineOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import { BRAND, ROLE } from "../../theme/brand";

/**
 * Tiny inline sparkline (no chart lib). Takes an array of numbers and
 * renders a polyline + area under the curve, sized to fit a KPI card.
 * Kept dependency-free so adding sparklines to other KPIs later only
 * needs data — no Recharts instantiation overhead per card.
 */
function Sparkline({ points = [], color = BRAND.teal, height = 24 }) {
  if (!Array.isArray(points) || points.length < 2) return null;

  const w = 64;
  const h = height;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;

  // Map each point to an (x, y) in the SVG viewBox.
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / span) * (h - 2) - 1;
    return [x, y];
  });

  const linePath = coords.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={areaPath} fill={color} opacity={0.15} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Kpi({ title, value, subtitle, icon: Icon, accent, tint, loading, onClick, sparkline }) {
  // The card becomes a button only when a target is wired. That way
  // "dead" KPIs (no drilldown yet) don't show a pointer cursor or
  // invite clicks that do nothing — a worse UX than being visibly
  // static.
  const interactive = typeof onClick === "function";

  const content = (
    <>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tint,
            color: accent,
            flexShrink: 0
          }}
        >
          <Icon fontSize="small" />
        </Box>
        <Typography
          variant="body2"
          sx={{ color: BRAND.dark, fontWeight: 600, lineHeight: 1.2 }}
        >
          {title}
        </Typography>
      </Stack>

      {loading ? (
        <Skeleton variant="text" width={90} height={40} />
      ) : (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography
            variant="h4"
            sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.1, flex: 1 }}
          >
            {value}
          </Typography>
          {sparkline && sparkline.length >= 2 ? (
            // Small inline trend for the last-N-days window. Color
            // inherits the KPI's accent so it reads as the same
            // signal at a glance (no "is this a different metric?"
            // confusion).
            <Tooltip title={`Trend · last ${sparkline.length} days`} arrow>
              <Box sx={{ flexShrink: 0 }}>
                <Sparkline points={sparkline} color={accent} />
              </Box>
            </Tooltip>
          ) : null}
        </Stack>
      )}

      {subtitle != null && !loading && (
        <Typography variant="caption" sx={{ color: BRAND.tealText, fontWeight: 500 }}>
          {subtitle}
        </Typography>
      )}
    </>
  );

  return (
    <Paper
      elevation={0}
      component={interactive ? "button" : "div"}
      onClick={interactive ? onClick : undefined}
      type={interactive ? "button" : undefined}
      sx={{
        p: 2,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "left",
        gap: 1.25,
        // Native <button> resets we need once the Paper becomes
        // interactive — otherwise MUI's default button styling (font
        // family, background) bleeds through.
        backgroundColor: BRAND.surface,
        backgroundImage: "none",
        font: "inherit",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease",
        "&:hover": interactive
          ? {
              borderColor: BRAND.teal,
              transform: "translateY(-1px)",
              boxShadow: "0 4px 12px rgba(59,64,77,0.08)"
            }
          : { borderColor: BRAND.borderStrong }
      }}
    >
      {content}
    </Paper>
  );
}

// Helpers to thread the raw allSettled results into concrete KPI values
// without spraying optional chaining across the component. Each helper
// returns `null` when the backing endpoint failed so the card falls
// through to the skeleton/zero state rather than displaying garbage.
function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

function formatPct(num) {
  if (!Number.isFinite(num)) return "—";
  return `${Math.round(num)}%`;
}

export default function HeroKpis({ results, loading, onNavigate }) {
  const dashboard = getValue(results?.dashboardSummary);
  const compliance = getValue(results?.complianceSummary);
  const connected = getValue(results?.connectedDevices);
  const jobsTs = getValue(results?.jobsTimeseries);
  // auditSummary stayed in the bundle (other components still use it);
  // we just no longer consume it for a Hero KPI since card 6 became
  // "Unread alerts" — see comment above `unreadAlerts` below.

  // Card 1: Total devices
  //
  // Important: this must use the fleet inventory count, not activeHosts.
  // activeHosts/onlineNow are recency signals and can legitimately be 0
  // while the tenant still has devices and historical telemetry.
  //
  // `fleetDevices` is the roster from the control DB — the same number
  // the MSP portfolio, Remote Control and the license rule use. The
  // older `totalDevices`/`totalHosts` counted rows in the tenant DB's
  // host_current_status, i.e. only devices that have REPORTED. A device
  // that enrolled and never checked in was invisible here, which is how
  // this page could show 16 while Remote Control showed 17. Keep the old
  // keys as the fallback for a backend that predates fleetDevices.
  const fleetDevices = dashboard?.fleetDevices;
  const reportingDevices =
    dashboard?.totalHosts ?? dashboard?.total_hosts ?? null;
  const totalDevices =
    fleetDevices ??
    dashboard?.totalDevices ??
    dashboard?.total_devices ??
    dashboard?.totalHosts ??
    dashboard?.total_hosts ??
    dashboard?.enrolledDevices ??
    dashboard?.enrolled_devices ??
    dashboard?.devices ??
    dashboard?.total ??
    0;

  // Card 2: Online now
  //
  // Canonical source is `/orchestrator/devices-connected` which derives
  // online status from `device_sessions.last_heartbeat` — that's what
  // the Jobs page already trusts. The dashboard summary shape does not
  // expose an online count as of today.
  const onlineCount =
    connected?.count ??
    (Array.isArray(connected?.deviceIds) ? connected.deviceIds.length : null) ??
    dashboard?.onlineCount ??
    dashboard?.online ??
    null;

  const onlinePct =
    totalDevices && onlineCount != null
      ? (onlineCount / totalDevices) * 100
      : null;

  const onlineAccent =
    onlinePct == null
      ? BRAND.teal
      : onlinePct >= 90
      ? ROLE.positive
      : onlinePct >= 70
      ? ROLE.caution
      : ROLE.critical;
  const onlineTint =
    onlinePct == null
      ? BRAND.tealSoft
      : onlinePct >= 90
      ? ROLE.positiveSoft
      : onlinePct >= 70
      ? ROLE.cautionSoft
      : ROLE.criticalSoft;

  // Card 3: Compliance score
  const complianceScore = compliance?.summary?.avgScore ?? null;
  const complianceAccent =
    complianceScore == null
      ? BRAND.teal
      : complianceScore >= 85
      ? ROLE.positive
      : complianceScore >= 60
      ? ROLE.caution
      : ROLE.critical;
  const complianceTint =
    complianceScore == null
      ? BRAND.tealSoft
      : complianceScore >= 85
      ? ROLE.positiveSoft
      : complianceScore >= 60
      ? ROLE.cautionSoft
      : ROLE.criticalSoft;

  // Card 4: open compliance findings with critical or high severity.
  //
  // Labeled "Critical findings" (not "alerts") on purpose — there is
  // no separate alerts pipeline yet. What the card shows is strictly
  // the SCP plugin's open findings bucketed by severity, surfaced from
  // /security/compliance/summary → openFindings. When an alerts engine
  // lands later, it gets a separate card rather than hijacking this one.
  const findings = compliance?.summary?.openFindings ?? {};
  const criticalHigh = (findings.critical ?? 0) + (findings.high ?? 0);

  // Card 5: Jobs in flight — sum in_flight across the last 7-day buckets
  // as a rough "active load" indicator. If we had a real /jobs?status=
  // aggregator we'd use that, but this is close enough for a Hero KPI.
  const lastBucket = Array.isArray(jobsTs?.buckets) && jobsTs.buckets.length > 0
    ? jobsTs.buckets[jobsTs.buckets.length - 1]
    : null;
  const jobsInFlight = lastBucket?.inFlight ?? 0;

  // Sparkline for "Jobs in flight" — the backend's jobsTimeseries
  // endpoint already emits one bucket per day for the last 7 days, so
  // we reuse that data. Other KPIs will gain sparklines as their
  // corresponding timeseries endpoints land (Compliance, Devices,
  // Online now, Critical findings).
  const jobsInFlightSpark = Array.isArray(jobsTs?.buckets)
    ? jobsTs.buckets.map((b) => Number(b?.inFlight ?? 0))
    : [];

  // Card 6 was "Security events 24h" (raw count from the audit
  // pipeline). We replaced it with "Unread alerts" — the actionable
  // signal from the new tenant-configurable alerts module. Raw audit
  // counts stay accessible via the audit page (and via clicking the
  // 7-day chart), but a CISO opening the dashboard cares more about
  // "what unread alerts should I look at" than "how many events
  // streamed in today".
  const unreadAlerts = getValue(results?.alertsUnread);
  const unreadCount = Number(unreadAlerts?.count ?? 0);
  const alertsAccent =
    unreadCount > 0 ? ROLE.critical : ROLE.positive;
  const alertsTint =
    unreadCount > 0 ? ROLE.criticalSoft : ROLE.positiveSoft;

  // Each card maps to a landing page (+ optional filter) so clicking
  // the KPI drops the operator into the drill-down already scoped.
  // Filter keys here must match what the target page reads from the URL
  // — `?filter=online` for Assets, `?severity=high` for SCP, etc. If
  // the target page doesn't yet honor a given query param, the link
  // still works (it just lands unfiltered).
  const notReporting =
    fleetDevices != null && reportingDevices != null
      ? Math.max(fleetDevices - reportingDevices, 0)
      : 0;

  const navigate = (page, query) => onNavigate?.(page, query);

  const cards = [
    {
      title: "Devices",
      value: totalDevices,
      // When the two counts disagree the gap is the story: those devices
      // enrolled (got a cert) and never sent inventory — failed
      // deployments worth chasing, not a rounding artifact.
      subtitle: !totalDevices
        ? null
        : notReporting > 0
          ? `${notReporting} enrolled, not reporting`
          : "total enrolled",
      icon: DevicesOutlinedIcon,
      accent: BRAND.teal,
      tint: BRAND.tealSoft,
      onClick: () => navigate("assets")
    },
    {
      title: "Online now",
      value: onlineCount ?? "—",
      subtitle:
        onlinePct != null
          ? `${formatPct(onlinePct)} of fleet`
          : "— no session data",
      icon: CloudDoneOutlinedIcon,
      accent: onlineAccent,
      tint: onlineTint,
      onClick: () => navigate("assets", { filter: "online" })
    },
    {
      title: "Compliance",
      value: complianceScore != null ? `${Math.round(complianceScore)}%` : "—",
      subtitle:
        compliance?.summary?.devicesReporting != null
          ? `${compliance.summary.devicesReporting} devices reporting`
          : null,
      icon: ShieldOutlinedIcon,
      accent: complianceAccent,
      tint: complianceTint,
      onClick: () => navigate("ad")
    },
    {
      title: "Critical findings",
      value: criticalHigh,
      subtitle: criticalHigh
        ? `${criticalHigh} compliance · critical + high`
        : "no open high-severity findings",
      icon: ReportProblemOutlinedIcon,
      accent: criticalHigh > 0 ? ROLE.critical : ROLE.positive,
      tint: criticalHigh > 0 ? ROLE.criticalSoft : ROLE.positiveSoft,
      onClick: () => navigate("ad", { severity: "high" })
    },
    {
      title: "Jobs in flight",
      value: jobsInFlight,
      subtitle: jobsInFlight ? "pending / running" : "queue clear",
      icon: WorkOutlineOutlinedIcon,
      accent: BRAND.teal,
      tint: BRAND.cyanSoft,
      sparkline: jobsInFlightSpark,
      onClick: () => navigate("jobs", { status: "in_flight" })
    },
    {
      title: "Unread alerts",
      value: unreadCount,
      subtitle:
        unreadCount > 0
          ? "since last visit"
          : "all caught up",
      icon: NotificationsActiveOutlinedIcon,
      accent: alertsAccent,
      tint: alertsTint,
      onClick: () => navigate("alerts")
    }
  ];

  return (
    <Grid container spacing={2}>
      {cards.map((card) => (
        <Grid key={card.title} size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <Kpi {...card} loading={loading} />
        </Grid>
      ))}
    </Grid>
  );
}
