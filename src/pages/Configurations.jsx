// src/pages/Configurations.jsx
//
// Settings landing page (sidebar: "Settings"). Three clickable cards
// that drill into the admin-only areas: Tokens, Tenants, and Tenant
// Members.
//
// Fase 4 homologation — this was the last page still using the old
// Configurations palette: gradient banner header (dark → teal), 52px
// numbers, `translateY(-2px)` lift on hover, and a hardcoded yellow
// "Expired" chip (`rgba(251,239,4,0.39)` / `#b3ac1eff`). Everything
// has moved to the shared primitives:
//
//   * <PageHeader> → h4/800 BRAND.dark with subtitle (matches every
//     other page in the app).
//   * <SectionPaper variant="panel" hoverable onClick> → clickable
//     card with the canonical brand hover (border-teal + soft
//     shadow), no `translateY` lift.
//   * <SummaryCard>-style internal layout: icon box on the left, title
//     caps + big value on the right. Since these cards carry extra
//     footer chips we still render the body inline rather than
//     pulling the shared component — the contract is similar enough
//     to read as a family but roomy enough to host the chip row.
//   * Chip colors come from BRAND.alert.* + ROLE.*, no more raw hex.

import * as React from "react";
import Grid from "@mui/material/Grid";
import { Box, Chip, Divider, Stack, Typography } from "@mui/material";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import { httpGetJson } from "../api/http";
import { getRetentionStats } from "../api/retention";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { BRAND } from "../theme/brand";

// Canonical shell for the three Settings cards. Takes an icon box +
// title + big value and an optional `footer` slot for a chip row.
// The card itself is clickable as a whole, showing a subtle
// ArrowForward on the right to hint "this opens another page".
function SettingsCard({
  title,
  value,
  valueHint,
  icon,
  accent = BRAND.teal,
  tint = BRAND.tealSoft,
  loading = false,
  onClick,
  footer = null,
}) {
  return (
    <SectionPaper
      variant="panel"
      onClick={onClick}
      hoverable
      sx={{
        p: { xs: 2, sm: 2.5 },
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 1.5,
            bgcolor: tint,
            color: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 12,
              color: "text.secondary",
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              lineHeight: 1.2,
            }}
          >
            {title}
          </Typography>
          {valueHint ? (
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
              {valueHint}
            </Typography>
          ) : null}
        </Box>
        <ArrowForwardOutlinedIcon
          sx={{
            color: BRAND.gray,
            fontSize: 18,
            flexShrink: 0,
            transition: "color 120ms ease, transform 120ms ease",
          }}
        />
      </Stack>

      <Typography
        sx={{
          fontSize: { xs: 32, sm: 36 },
          fontWeight: 800,
          color: BRAND.dark,
          lineHeight: 1.05,
          mb: footer ? 1.5 : 0,
        }}
      >
        {loading ? "…" : value}
      </Typography>

      {footer ? (
        <>
          <Divider sx={{ borderColor: BRAND.border, mb: 1.5 }} />
          <Box sx={{ mt: "auto", display: "flex", gap: 1, flexWrap: "wrap" }}>
            {footer}
          </Box>
        </>
      ) : null}
    </SectionPaper>
  );
}

// Small helper — render one semantic chip. Keeps the three cards
// below tight because each card has 2-3 of these in a row.
function StatChip({ label, count, variant = "teal", loading }) {
  // Passing count=""/null/undefined renders a label-only chip (e.g.
  // "Paused"), useful for status badges that don't carry a numeric
  // value. Falsy-but-not-zero is the trigger — `count: 0` still
  // renders as "Label: 0" because that IS information.
  const display = loading ? "…" : count;
  const labelText =
    display === "" || display == null ? label : `${label}: ${display}`;
  const styles = {
    teal:    { bg: BRAND.tealSoft,           fg: BRAND.tealText        },
    success: { bg: BRAND.alert.successSoft,  fg: BRAND.alert.success   },
    warning: { bg: BRAND.alert.warningSoft,  fg: BRAND.alert.warning   },
    error:   { bg: BRAND.alert.errorSoft,    fg: BRAND.alert.error     },
    neutral: { bg: BRAND.darkSoft,           fg: BRAND.dark            },
  };
  const s = styles[variant] || styles.teal;
  return (
    <Chip
      label={labelText}
      size="small"
      sx={{
        bgcolor: s.bg,
        color: s.fg,
        fontWeight: 700,
        fontSize: 11,
      }}
    />
  );
}

export default function Configurations({ onNavigate }) {
  // Note: `tokensSummary` was removed when the Tokens card moved to
  // Device Enrollment. The /api/v1/configurations/summary endpoint
  // still returns `tokens_summary`; we just don't render it here.
  const [tenantsSummary, setTenantsSummary] = React.useState(null);
  const [tenantMembersSummary, setTenantMembersSummary] = React.useState(null);
  const [retentionStats, setRetentionStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        // Two independent calls in parallel. Retention is admin-scoped
        // and may 401 for non-admin viewers — we swallow that quietly
        // so the rest of the page still renders. The other call (config
        // summary) is the page's primary content; if it fails we show
        // an error.
        const [summary, retention] = await Promise.all([
          httpGetJson("/api/v1/configurations/summary"),
          getRetentionStats().catch(() => null),
        ]);
        if (!alive) return;
        setTenantsSummary(summary?.tenants_summary ?? null);
        setTenantMembersSummary(summary?.tenant_members_summary ?? null);
        setRetentionStats(retention ?? null);
      } catch (e) {
        console.error("Configurations summary fetch failed:", e);
        if (!alive) return;
        setError("Failed to load configurations summary");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const tenantsTotal     = tenantsSummary?.tenantsCount      ?? 0;

  const membersTotal     = tenantMembersSummary?.membersCount         ?? 0;
  const membersActive    = tenantMembersSummary?.activeMembersCount   ?? 0;
  const membersInactive  =
    tenantMembersSummary?.inactiveMembersCount
    ?? Math.max(membersTotal - membersActive, 0);

  // Retention card values. Sum bytes across the per-table breakdown
  // — that's the headline "how much data does this tenant carry"
  // number operators care about. Last-run date is the second piece
  // of context (paused? ran today?) and lives in the footer chips.
  const retentionPolicy = retentionStats?.policy ?? null;
  const retentionSizes  = retentionStats?.sizes ?? null;
  const retentionEnabled = !!retentionPolicy?.enabled;
  const retentionTotalBytes = React.useMemo(
    () =>
      (retentionSizes?.perTable ?? []).reduce(
        (acc, r) => acc + (Number.isFinite(r.sizeBytes) ? r.sizeBytes : 0),
        0
      ),
    [retentionSizes]
  );
  const retentionLastRunLabel = (() => {
    const iso = retentionPolicy?.lastRunAtUtc;
    if (!iso) return "never";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "never";
    const hoursAgo = Math.max(0, Math.floor((Date.now() - t) / 3_600_000));
    if (hoursAgo < 1) return "<1h ago";
    if (hoursAgo < 24) return `${hoursAgo}h ago`;
    const days = Math.floor(hoursAgo / 24);
    return `${days}d ago`;
  })();
  function formatBytesShort(n) {
    if (!Number.isFinite(n) || n < 0) return "—";
    if (n < 1024) return `${n}B`;
    const units = ["KB", "MB", "GB", "TB"];
    let v = n / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toFixed(v >= 100 ? 0 : 1)}${units[i]}`;
  }

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Settings"
        subtitle="Administrative surfaces for tenants and members."
        icon={<SettingsOutlinedIcon />}
      />

      {error ? (
        <Typography sx={{ color: BRAND.alert.error, mb: 2 }}>
          {error}
        </Typography>
      ) : null}

      {/* The "Tokens" card was removed in favor of the new Device
          Enrollment page (top-level sidebar entry), which combines
          token generation with agent installer downloads — the two
          things needed to onboard a device. Settings now hosts only
          tenant and member admin surfaces. */}
      <Grid container spacing={2} alignItems="stretch">
        {tenantsSummary ? (
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <SettingsCard
              title="Tenants"
              valueHint="Tenant records · click to manage"
              value={tenantsTotal}
              icon={<BusinessOutlinedIcon />}
              loading={loading}
              onClick={() => onNavigate?.("tenants")}
            />
          </Grid>
        ) : null}

        {tenantMembersSummary ? (
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <SettingsCard
              title="Tenant members"
              valueHint="Members across all tenants"
              value={membersTotal}
              icon={<GroupOutlinedIcon />}
              loading={loading}
              onClick={() => onNavigate?.("tenant-members")}
              footer={
                <>
                  <StatChip
                    label="Active"
                    count={membersActive}
                    variant="success"
                    loading={loading}
                  />
                  <StatChip
                    label="Inactive"
                    count={membersInactive}
                    variant="neutral"
                    loading={loading}
                  />
                </>
              }
            />
          </Grid>
        ) : null}

        {/* Retention card — admin only. The retentionStats fetch quietly
            returns null for non-admin viewers (401), so the card simply
            doesn't render. Click → full retention page. */}
        {retentionStats ? (
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <SettingsCard
              title="Database retention"
              valueHint={
                retentionEnabled
                  ? `Cleanup enabled · last run ${retentionLastRunLabel}`
                  : "Cleanup paused"
              }
              value={formatBytesShort(retentionTotalBytes)}
              icon={<StorageOutlinedIcon />}
              accent={retentionEnabled ? BRAND.teal : BRAND.alert.warning}
              tint={retentionEnabled ? BRAND.tealSoft : BRAND.alert.warningSoft}
              loading={loading}
              onClick={() => onNavigate?.("retention")}
              footer={
                <>
                  <StatChip
                    label={retentionEnabled ? "Enabled" : "Paused"}
                    count=""
                    variant={retentionEnabled ? "success" : "warning"}
                    loading={loading}
                  />
                  <StatChip
                    label="Tables tracked"
                    count={retentionSizes?.perTable?.length ?? 0}
                    variant="neutral"
                    loading={loading}
                  />
                </>
              }
            />
          </Grid>
        ) : null}
      </Grid>
    </Box>
  );
}
