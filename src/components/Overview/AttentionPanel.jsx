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
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import UpdateOutlinedIcon from "@mui/icons-material/UpdateOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import AlertRow from "./AlertRow";
import { BRAND, ICON, ROLE } from "../../theme/brand";
import { classifyAgentVersions } from "./agentVersions";

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

export default function AttentionPanel({ results, onNavigate }) {
  const dashboard = getValue(results?.dashboardSummary);
  const expiring = getValue(results?.expiringCerts);
  const latest = getValue(results?.latestVersions);
  const agentVersions = getValue(results?.agentVersions);
  const sdpTs = getValue(results?.sdpTimeseries);

  // ---- derive counts ---------------------------------------------------

  // Not seen in 7 days. This row used to read `offlineOver24h` /
  // `offline24h`, which /dashboard/summary has never returned — so it was
  // always 0 and never appeared. `inactiveAssets7d` is the field the
  // summary actually serves.
  const inactiveCount = Number(dashboard?.inactiveAssets7d ?? 0);

  // Agent mTLS certificates (Tracenium's own PKI, not CDP) expiring <30d.
  // Needs the `pki` capability: a USER gets 403 and the row stays out.
  const expiringCount =
    expiring?.count ??
    (Array.isArray(expiring?.certificates) ? expiring.certificates.length : 0);

  // Software installs that failed over the last 30 days. Only present when
  // the plan includes SDP — otherwise the slot is never requested.
  const failedInstalls = Array.isArray(sdpTs?.buckets)
    ? sdpTs.buckets.reduce((sum, b) => sum + Number(b?.failed ?? 0), 0)
    : 0;

  // Outdated agents — the agent-version histogram classified against the
  // highest published version per platform+arch. "Outdated" = not
  // `current`; `unknown` (no version on record) stays out of the count.
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
  const { buckets: versionBuckets } = classifyAgentVersions(byVersion, latestMap);
  const outdatedCount =
    (versionBuckets.oneBehind ?? 0) + (versionBuckets.older ?? 0);

  // ---- ordered list ----------------------------------------------------
  //
  // Only what every plan has. Compliance findings moved to block 2 with
  // their plugin; the "failed events last 24h" row counted audit-log errors
  // under a `failed_jobs` key — label, key and window disagreed, and the
  // audit chart below already separates errors.

  const alerts = [
    {
      key: "inactive",
      count: inactiveCount,
      label: "devices not seen in 7 days",
      severity: "warning",
      icon: CloudOffOutlinedIcon,
      navigate: () => onNavigate?.("assets")
    },
    {
      key: "certs",
      count: expiringCount,
      label: "agent certificates expiring <30d",
      severity: "error",
      icon: KeyOffOutlinedIcon,
      navigate: () => onNavigate?.("pki", { tab: "expiring" })
    },
    {
      key: "failed_installs",
      count: failedInstalls,
      label: "software installs failed · 30d",
      severity: "warning",
      icon: ErrorOutlineOutlinedIcon,
      navigate: () => onNavigate?.("software-delivery")
    },
    {
      key: "outdated",
      count: outdatedCount,
      label: "agents behind latest version",
      severity: "info",
      icon: UpdateOutlinedIcon,
      navigate: () => onNavigate?.("assets")
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
          <CheckCircleOutlineOutlinedIcon sx={{ fontSize: ICON["2xl"], mb: 1 }} />
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
