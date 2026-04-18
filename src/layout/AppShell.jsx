import * as React from "react";
import { Box, CircularProgress } from "@mui/material";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { httpGetJson } from "../api/http";
import { getSearchParam, updateSearchParams } from "../utils/browserState";

const Assets = React.lazy(() => import("../pages/Assets"));
const Configurations = React.lazy(() => import("../pages/Configurations"));
const TokensAdministrator = React.lazy(() => import("../pages/TokensAdministrator"));
const TenantsAdministrator = React.lazy(() => import("../pages/TenantsAdministrator"));
const Welcome = React.lazy(() => import("../pages/Welcome"));
const SoftwareDelivery = React.lazy(() => import("../pages/SoftwareDelivery"));
const Jobs = React.lazy(() => import("../pages/Jobs"));
const Audit = React.lazy(() => import("../pages/Audit"));
const PKI = React.lazy(() => import("../pages/PKI"));

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
      <CircularProgress sx={{ color: "#1ba6a6" }} />
    </Box>
  );
}

export default function AppShell() {
  const [bootstrap, setBootstrap] = React.useState(null);
  const [selectedPage, setSelectedPage] = React.useState(() => getSearchParam("page", "assets"));
  const [showWelcomeEntry, setShowWelcomeEntry] = React.useState(false);

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
      setSelectedPage(getSearchParam("page", "assets"));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  let content = <Assets onAssetsEmptyStateChange={setShowWelcomeEntry} />;

  if (selectedPage === "configurations") {
    content = <Configurations onNavigate={setSelectedPage} />;
  }

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

  if (selectedPage === "software-delivery") {
    content = <SoftwareDelivery />;
  }

  if (selectedPage === "jobs") {
    content = <Jobs />;
  }

  if (selectedPage === "audit") {
    content = <Audit />;
  }

  if (selectedPage === "pki") {
    content = <PKI />;
  }

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100dvh",
        width: "100%",
        bgcolor: "#f5f6f8",
      }}
    >
      <Sidebar
        selected={selectedPage}
        onSelect={setSelectedPage}
        showWelcomeEntry={showWelcomeEntry}
      />

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          bgcolor: "#f5f6f8",
        }}
      >
        <Box
          sx={{
            width: "100%",
            flexShrink: 0,
          }}
        >
          <Topbar />
        </Box>

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            width: "98%",
            px: { xs: 1.5, sm: 2 },
            py: { xs: 1.5, sm: 2 },
            bgcolor: "#f5f6f8",
            overflow: "auto",
          }}
        >
          <React.Suspense fallback={<PageFallback />}>
            {content}
          </React.Suspense>
        </Box>
      </Box>
    </Box>
  );
}
