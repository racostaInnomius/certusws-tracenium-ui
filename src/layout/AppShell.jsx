import * as React from "react";
import { Box, CircularProgress } from "@mui/material";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { httpGetJson } from "../api/http";
import { getSearchParam, updateSearchParams } from "../utils/browserState";

const Assets = React.lazy(() => import("../pages/Assets"));
const Overview = React.lazy(() => import("../pages/Overview"));
const Configurations = React.lazy(() => import("../pages/Configurations"));
const TokensAdministrator = React.lazy(() => import("../pages/TokensAdministrator"));
const TenantsAdministrator = React.lazy(() => import("../pages/TenantsAdministrator"));
const Welcome = React.lazy(() => import("../pages/Welcome"));
const AgentReleases = React.lazy(() => import("../pages/AgentReleases"));
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

export default function AppShell() {
  const [bootstrap, setBootstrap] = React.useState(null);
  // Overview is the canonical landing page — it's the SOC-style dashboard
  // the operator should see when they log in without a deep link. Pages
  // with no special nav (bare `/` or `?page=` missing) resolve here.
  const [selectedPage, setSelectedPage] = React.useState(() => getSearchParam("page", "overview"));
  const [showWelcomeEntry, setShowWelcomeEntry] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

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
  }, []);

  // Default → Overview. Any unrecognized ?page= key also falls through
  // to Overview, which is the safer behavior than dropping the user
  // onto a page they didn't ask for.
  let content = <Overview />;

  if (selectedPage === "assets") {
    // Assets keeps its welcome-state callback because the first-time
    // empty-fleet flow is owned by this page, not by Overview.
    content = <Assets onAssetsEmptyStateChange={setShowWelcomeEntry} />;
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
          }}
        >
          <React.Suspense fallback={<PageFallback />}>
            <Box sx={{ minWidth: 0, width: "100%" }}>{content}</Box>
          </React.Suspense>
        </Box>
      </Box>
    </Box>
  );
}
