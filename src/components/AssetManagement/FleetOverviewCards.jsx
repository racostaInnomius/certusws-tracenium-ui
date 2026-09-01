// src/components/AssetManagement/FleetOverviewCards.jsx
//
// La fila que encabeza Hardware Inventory.
//
// ⚠️ Reemplaza a "Devices" y "Avg Memory". Ninguna de las dos contestaba una
// pregunta que alguien tuviera: `Devices` repetía un conteo que ya vive en
// otras dos pantallas, y `Avg Memory` promediaba servidores virtuales con
// laptops — un número que no describe a ninguna máquina y no dispara ninguna
// decisión.
//
// EL CAMBIO DE FONDO NO SON LAS CIFRAS, ES QUE LAS TARJETAS FILTRAN.
//
// Antes eran adorno: ver "5 equipos con disco alto" y no poder saber CUÁLES
// obligaba a buscarlos a mano en una tabla paginada. Cada tarjeta —y cada
// segmento de la barra— aplica su filtro a la tabla de abajo, que es lo que
// convierte la pantalla de reporte en herramienta.
//
// Las cifras vienen del backend ya contadas (summarizeFleet), no se derivan
// aquí: el conteo de la tarjeta y las filas del filtro salen de la MISMA
// función, o la pantalla acabaría diciendo "5" y mostrando cuatro.

import * as React from "react";
import { Box, Chip, Paper, Stack, Tooltip, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

/**
 * Segmentos de la barra de composición.
 *
 * ⚠️ `virtual` NO está aquí. Es un eje distinto que atraviesa a los otros
 * cuatro (un servidor puede ser virtual), y meterlo como quinto segmento haría
 * que la barra sumara más que la flota. Va como chip aparte.
 */
const SEGMENTS = [
  { key: "laptop", label: "Laptops", color: BRAND.teal },
  { key: "desktop", label: "Desktops", color: BRAND.tealText },
  { key: "server", label: "Servers", color: BRAND.dark },
  { key: "unknown", label: "Unclassified", color: BRAND.gray },
];

function clickableSx(active) {
  return {
    cursor: "pointer",
    transition: "border-color 160ms ease, box-shadow 160ms ease",
    borderColor: active ? BRAND.teal : BRAND.border,
    boxShadow: active ? `0 0 0 3px ${BRAND.tealSoft}` : BRAND.shadow,
    "&:hover": { borderColor: BRAND.teal },
  };
}

function CardShell({ children, active, onClick, ariaLabel }) {
  return (
    <Paper
      elevation={0}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      sx={{
        p: 2,
        height: "100%",
        minHeight: 132,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        ...clickableSx(active),
      }}
    >
      {children}
    </Paper>
  );
}

function CardTitle({ children }) {
  return (
    <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>{children}</Typography>
  );
}

/**
 * Equipos que piden atención hoy.
 *
 * En cero se ve TRANQUILA, no vacía: "nada por encima del 85%" es una
 * respuesta y merece leerse como tal. Una tarjeta en blanco se confunde con
 * una que no cargó.
 */
function AttentionCard({ attention, active, onSelect }) {
  const count = Number(attention?.diskHigh || 0);
  const unknown = Number(attention?.diskUnknown || 0);
  const threshold = Number(attention?.thresholdPct || 85);
  const calm = count === 0;

  return (
    <CardShell
      active={active}
      onClick={() => onSelect(count > 0 ? "disk_high" : "all")}
      ariaLabel={`${count} devices above ${threshold}% disk usage`}
    >
      <CardTitle>Needs attention</CardTitle>

      <Box>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography
            sx={{
              fontSize: TEXT["3xl"],
              fontWeight: 800,
              lineHeight: 1.1,
              color: calm ? BRAND.tealText : ROLE.critical,
            }}
          >
            {count}
          </Typography>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>
            {calm ? `no device is over ${threshold}% disk` : `over ${threshold}% disk usage`}
          </Typography>
        </Stack>

        {/* El "sin dato" viaja aparte y NUNCA sumado al de arriba: un equipo
            del que no sabemos nada no es un equipo con problema. Pero tampoco
            se calla — no saber también es un dato. */}
        {unknown > 0 ? (
          <Tooltip title="These devices have not reported disk capacity, so they are neither counted as healthy nor as full.">
            <Chip
              size="small"
              label={`${unknown} not reporting disk`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect("disk_unknown");
              }}
              sx={{
                mt: 1,
                height: 22,
                fontSize: TEXT.xs,
                fontWeight: 700,
                bgcolor: BRAND.surfaceMuted,
                color: BRAND.dark,
                cursor: "pointer",
              }}
            />
          </Tooltip>
        ) : null}
      </Box>
    </CardShell>
  );
}

/**
 * De qué está hecha la flota — una sola barra apilada en vez de cuatro
 * rankings idénticos.
 *
 * La forma sigue a la pregunta: esto son proporciones de un todo, y un todo se
 * lee de un vistazo en una barra, no en cuatro listas que hay que sumar
 * mentalmente.
 */
function CompositionCard({ composition, total, activeFilter, onSelect }) {
  const segments = SEGMENTS.map((s) => ({
    ...s,
    value: Number(composition?.[s.key] || 0),
  })).filter((s) => s.value > 0);

  const sum = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  const virtual = Number(composition?.virtual || 0);

  return (
    <CardShell
      active={activeFilter === "all"}
      onClick={() => onSelect("all")}
      ariaLabel={`Fleet of ${total} devices`}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <CardTitle>Fleet composition</CardTitle>
        <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>
          {Number(total || 0)}
        </Typography>
      </Stack>

      <Box sx={{ mt: 1.25 }}>
        <Box
          sx={{
            display: "flex",
            height: 12,
            borderRadius: 999,
            overflow: "hidden",
            bgcolor: BRAND.surfaceMuted,
          }}
        >
          {segments.map((s) => (
            <Tooltip key={s.key} title={`${s.label}: ${s.value}`}>
              <Box
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(s.key);
                }}
                sx={{
                  width: `${(s.value / sum) * 100}%`,
                  bgcolor: s.color,
                  cursor: "pointer",
                  opacity: activeFilter === s.key ? 1 : 0.9,
                  transition: "opacity 160ms ease",
                  "&:hover": { opacity: 1 },
                }}
              />
            </Tooltip>
          ))}
        </Box>

        <Stack direction="row" spacing={1.25} sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.5 }}>
          {segments.map((s) => (
            <Stack
              key={s.key}
              direction="row"
              spacing={0.5}
              alignItems="center"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(s.key);
              }}
              sx={{ cursor: "pointer" }}
            >
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: s.color }} />
              <Typography
                sx={{
                  fontSize: TEXT.xs,
                  fontWeight: activeFilter === s.key ? 800 : 600,
                  color: activeFilter === s.key ? BRAND.dark : "text.secondary",
                }}
              >
                {s.label} {s.value}
              </Typography>
            </Stack>
          ))}

          {/* El eje que atraviesa. Se muestra aparte justamente porque decir
              "11 virtuales" junto a "11 servidores" es el hallazgo: toda la
              capa de servidores de esta flota está virtualizada. */}
          {virtual > 0 ? (
            <Tooltip title="Runs on a hypervisor. This cuts across the categories above — a server can also be virtual.">
              <Chip
                size="small"
                label={`${virtual} virtual`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect("virtual");
                }}
                sx={{
                  height: 20,
                  fontSize: TEXT.xs,
                  fontWeight: 700,
                  bgcolor: activeFilter === "virtual" ? BRAND.tealSoftStrong : BRAND.tealSoft,
                  color: BRAND.tealText,
                  cursor: "pointer",
                }}
              />
            </Tooltip>
          ) : null}
        </Stack>
      </Box>
    </CardShell>
  );
}

/** Equipos por debajo del piso de memoria — candidatos naturales a renovación. */
function UnderSpecCard({ underSpec, active, onSelect }) {
  const count = Number(underSpec?.lowMemory || 0);
  const floor = Number(underSpec?.floorGb || 8);

  return (
    <CardShell
      active={active}
      onClick={() => onSelect(count > 0 ? "low_memory" : "all")}
      ariaLabel={`${count} devices at or below ${floor} GB of memory`}
    >
      <CardTitle>Under-spec</CardTitle>

      <Box>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography
            sx={{
              fontSize: TEXT["3xl"],
              fontWeight: 800,
              lineHeight: 1.1,
              color: count > 0 ? BRAND.alert.high : BRAND.tealText,
            }}
          >
            {count}
          </Typography>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>
            {count === 0 ? `every device is over ${floor} GB` : `at or below ${floor} GB of RAM`}
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 1 }}>
          Refresh candidates
        </Typography>
      </Box>
    </CardShell>
  );
}

export default function FleetOverviewCards({ fleet, loading, activeFilter, onSelect }) {
  // ⚠️ Mientras carga NO se pinta 0. Un cero es una afirmación —"no hay nada
  // que atender"— y hacerla antes de tener los datos es justo la mentira
  // tranquilizadora que esta fila existe para evitar.
  if (loading && !fleet) {
    return (
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[0, 1, 2].map((i) => (
          <Grid key={i} size={{ xs: 12, md: 4 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                minHeight: 132,
                borderRadius: 3,
                border: `1px solid ${BRAND.border}`,
                display: "flex",
                alignItems: "center",
              }}
            >
              <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>Loading…</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    );
  }

  const composition = fleet?.composition;
  const attention = fleet?.attention;
  const underSpec = fleet?.underSpec;

  return (
    <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
      <Grid size={{ xs: 12, md: 4 }}>
        <AttentionCard
          attention={attention}
          active={activeFilter === "disk_high" || activeFilter === "disk_unknown"}
          onSelect={onSelect}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <CompositionCard
          composition={composition}
          total={fleet?.total}
          activeFilter={activeFilter}
          onSelect={onSelect}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <UnderSpecCard
          underSpec={underSpec}
          active={activeFilter === "low_memory"}
          onSelect={onSelect}
        />
      </Grid>
    </Grid>
  );
}
