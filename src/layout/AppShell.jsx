import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import Sidebar from "./Sidebar";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import InstallDesktopOutlinedIcon from "@mui/icons-material/InstallDesktopOutlined";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import Topbar from "./Topbar";
import { AUTH_REQUIRED_EVENT, TEMPORARY_ERROR_EVENT, clearApiCache, getLoginUrl, httpGetJson, isAuthError, isTemporaryApiError } from "../api/http";
import { clearCachedFetch } from "../hooks/useCachedFetch";
import { getSearchParam, updateSearchParams } from "../utils/browserState";
import { BRAND } from "../theme/brand";

const Assets = React.lazy(() => import("../pages/Assets"));
const Overview = React.lazy(() => import("../pages/Overview"));
const Configurations = React.lazy(() => import("../pages/Configurations"));
const TokensAdministrator = React.lazy(() => import("../pages/TokensAdministrator"));
const TenantsAdministrator = React.lazy(() => import("../pages/TenantsAdministrator"));
const Welcome = React.lazy(() => import("../pages/Welcome"));
const AgentReleases = React.lazy(() => import("../pages/AgentReleases"));
const SoftwareDelivery = React.lazy(() => import("../pages/SoftwareDelivery"));
const DeviceEnrollment = React.lazy(() => import("../pages/DeviceEnrollment"));
const PluginControl = React.lazy(() => import("../pages/PluginControl"));
const Jobs = React.lazy(() => import("../pages/Jobs"));
const Policies = React.lazy(() => import("../pages/Policies"));
const Audit = React.lazy(() => import("../pages/Audit"));
const PKI = React.lazy(() => import("../pages/PKI"));
const SecurityCompliance = React.lazy(() => import("../pages/SecurityCompliance"));
const PatchManagement = React.lazy(() => import("../pages/PatchManagement"));
const Alerts = React.lazy(() => import("../pages/Alerts"));
const RemoteControl = React.lazy(() => import("../pages/RemoteControl"));
const Retention = React.lazy(() => import("../pages/Retention"));

function PageFallback() {
  return (
    <Box
      sx={{
        minHeight: 320,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress sx={{ color: "#5A9F9F" }} />
    </Box>
  );
}

const USER_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const USER_IDLE_COUNTDOWN_SECONDS = 15;
const USER_ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "pointerdown",
];

const EMPTY_TENANT_GATED_PAGES = new Set([
  "overview",
  "assets",
  "ad",
  "patch",
  "software-delivery",
  "remote-control",
  "jobs",
  "policies",
  "audit",
  "alerts",
  "pki",
  "plugin-control",
]);

function readNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getSummaryInventoryCount(summary) {
  if (!summary || typeof summary !== "object") return 0;

  return readNumber(
    summary.devices,
    summary.totalDevices,
    summary.total_devices,
    summary.enrolledDevices,
    summary.enrolled_devices,
    summary.activeHosts,
    summary.active_hosts,
    summary.totalHosts,
    summary.total_hosts,
    summary.hosts,
    summary.reportingDevices,
    summary.reporting_devices,
    summary?.kpis?.devices,
    summary?.kpis?.totalDevices,
    summary?.inventory?.devices,
    summary?.inventory?.totalDevices
  );
}

function normalizeHostsTotal(payload) {
  if (Array.isArray(payload)) return payload.length;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return readNumber(payload?.total, payload?.totalItems, payload?.count, items.length);
}

function NoInformationOverlay({ onNavigate }) {
  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        pt: { xs: "24vh", sm: "22vh", md: "20vh" },
        px: 2,
        bgcolor: "rgba(15, 23, 42, 0.18)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <Fade in timeout={{ enter: 320, exit: 200 }}>
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 560,
            px: { xs: 3, sm: 4 },
            py: { xs: 3, sm: 4 },
            borderRadius: 3,
            textAlign: "center",
            border: `1px solid ${BRAND.border}`,
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(240,252,251,0.96) 100%)",
            boxShadow: "0 18px 45px rgba(59,64,77,0.20)",
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
            <Box
              sx={{
                width: 58,
                height: 58,
                borderRadius: 3,
                display: "grid",
                placeItems: "center",
                bgcolor: BRAND.tealSoft,
                color: BRAND.tealText,
                border: `1px solid ${BRAND.tealSoftStrong}`,
              }}
            >
              <Inventory2OutlinedIcon sx={{ fontSize: 34 }} />
            </Box>
          </Box>

          <Typography
            variant="h6"
            sx={{ fontWeight: 800, color: BRAND.dark, mb: 1.25 }}
          >
            No information is available yet.
          </Typography>

          <Typography
            sx={{
              color: "text.secondary",
              fontSize: 15.5,
              lineHeight: 1.65,
              maxWidth: 470,
              mx: "auto",
              mb: 3,
            }}
          >
            You either don't have any agents installed or your agents haven't
            reported data yet. Start by enrolling a device, then come back once
            telemetry starts flowing into Tracenium.
          </Typography>

          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              justifyContent: "center",
              gap: 1.25,
            }}
          >
            <Button
              variant="contained"
              startIcon={<InstallDesktopOutlinedIcon />}
              onClick={() => onNavigate?.("enrollment")}
              sx={{
                textTransform: "none",
                fontWeight: 800,
                borderRadius: 2,
                bgcolor: BRAND.teal,
                color: "#fff",
                px: 2.25,
                "&:hover": { bgcolor: BRAND.tealHover },
              }}
            >
              Enroll a device
            </Button>
            <Button
              variant="outlined"
              onClick={() => onNavigate?.("welcome")}
              sx={{
                textTransform: "none",
                fontWeight: 800,
                borderRadius: 2,
                borderColor: BRAND.teal,
                color: BRAND.tealText,
                px: 2.25,
                "&:hover": { borderColor: BRAND.tealText, bgcolor: BRAND.tealSoft },
              }}
            >
              Open welcome guide
            </Button>
          </Box>
        </Paper>
      </Fade>
    </Box>
  );
}


function UserInactivityDialog({
  open,
  countdown,
  loading = false,
  signingOut = false,
  error = "",
  onStayActive,
  onSignOut,
}) {
  const safeCountdown = Math.max(0, Number(countdown || 0));
  const progress = Math.max(0, Math.min(100, (safeCountdown / USER_IDLE_COUNTDOWN_SECONDS) * 100));

  return (
    <Dialog
      open={open}
      maxWidth="xs"
      fullWidth
      disableEscapeKeyDown
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          overflow: "hidden",
          boxShadow: "0 22px 60px rgba(15,23,42,0.28)",
        },
      }}
    >
      <DialogTitle
        sx={{
          pb: 1.25,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          color: BRAND.dark,
          fontWeight: 900,
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            color: BRAND.tealText,
            bgcolor: BRAND.tealSoft,
            border: `1px solid ${BRAND.tealSoftStrong}`,
            flexShrink: 0,
          }}
        >
          <AccessTimeRoundedIcon fontSize="small" />
        </Box>
        Your session is about to expire.
      </DialogTitle>

      <DialogContent sx={{ pt: 0.75 }}>
        <Stack spacing={2}>
          <Typography sx={{ color: "text.secondary", fontSize: 14.5, lineHeight: 1.65 }}>
            We have not detected activity for a while. Stay active to keep working,
            or sign out to end your session safely.
          </Typography>

          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: `1px solid ${BRAND.border}`,
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(240,252,251,0.88))",
            }}
          >
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={2}>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Auto sign-out in
              </Typography>
              <Typography sx={{ fontSize: 28, lineHeight: 1, fontWeight: 900, color: safeCountdown <= 5 ? BRAND.alert.error : BRAND.tealText }}>
                {safeCountdown}s
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                mt: 1.25,
                height: 7,
                borderRadius: 999,
                bgcolor: BRAND.darkSoft,
                "& .MuiLinearProgress-bar": {
                  borderRadius: 999,
                  bgcolor: safeCountdown <= 5 ? BRAND.alert.error : BRAND.teal,
                },
              }}
            />
          </Box>

          {error ? (
            <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
              {error}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          gap: 1,
          borderTop: `1px solid ${BRAND.border}`,
          bgcolor: BRAND.surfaceMuted,
        }}
      >
        <Button
          onClick={onSignOut}
          disabled={loading || signingOut}
          startIcon={<LogoutRoundedIcon />}
          sx={{
            textTransform: "none",
            fontWeight: 800,
            color: BRAND.dark,
          }}
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </Button>
        <Button
          onClick={onStayActive}
          disabled={loading || signingOut}
          variant="contained"
          sx={{
            textTransform: "none",
            fontWeight: 900,
            borderRadius: 2,
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          {loading ? "Checking..." : "Stay active"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AppShell() {
  const [_bootstrap, setBootstrap] = React.useState(null);
  // Overview is the canonical landing page — it's the SOC-style dashboard
  // the operator should see when they log in without a deep link. Pages
  // with no special nav (bare `/` or `?page=` missing) resolve here.
  const [selectedPage, setSelectedPage] = React.useState(() => getSearchParam("page", "overview"));
  const [showWelcomeEntry, setShowWelcomeEntry] = React.useState(false);
  const [tenantInventoryState, setTenantInventoryState] = React.useState("unknown");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [viewReloadToken, setViewReloadToken] = React.useState(0);
  const [temporaryWarning, setTemporaryWarning] = React.useState(null);
  const [idleDialogOpen, setIdleDialogOpen] = React.useState(false);
  const [idleCountdown, setIdleCountdown] = React.useState(USER_IDLE_COUNTDOWN_SECONDS);
  const [idleStayActiveLoading, setIdleStayActiveLoading] = React.useState(false);
  const [idleSigningOut, setIdleSigningOut] = React.useState(false);
  const [idleDialogError, setIdleDialogError] = React.useState("");

  const idleTimerRef = React.useRef(null);
  const activityThrottleRef = React.useRef(0);
  const idleDialogOpenRef = React.useRef(false);
  const idleSigningOutRef = React.useRef(false);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await httpGetJson("/api/bootstrap");
        if (!alive) return;
        setBootstrap(res);
      } catch (e) {
        console.error("Bootstrap fetch failed in AppShell:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);


  React.useEffect(() => {
    idleDialogOpenRef.current = idleDialogOpen;
  }, [idleDialogOpen]);

  React.useEffect(() => {
    idleSigningOutRef.current = idleSigningOut;
  }, [idleSigningOut]);

  const clearIdleTimer = React.useCallback(() => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const openIdleDialog = React.useCallback(() => {
    clearIdleTimer();
    setIdleDialogError("");
    setIdleStayActiveLoading(false);
    setIdleCountdown(USER_IDLE_COUNTDOWN_SECONDS);
    setIdleDialogOpen(true);
  }, [clearIdleTimer]);

  const resetIdleTimer = React.useCallback(() => {
    if (idleDialogOpenRef.current || idleSigningOutRef.current) return;

    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      openIdleDialog();
    }, USER_IDLE_TIMEOUT_MS);
  }, [clearIdleTimer, openIdleDialog]);

  const performIdleLogout = React.useCallback(async () => {
    if (idleSigningOutRef.current) return;

    idleSigningOutRef.current = true;
    setIdleSigningOut(true);
    clearIdleTimer();
    setTemporaryWarning(null);

    try {
      clearApiCache();
      clearCachedFetch();
    } catch {
      // best effort
    }

    let logoutUrl = getLoginUrl();

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/logout`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.logoutUrl) logoutUrl = data.logoutUrl;
      }
    } catch (err) {
      console.warn("Idle logout request failed; redirecting to login/logout fallback.", err);
    } finally {
      try {
        window.location.assign(logoutUrl);
      } catch {
        window.location.href = logoutUrl;
      }
    }
  }, [clearIdleTimer]);

  const handleStayActive = React.useCallback(async () => {
    setIdleDialogError("");
    setIdleStayActiveLoading(true);

    try {
      await httpGetJson("/api/bootstrap", {
        cache: "no-store",
        timeoutMs: 12_000,
        notifyOnTemporaryError: false,
      });

      setIdleDialogOpen(false);
      setIdleCountdown(USER_IDLE_COUNTDOWN_SECONDS);
      setIdleStayActiveLoading(false);
      resetIdleTimer();
    } catch (err) {
      if (isAuthError(err)) {
        return;
      }

      setIdleStayActiveLoading(false);
      setIdleDialogError(
        isTemporaryApiError(err)
          ? "We could not refresh your session right now. Please try again or sign out."
          : err?.message || "We could not refresh your session. Please try again or sign out."
      );
    }
  }, [resetIdleTimer]);

  React.useEffect(() => {
    const handleActivity = () => {
      const currentTs = Date.now();
      if (currentTs - activityThrottleRef.current < 750) return;
      activityThrottleRef.current = currentTs;
      resetIdleTimer();
    };

    USER_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resetIdleTimer();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    resetIdleTimer();

    return () => {
      clearIdleTimer();
      USER_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearIdleTimer, resetIdleTimer]);

  React.useEffect(() => {
    if (!idleDialogOpen || idleStayActiveLoading || idleSigningOut) return undefined;

    const intervalId = window.setInterval(() => {
      setIdleCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          performIdleLogout();
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [idleDialogOpen, idleStayActiveLoading, idleSigningOut, performIdleLogout]);

  const resolveTenantInventoryState = React.useCallback(async () => {
    setTenantInventoryState((prev) => (prev === "empty" || prev === "has-data" ? prev : "checking"));

    const [summaryRes, hostsRes] = await Promise.allSettled([
      httpGetJson("/api/v1/dashboard/summary", {
        cache: "no-store",
        notifyOnTemporaryError: false,
      }),
      httpGetJson("/api/v1/dashboard/hosts?page=1&pageSize=1", {
        cache: "no-store",
        notifyOnTemporaryError: false,
      }),
    ]);

    const authFailure = [summaryRes, hostsRes].some(
      (res) => res.status === "rejected" && isAuthError(res.reason)
    );

    if (authFailure) {
      setTenantInventoryState("unknown");
      return;
    }

    const temporaryFailure = [summaryRes, hostsRes].some(
      (res) => res.status === "rejected" && isTemporaryApiError(res.reason)
    );

    const summaryOk = summaryRes.status === "fulfilled";
    const hostsOk = hostsRes.status === "fulfilled";
    const summaryCount = summaryOk ? getSummaryInventoryCount(summaryRes.value) : 0;
    const hostsTotal = hostsOk ? normalizeHostsTotal(hostsRes.value) : 0;
    const hasInventory = summaryCount > 0 || hostsTotal > 0;

    if (hasInventory) {
      setTenantInventoryState("has-data");
      setShowWelcomeEntry(false);
      return;
    }

    // The hosts endpoint is the safest source of truth for an empty fleet.
    // If it failed temporarily, do not infer an empty tenant from partial data.
    if (hostsOk && !temporaryFailure) {
      setTenantInventoryState("empty");
      setShowWelcomeEntry(true);
      return;
    }

    setTenantInventoryState("unknown");
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    resolveTenantInventoryState().catch((err) => {
      if (cancelled) return;
      if (!isAuthError(err) && !isTemporaryApiError(err)) {
        console.warn("Tenant inventory empty-state probe failed:", err?.message || err);
      }
      setTenantInventoryState("unknown");
    });

    return () => {
      cancelled = true;
    };
  }, [resolveTenantInventoryState]);

  const handleAssetsEmptyStateChange = React.useCallback((isEmpty) => {
    const nextEmpty = Boolean(isEmpty);
    setShowWelcomeEntry(nextEmpty);
    setTenantInventoryState(nextEmpty ? "empty" : "has-data");
  }, []);

  React.useEffect(() => {
    const handleTemporaryError = (event) => {
      setTemporaryWarning({
        message:
          event?.detail?.message ||
          "Unable to refresh data. Showing last available data.",
        originalMessage: event?.detail?.originalMessage || "",
        ts: Date.now(),
      });
    };

    window.addEventListener(TEMPORARY_ERROR_EVENT, handleTemporaryError);
    return () => {
      window.removeEventListener(TEMPORARY_ERROR_EVENT, handleTemporaryError);
    };
  }, []);

  React.useEffect(() => {
    let redirecting = false;

    const handleAuthRequired = (event) => {
      // Tell http.js the auth event has a dedicated shell-level handler.
      event?.preventDefault?.();

      if (redirecting) return;
      redirecting = true;

      setTemporaryWarning(null);
      clearApiCache();
      clearCachedFetch();

      try {
        window.location.assign(getLoginUrl());
      } catch {
        window.location.href = getLoginUrl();
      }
    };

    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => {
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    };
  }, []);

  const handleRetryCurrentView = React.useCallback(() => {
    setTemporaryWarning(null);
    setViewReloadToken((prev) => prev + 1);
  }, []);

  React.useEffect(() => {
    updateSearchParams({ page: selectedPage });
  }, [selectedPage]);

  React.useEffect(() => {
    const handlePopState = () => {
      // Same default as the initial state — back/forward without a
      // ?page= lands the user on Overview, not on Assets.
      setSelectedPage(getSearchParam("page", "overview"));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleSelect = React.useCallback((key) => {
    setSelectedPage(key);
    setMobileOpen(false); // auto-close drawer when a page is picked on mobile
    setTemporaryWarning(null);
  }, []);

  // Default → Overview. Any unrecognized ?page= key also falls through
  // to Overview, which is the safer behavior than dropping the user
  // onto a page they didn't ask for.
  let content = <Overview />;

  if (selectedPage === "assets") {
    // Assets keeps its welcome-state callback because the first-time
    // empty-fleet flow is owned by this page, not by Overview.
    content = (
      <Assets
        onAssetsEmptyStateChange={handleAssetsEmptyStateChange}
        suppressEmptyStateOverlay
      />
    );
  }

  if (selectedPage === "configurations") {
    content = <Configurations onNavigate={setSelectedPage} />;
  }

  // Device Enrollment is the new combined surface — sidebar entry for
  // operators ("download installer + mint a token in the same flow").
  if (selectedPage === "enrollment") {
    content = <DeviceEnrollment />;
  }

  // Plugin Control — tenant-wide plugin enablement, split out of
  // Policies so the "what's on" knob is separated from the "how it
  // behaves" knobs. Admin-scoped at the UI layer; backend hardening
  // (whitelist + role middleware) is Phase 2.
  if (selectedPage === "plugin-control") {
    content = <PluginControl />;
  }

  // Legacy `tokens` route kept alive so existing bookmarks / deep links
  // (Settings → Tokens cards from prior releases, automation links)
  // don't 404. The standalone TokensAdministrator still works; the new
  // primary entry point is Device Enrollment.
  if (selectedPage === "tokens") {
    content = <TokensAdministrator />;
  }

  if (selectedPage === "tenants") {
    content = <TenantsAdministrator mode="global" />;
  }

  if (selectedPage === "tenant-members") {
    content = <TenantsAdministrator mode="tenant" />;
  }

  if (selectedPage === "welcome") {
    content = <Welcome onNavigate={setSelectedPage} />;
  }
  // Agent releases — admin catalog of Tracenium agent installer
  // binaries. The primary user-facing entry is the Device Enrollment
  // → Agent Downloads tab; this page itself is mostly admin-only CRUD.
  // Originally mounted at `software-delivery` until the 2026-05-01
  // rename; the transition alias was dropped in Batch 3.
  if (selectedPage === "agent-releases") {
    content = <AgentReleases />;
  }

  // Software Delivery (SDP) — operator surface for deploying
  // third-party software to the fleet. Distinct from `agent-releases`
  // (which catalogs the Tracenium agent's own installer binaries).
  // Two tabs: Catalog (CRUD packages) and Deployments (history +
  // per-device results).
  if (selectedPage === "software-delivery") {
    content = <SoftwareDelivery onNavigate={setSelectedPage} />;
  }

  if (selectedPage === "jobs") {
    content = <Jobs />;
  }

  if (selectedPage === "policies") {
    content = <Policies />;
  }

  if (selectedPage === "audit") {
    content = <Audit />;
  }

  if (selectedPage === "pki") {
    content = <PKI />;
  }

  if (selectedPage === "ad") {
    content = <SecurityCompliance />;
  }

  if (selectedPage === "patch") {
    content = <PatchManagement />;
  }

  if (selectedPage === "remote-control") {
    content = <RemoteControl />;
  }

  if (selectedPage === "alerts") {
    content = <Alerts />;
  }

  // Retention — admin-only drilldown reached from the "Database retention"
  // card on Settings. Mounted at top level (not nested under settings/*)
  // because deep linking is one of the operational needs: paste the link
  // into a maintenance ticket, hit it, see sizes + last-run audit.
  if (selectedPage === "retention") {
    content = <Retention onNavigate={setSelectedPage} />;
  }

  const shouldShowNoInformationOverlay =
    tenantInventoryState === "empty" && EMPTY_TENANT_GATED_PAGES.has(selectedPage);

  return (
    <Box
      sx={{
        display: "flex",
        height: "100dvh",
        width: "100%",
        bgcolor: "#f5f6f8",
        overflow: "hidden", // the shell is a fixed frame
      }}
    >
      <Sidebar
        selected={selectedPage}
        onSelect={handleSelect}
        showWelcomeEntry={showWelcomeEntry}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          bgcolor: "#f5f6f8",
          overflow: "hidden",
        }}
      >
        <Box sx={{ width: "100%", flexShrink: 0 }}>
          <Topbar onMenuClick={() => setMobileOpen(true)} />
        </Box>

        {/* The single scroll container for everything below the Topbar.
            Vertical scroll is owned here. Horizontal scroll is clamped:
            wide Papers (DataGrids) scroll internally via the :has() rule
            in index.css. */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            width: "100%",
            px: { xs: 1.25, sm: 2, md: 2.5 },
            py: { xs: 1.25, sm: 2 },
            bgcolor: "#f5f6f8",
            overflowY: "auto",
            overflowX: "hidden",
            position: "relative",
          }}
        >
          <React.Suspense fallback={<PageFallback />}>
            <Box
              key={`${selectedPage}-${viewReloadToken}`}
              sx={{
                minWidth: 0,
                width: "100%",
                filter: shouldShowNoInformationOverlay ? "blur(8px)" : "none",
                transform: "translateZ(0)",
                transition: "filter 220ms ease",
                pointerEvents: shouldShowNoInformationOverlay ? "none" : "auto",
                userSelect: shouldShowNoInformationOverlay ? "none" : "auto",
              }}
            >
              {content}
            </Box>
          </React.Suspense>

          {shouldShowNoInformationOverlay ? (
            <NoInformationOverlay onNavigate={handleSelect} />
          ) : null}
        </Box>
      </Box>

      <UserInactivityDialog
        open={idleDialogOpen}
        countdown={idleCountdown}
        loading={idleStayActiveLoading}
        signingOut={idleSigningOut}
        error={idleDialogError}
        onStayActive={handleStayActive}
        onSignOut={performIdleLogout}
      />

      <Snackbar
        open={Boolean(temporaryWarning)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        autoHideDuration={8000}
        onClose={(_, reason) => {
          if (reason === "clickaway") return;
          setTemporaryWarning(null);
        }}
      >
        <Alert
          severity="warning"
          variant="filled"
          onClose={() => setTemporaryWarning(null)}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={handleRetryCurrentView}
              sx={{ fontWeight: 800, textTransform: "none" }}
            >
              Retry
            </Button>
          }
          sx={{ alignItems: "center", boxShadow: "0 10px 28px rgba(15,23,42,0.22)" }}
        >
          {temporaryWarning?.message || "Unable to refresh data. Showing last available data."}
        </Alert>
      </Snackbar>
    </Box>
  );
}
