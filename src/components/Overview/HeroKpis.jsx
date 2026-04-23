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

import { Box, Grid, Paper, Skeleton, Stack, Typography } from "@mui/material";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import WorkOutlineOutlinedIcon from "@mui/icons-material/WorkOutlineOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import { BRAND, ROLE } from "../../theme/brand";

function Kpi({ title, value, subtitle, icon: Icon, accent, tint, loading }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        transition: "border-color 120ms ease",
        "&:hover": { borderColor: BRAND.borderStrong }
      }}
    >
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
        <Typography
          variant="h4"
          sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.1 }}
        >
          {value}
        </Typography>
      )}

      {subtitle != null && !loading && (
        <Typography variant="caption" sx={{ color: BRAND.tealText, fontWeight: 500 }}>
          {subtitle}
        </Typography>
      )}
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

export default function HeroKpis({ results, loading }) {
  const dashboard = getValue(results?.dashboardSummary);
  const audit = getValue(results?.auditSummary);
  const compliance = getValue(results?.complianceSummary);
  const connected = getValue(results?.connectedDevices);
  const jobsTs = getValue(results?.jobsTimeseries);

  // Card 1: Total devices
  //
  // `/dashboard/summary` reports this as `activeHosts` (the current
  // backend contract observed live). Older inline dashboard variants
  // used `devices` / `total` — we preserve those as fallbacks so the
  // card keeps working if the backend ever renames again.
  const totalDevices =
    dashboard?.activeHosts ??
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

  // Card 6: Security events last 24h (with rejected+error count for
  // color severity). Rejected/error > 0 gets a warning tint.
  const auditSummary = audit?.summary ?? {};
  const eventsLast24h = auditSummary.last_24h ?? 0;
  const rejectedOrError =
    (auditSummary.rejected_count ?? 0) + (auditSummary.error_count ?? 0);
  const auditAccent =
    rejectedOrError > 0
      ? ROLE.critical
      : eventsLast24h > 0
      ? BRAND.teal
      : BRAND.gray;
  const auditTint =
    rejectedOrError > 0
      ? ROLE.criticalSoft
      : eventsLast24h > 0
      ? BRAND.tealSoft
      : BRAND.surfaceMuted;

  const cards = [
    {
      title: "Devices",
      value: totalDevices,
      subtitle: totalDevices ? "total enrolled" : null,
      icon: DevicesOutlinedIcon,
      accent: BRAND.teal,
      tint: BRAND.tealSoft
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
      tint: onlineTint
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
      tint: complianceTint
    },
    {
      title: "Critical findings",
      value: criticalHigh,
      subtitle: criticalHigh
        ? `${criticalHigh} compliance · critical + high`
        : "no open high-severity findings",
      icon: ReportProblemOutlinedIcon,
      accent: criticalHigh > 0 ? ROLE.critical : ROLE.positive,
      tint: criticalHigh > 0 ? ROLE.criticalSoft : ROLE.positiveSoft
    },
    {
      title: "Jobs in flight",
      value: jobsInFlight,
      subtitle: jobsInFlight ? "pending / running" : "queue clear",
      icon: WorkOutlineOutlinedIcon,
      accent: BRAND.teal,
      tint: BRAND.cyanSoft
    },
    {
      title: "Security events 24h",
      value: eventsLast24h,
      subtitle:
        rejectedOrError > 0
          ? `${rejectedOrError} rejected/error`
          : eventsLast24h > 0
          ? "all ok"
          : null,
      icon: NotificationsActiveOutlinedIcon,
      accent: auditAccent,
      tint: auditTint
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
