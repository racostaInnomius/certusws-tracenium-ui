// src/pages/WindowsGpos.jsx
//
// Las directivas de grupo aplicadas a cada equipo Windows.
//
// ⚠️ Vive en Asset Management y no en Security Compliance porque es
// INVENTARIO. El agente lo recolecta con `gpresult` desde hace tiempo, pero el
// dato viajaba como evidencia del hallazgo
// `windows.domain.gpo_inventory_available` y por eso se mostraba dentro del
// cajón de un equipo, en cumplimiento. Que una lista de directivas aplicadas
// sea "evidencia" de un hallazgo cuyo veredicto es "sí, se pudo leer el
// inventario" describe cómo se construyó, no lo que es.
//
// Y la vista cambia con el sitio: dentro del cajón se veían LAS directivas DE
// UN EQUIPO; aquí se ve cuántos equipos comparte cada directiva, que es la
// pregunta que no se podía hacer. Una GPO aplicada a un solo equipo de
// cincuenta es tan interesante como una aplicada a los cincuenta, y por
// razones opuestas.

import * as React from "react";
import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";
import { DataGrid } from "@mui/x-data-grid";

import { getWindowsGpoInventory } from "../api/inventoryDashboard";
import { useCachedFetch } from "../hooks/useCachedFetch";
import CompositionBars from "../components/common/CompositionBars";
import { BRAND, TEXT } from "../theme/brand";
import { formatDate } from "../utils/format";

function Kpi({ label, value, tone }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: "100%",
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
      }}
    >
      <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: tone || BRAND.dark, mt: 0.5 }}>
        {value}
      </Typography>
    </Paper>
  );
}

function GpoChips({ names }) {
  const list = Array.isArray(names) ? names : [];
  if (list.length === 0) {
    // "Ninguna" y "no se pudo leer" son cosas distintas y se ven distintas.
    return <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>None</Typography>;
  }
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, py: 0.5 }}>
      {list.map((n) => (
        <Chip
          key={n}
          size="small"
          label={n}
          sx={{ height: 22, fontSize: TEXT.xs, bgcolor: BRAND.surfaceMuted, color: BRAND.dark }}
        />
      ))}
    </Stack>
  );
}

export default function WindowsGpos({ refreshNonce }) {
  const { data, loading, refetch } = useCachedFetch(
    "windows-gpos:v1",
    async () => (await getWindowsGpoInventory()) || null,
    { staleMs: 60_000, storageMaxAgeMs: 10 * 60_000, revalidateOnMount: "stale" }
  );

  React.useEffect(() => {
    if (refreshNonce) refetch();
  }, [refreshNonce, refetch]);

  const summary = data?.summary;
  const devices = React.useMemo(() => (Array.isArray(data?.devices) ? data.devices : []), [data]);

  const gpoRows = React.useMemo(
    () =>
      (Array.isArray(data?.gpos) ? data.gpos : []).map((g, i) => ({
        id: `${g.name}-${i}`,
        label: g.name,
        value: Number(g.devices || 0),
        color: BRAND.teal,
      })),
    [data]
  );

  const columns = [
    { field: "hostname", headerName: "Device", minWidth: 180, flex: 0.8 },
    { field: "osFullVersion", headerName: "OS", minWidth: 180, flex: 0.7 },
    {
      field: "computerGpos",
      headerName: "Computer GPOs",
      minWidth: 320,
      flex: 1.6,
      sortable: false,
      renderCell: (p) => <GpoChips names={p.value} />,
    },
    {
      field: "collectedAt",
      headerName: "Collected",
      minWidth: 150,
      flex: 0.5,
      renderCell: (p) => formatDate(p.value),
    },
  ];

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Kpi label="Devices reporting" value={loading && !summary ? "…" : summary?.devicesReporting ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Kpi label="With computer GPOs" value={loading && !summary ? "…" : summary?.withComputerGpos ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Kpi label="Distinct GPOs" value={loading && !summary ? "…" : summary?.distinctGpos ?? 0} />
        </Grid>
      </Grid>

      {/* ⚠️ El cero de usuario NO se calla ni se disfraza de "sin datos". Es
          una limitación conocida con una causa concreta, y decirla evita que
          alguien concluya que la flota no tiene directivas de usuario. */}
      {summary && summary.withUserGpos === 0 ? (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
          <strong>User GPOs are not collected yet.</strong> `gpresult /Scope User` runs from the
          privileged service, which has no interactive user profile, so Windows returns no user
          RSOP data. Collecting them needs the tray app — it runs inside the signed-in user's
          session — to report them back the same way it already requests software installs.
        </Alert>
      ) : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            <CompositionBars
              title="GPOs by reach"
              items={gpoRows}
              totalLabel="applications"
              emptyLabel="No GPOs reported"
              minHeight={320}
              maxItems={10}
            />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper
            elevation={0}
            sx={{ p: 2, borderRadius: 3, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
              Applied policies by device
            </Typography>
            <Box sx={{ height: 460, width: "100%" }}>
              <DataGrid
                rows={devices}
                columns={columns}
                loading={loading}
                getRowId={(r) => r.agentId}
                getRowHeight={() => "auto"}
                disableRowSelectionOnClick
                pageSizeOptions={[10, 25, 50]}
                initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                sx={{
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 2,
                  "& .MuiDataGrid-cell": { py: 0.75, alignItems: "center" },
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
