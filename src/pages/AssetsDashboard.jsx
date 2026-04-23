import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Box,
  Backdrop,
  Paper,
  Typography,
  Fade,
} from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";

import { dashboardApi } from "../api/dashboard";
import { httpGetJson } from "../api/http";

import OsPlatformDonut from "../components/Charts/OsPlatformDonut";
import TopManufacturersBar from "../components/Charts/TopManufacturersBar";
import OsVersionsBar from "../components/Charts/OsVersionsBar";
import PrintersByVendorPie from "../components/Charts/PrintersByVendorPie";

import HostsTable from "../components/Charts/HostsTable";
import HostDetails from "../components/Charts/HostDetails";

function MetricCard({ title, value }) {
  return (
    <Paper
      elevation={0}
      sx={{
        width: "100%",
        minHeight: 260,
        height: "100%",
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid rgba(0,0,0,0.10)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <Box
        sx={{
          px: 2,
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#2e8f92",
          borderBottom: "3px solid rgba(100, 255, 255, 0.45)",
        }}
      >
        <Typography
          sx={{
            color: "white",
            fontWeight: 700,
            letterSpacing: 0.2,
            fontSize: 18,
            textAlign: "center",
          }}
        >
          {title}
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 180,
          backgroundColor: "#4aa0a2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 2,
        }}
      >
        <Typography
          sx={{
            color: "white",
            fontWeight: 800,
            fontSize: { xs: 56, md: 64 },
            lineHeight: 1,
            textShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          {value ?? "—"}
        </Typography>
      </Box>
    </Paper>
  );
}

function DashboardPanel({ children, height = 260, padding = 2 }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: padding,
        width: "100%",
        height: "100%",
        minHeight: height,
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.10)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      <Box sx={{ width: "100%", height: "100%" }}>{children}</Box>
    </Paper>
  );
}

export default function Assets({ onAssetsEmptyStateChange }) {
  const [summary, setSummary] = React.useState(null);
  const [hosts, setHosts] = React.useState([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState(null);
  const [selectedHostDetail, setSelectedHostDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const s = await dashboardApi.getSummary();
        if (!isMounted) return;
        setSummary(s);
      } catch (e) {
        console.error("Summary fetch failed:", e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        setLoading(true);

        const list = await httpGetJson("/api/v1/dashboard/hosts");
        if (!isMounted) return;

        const rows = Array.isArray(list) ? list : [];
        setHosts(rows);

        if (rows.length > 0 && !selectedAgentId) {
          setSelectedAgentId(rows[0].agent_id);
        }
      } catch (e) {
        console.error("Hosts fetch failed:", e);
        if (!isMounted) return;
        setHosts([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [selectedAgentId]);

  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      if (!selectedAgentId) return;

      try {
        const res = await httpGetJson(
          `/api/v1/dashboard/hosts/${encodeURIComponent(selectedAgentId)}/detail`
        );
        if (!isMounted) return;

        setSelectedHostDetail(
          res
            ? {
                ...res,
                serialNumber: res.serialnumber,
                macAddress: res.macaddress,
              }
            : null
        );
      } catch (e) {
        console.error("Host detail fetch failed:", e);
        if (!isMounted) return;
        setSelectedHostDetail(null);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [selectedAgentId]);

  const selectedHost = React.useMemo(() => {
    return hosts.find((h) => h.agent_id === selectedAgentId) ?? null;
  }, [hosts, selectedAgentId]);

  const hasNoAssetsData =
    !loading &&
    (!hosts || hosts.length === 0) &&
    Number(summary?.activeHosts ?? 0) === 0 &&
    Number(summary?.totalPrinters ?? 0) === 0;

  React.useEffect(() => {
    onAssetsEmptyStateChange?.(hasNoAssetsData);
  }, [hasNoAssetsData, onAssetsEmptyStateChange]);

  return (
    <Box
      sx={{
        p: { xs: 0, sm: 0.5, md: 1 },
        position: "relative",
        minHeight: "calc(100dvh - 220px)",
      }}
    >
      <Grid container spacing={2} alignItems="stretch">
        {/* Row 1 */}
        <Grid size={{ xs: 12, md: 6, lg: 2 }} sx={{ display: "flex" }}>
          <MetricCard title="Active Hosts" value={summary?.activeHosts ?? "—"} />
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 3 }} sx={{ display: "flex" }}>
          <DashboardPanel height={260}>
            <OsPlatformDonut osPlatform={summary?.osPlatform ?? []} />
          </DashboardPanel>
        </Grid>

        <Grid size={{ xs: 12, md: 12, lg: 5 }} sx={{ display: "flex" }}>
          <DashboardPanel height={260}>
            <TopManufacturersBar topManufacturers={summary?.topManufacturers ?? []} />
          </DashboardPanel>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 2 }} sx={{ display: "flex" }}>
          <MetricCard title="Total Printers" value={summary?.totalPrinters ?? "—"} />
        </Grid>

        {/* Row 2 */}
        <Grid size={{ xs: 12, lg: 7 }} sx={{ display: "flex" }}>
          <DashboardPanel height={300}>
            <OsVersionsBar osVersions={summary?.osVersions ?? []} />
          </DashboardPanel>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }} sx={{ display: "flex" }}>
          <DashboardPanel height={300}>
            <PrintersByVendorPie printersByVendor={summary?.printersByVendor ?? []} />
          </DashboardPanel>
        </Grid>

        {/* Row 3 */}
        <Grid size={{ xs: 12 }} sx={{ display: "flex" }}>
          <DashboardPanel height={380}>
            <Box
              sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <HostsTable
                  rows={hosts}
                  selectedAgentId={selectedAgentId}
                  onSelectAgentId={(id) => setSelectedAgentId(id)}
                />
              </Box>

              <Box sx={{ height: 185, minHeight: 185 }}>
                <HostDetails host={selectedHost} detail={selectedHostDetail} />
              </Box>
            </Box>
          </DashboardPanel>
        </Grid>
      </Grid>

      {hasNoAssetsData && (
        <Backdrop
          open
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            borderRadius: 2,
            backgroundColor: "rgba(15, 23, 42, 0.20)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            pt: { xs: "26vh", sm: "24vh", md: "22vh" },
          }}
        >
          <Fade in={hasNoAssetsData} timeout={{ enter: 320, exit: 200 }}>
            <Paper
              elevation={0}
              sx={{
                width: "100%",
                maxWidth: 520,
                mx: 2,
                px: { xs: 3, sm: 4 },
                py: { xs: 3, sm: 4 },
                borderRadius: 3,
                textAlign: "center",
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 18px 45px rgba(0,0,0,0.18)",
                transform: hasNoAssetsData
                  ? "scale(1) translateY(0)"
                  : "scale(0.96) translateY(12px)",
                opacity: hasNoAssetsData ? 1 : 0,
                transition: "transform 320ms ease, opacity 320ms ease",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: "#16324f",
                  mb: 1.5,
                }}
              >
                Aún no hay información disponible
              </Typography>

              <Typography
                sx={{
                  color: "#667085",
                  fontSize: 16,
                  lineHeight: 1.6,
                  mb: 3,
                }}
              >
                No tienes agentes instalados o tus agentes no han reportado datos todavía.
              </Typography>

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  mb: 2,
                }}
              >
                <Inventory2OutlinedIcon
                  sx={{
                    fontSize: 48,
                    color: "rgba(27,166,166,0.5)",
                    animation: "pulse 2s infinite",
                    "@keyframes pulse": {
                      "0%": { opacity: 0.4 },
                      "50%": { opacity: 1 },
                      "100%": { opacity: 0.4 },
                    },
                  }}
                />
              </Box>
            </Paper>
          </Fade>
        </Backdrop>
      )}
    </Box>
  );
}