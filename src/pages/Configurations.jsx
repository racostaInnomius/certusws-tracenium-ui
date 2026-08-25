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
import { Box, Chip, Divider, Stack, Tab, Tabs, Typography } from "@mui/material";
import CircularProgress from "@mui/material/CircularProgress";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import { getSearchParam, updateSearchParams } from "../utils/browserState";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { listLocationSites } from "../api/locationSites";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";

import { httpGetJson } from "../api/http";
import { getRetentionStats } from "../api/retention";
import { listTenantRoles } from "../api/roles";
import { useCachedFetch } from "../hooks/useCachedFetch";
import { fetchMyPartner } from "../msp/mspApi";
import JoinPartnerDialog from "../msp/JoinPartnerDialog";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { useAuthContext } from "../auth/AuthContext";
import { BRAND, TEXT } from "../theme/brand";

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
              fontSize: TEXT.sm,
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
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
              {valueHint}
            </Typography>
          ) : null}
        </Box>
        <ArrowForwardOutlinedIcon
          sx={{
            color: BRAND.gray,
            fontSize: TEXT.xl,
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
        fontSize: TEXT.xs,
      }}
    />
  );
}

// Agent Settings is a large page (schedules, feature gates, device
// overrides, rollout table). Lazy so opening Settings doesn't pay for
// it until the operator actually switches to that tab.
const AgentSettings = React.lazy(() => import("./AgentSettings"));

// Deep-linkable via ?settingsTab=. Same pattern PKI uses for its tabs.
const SETTINGS_TABS = ["tenant", "agent"];

export default function Configurations({ onNavigate, initialTab }) {
  const { auth } = useAuthContext();
  const tenantId = auth?.tenantId;
  // Seeded once from the prop (set by the `agent-settings` / `policies`
  // route aliases) or the URL, then kept in the URL so a reload and the
  // back button both land on the same division.
  const [tab, setTab] = React.useState(() => {
    const fromUrl = getSearchParam("settingsTab", "");
    if (SETTINGS_TABS.includes(initialTab)) return initialTab;
    return SETTINGS_TABS.includes(fromUrl) ? fromUrl : "tenant";
  });

  React.useEffect(() => {
    updateSearchParams({ settingsTab: tab });
  }, [tab]);

  // Note: `tokensSummary` was removed when the Tokens card moved to
  // Device Enrollment. The /api/v1/configurations/summary endpoint
  // still returns `tokens_summary`; we just don't render it here.
  //
  // Use stale-while-revalidate cache here so Settings paints from the
  // last known snapshot immediately, then refreshes quietly when stale.
  // Retention is admin-scoped and may 401 for non-admin viewers — we
  // preserve the previous behavior by swallowing that call only, while
  // still surfacing failures from the primary configurations summary.
  const {
    data: settingsSnapshot,
    loading,
    error: settingsError,
  } = useCachedFetch(
    "settings:configurations:v1",
    async () => {
      const [summary, retention] = await Promise.all([
        httpGetJson("/api/v1/configurations/summary"),
        getRetentionStats().catch(() => null),
      ]);

      return {
        tenantMembersSummary: summary?.tenant_members_summary ?? null,
        retentionStats: retention ?? null,
      };
    },
    {
      staleMs: 60_000,
      storageMaxAgeMs: 10 * 60_000,
      revalidateOnMount: "stale",
    }
  );

  const tenantMembersSummary = settingsSnapshot?.tenantMembersSummary ?? null;
  const retentionStats = settingsSnapshot?.retentionStats ?? null;

  // How many ranges are mapped, for the Location sites card. Read on its own
  // and fail-open: a tenant with no mappings (the common case at first) must
  // still see the card, because zero is exactly the state the card exists to
  // get an operator out of.
  const [locationSiteCount, setLocationSiteCount] = React.useState(null);
  const [locationSitesLoading, setLocationSitesLoading] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    listLocationSites()
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data) ? data : data?.items ?? [];
        setLocationSiteCount(items.length);
      })
      .catch(() => {
        if (!cancelled) setLocationSiteCount(null);
      })
      .finally(() => {
        if (!cancelled) setLocationSitesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Custom (non-built-in) role count, for the Roles card. Same fail-open
  // shape as location sites — a tenant with zero custom roles (the
  // common case before any admin has used this yet) must still see the
  // card, and a read error shouldn't hide the entry point to fix it.
  const [customRoleCount, setCustomRoleCount] = React.useState(null);
  const [rolesCountLoading, setRolesCountLoading] = React.useState(true);
  React.useEffect(() => {
    if (!tenantId) {
      setRolesCountLoading(false);
      return;
    }
    let cancelled = false;
    listTenantRoles(tenantId)
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setCustomRoleCount(items.filter((r) => !r.isSystem).length);
      })
      .catch(() => {
        if (!cancelled) setCustomRoleCount(null);
      })
      .finally(() => {
        if (!cancelled) setRolesCountLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  // Per-tenant session security (auto-logout) read separately. Doesn't
  // need stale-while-revalidate because the value is tiny + cached on
  // the server. Fail-open: render the card with N/A if the read errors,
  // but still let the user click through to fix the underlying config.
  const {
    data: sessionSettingsSnapshot,
    loading: sessionSettingsLoading,
  } = useCachedFetch(
    "settings:session-settings:v1",
    async () => httpGetJson("/api/v1/session-settings"),
    {
      staleMs: 60_000,
      storageMaxAgeMs: 5 * 60_000,
      revalidateOnMount: "stale",
    }
  );
  const sessionSettingsView = sessionSettingsSnapshot?.settings ?? null;
  const sessionAutoLogoutEnabled =
    sessionSettingsView?.effective?.autoLogoutEnabled ?? true;
  const sessionAutoLogoutMinutes =
    sessionSettingsView?.effective?.autoLogoutMinutes ?? null;
  const error = settingsError ? "Failed to load configurations summary" : "";

  // Partner (MSP) status — only relevant for a client tenant. Drives the
  // "Join a partner" card + its redeem dialog (self-service client-attach).
  const [partner, setPartner] = React.useState(null);
  const [joinOpen, setJoinOpen] = React.useState(false);
  const loadPartner = React.useCallback(async () => {
    try {
      const resp = await fetchMyPartner();
      setPartner(resp?.status ?? null);
    } catch {
      setPartner(null);
    }
  }, []);
  React.useEffect(() => { loadPartner(); }, [loadPartner]);
  const showPartnerCard = partner?.tenantType === "client";

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
        subtitle="Tenant administration and agent behaviour, in one place."
        icon={<SettingsOutlinedIcon />}
      />

      {/* Two divisions. Both are tenant-scoped configuration, which is
          why they were consolidated: "Agent Settings" used to be its own
          sidebar entry, and operators had to know that plugin cadence
          lived somewhere other than the rest of the tenant's setup. */}
      <Tabs
        value={tab}
        onChange={(_e, next) => setTab(next)}
        sx={{
          mb: 2,
          borderBottom: `1px solid ${BRAND.border}`,
          "& .MuiTab-root": {
            textTransform: "none",
            fontWeight: 700,
            color: BRAND.dark,
            minHeight: 48,
            outline: "none",
            "&:focus": { outline: "none" },
          },
          "& .Mui-selected": { color: `${BRAND.teal} !important` },
          "& .MuiTabs-indicator": { backgroundColor: BRAND.teal, height: 3 },
        }}
      >
        <Tab
          value="tenant"
          label="Tenant Settings"
          icon={<SettingsOutlinedIcon fontSize="small" />}
          iconPosition="start"
          sx={{ gap: 0.75 }}
        />
        <Tab
          value="agent"
          label="Agent Settings"
          icon={<TuneOutlinedIcon fontSize="small" />}
          iconPosition="start"
          sx={{ gap: 0.75 }}
        />
      </Tabs>

      {tab === "agent" ? (
        <React.Suspense
          fallback={
            <Box sx={{ display: "grid", placeItems: "center", minHeight: 240 }}>
              <CircularProgress size={26} sx={{ color: BRAND.teal }} />
            </Box>
          }
        >
          <AgentSettings embedded />
        </React.Suspense>
      ) : (
        <>

      {error ? (
        <Typography sx={{ color: BRAND.alert.error, mb: 2 }}>
          {error}
        </Typography>
      ) : null}

      {/* The "Tokens" card was removed in favor of the new Device
          Enrollment page (top-level sidebar entry), which combines
          token generation with agent installer downloads — the two
          things needed to onboard a device. Settings now hosts only
          tenant and member admin surfaces.

          The "Tenants" card (cross-tenant admin_master data) was
          relocated out of here — it doesn't belong on a per-tenant
          Settings page and was visible to any viewer regardless of
          role. It now lives as the "Manage Tenants" button on the
          vendor-only "All tenants" Portfolio view, which is already
          admin_master-gated (see src/msp/Portfolio.jsx). */}
      <Grid container spacing={2} alignItems="stretch">
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

        {/* Roles & Permissions (ADR-0011) — create custom roles beyond
            the 3 built-ins, with a per-capability permission matrix.
            Same "always rendered, inner page gates the write actions"
            posture as Session security below: any member can see the
            count, only OWNER/ADMIN can open it and change anything. */}
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <SettingsCard
            title="Roles & permissions"
            valueHint={
              customRoleCount ? "Custom roles configured" : "Only the built-in roles so far"
            }
            value={customRoleCount === null ? "—" : String(customRoleCount)}
            icon={<AdminPanelSettingsOutlinedIcon />}
            loading={rolesCountLoading}
            onClick={() => onNavigate?.("roles")}
            footer={
              <StatChip
                label="Custom roles"
                count={customRoleCount ?? 0}
                variant={customRoleCount ? "success" : "neutral"}
                loading={rolesCountLoading}
              />
            }
          />
        </Grid>

        {/* Session security — auto-logout toggle + idle minutes.
            Always rendered for any authenticated tenant member, but the
            inner page gates the Save action to OWNER/ADMIN role. */}
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <SettingsCard
            title="Session security"
            valueHint={
              sessionAutoLogoutEnabled
                ? "Auto-logout on inactivity"
                : "Auto-logout disabled"
            }
            value={
              sessionAutoLogoutEnabled && sessionAutoLogoutMinutes
                ? `${sessionAutoLogoutMinutes} min`
                : sessionAutoLogoutEnabled
                  ? "—"
                  : "Off"
            }
            icon={<TimerOutlinedIcon />}
            accent={sessionAutoLogoutEnabled ? BRAND.teal : BRAND.alert.warning}
            tint={sessionAutoLogoutEnabled ? BRAND.tealSoft : BRAND.alert.warningSoft}
            loading={sessionSettingsLoading}
            onClick={() => onNavigate?.("session-settings")}
            footer={
              <StatChip
                label={sessionAutoLogoutEnabled ? "Enabled" : "Disabled"}
                count=""
                variant={sessionAutoLogoutEnabled ? "success" : "warning"}
                loading={sessionSettingsLoading}
              />
            }
          />
        </Grid>

        {/* Location sites — the CIDR → site map. The page existed and its route
            was registered, but nothing linked to it, so it was reachable only
            by typing ?page=location-sites. Always shown: with no mappings the
            device drawer falls back to a raw subnet, and this card is how an
            operator discovers there is something better. */}
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <SettingsCard
            title="Location sites"
            valueHint="Name your network ranges so devices show a site and a city instead of a raw subnet"
            value={locationSiteCount === null ? "—" : String(locationSiteCount)}
            icon={<PlaceOutlinedIcon />}
            accent={BRAND.teal}
            tint={BRAND.tealSoft}
            loading={locationSitesLoading}
            onClick={() => onNavigate?.("location-sites")}
            footer={
              <StatChip
                label="Ranges mapped"
                count={locationSiteCount ?? 0}
                variant={locationSiteCount ? "success" : "neutral"}
                loading={locationSitesLoading}
              />
            }
          />
        </Grid>

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

        {/* Join a partner — self-service client-attach. Only for client
            tenants; shows current partner or opens the redeem dialog. */}
        {showPartnerCard ? (
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <SettingsCard
              title="Partner (MSP)"
              valueHint={partner?.managed ? "Managed · click for details" : "Click to join with a code"}
              value={partner?.managed ? (partner.msp?.name || "Managed") : "Independent"}
              icon={<HandshakeOutlinedIcon />}
              accent={partner?.managed ? BRAND.teal : BRAND.alert.warning}
              tint={partner?.managed ? BRAND.tealSoft : BRAND.alert.warningSoft}
              onClick={() => setJoinOpen(true)}
              footer={
                <StatChip
                  label={partner?.managed ? "Linked" : "Not linked"}
                  count=""
                  variant={partner?.managed ? "success" : "warning"}
                />
              }
            />
          </Grid>
        ) : null}
      </Grid>
        </>
      )}

      <JoinPartnerDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={loadPartner}
      />
    </Box>
  );
}
