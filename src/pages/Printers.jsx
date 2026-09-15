// src/pages/Printers.jsx
//
// Asset Management → Printers: las impresoras de la FLOTA, no las de un equipo.
//
// Hasta ahora sólo se veían dentro del detalle de cada equipo, así que la
// pregunta "¿cuántas impresoras tenemos y dónde?" no tenía respuesta. Aquí se
// agrupan como colas (una cola de un servidor de impresión vista desde nueve
// equipos es UNA cola con nueve usuarios), se cuentan las físicas por su
// dirección y se dice qué parte del parque no se pudo leer.
//
// ⚠️ Los avisos de cobertura NO son decoración: van ANTES de las cifras porque
// cambian lo que las cifras significan. Ver utils/printerFleet.js.

import * as React from "react";
import { Alert, Box, Chip, Paper, Stack, Tooltip, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";
import { DataGrid } from "@mui/x-data-grid";

import { getPrinterFleet } from "../api/inventoryDashboard";
import { useCachedFetch } from "../hooks/useCachedFetch";
import RingCard from "../components/Charts/RingCard";
import { BRAND, TEXT } from "../theme/brand";
import { formatDate } from "../utils/format";
import {
  SOURCE_LABELS,
  connectionSlices,
  coverageNotices,
  filterPrinters,
  serverSlices,
  vendorSlices,
} from "../utils/printerFleet";

function Kpi({ label, value, hint }) {
  return (
    <Paper
      elevation={0}
      sx={{ p: 2, height: "100%", borderRadius: 3, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow }}
    >
      <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: BRAND.dark, mt: 0.5 }}>{value}</Typography>
      {hint ? <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 0.25 }}>{hint}</Typography> : null}
    </Paper>
  );
}

// ⚠️ Cero impresoras físicas con colas sin dirección NO es cero: es que no se
// sabe. Medido en T111 (2026-09-15): 8 colas, todas conexiones de usuario, sin
// una sola dirección — "0" habría dicho que la empresa no tiene impresoras.
function physicalValue(summary) {
  const known = Number(summary?.physicalPrinters ?? 0);
  const unaddressed = Number(summary?.queuesWithoutAddress ?? 0);
  return known === 0 && unaddressed > 0 ? "Unknown" : known;
}

function physicalHint(summary) {
  const known = Number(summary?.physicalPrinters ?? 0);
  const unaddressed = Number(summary?.queuesWithoutAddress ?? 0);
  const colas = `${unaddressed} ${unaddressed === 1 ? "queue" : "queues"}`;
  if (unaddressed === 0) return "Counted by device address";
  if (known === 0) return `None of the ${colas} reports a device address yet`;
  return `At least — ${colas} without a known address`;
}

function Missing({ children = "Not reported" }) {
  return <Typography sx={{ fontSize: TEXT.md, color: "text.disabled" }}>{children}</Typography>;
}

function UsersCell({ users }) {
  const list = Array.isArray(users) ? users : [];
  if (list.length === 0) return <Missing>No connected devices</Missing>;
  const shown = list.slice(0, 4);
  const rest = list.slice(4);
  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, py: 0.5 }}>
      {shown.map((u) => (
        <Chip
          key={u.agentId}
          size="small"
          label={u.hostname || u.agentId}
          title={u.isDefault ? "Default printer on this device" : undefined}
          sx={{
            height: 22,
            fontSize: TEXT.xs,
            bgcolor: BRAND.surfaceMuted,
            color: BRAND.dark,
            fontWeight: u.isDefault ? 700 : 500,
          }}
        />
      ))}
      {rest.length > 0 ? (
        <Tooltip title={rest.map((u) => u.hostname || u.agentId).join(", ")}>
          <Chip size="small" label={`+${rest.length}`} sx={{ height: 22, fontSize: TEXT.xs }} />
        </Tooltip>
      ) : null}
    </Stack>
  );
}

export default function Printers({ refreshNonce }) {
  const { data, loading, refetch } = useCachedFetch(
    "printers-fleet:v1",
    async () => (await getPrinterFleet()) || null,
    { staleMs: 60_000, storageMaxAgeMs: 10 * 60_000, revalidateOnMount: "stale" }
  );

  React.useEffect(() => {
    if (refreshNonce) refetch();
  }, [refreshNonce, refetch]);

  const summary = data?.summary;
  // Mientras carga NO se pinta 0: un cero es una afirmación.
  const cargando = loading && !summary;
  const [filter, setFilter] = React.useState(null);

  const notices = React.useMemo(() => coverageNotices(data), [data]);
  const printers = React.useMemo(() => filterPrinters(data?.printers, filter), [data, filter]);
  const fleetDevices = data?.coverage?.fleetDevices;

  const toggle = (type) => (slice) => {
    if (slice.key === "__other__") return;
    setFilter((f) => (f && f.type === type && f.key === slice.key ? null : { type, key: slice.key, label: slice.label }));
  };
  const active = (type) => (filter?.type === type ? filter.key : null);

  const columns = [
    {
      field: "name",
      headerName: "Printer",
      minWidth: 220,
      flex: 1.1,
      renderCell: (p) => (
        <Box sx={{ py: 0.5, minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{p.row.name}</Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
            {p.row.kind === "shared_queue" ? `\\\\${p.row.server}` : p.row.users?.[0]?.hostname || "Local"}
          </Typography>
        </Box>
      ),
    },
    {
      field: "model",
      headerName: "Model",
      minWidth: 200,
      flex: 1,
      // ⚠️ Una conexión de usuario no trae modelo: sólo lo sabe el servidor.
      // "Not reported" y no un guion, que se leería como "no tiene".
      renderCell: (p) => (p.value ? <Typography sx={{ fontSize: TEXT.md }}>{p.value}</Typography> : <Missing />),
    },
    {
      field: "location",
      headerName: "Location",
      minWidth: 140,
      flex: 0.6,
      renderCell: (p) => (p.value ? <Typography sx={{ fontSize: TEXT.md }}>{p.value}</Typography> : <Missing />),
    },
    {
      field: "hostAddress",
      headerName: "Address",
      minWidth: 130,
      flex: 0.5,
      renderCell: (p) =>
        p.value ? (
          <Typography sx={{ fontSize: TEXT.md, fontFamily: "monospace" }}>{p.value}</Typography>
        ) : (
          <Missing>Unknown</Missing>
        ),
    },
    {
      field: "users",
      headerName: "Used by",
      minWidth: 260,
      flex: 1.3,
      sortComparator: (a, b) => (a?.length ?? 0) - (b?.length ?? 0),
      renderCell: (p) => <UsersCell users={p.value} />,
    },
    {
      field: "sources",
      headerName: "Seen as",
      minWidth: 160,
      flex: 0.7,
      sortable: false,
      renderCell: (p) => (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, py: 0.5 }}>
          {(p.value || []).map((s) => (
            <Chip key={s} size="small" variant="outlined" label={SOURCE_LABELS[s] || s} sx={{ height: 22, fontSize: TEXT.xs }} />
          ))}
        </Stack>
      ),
    },
    {
      field: "lastSeenAtUtc",
      headerName: "Last seen",
      minWidth: 140,
      flex: 0.5,
      renderCell: (p) => formatDate(p.value),
    },
  ];

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi
            label="Print queues"
            value={cargando ? "…" : summary?.queues ?? 0}
            hint={
              !cargando && summary?.virtualQueues > 0
                ? `${summary.virtualQueues} virtual (PDF, XPS, OneNote…) not counted`
                : undefined
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {/* ⚠️ Las físicas salen de la dirección del puerto y SÓLO de ahí:
              varias colas pueden ser el mismo aparato. Las colas sin dirección
              se dicen, no se suman como "una impresora más". */}
          <Kpi
            label="Physical printers"
            value={cargando ? "…" : physicalValue(summary)}
            hint={cargando ? undefined : physicalHint(summary)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi
            label="Devices with printers"
            value={cargando ? "…" : summary?.devicesWithPrinters ?? 0}
            hint={!cargando && typeof fleetDevices === "number" ? `of ${fleetDevices} in the fleet` : undefined}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi label="Print servers" value={cargando ? "…" : summary?.printServers ?? 0} />
        </Grid>
      </Grid>

      {notices.map((n) => (
        <Alert key={n.key} severity={n.severity} sx={{ mb: 2, borderRadius: 3 }}>
          <strong>{n.title}</strong> {n.body}
        </Alert>
      ))}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            <RingCard
              title="By print server"
              subtitle="Where each queue lives"
              slices={serverSlices(data)}
              total={summary?.queues ?? null}
              centerLabel="queues"
              ariaNoun="queues"
              activeKey={active("server")}
              onSliceClick={toggle("server")}
              loading={cargando}
              emptyLabel="No printers reported"
              sx={{ minHeight: 260 }}
            />
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            <RingCard
              title="By vendor"
              subtitle="From the model, or the queue name when no model is reported"
              slices={vendorSlices(data)}
              total={summary?.queues ?? null}
              centerLabel="queues"
              ariaNoun="queues"
              activeKey={active("vendor")}
              onSliceClick={toggle("vendor")}
              loading={cargando}
              emptyLabel="No printers reported"
              sx={{ minHeight: 260 }}
            />
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            <RingCard
              title="By connection"
              subtitle="Shared from a server, network or direct (USB…)"
              slices={connectionSlices(data)}
              total={summary?.queues ?? null}
              centerLabel="queues"
              ariaNoun="queues"
              activeKey={active("connection")}
              onSliceClick={toggle("connection")}
              loading={cargando}
              emptyLabel="No printers reported"
              sx={{ minHeight: 260 }}
            />
          </Box>
        </Grid>
      </Grid>

      <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap" }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Print queues
          </Typography>
          {/* Una tabla filtrada que no lo dice miente sobre el tamaño del parque. */}
          {filter ? (
            <Chip
              size="small"
              label={`${filter.label} · ${printers.length}`}
              onDelete={() => setFilter(null)}
              sx={{ height: 24, fontWeight: 800, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
            />
          ) : null}
        </Stack>
        <Box sx={{ height: 520, width: "100%" }}>
          <DataGrid
            rows={printers}
            columns={columns}
            loading={loading}
            getRowId={(r) => r.key}
            getRowHeight={() => "auto"}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            localeText={{ noRowsLabel: "No printers reported" }}
            sx={{
              border: `1px solid ${BRAND.border}`,
              borderRadius: 2,
              "& .MuiDataGrid-cell": { py: 0.75, alignItems: "center" },
            }}
          />
        </Box>
      </Paper>
    </Box>
  );
}
