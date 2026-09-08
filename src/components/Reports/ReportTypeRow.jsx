// src/components/Reports/ReportTypeRow.jsx
//
// Una FILA por tipo de informe. Sustituye a `ReportTypeCard`.
//
// La tarjeta daba a seis informes la altura de una pantalla y media: cada una
// llevaba hasta cinco botones (uno por formato + Preview + Email + Schedule),
// y con seis tipos había que hacer scroll para ver el catálogo entero de un
// tenant que sólo tiene seis cosas que generar. Un catálogo se lee de arriba
// abajo buscando una línea; para eso una lista gana a una rejilla de fichas.
//
// Qué se quitó de la fila y por qué:
//
//   * Un botón por formato (CSV · JSON · PDF). El formato es una PROPIEDAD de
//     lo que vas a generar, no tres acciones distintas: se pregunta al
//     generar. Tres botones por fila eran dieciséis en pantalla, todos con el
//     mismo peso visual y ninguno siendo la acción principal.
//   * "Schedule". Programar tiene su propia pestaña, y desde ella se puede
//     programar cualquier tipo — el botón de aquí era un segundo camino al
//     mismo sitio, compitiendo por espacio con la acción principal.
//   * "Email". No se puede mandar lo que todavía no existe: mandar por correo
//     es algo que se decide DESPUÉS de generar, y ahí es donde se ofrece.
//
// Queda lo que sí se hace desde el catálogo: mirar antes de generar
// (`Preview`, sólo para los tipos que tienen JSON) y generar.

import * as React from "react";
import { Box, Button, Chip, Stack, Tooltip, Typography } from "@mui/material";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { formatWhen, runStatusColor, runStatusLabel } from "./reportSchedules";
import { groupLabel } from "./reportGroups";
import { BRAND, TEXT } from "../../theme/brand";

export default function ReportTypeRow({
  type,
  lastRun = null,
  busy = false,
  canPreview = false,
  onGenerate,
  onPreview,
}) {
  const pideParams = Boolean(type.params?.length);

  return (
    // `role="group"` con el nombre del informe: la fila es un conjunto de
    // controles SOBRE UN MISMO informe, y sin eso un lector de pantalla lee
    // "Preview, Generate" sin decir de qué.
    <Box
      role="group"
      aria-label={type.label}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.5,
        py: 1.25,
        borderBottom: `1px solid ${BRAND.border}`,
        "&:last-of-type": { borderBottom: "none" },
        "&:hover": { bgcolor: BRAND.surfaceHover || BRAND.tealSoft },
        flexWrap: { xs: "wrap", md: "nowrap" },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }} noWrap>
            {type.label}
          </Typography>
          {/* De qué página sale, con el nombre que esa página tiene en el
              menú. Sustituye a los encabezados de grupo: con seis informes
              repartidos en cinco grupos, cinco cabeceras costaban más alto
              que las propias filas. */}
          <Chip
            size="small"
            variant="outlined"
            label={groupLabel(type.group)}
            sx={{ height: 20, fontSize: TEXT.xs, flexShrink: 0 }}
          />
          {/* Avisa de que este tipo va a preguntar por su alcance, en vez de
              sorprender con un diálogo tras pulsar. */}
          {pideParams ? (
            <Tooltip title="This report asks for a scope before it runs">
              <Chip size="small" label="params" variant="outlined" sx={{ height: 20, fontSize: TEXT.xs, flexShrink: 0 }} />
            </Tooltip>
          ) : null}
        </Stack>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }} noWrap title={type.description}>
          {type.description}
        </Typography>
      </Box>

      {/* Último run: lo que se quiere saber ANTES de generar otro — "¿no lo
          habrá sacado ya alguien esta mañana?". */}
      <Box sx={{ flexShrink: 0, minWidth: { md: 190 }, textAlign: { md: "right" } }}>
        {lastRun ? (
          <Stack direction="row" spacing={0.75} alignItems="center" justifyContent={{ md: "flex-end" }}>
            <Chip
              size="small"
              variant="outlined"
              color={runStatusColor(lastRun.outcome)}
              label={runStatusLabel(lastRun.outcome)}
              sx={{ height: 20, fontSize: TEXT.xs }}
            />
            <Typography variant="caption" sx={{ color: BRAND.gray }} noWrap>
              {formatWhen(lastRun.occurredAt)}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Never generated
          </Typography>
        )}
      </Box>

      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
        {canPreview ? (
          <Button
            size="small"
            startIcon={<VisibilityOutlinedIcon />}
            onClick={onPreview}
            sx={{ textTransform: "none" }}
          >
            Preview
          </Button>
        ) : null}
        <Button
          size="small"
          variant="outlined"
          startIcon={<PlayArrowOutlinedIcon />}
          onClick={onGenerate}
          disabled={busy}
          // Nombre accesible ESTABLE: el rótulo pasa a "Generating…" mientras
          // corre, y sin esto la fila deja de encontrarse por su botón justo
          // durante la acción.
          aria-label={`Generate ${type.label}`}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {busy ? "Generating…" : "Generate"}
        </Button>
      </Stack>
    </Box>
  );
}
