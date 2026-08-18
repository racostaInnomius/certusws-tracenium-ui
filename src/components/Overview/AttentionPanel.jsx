// src/components/Overview/AttentionPanel.jsx
//
// "Things a CISO/IT admin should look at first" panel. Filters out rows
// with count=0 (no noise), and if everything is zero shows a cheerful
// "all clear" state so the panel never looks empty-sad.
//
// Each row navigates to the relevant page with a pre-applied filter via
// the URL ?page=... query param pattern already used by AppShell. The
// component takes a `navigateTo(page, query)` callback so the parent
// owns the routing concern.

import { Paper, Stack, Typography, Box } from "@mui/material";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import KeyOffOutlinedIcon from "@mui/icons-material/KeyOffOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import UpdateOutlinedIcon from "@mui/icons-material/UpdateOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import AlertRow from "./AlertRow";
import { BRAND, ROLE } from "../../theme/brand";
import { classifyAgentVersions } from "./agentVersions";

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

export default function AttentionPanel({ results, onNavigate }) {
  const dashboard = getValue(results?.dashboardSummary);
  const audit = getValue(results?.auditSummary);
  const compliance = getValue(results?.complianceSummary);
  const expiring = getValue(results?.expiringCerts);
  const latest = getValue(results?.latestVersions);
  const agentVersions = getValue(results?.agentVersions);

  // ---- derive counts ---------------------------------------------------

  // Offline >24h — derived from dashboard summary if it exposes the
  // field; otherwise defaults to 0 so we don't invent a number.
  const offlineCount =
    dashboard?.offlineOver24h ?? dashboard?.offline24h ?? 0;

  // Certs expiring <30 days
  const expiringCount =
    expiring?.count ??
    (Array.isArray(expiring?.items) ? expiring.items.length : 0);

  // Critical+High open findings
  const findings = compliance?.summary?.openFindings ?? {};
  const criticalHigh = (findings.critical ?? 0) + (findings.high ?? 0);

  // Failed jobs last 24h — approximate using audit summary's error bucket
  // (which covers backend-recorded failures). The real "failed jobs"
  // signal lives in the jobs timeseries but aggregating over 24h there
  // requires either a dedicated endpoint or client-side slicing; this is
  // the pragmatic shortcut for the first release.
  const failed24h = audit?.summary?.error_count ?? 0;

  // Outdated agents — fleet-wide count derived from the dedicated
  // `/dashboard/agent-versions` aggregate classified against the
  // highest published version we know about (taken from the binaries
  // metadata endpoint). "Outdated" here = anything not `current`, which
  // includes both `oneBehind` and `older`. We keep `unknown` out of the
  // count — those are devices with no agent_version on disk, which is
  // likely an older enrollment record rather than a true upgrade lag.
  const latestMap = {};
  if (Array.isArray(latest)) {
    for (const entry of latest) {
      if (entry?.ok && entry.data?.latestVersion) {
        latestMap[`${entry.platform}:${entry.arch}`] = entry.data.latestVersion;
      }
    }
  }
  const byVersion = Array.isArray(agentVersions?.byVersion)
    ? agentVersions.byVersion
    : [];
  const { buckets: versionBuckets } = classifyAgentVersions(
    byVersion,
    latestMap
  );
  const outdatedCount =
    (versionBuckets.oneBehind ?? 0) + (versionBuckets.older ?? 0);

  // ---- ordered list ----------------------------------------------------

  const alerts = [
    {
      key: "offline",
      count: offlineCount,
      label: "devices offline >24h",
      severity: "warning",
      icon: CloudOffOutlinedIcon,
      navigate: () => onNavigate?.("assets", { filter: "offline" })
    },
    {
      key: "certs",
      count: expiringCount,
      label: "certificates expiring <30d",
      severity: "error",
      icon: KeyOffOutlinedIcon,
      navigate: () => onNavigate?.("pki", { tab: "expiring" })
    },
    {
      key: "findings",
      count: criticalHigh,
      label: "critical/high compliance findings open",
      severity: "error",
      icon: ReportProblemOutlinedIcon,
      // Page key is "ad", not "security" — that's the route Security
      // Compliance is registered under (see layout/pageRegistry.jsx).
      // With the wrong key renderPage fell through to its Overview
      // fallback, so the click silently kept the user where they were
      // and read as a dead card.
      navigate: () => onNavigate?.("ad", { severity: "high" })
    },
    {
      key: "failed_jobs",
      count: failed24h,
      label: "failed events last 24h",
      severity: "warning",
      icon: ErrorOutlineOutlinedIcon,
      navigate: () => onNavigate?.("audit", { outcome: "error" })
    },
    {
      key: "outdated",
      count: outdatedCount,
      label: "agents behind latest version",
      severity: "info",
      icon: UpdateOutlinedIcon,
      navigate: () => onNavigate?.("assets", { filter: "outdated" })
    }
  ];

  const visible = alerts.filter((a) => (a.count ?? 0) > 0);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{ color: BRAND.dark, fontWeight: 700, mb: 1.5 }}
      >
        Attention required
      </Typography>

      {visible.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 4,
            color: ROLE.positive
          }}
        >
          <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 36, mb: 1 }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.dark }}>
            All clear
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray, mt: 0.5 }}>
            No issues needing immediate attention
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {visible.map((a) => (
            <AlertRow
              key={a.key}
              icon={a.icon}
              severity={a.severity}
              count={a.count}
              label={a.label}
              onClick={a.navigate}
            />
          ))}
        </Stack>
      )}
    </Paper>
  );
}
