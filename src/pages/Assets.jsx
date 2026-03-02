import * as React from "react";
import { Grid, Paper, Typography, Box } from "@mui/material";
import { dashboardApi } from "../api/dashboard";
import OsPlatformDonut from "../components/Charts/OsPlatformDonut";
import TopManufacturersBar from "../components/Charts/TopManufacturersBar";
import OsVersionsBar from "../components/Charts/OsVersionsBar";

export default function Assets() {
  const [summary, setSummary] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false; // evita setState si el componente se desmonta por redirect

    (async () => {
      try {
        const data = await dashboardApi.getSummary(); // /api/v1/dashboard/summary
        if (!cancelled && data) setSummary(data);
      } catch (e) {
        const msg = String(e?.message || "");
        // Si no hay sesión, AuthGate se encargará del redirect; aquí solo evitamos ruido/flicker
        if (msg.startsWith("UNAUTHENTICATED")) return;

        console.error("getSummary failed:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Grid container spacing={2}>
      {/* Active Hosts */}
      <Grid item xs={12} md={3}>
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="overline">Active Hosts</Typography>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>
            {summary?.activeHosts ?? "—"}
          </Typography>
        </Paper>
      </Grid>

      {/* Charts area (OS Platform + Top Manufacturer) */}
      <Grid item xs={12} md={6}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <Box sx={{ height: 240 }}>
              <OsPlatformDonut osPlatform={summary?.osPlatform} />
            </Box>
          </Grid>

          <Grid item xs={12} md={7}>
            <Paper
              sx={{
                p: 2,
                borderRadius: 3,
                height: 240,
                overflowY: "auto", // para simular el scroll del mock si hay muchos manufacturers
                pr: 1,
              }}
            >
              <TopManufacturersBar topManufacturers={summary?.topManufacturers} />
            </Paper>
          </Grid>
        </Grid>
      </Grid>

      {/* Total Printers */}
      <Grid item xs={12} md={3}>
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="overline">Total Printers</Typography>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>
            {summary?.totalPrinters ?? "—"}
          </Typography>
        </Paper>
      </Grid>

      {/* OS Versions */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2, borderRadius: 3, minHeight: 280, overflow: "auto" }}>
          <OsVersionsBar osVersions={summary?.osVersions} />
        </Paper>
      </Grid>

      {/* Placeholder Hosts Table */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2, borderRadius: 3, minHeight: 280 }}>
          <Typography variant="overline">Placeholder: Hosts Table</Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}