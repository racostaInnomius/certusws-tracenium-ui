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
import { describeWithoutGpos } from "../utils/gpoDomainSummary";

function Kpi({ label, value, tone, onClick, active, hint }) {
  const clicable = typeof onClick === "function";
  return (
    <Paper
      elevation={0}
      role={clicable ? "button" : undefined}
      tabIndex={clicable ? 0 : undefined}
      aria-pressed={clicable ? Boolean(active) : undefined}
      onClick={onClick}
      onKeyDown={
        clicable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        p: 2,
        height: "100%",
        borderRadius: 3,
        cursor: clicable ? "pointer" : "default",
        border: `1px solid ${active ? BRAND.teal : BRAND.border}`,
        boxShadow: active ? `0 0 0 3px ${BRAND.tealSoft}` : BRAND.shadow,
        transition: "border-color 160ms ease, box-shadow 160ms ease",
        ...(clicable ? { "&:hover": { borderColor: BRAND.teal } } : {}),
      }}
    >
      <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: tone || BRAND.dark, mt: 0.5 }}>
        {value}
      </Typography>
      {hint ? (
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 0.25 }}>{hint}</Typography>
      ) : null}
    </Paper>
  );
}

function GpoChips({ names }) {
  // ⚠️ "Ninguna" y "no se pudo leer" son cosas distintas y se ven distintas.
  // Que se vieran igual es lo que hizo pasar por equipo sin directivas a uno
  // que tenia tres aplicadas: el colector no encontraba el encabezado en un
  // Windows en espanol y devolvia la lista vacia.
  if (names === null || names === undefined) {
    return <Typography sx={{ fontSize: TEXT.md, color: "text.disabled" }}>Not reported</Typography>;
  }
  const list = Array.isArray(names) ? names : [];
  if (list.length === 0) {
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
  // Mientras carga NO se pinta 0: un cero es una afirmacion, y hacerla antes
  // de tener los datos es la mentira tranquilizadora de siempre.
  const cargando = loading && !summary;

  const todos = React.useMemo(() => (Array.isArray(data?.devices) ? data.devices : []), [data]);

  const sinNinguna = Number(summary?.withoutAnyGpos ?? 0);
  // ⚠️ El total por si solo no dice que hacer: un equipo de workgroup sin
  // directivas esta bien, uno de dominio sin directivas esta averiado. El
  // desglose vive en gpoDomainSummary.js con sus tests.
  const desglose = describeWithoutGpos(summary);

  // Ver solo los equipos sin ninguna directiva. Se apaga volviendo a pulsar.
  const [soloSinGpo, setSoloSinGpo] = React.useState(false);

  const devices = React.useMemo(
    () =>
      soloSinGpo
        ? todos.filter(
            (d) =>
              // ⚠️ Mismo criterio que el conteo del backend (gpo-domain.ts):
              // un equipo cuya lectura fallo NO es un equipo sin directivas.
              Array.isArray(d.computerGpos) &&
              d.computerGpos.length === 0 &&
              (d.userGpos?.length ?? 0) === 0
          )
        : todos,
    [todos, soloSinGpo]
  );

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
      field: "partOfDomain",
      headerName: "Domain",
      minWidth: 200,
      flex: 0.8,
      // ⚠️ Tres estados, no dos. `null` es "todavia no lo reporta", y pintarlo
      // como "Workgroup" convertiria un equipo averiado en uno correcto.
      renderCell: (p) => {
        const enDominio = p.value;
        if (enDominio === true) {
          return (
            <Typography sx={{ fontSize: TEXT.md }}>{p.row?.domain || "Joined"}</Typography>
          );
        }
        if (enDominio === false) {
          return (
            <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>Workgroup</Typography>
          );
        }
        return (
          <Typography sx={{ fontSize: TEXT.md, color: "text.disabled" }}>Not reported</Typography>
        );
      },
    },
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
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi label="Devices reporting" value={cargando ? "…" : summary?.devicesReporting ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi label="With computer GPOs" value={cargando ? "…" : summary?.withComputerGpos ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {/* ⚠️ La ausencia es un dato: sin este numero, un equipo sin
              directivas se pierde entre las cincuenta filas de la tabla.
              Pero el total no basta —mezcla workgroup con averia— asi que
              debajo va el desglose, y el rojo se enciende SOLO cuando hay
              equipos unidos al dominio sin recibir ni una. */}
          <Kpi
            label="Without any GPO"
            value={cargando ? "…" : sinNinguna}
            hint={cargando ? undefined : desglose?.text}
            tone={desglose?.actionable ? BRAND.alert.high : undefined}
            onClick={sinNinguna > 0 ? () => setSoloSinGpo((v) => !v) : undefined}
            active={soloSinGpo}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi label="Distinct GPOs" value={cargando ? "…" : summary?.distinctGpos ?? 0} />
        </Grid>
      </Grid>

      {/* ⚠️ El aviso solo aparece cuando HAY directivas de equipo.
          Antes salia siempre que withUserGpos era 0, es decir tambien en
          tenants sin un solo equipo de dominio: ahi no es que falten las de
          usuario, es que no hay GPO de ninguna clase, y regañar por una
          limitacion que no aplica es ruido. */}
      {summary && summary.withComputerGpos > 0 && summary.withUserGpos === 0 ? (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
          <strong>User GPOs are not collected yet.</strong> <code>gpresult /Scope User</code> runs
          from the privileged service, which has no interactive user profile, so Windows returns no
          user RSOP data. Collecting them needs the tray app — it runs inside the signed-in
          user&apos;s session — to report them back the same way it already requests software
          installs.
        </Alert>
      ) : null}

      {/* El caso contrario: hay equipos, y ninguno tiene directivas. Decirlo
          es mejor que tres ceros y una grafica vacia, que no distinguen "no
          aplica" de "algo se rompio". */}
      {summary && summary.devicesReporting > 0 && summary.withComputerGpos === 0 ? (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          <strong>
            {summary.devicesReporting} device{summary.devicesReporting === 1 ? "" : "s"} reported,
            none has any Group Policy applied.
          </strong>{" "}
          {desglose?.joined > 0
            ? `${desglose.joined} of them ${desglose.joined === 1 ? "is" : "are"} joined to a domain and should be receiving policies — that part is a fault worth chasing.`
            : "Check the Domain column below: on a workgroup device this is the expected state."}
        </Alert>
      ) : null}

      {/* ⚠️ La lectura que fallo se declara. Es el aviso que no existia cuando
          un equipo con tres directivas aplicadas llevaba meses contandose
          entre los que no tenian ninguna. */}
      {summary && summary.withoutGpoData > 0 ? (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          <strong>
            {summary.withoutGpoData} device{summary.withoutGpoData === 1 ? "" : "s"} could not report{" "}
            {summary.withoutGpoData === 1 ? "its" : "their"} applied policies.
          </strong>{" "}
          They are counted apart from the devices below: a failed read is not the same as a device
          with no Group Policy, and treating it as one hides exactly the devices worth looking at.
        </Alert>
      ) : null}

      {/* ⚠️ Mientras haya equipos que no reportan pertenencia al dominio, el
          conteo de averiados es un PISO y no un total. Callarlo dejaria la
          pantalla afirmando "solo hay uno" cuando lo que hay es "solo se sabe
          de uno" — y esas dos frases llevan a decisiones distintas. */}
      {summary && summary.domainUnknown > 0 && summary.devicesReporting > 0 ? (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
          <strong>
            {summary.domainUnknown} of {summary.devicesReporting} device
            {summary.devicesReporting === 1 ? "" : "s"} {summary.domainUnknown === 1 ? "does" : "do"}{" "}
            not report domain membership yet.
          </strong>{" "}
          The agent already collects it; each device starts sending it on its next compliance
          evaluation cycle. Until then the domain-joined counts below are a floor, not a total.
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
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ mb: 1.5, flexWrap: "wrap" }}
            >
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Applied policies by device
              </Typography>
              {/* Una tabla filtrada que no lo dice miente sobre el tamano de
                  la flota. Misma regla que en Hardware Inventory. */}
              {soloSinGpo ? (
                <Chip
                  size="small"
                  label={`Without any GPO · ${devices.length}`}
                  onDelete={() => setSoloSinGpo(false)}
                  sx={{
                    height: 24,
                    fontWeight: 800,
                    fontSize: TEXT.xs,
                    bgcolor: BRAND.tealSoft,
                    color: BRAND.tealText,
                  }}
                />
              ) : null}
            </Stack>
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
