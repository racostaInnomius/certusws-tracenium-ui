// src/components/Reports/ReportTypeCard.jsx
//
// Una tarjeta por tipo de informe, en lugar de una fila de tabla.
//
// La celda de acciones metía hasta CINCO botones en 340 px (uno por formato +
// Preview + Email + Schedule) y el grupo se pintaba como una columna de texto
// teniendo `group` del servidor. En una tarjeta los formatos respiran, el
// grupo agrupa de verdad y cabe lo que de verdad se quiere saber antes de
// pulsar: cuándo se generó por última vez y cómo fue.
//
// El último run venía en `report_runs` desde E3 y obligaba a bajar a otra
// tabla para verlo. Es la pregunta que se hace ANTES de generar —"¿no lo
// habrá sacado ya alguien esta mañana?"— y estaba a dos pantallas.

import * as React from "react";
import { Box, Button, Chip, Stack, Tooltip, Typography } from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import SectionPaper from "../common/SectionPaper";
import { formatWhen, runStatusColor, runStatusLabel } from "./reportSchedules";
import { BRAND, TEXT } from "../../theme/brand";

export default function ReportTypeCard({
  type,
  lastRun = null,
  runningFormat = "",
  canPreview = false,
  canSchedule = false,
  onRun,
  onPreview,
  onEmail,
  onSchedule,
}) {
  const formats = Array.isArray(type.formats) ? type.formats : [];
  const pideParams = Boolean(type.params?.length);

  return (
    // `role="group"` con el nombre del informe: la tarjeta es un conjunto de
    // controles SOBRE UN MISMO informe, y sin eso un lector de pantalla lee
    // "PDF, CSV, Preview, Email" sin decir de qué. También es lo que deja
    // localizarla sin depender de la maquetación.
    <SectionPaper
      variant="panel"
      role="group"
      aria-label={type.label}
      sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column", minWidth: 0 }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 0.5 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark, flex: 1, minWidth: 0 }}>
          {type.label}
        </Typography>
        {/* Avisa de que este tipo va a preguntar antes de generar, en vez de
            sorprender con un diálogo tras pulsar un formato. */}
        {pideParams ? (
          <Tooltip title="This report asks for a scope before it runs">
            <Chip size="small" label="params" variant="outlined" sx={{ height: 20, fontSize: TEXT.xs }} />
          </Tooltip>
        ) : null}
      </Stack>

      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5, flex: 1 }}>
        {type.description}
      </Typography>

      {/* Último run: lo que se quiere saber ANTES de generar otro. */}
      <Box sx={{ mb: 1.5 }}>
        {lastRun ? (
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
            <Chip
              size="small"
              variant="outlined"
              color={runStatusColor(lastRun.outcome)}
              label={runStatusLabel(lastRun.outcome)}
              sx={{ height: 20, fontSize: TEXT.xs }}
            />
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              {formatWhen(lastRun.occurredAt)}
              {lastRun.actor ? ` · ${lastRun.actor}` : ""}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Never generated
          </Typography>
        )}
      </Box>

      {/* Los formatos GENERAN. Un botón por formato y no un desplegable: son
          dos o tres, y esconderlos tras un menú añade un clic a la acción
          principal de la tarjeta. */}
      <Stack direction="row" spacing={0.5} sx={{ mb: 1, flexWrap: "wrap", rowGap: 0.5 }}>
        {formats.map((format) => (
          <Button
            key={format}
            size="small"
            variant="outlined"
            startIcon={<DownloadOutlinedIcon />}
            disabled={runningFormat === format}
            onClick={() => onRun?.(format)}
            sx={{ textTransform: "none", minWidth: 0 }}
          >
            {format.toUpperCase()}
          </Button>
        ))}
      </Stack>

      {/* Secundarias: mirar antes de generar, mandar por correo, programar. */}
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
        {canPreview ? (
          <Button size="small" startIcon={<VisibilityOutlinedIcon />} onClick={onPreview} sx={{ textTransform: "none" }}>
            Preview
          </Button>
        ) : null}
        <Button size="small" startIcon={<MailOutlineIcon />} onClick={onEmail} sx={{ textTransform: "none" }}>
          Email
        </Button>
        {canSchedule ? (
          <Button size="small" startIcon={<EventRepeatOutlinedIcon />} onClick={onSchedule} sx={{ textTransform: "none" }}>
            Schedule
          </Button>
        ) : null}
      </Stack>
    </SectionPaper>
  );
}
