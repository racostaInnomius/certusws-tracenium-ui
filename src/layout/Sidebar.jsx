import * as React from "react";
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Button,
  Chip,
  Divider,
  Typography,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useAuthContext } from "../auth/AuthContext";
import { performLogout } from "../auth/logout";
import { useMsp } from "../msp/MspContext";

import LogoutIcon from "@mui/icons-material/Logout";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import GppGoodOutlinedIcon from "@mui/icons-material/GppGoodOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import PhonelinkSetupOutlinedIcon from "@mui/icons-material/PhonelinkSetupOutlined";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import InstallDesktopOutlinedIcon from "@mui/icons-material/InstallDesktopOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import WorkspacePremiumOutlinedIcon from "@mui/icons-material/WorkspacePremiumOutlined";

import { TOPBAR_HEIGHT, CHROME_LINE_WIDTH } from "./Topbar";

import { BRAND } from "../theme/brand";
import { getTenantById } from "../api/tenants";

export const SIDEBAR_WIDTH = 210;

function firstNonEmptyText(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "active"].includes(text)) return true;
  if (["false", "0", "no", "n", "inactive", "disabled"].includes(text)) return false;

  return fallback;
}

function firstObject(...values) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return null;
}

function getTenantMemberFromAuth(auth) {
  return firstObject(
    auth?.tenantMember,
    auth?.tenant_member,
    auth?.user?.tenantMember,
    auth?.user?.tenant_member,
    auth?.bootstrap?.tenantMember,
    auth?.bootstrap?.tenant_member,
    auth?.bootstrap?.user?.tenantMember,
    auth?.bootstrap?.user?.tenant_member
  );
}

function getTenantMemberRoleFromAuth(auth) {
  const member = getTenantMemberFromAuth(auth);
  return firstNonEmptyText(
    member?.role,
    member?.traceniumRole,
    member?.tracenium_role,
    auth?.traceniumRole,
    auth?.tracenium_role,
    auth?.user?.traceniumRole,
    auth?.user?.tracenium_role,
    auth?.bootstrap?.traceniumRole,
    auth?.bootstrap?.tracenium_role,
    auth?.bootstrap?.user?.traceniumRole,
    auth?.bootstrap?.user?.tracenium_role
  ).toUpperCase();
}

function getTenantMemberIsActiveFromAuth(auth) {
  const member = getTenantMemberFromAuth(auth);
  const role = getTenantMemberRoleFromAuth(auth);
  const activeCandidate = firstDefined(
    member?.isActive,
    member?.is_active,
    member?.active,
    member?.enabled,
    auth?.tenantMemberIsActive,
    auth?.tenant_member_is_active,
    auth?.user?.tenantMemberIsActive,
    auth?.user?.tenant_member_is_active,
    auth?.bootstrap?.tenantMemberIsActive,
    auth?.bootstrap?.tenant_member_is_active,
    auth?.bootstrap?.user?.tenantMemberIsActive,
    auth?.bootstrap?.user?.tenant_member_is_active
  );

  return normalizeBoolean(activeCandidate, Boolean(role));
}

function getTenantIdFromAuth(auth) {
  const member = getTenantMemberFromAuth(auth);

  return firstNonEmptyText(
    auth?.tenantId,
    auth?.tenant_id,
    auth?.tenant?.id,
    auth?.currentTenant?.id,
    member?.tenantId,
    member?.tenant_id,
    auth?.bootstrap?.tenantId,
    auth?.bootstrap?.tenant_id,
    auth?.bootstrap?.tenant?.id,
    auth?.bootstrap?.user?.tenantId,
    auth?.bootstrap?.user?.tenant_id
  );
}

function getTenantNameFromAuth(auth) {
  const member = getTenantMemberFromAuth(auth);
  const tenant = firstObject(
    auth?.tenant,
    auth?.currentTenant,
    member?.tenant,
    auth?.bootstrap?.tenant,
    auth?.bootstrap?.currentTenant,
    auth?.bootstrap?.user?.tenant
  ) || {};

  return firstNonEmptyText(
    auth?.tenantName,
    auth?.tenant_name,
    auth?.tenantDisplayName,
    auth?.tenant_display_name,
    auth?.organizationName,
    auth?.orgName,
    tenant?.name,
    tenant?.displayName,
    tenant?.display_name,
    tenant?.externalIdpTenant,
    tenant?.external_idp_tenant,
    auth?.bootstrap?.tenantName,
    auth?.bootstrap?.tenant_name,
    auth?.bootstrap?.tenantDisplayName,
    auth?.bootstrap?.tenant_display_name
  );
}

function looksLikeEmail(value) {
  const text = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function findEmailDeep(value, depth = 0, seen = new Set()) {
  if (depth > 5 || value === null || value === undefined) return "";

  if (typeof value === "string") {
    return looksLikeEmail(value) ? value.trim() : "";
  }

  if (typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);

  const preferredKeys = [
    "email",
    "mail",
    "preferredEmail",
    "preferred_email",
    "preferred_username",
    "upn",
    "userEmail",
    "user_email",
  ];

  for (const key of preferredKeys) {
    const found = findEmailDeep(value?.[key], depth + 1, seen);
    if (found) return found;
  }

  for (const nestedKey of [
    "user",
    "profile",
    "account",
    "claims",
    "idTokenClaims",
    "payload",
    "raw",
    "tenantMember",
    "tenant_member",
    "bootstrap",
    "auth",
    "principal",
  ]) {
    const found = findEmailDeep(value?.[nestedKey], depth + 1, seen);
    if (found) return found;
  }

  // Last-resort compatibility for backend shape changes: scan values, but
  // still require a real email pattern so we don't accidentally render subject
  // IDs, usernames, tenant names, or roles as an email line.
  for (const child of Object.values(value)) {
    const found = findEmailDeep(child, depth + 1, seen);
    if (found) return found;
  }

  return "";
}

function getUserEmailFromAuth(auth) {
  return firstNonEmptyText(
    auth?.email,
    auth?.user?.email,
    auth?.profile?.email,
    auth?.account?.email,
    auth?.tenantMember?.email,
    auth?.tenant_member?.email,
    auth?.payload?.email,
    auth?.raw?.email,
    auth?.bootstrap?.email,
    auth?.bootstrap?.user?.email,
    findEmailDeep(auth)
  );
}

function TenantWorkspaceBadge({ tenantName, tenantId, userEmail }) {
  const safeTenantName = firstNonEmptyText(tenantName);
  const safeTenantId = firstNonEmptyText(tenantId);
  const displayName = safeTenantName || (safeTenantId ? `Tenant ${safeTenantId}` : "");

  if (!displayName) return null;

  const safeUserEmail = firstNonEmptyText(userEmail);
  const caption = safeTenantName && safeTenantId ? `Tenant ${safeTenantId}` : "Current workspace";
  const tooltipTitle = safeUserEmail ? `${displayName} · ${safeUserEmail}` : displayName;

  return (
    <Tooltip title={tooltipTitle} placement="right" arrow>
      <Box
        sx={{
          mb: 0.65,
          px: 1,
          py: safeUserEmail ? 0.82 : 0.72,
          borderRadius: 2,
          border: "1px solid rgba(143,253,255,0.14)",
          background:
            "linear-gradient(135deg, rgba(90,159,159,0.13), rgba(255,255,255,0.035))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.9, minWidth: 0 }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: 1.5,
              display: "grid",
              placeItems: "center",
              bgcolor: "rgba(90,159,159,0.16)",
              color: BRAND.teal,
              flexShrink: 0,
            }}
          >
            <BusinessOutlinedIcon sx={{ fontSize: 16 }} />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: 10,
                lineHeight: 1.1,
                fontWeight: 800,
                letterSpacing: 0.85,
                textTransform: "uppercase",
                color: "rgba(143,253,255,0.58)",
              }}
            >
              Workspace
            </Typography>
            <Typography
              noWrap
              sx={{
                mt: 0.15,
                fontSize: 12.5,
                lineHeight: 1.25,
                fontWeight: 700,
                color: "rgba(255,255,255,0.90)",
                maxWidth: SIDEBAR_WIDTH - 86,
              }}
            >
              {displayName}
            </Typography>
            {safeUserEmail ? (
              <Typography
                noWrap
                sx={{
                  mt: 0.2,
                  fontSize: 10.6,
                  lineHeight: 1.2,
                  fontWeight: 500,
                  color: "rgba(231,233,238,0.62)",
                  maxWidth: SIDEBAR_WIDTH - 86,
                }}
              >
                {safeUserEmail}
              </Typography>
            ) : (
              <Typography
                noWrap
                sx={{
                  mt: 0.2,
                  fontSize: 10.2,
                  lineHeight: 1.15,
                  fontWeight: 500,
                  color: "rgba(231,233,238,0.42)",
                  maxWidth: SIDEBAR_WIDTH - 86,
                }}
              >
                {caption}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Tooltip>
  );
}

function SidebarContent({ items, selected, onSelect, handleLogout, tenantName, tenantId, userEmail }) {
  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        bgcolor: BRAND.dark,
        color: "#e7e9ee",
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        maxHeight: "100dvh",
        minHeight: 0,
        overflow: "hidden",
        boxSizing: "border-box",
        borderRight: "none",
        boxShadow: "none",
      }}
    >
      {/* Header: brand wordmark. Same height and bottom-border as the
          Topbar so the cyan line is continuous across the sidebar and
          the top of the main pane. */}
      <Box
        sx={{
          height: TOPBAR_HEIGHT,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 1,
          borderBottom: `${CHROME_LINE_WIDTH}px solid ${BRAND.accentBrightLine}`,
        }}
      >
        <Box
          component="img"
          src="/tracenium_metallic_fullcolor_v1_256.png"
          alt="Tracenium"
          sx={{
            height: 40,
            width: "auto",
            display: "block",
          }}
        />
      </Box>

      <List
        disablePadding
        sx={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          px: 1.5,
          pt: 1.5,
          pb: 1,
          overscrollBehavior: "contain",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(143,253,255,0.26) transparent",
          "&::-webkit-scrollbar": { width: 7 },
          "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            borderRadius: 999,
            backgroundColor: "rgba(143,253,255,0.22)",
          },
          "&::-webkit-scrollbar-thumb:hover": {
            backgroundColor: "rgba(143,253,255,0.36)",
          },
        }}
      >
        {items.map((it) => {
          // Divider rows: a faint horizontal rule with a small section
          // label above it. Uses the same teal-on-dark family the rest
          // of the sidebar uses (BRAND.cyan at low alpha) so it reads
          // as part of the chrome, not a heavy separator. The label is
          // optional — if absent, render only the line.
          if (it.type === "divider") {
            return (
              <Box key={it.key} sx={{ mt: 1.5, mb: 0.75, px: 1.1 }}>
                {it.label ? (
                  <Typography
                    component="div"
                    sx={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "rgba(90,159,159,0.72)",
                      mb: 0.5,
                    }}
                  >
                    {it.label}
                  </Typography>
                ) : null}
                <Divider
                  sx={{
                    borderColor: "rgba(90,159,159,0.28)",
                  }}
                />
              </Box>
            );
          }

          const isSelected = selected === it.key;
          return (
            <ListItemButton
              key={it.key}
              selected={isSelected}
              onClick={() => onSelect?.(it.key)}
              sx={{
                borderRadius: 2,
                mb: 0.25,
                py: 0.6,
                px: 1.1,
                minHeight: 36,
                color: "#e7e9ee",
                transition: "background-color 0.12s ease, color 0.12s ease",
                ...(it.highlighted && {
                  bgcolor: BRAND.tealSoft,
                  border: `1px solid ${BRAND.tealSoftStrong}`,
                  "&:hover": { bgcolor: BRAND.tealSoftStrong },
                }),
                "&:hover": {
                  bgcolor: "rgba(90,159,159,0.16)",
                  color: "#ffffff",
                },
                "&.Mui-selected": {
                  bgcolor: "rgba(90,159,159,0.28)",
                  color: "#ffffff",
                  "& .MuiListItemIcon-root": { color: BRAND.teal },
                },
                "&.Mui-selected:hover": {
                  bgcolor: "rgba(90,159,159,0.36)",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 32,
                  color: isSelected ? BRAND.teal : "#b9bec8",
                  "& svg": { fontSize: 20 },
                }}
              >
                {it.icon}
              </ListItemIcon>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <ListItemText
                  primary={it.label}
                  slotProps={{
                    primary: {
                      noWrap: true,
                      sx: {
                        fontSize: 13.5,
                        fontWeight: isSelected ? 700 : 500,
                        lineHeight: 1.2,
                        letterSpacing: 0.2,
                      },
                    },
                  }}
                />
              </Box>
              {it.highlighted && (
                <Chip
                  label="Start"
                  size="small"
                  sx={{
                    ml: 0.5,
                    height: 20,
                    flexShrink: 0,
                    bgcolor: BRAND.teal,
                    color: BRAND.dark,
                    fontWeight: 800,
                    fontSize: 10,
                  }}
                />
              )}
              {/* Beta badge — flags product areas that are functionally
                  live but still stabilizing (early plugin coverage,
                  UX still settling). Distinct cyan outline (not the
                  solid teal "Start" chip) so it reads as an FYI, not
                  a call to action. */}
              {it.badge && (
                <Chip
                  label={it.badge}
                  size="small"
                  sx={{
                    ml: 0.5,
                    height: 18,
                    flexShrink: 0,
                    bgcolor: "rgba(143,253,255,0.14)",
                    color: BRAND.cyan,
                    border: "1px solid rgba(143,253,255,0.4)",
                    fontWeight: 800,
                    fontSize: 9.5,
                    letterSpacing: 0.3,
                    "& .MuiChip-label": { px: 0.7 },
                  }}
                />
              )}
            </ListItemButton>
          );
        })}
      </List>

      <Box
        sx={{
          flexShrink: 0,
          px: 1.5,
          pb: "max(12px, env(safe-area-inset-bottom))",
          pt: 1,
          borderTop: "1px solid rgba(90,159,159,0.18)",
          background:
            "linear-gradient(180deg, rgba(59,64,77,0.92), rgba(59,64,77,1))",
        }}
      >
        <TenantWorkspaceBadge tenantName={tenantName} tenantId={tenantId} userEmail={userEmail} />

        <Button
          onClick={handleLogout}
          startIcon={<LogoutIcon />}
          fullWidth
          sx={{
            textTransform: "none",
            fontWeight: 600,
            justifyContent: "flex-start",
            color: BRAND.gray,
            px: 1.1,
            py: 0.75,
            borderRadius: 2,
            "&:hover": {
              bgcolor: "rgba(90,159,159,0.16)",
              color: "#ffffff",
            },
          }}
        >
          Logout
        </Button>
      </Box>
    </Box>
  );
}

export default function Sidebar({
  selected,
  onSelect,
  showWelcomeEntry = false,
  mobileOpen = false,
  onMobileClose,
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  const { auth } = useAuthContext();
  // When an MSP operator / vendor has drilled into a client (active tenant
  // set), the workspace badge must reflect THAT client — not the token's
  // home tenant. The Sidebar only renders inside the client shell, so when
  // activeTenant is set it is the tenant being viewed.
  const { activeTenant } = useMsp();

  const authTenantId = React.useMemo(() => getTenantIdFromAuth(auth), [auth]);
  const authTenantName = React.useMemo(() => getTenantNameFromAuth(auth), [auth]);
  const authUserEmail = React.useMemo(() => getUserEmailFromAuth(auth), [auth]);
  const [resolvedTenantName, setResolvedTenantName] = React.useState("");

  React.useEffect(() => {
    let alive = true;

    if (authTenantName || !authTenantId) {
      setResolvedTenantName("");
      return () => {
        alive = false;
      };
    }

    getTenantById(authTenantId)
      .then((tenant) => {
        if (!alive) return;
        setResolvedTenantName(
          firstNonEmptyText(
            tenant?.name,
            tenant?.displayName,
            tenant?.display_name,
            tenant?.externalIdpTenant,
            tenant?.external_idp_tenant
          )
        );
      })
      .catch(() => {
        if (!alive) return;
        setResolvedTenantName("");
      });

    return () => {
      alive = false;
    };
  }, [authTenantId, authTenantName]);

  // Active tenant (MSP drill-in) wins over the token's home tenant for the
  // workspace badge, so the name + id shown match the tenant actually open.
  const tenantDisplayName =
    (activeTenant?.name ?? "") || authTenantName || resolvedTenantName || "";
  const effectiveTenantId = activeTenant?.id ?? authTenantId;

  const tenantMemberRole = getTenantMemberRoleFromAuth(auth);
  const tenantMemberIsActive = getTenantMemberIsActiveFromAuth(auth);
  const isPrivileged =
    tenantMemberIsActive === true &&
    (tenantMemberRole === "OWNER" || tenantMemberRole === "ADMIN");

  // Items render top-to-bottom in the sidebar. The list is split into
  // two functional groups separated by a divider:
  //
  //   1. Operational pages — what an operator monitors day-to-day
  //      (fleet state, posture, jobs, alerts).
  //   2. Administration pages — surfaces a privileged user touches
  //      occasionally (enrolling new devices, managing certificates,
  //      tenant settings). Pushing them below the divider keeps the
  //      ops-focused list short and signals that they're configuration
  //      surfaces, not daily-driver pages.
  //
  // Items use a tagged-union shape: regular nav items have
  // `{label, key, icon, highlighted?}`; the separator is
  // `{type: "divider"}`. The render loop in <SidebarContent /> picks
  // the right component per type. We place the divider only when the
  // admin group has at least one entry (i.e. when the user is
  // privileged) so non-privileged users don't see a trailing line
  // with nothing under it.
  const items = [
    ...(showWelcomeEntry
      ? [{ label: "Welcome", key: "welcome", icon: <RocketLaunchOutlinedIcon />, highlighted: true }]
      : []),
    { label: "Overview", key: "overview", icon: <DashboardOutlinedIcon /> },
    { label: "Asset Management", key: "assets", icon: <ComputerOutlinedIcon /> },
    { label: "Security Compliance", key: "ad", icon: <GppGoodOutlinedIcon /> },
    // Crypto Discovery (CDP) — cert inventory ON the devices. Sits next
    // to Security Compliance because both are posture-monitoring
    // surfaces (distinct from PKI in Administration, which is the
    // agent's own mTLS identity certs).
    { label: "Crypto Discovery", key: "cdp", icon: <WorkspacePremiumOutlinedIcon />, badge: "Beta" },
    { label: "Patch Management", key: "patch", icon: <SystemUpdateAltOutlinedIcon /> },
    // Software Delivery (SDP) — Phase 1. Sits next to Patch Management
    // because they're conceptually adjacent ("the fleet runs these
    // bits") and admins often jump between them.
    { label: "Software Delivery", key: "software-delivery", icon: <CloudDownloadOutlinedIcon /> },
    { label: "Remote Control", key: "remote-control", icon: <DesktopWindowsOutlinedIcon />, badge: "Beta" },

    // Device Management (MDM/MAM) sits with the operational surfaces,
    // not under Administration: it's a product area in its own right
    // (first-party MDM lands here), not a configuration knob.
    ...(isPrivileged
      ? [{ label: "Device Management", key: "device-management", icon: <PhonelinkSetupOutlinedIcon />, badge: "Beta" }]
      : []),
    ...(isPrivileged
      ? [{ label: "Jobs", key: "jobs", icon: <AssignmentOutlinedIcon /> }]
      : []),

    // Security Baselines = the desired endpoint state + remediation
    // mode. Deliberately adjacent to Security Compliance (`ad`), which
    // shows the evidence of that state.
    ...(isPrivileged
      ? [{ label: "Security Baselines", key: "security-baselines", icon: <ShieldOutlinedIcon /> }]
      : []),
    ...(isPrivileged
      ? [{ label: "Audit", key: "audit", icon: <FactCheckOutlinedIcon /> }]
      : []),
    { label: "Alerts", key: "alerts", icon: <NotificationsOutlinedIcon /> },

    // ── Administration group ───────────────────────────────
    ...(isPrivileged
      ? [
          { type: "divider", key: "divider-admin", label: "Administration" },
          { label: "Device Enrollment", key: "enrollment", icon: <InstallDesktopOutlinedIcon /> },
          { label: "PKI", key: "pki", icon: <VpnKeyOutlinedIcon /> },
          // Plugin Control — tenant-wide enable/disable for plugins.
          // Inserted between PKI and Settings as agreed; visually
          // groups with the other admin surfaces.
          { label: "Plugin Control", key: "plugin-control", icon: <ExtensionOutlinedIcon /> },
          // Agent Settings is NOT a separate entry: it's the second
          // division inside Settings (?settingsTab=agent). Both are
          // tenant-scoped configuration, and splitting them meant
          // operators had to know that plugin cadence lived somewhere
          // other than the rest of the tenant's setup.
          { label: "Settings", key: "configurations", icon: <SettingsOutlinedIcon /> },
        ]
      : []),
  ];

  const handleLogout = performLogout;

  if (isDesktop) {
    // Permanent sidebar for md+ viewports (≥ 900px). Includes iPad landscape.
    return (
      <Box sx={{ flexShrink: 0 }}>
        <SidebarContent
          items={items}
          selected={selected}
          onSelect={onSelect}
          handleLogout={handleLogout}
          tenantName={tenantDisplayName}
          tenantId={effectiveTenantId}
          userEmail={authUserEmail}
        />
      </Box>
    );
  }

  // Temporary drawer for xs/sm (< 900px). Includes phones and iPad portrait.
  return (
    <Drawer
      variant="temporary"
      open={mobileOpen}
      onClose={onMobileClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        "& .MuiDrawer-paper": {
          width: SIDEBAR_WIDTH,
          boxSizing: "border-box",
          height: "100dvh",
          maxHeight: "100dvh",
          bgcolor: BRAND.dark,
          border: "none",
          overflow: "hidden",
        },
      }}
    >
      <SidebarContent
        items={items}
        selected={selected}
        onSelect={onSelect}
        handleLogout={handleLogout}
        tenantName={tenantDisplayName}
        tenantId={effectiveTenantId}
        userEmail={authUserEmail}
      />
    </Drawer>
  );
}
