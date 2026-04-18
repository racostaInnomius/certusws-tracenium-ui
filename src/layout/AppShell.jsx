import * as React from "react";
import { Box } from "@mui/material";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { httpGetJson } from "../api/http";

import Assets from "../pages/Assets";
import Configurations from "../pages/Configurations";
import TokensAdministrator from "../pages/TokensAdministrator";
import TenantsAdministrator from "../pages/TenantsAdministrator";
import Welcome from "../pages/Welcome";
import SoftwareDelivery from "../pages/SoftwareDelivery";
import Jobs from "../pages/Jobs";
import Audit from "../pages/Audit";
import PKI from "../pages/PKI";

export default function AppShell() {
  const [bootstrap, setBootstrap] = React.useState(null);
  const [selectedPage, setSelectedPage] = React.useState("assets");
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
          {content}
        </Box>
      </Box>
    </Box>
  );
}
