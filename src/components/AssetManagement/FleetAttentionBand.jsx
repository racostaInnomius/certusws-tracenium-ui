// src/components/AssetManagement/FleetAttentionBand.jsx
//
// Lo único de esta página que pide una acción hoy, a lo ancho y arriba de todo.
//
// ⚠️ Reemplaza a las tres tarjetas que encabezaban el tab, y las otras dos se
// fueron porque REPETÍAN una gráfica:
//
//   - "Under-spec" (4 equipos ≤8 GB) es la primera columna del histograma de
//     memoria. Dos maneras de decir lo mismo, y la tarjeta era la que menos
//     decía: el número sin la forma no dice si esos 4 son la cola de una flota
//     sana o el principio de un problema.
//   - "Fleet composition" (el total) vive ahora en el centro de la dona.
//
// Lo que queda no se repite en ninguna gráfica: el histograma de disco enseña
// la FORMA de la flota, y esta banda el número que hay que atender. Es la misma
// relación que el operador usa para decidir — cuántos, y qué tan cerca vienen
// los demás.

import * as React from "react";
import { Box, Chip, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

export default function FleetAttentionBand({ attention, loading, activeFilter, onSelect }) {
  // ⚠️ Mientras carga NO se pinta 0. Un cero es una afirmación —"no hay nada
  // que atender"— y hacerla antes de tener los datos es justo la mentira
  // tranquilizadora que esta banda existe para evitar.
  if (loading && !attention) {
    return (
      <Paper
        elevation={0}
        sx={{
          mb: 2,
          px: 2,
          py: 1.5,
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
        }}
      >
        <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>Loading…</Typography>
      </Paper>
    );
  }

  const count = Number(attention?.diskHigh || 0);
  const unknown = Number(attention?.diskUnknown || 0);
  const threshold = Number(attention?.thresholdPct || 85);
  const calm = count === 0;
  const active = activeFilter === "disk_high" || activeFilter === "disk_unknown";

  return (
    <Paper
      elevation={0}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`${count} devices above ${threshold}% disk usage`}
      onClick={() => onSelect?.(count > 0 ? "disk_high" : "all")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(count > 0 ? "disk_high" : "all");
        }
      }}
      sx={{
        mb: 2,
        px: 2,
        py: 1.5,
        borderRadius: 3,
        cursor: "pointer",
        border: `1px solid ${active ? BRAND.teal : BRAND.border}`,
        boxShadow: active ? `0 0 0 3px ${BRAND.tealSoft}` : BRAND.shadow,
        bgcolor: calm ? BRAND.surface : BRAND.alert.errorSoft,
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
        transition: "border-color 160ms ease, box-shadow 160ms ease",
        "&:hover": { borderColor: BRAND.teal },
      }}
    >
      <Stack direction="row" alignItems="baseline" spacing={1}>
        <Typography
          sx={{
            fontSize: TEXT["2xl"],
            fontWeight: 800,
            lineHeight: 1,
            color: calm ? BRAND.tealText : ROLE.critical,
          }}
        >
          {count}
        </Typography>
        <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, color: BRAND.dark }}>
          {calm ? `No device is over ${threshold}% disk` : `devices over ${threshold}% disk usage`}
        </Typography>
      </Stack>

      <Box sx={{ flex: 1 }} />

      {/* El "sin dato" viaja aparte y NUNCA sumado al de la izquierda: un
          equipo del que no sabemos nada no es un equipo con problema. Pero
          tampoco se calla — no saber también es un dato. */}
      {unknown > 0 ? (
        <Tooltip title="These devices have not reported disk capacity, so they are neither counted as healthy nor as full.">
          <Chip
            size="small"
            label={`${unknown} not reporting disk`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.("disk_unknown");
            }}
            sx={{
              height: 24,
              fontSize: TEXT.xs,
              fontWeight: 700,
              bgcolor: BRAND.surfaceMuted,
              color: BRAND.dark,
              cursor: "pointer",
            }}
          />
        </Tooltip>
      ) : null}
    </Paper>
  );
}
