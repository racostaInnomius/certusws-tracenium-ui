import * as React from "react";
import Grid from "@mui/material/Grid";
import { Paper, Typography, Box } from "@mui/material";

import { dashboardApi } from "../api/dashboard";
import OsPlatformDonut from "../components/Charts/OsPlatformDonut";
import TopManufacturersBar from "../components/Charts/TopManufacturersBar";
import OsVersionsBar from "../components/Charts/OsVersionsBar";
import PrintersByVendorPie from "../components/Charts/PrintersByVendorPie";

export default function Assets() {
  const [summary, setSummary] = React.useState(null);

  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const res = await dashboardApi.getSummary();
        if (isMounted) setSummary(res);
      } catch (e) {
        console.error("Failed to load dashboard summary", e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Grid container spacing={2}>
      {/* Row 1 */}
      {/* <Grid size={{ xs: 12, md: 2 }}> */}
      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Typography sx={{ fontWeight: 600, mb: 1 }}>Active Hosts</Typography>
        <Box sx={{ display: "flex", alignItems: "center", height: 170 }}>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>
            {summary?.activeHosts ?? "—"}
          </Typography>
        </Box>
      </Paper>
      {/* </Grid> */}

      <Grid size={{ xs: 12, md: 3 }}>
        {/* Recharts: el contenedor debe tener altura explícita para evitar width/height = -1 */}
        <Box sx={{ height: 260 }}>
          <OsPlatformDonut osPlatform={summary?.osPlatform} />
        </Box>
      </Grid>

      <Grid size={{ xs: 12, md: 5 }}>
        <Paper sx={{ p: 2, borderRadius: 3, height: 260, overflow: "hidden" }}>
          <TopManufacturersBar topManufacturers={summary?.topManufacturers} />
        </Paper>
      </Grid>

      {/* <Grid size={{ xs: 12, md: 2 }}> */}
      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Typography sx={{ fontWeight: 600, mb: 1 }}>Total Printers</Typography>
        <Box sx={{ display: "flex", alignItems: "center", height: 170 }}>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>
            {summary?.totalPrinters ?? "—"}
          </Typography>
        </Box>
      </Paper>
      {/* </Grid> */}

      {/* Row 2 */}
      <Grid size={{ xs: 12, md: 6 }}>
        <Paper sx={{ p: 2, borderRadius: 3, height: 300, overflow: "hidden" }}>
          <OsVersionsBar osVersions={summary?.osVersions} />
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Paper sx={{ p: 2, height: 300, borderRadius: 2}}>
          <Box sx={{ height: 300, minHeight: 250 }}>
            <PrintersByVendorPie printersByVendor={summary?.printersByVendor} />
          </Box>
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Paper sx={{ p: 2, borderRadius: 3, height: 300 }}>
          <Typography variant="overline">Placeholder: Hosts Table</Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}