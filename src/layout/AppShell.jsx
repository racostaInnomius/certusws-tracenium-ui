import * as React from "react";
import { Box } from "@mui/material";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { httpGetJson } from "../api/http";

import Assets from "../pages/Assets";
import Configurations from "../pages/Configurations";
import TokensAdministrator from "../pages/TokensAdministrator";

export default function AppShell() {
  const [bootstrap, setBootstrap] = React.useState(null);
  const [selectedPage, setSelectedPage] = React.useState("assets");

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

  let content = <Assets />;

  if (selectedPage === "configurations") {
    content = <Configurations onNavigate={setSelectedPage} />;
  }

  if (selectedPage === "tokens") {
    content = <TokensAdministrator />;
  }

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <Sidebar
        tenantId={bootstrap?.tenantId}
        selected={selectedPage}
        onSelect={setSelectedPage}
      />

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Topbar />
        <Box sx={{ flex: 1, p: 2, overflow: "auto", bgcolor: "#f5f6f8" }}>
          {content}
        </Box>
      </Box>
    </Box>
  );
}