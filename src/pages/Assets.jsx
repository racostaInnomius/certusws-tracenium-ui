import * as React from "react";
import Grid from "@mui/material/Grid";
import { Paper, Typography, Box } from "@mui/material";

import { dashboardApi } from "../api/dashboard";
import { httpGetJson } from "../api/http";

import OSPlatformDonut from "../components/Charts/OSPlatformDonut";
import TopManufacturersBar from "../components/Charts/TopManufacturersBar";
import OsVersionsBar from "../components/Charts/OsVersionsBar";
import PrintersByVendorPie from "../components/Charts/PrintersByVendorPie";

import HostsTable from "../components/Charts/HostsTable";
import HostDetails from "../components/Charts/HostDetails";

export default function Assets() {
  const [summary, setSummary] = React.useState(null);

  const [hosts, setHosts] = React.useState([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState(null);
  const [selectedHostDetail, setSelectedHostDetail] = React.useState(null);

  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const s = await dashboardApi.getSummary();
        if (!isMounted) return;
        setSummary(s);
      } catch (e) {
        // no rompas el dashboard por summary
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
        const list = await httpGetJson("/api/v1/dashboard/hosts");
        if (!isMounted) return;

        const rows = Array.isArray(list) ? list : [];
        setHosts(rows);

        // Auto-select primer host (UX)
        if (rows.length > 0 && !selectedAgentId) {
          setSelectedAgentId(rows[0].agent_id);
        }
      } catch (e) {
        console.error("Hosts fetch failed:", e);
        if (!isMounted) return;
        setHosts([]);
      }
    })();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      if (!selectedAgentId) return;

      try {
        const res = await httpGetJson(
          `/api/v1/dashboard/hosts/${encodeURIComponent(selectedAgentId)}/detail`
        );
        const d = res?.detail;

        if (!isMounted) return;
        setSelectedHostDetail(d? {
          ...d,
          serialNumber: d.serialnumber,
          macAddress: d.macaddress,
        } : null);
        
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

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Assets
      </Typography>

      <Grid container spacing={2}>
        {/* Row 1 */}
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 600, mb: 1 }}>Active Hosts</Typography>
          <Box sx={{ display: "flex", alignItems: "center", height: 170 }}>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>
              {summary?.activeHosts ?? "—"}
            </Typography>
          </Box>
        </Paper>

        <Grid size={{ xs: 12, md: 3 }}>
            <Box sx={{ height: 260, minHeight: 240 }}>
              <OSPlatformDonut osPlatform={summary?.osPlatform ?? []} />
            </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 2, borderRadius: 3, height: 260, overflow: "hidden" }}>
            {/* <Box sx={{ height: 260, minHeight: 240 }}> */}
              <TopManufacturersBar topManufacturers={summary?.topManufacturers ?? []} />
            {/* </Box> */}
          </Paper>
        </Grid>

        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 600, mb: 1 }}>Total Printers</Typography>
          <Box sx={{ display: "flex", alignItems: "center", height: 170 }}>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>
              {summary?.totalPrinters ?? "—"}
            </Typography>
          </Box>
        </Paper>

        {/* Row 2: OS Versions + Right Panel (Hosts table + details) */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, borderRadius: 3, height: 300, overflow: "hidden" }}>
            <OsVersionsBar osVersions={summary?.osVersions} />
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 300, width: 400, borderRadius: 2 }}>
            <Box sx={{ height: 300, width: 410, minHeight: 250 }}>
              <PrintersByVendorPie printersByVendor={summary?.printersByVendor} />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          {/* Panel grande derecho: tabla arriba + details abajo */}
          <Paper sx={{ p: 2, borderRadius: 2, height: 360 }}>
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <HostsTable
                  rows={hosts}
                  selectedAgentId={selectedAgentId}
                  onSelectAgentId={(id) => setSelectedAgentId(id)}
                />
              </Box>

              <Box sx={{ height: 180 }}>
                <HostDetails host={selectedHost} detail={selectedHostDetail} />
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}