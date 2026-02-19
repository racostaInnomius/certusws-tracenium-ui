import * as React from "react";
import { Grid, Paper, Typography } from "@mui/material";
import { dashboardApi } from "../api/dashboard";
import OsPlatformDonut from "../components/Charts/OsPlatformDonut";


export default function Assets() {
  const [summary, setSummary] = React.useState(null);
  const platformCounts = summary?.osPlatform; // {Windows: X, Mac: Y, Linux: Z}

React.useEffect(() => {
  let cancelled = false; // evita setState si el componente se desmonta por redirect

  (async () => {
    try {
      const data = await dashboardApi.getSummary(); // llama a /api/v1/dashboard/summary
      if (!cancelled && data) setSummary(data);     // setea summary si seguimos montados
    } catch (e) {
      const msg = String(e?.message || "");
      // Si no hay sesión, AuthGate se encargará del redirect; aquí solo evitamos ruido/flicker
      if (msg.startsWith("UNAUTHENTICATED")) return;

      // Cualquier otro error sí lo reportamos
      console.error("getSummary failed:", e);
    }
  })();

  return () => {
    cancelled = true; // marca cancelación
  };
}, []);

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={3}>
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="overline">Active Hosts</Typography>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>
            {summary?.activeHosts ?? "—"}
          </Typography>
        </Paper>
      </Grid>

      <Grid item xs={12} md={6}>
        <OsPlatformDonut osPlatform={summary?.osPlatform} />
      </Grid>

      <Grid item xs={12} md={3}>
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="overline">Total Printers</Typography>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>
            {summary?.totalPrinters ?? "—"}
          </Typography>
        </Paper>
      </Grid>

      <Grid item xs={12} md={8}>
        <Paper sx={{ p: 2, borderRadius: 3, minHeight: 220 }}>
          <Typography variant="overline">Placeholder: Hosts Table</Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}