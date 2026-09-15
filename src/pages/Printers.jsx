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
  adSourceLine,
  connectionSlices,
  coverageNotices,
  filterPrinters,
  notCountedParts,
  notCountedTotal,
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
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{p.row.name}</Typography>
            {/* ⚠️ ADR-0023 D9: un pool reparte trabajos entre aparatos, y cada
                dirección cuenta como una impresora. Sin la marca, la misma cola
                repetida en dos filas parecería un duplicado. */}
            {p.row.pooled ? (
              <Chip
                size="small"
                label="Pool"
                title="This queue spreads jobs across several printers; each address counts as one"
                sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
              />
            ) : null}
          </Stack>
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
            {p.row.kind === "shared_queue" ? `\\\\${p.row.server}` : p.row.users?.[0]?.hostname || "Local"}
          </Typography>
          {/* Los otros nombres con los que aparece: dice POR QUÉ varias colas
              cuentan como una sola impresora. */}
          {Array.isArray(p.row.aliases) && p.row.aliases.length > 0 ? (
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }} title={p.row.aliases.join(", ")}>
              {`Also as: ${p.row.aliases.slice(0, 2).join(", ")}${p.row.aliases.length > 2 ? ` +${p.row.aliases.length - 2}` : ""}`}
            </Typography>
          ) : null}
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
      // ⚠️ `declared` = sacada del NOMBRE del puerto (IP_10.x…), no medida: si
      // alguien cambió la IP sin renombrar el puerto, es la vieja.
      renderCell: (p) =>
        p.value ? (
          <Box sx={{ py: 0.5 }}>
            <Typography sx={{ fontSize: TEXT.md, fontFamily: "monospace" }}>
              {(p.row.addresses?.length ? p.row.addresses : [p.value]).join(", ")}
            </Typography>
            {p.row.addressSource === "declared" ? (
              <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }} title="Taken from the port name, not measured on the device">
                from port name
              </Typography>
            ) : null}
          </Box>
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
          {/* ⚠️ La cifra es la IMPRESORA, no la cola: una misma impresora se
              instala con varios nombres en varios equipos. Medido en T111 el
              2026-09-15: 111 colas que eran 38 impresoras. */}
          <Kpi
            label="Printers"
            value={cargando ? "…" : summary?.physicalPrinters ?? 0}
            hint={
              cargando
                ? undefined
                : `From ${summary?.queues ?? 0} print queues${
                    summary?.printersWithoutAddress > 0 ? ` · ${summary.printersWithoutAddress} without a network address` : ""
                  }${summary?.adOnlyPrinters > 0 ? ` · ${summary.adOnlyPrinters} only in Active Directory` : ""}`
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi
            label="Not counted"
            value={cargando ? "…" : notCountedTotal(summary)}
            hint={cargando ? undefined : notCountedParts(summary).join(" · ") || "No virtual or auto-discovered queues"}
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

      {/* ADR-0023: la parte de AD dice de dónde y de cuándo es. */}
      {adSourceLine(data) ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: -1, mb: 2 }}>{adSourceLine(data)}</Typography>
      ) : null}

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
              subtitle="Where each printer is shared from"
              slices={serverSlices(data)}
              total={summary?.physicalPrinters ?? null}
              centerLabel="printers"
              ariaNoun="printers"
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
              total={summary?.physicalPrinters ?? null}
              centerLabel="printers"
              ariaNoun="printers"
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
              total={summary?.physicalPrinters ?? null}
              centerLabel="printers"
              ariaNoun="printers"
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
            Printers
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
