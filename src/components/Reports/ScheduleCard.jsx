// src/components/Reports/ScheduleCard.jsx
//
// Una ficha por programación, en lugar de una fila de ocho columnas.
//
// Una programación tiene alcance, periodo, destinatarios, destinos GRC y dos
// fechas. En una tabla eso son ocho columnas apretadas donde lo importante
// —qué manda, a quién y cuándo— queda repartido y ninguna celda lo cuenta
// entero. En una ficha se lee como una frase.
//
// Y los destinos GRC van POR SU NOMBRE. "1 destino" no dice si es el bueno
// cuando hay tres, y en una programación mensual el error se descubre un mes
// después.

import * as React from "react";
import { Box, Chip, IconButton, Menu, MenuItem, Stack, Switch, Tooltip, Typography } from "@mui/material";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVert";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SectionPaper from "../common/SectionPaper";
import {
  describePeriod, formatWhen, recipientCount, runStatusColor, runStatusLabel,
  summarizeParams, typeHasPeriod,
} from "./reportSchedules";
import { BRAND, TEXT } from "../../theme/brand";

export default function ScheduleCard({
  schedule,
  type,
  targetsById = {},
  busy = false,
  onToggle,
  onRun,
  onEdit,
  onDelete,
}) {
  const [menuEl, setMenuEl] = React.useState(null);
  const cerrar = () => setMenuEl(null);
  const hacer = (fn) => () => { cerrar(); fn?.(schedule); };

  const etiqueta = type?.label || schedule.reportKey;
  const alcance = [
    summarizeParams(schedule, type),
    typeHasPeriod(type) ? describePeriod(schedule.periodMonths) : "",
  ].filter(Boolean).join(" · ");

  const destinatarios = recipientCount(schedule);
  const destinos = (schedule.targetIds || []).map((id) => targetsById[id]);

  return (
    <SectionPaper variant="panel" role="group" aria-label={`Schedule ${etiqueta}`} sx={{ p: 2, minWidth: 0 }}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>
            {etiqueta} · {String(schedule.format || "").toUpperCase()}
          </Typography>
          {alcance ? (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{alcance}</Typography>
          ) : null}
        </Box>

        <Switch
          size="small"
          checked={Boolean(schedule.enabled)}
          disabled={busy}
          onChange={() => onToggle?.(schedule)}
          inputProps={{ "aria-label": `Enable schedule ${schedule.id}` }}
        />
        <IconButton
          size="small"
          aria-label={`Schedule ${schedule.id} actions`}
          disabled={busy}
          onClick={(e) => setMenuEl(e.currentTarget)}
        >
          <MoreVertOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>

      {/* A dónde va. Los destinos GRC por NOMBRE — y los que ya no existen se
          dicen por su id en vez de desaparecer: una programación que empuja a
          un destino borrado es exactamente lo que hay que ver. */}
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 1 }}>
        {destinatarios > 0
          ? `${destinatarios} recipient${destinatarios === 1 ? "" : "s"}`
          : "No recipients"}
        {destinos.length
          ? ` · ${destinos.map((t, i) => t?.label || `target ${schedule.targetIds[i]}`).join(", ")}`
          : ""}
      </Typography>

      {/* Cuándo. La próxima y la última, juntas: "cada mes" sin una fecha
          concreta no deja comprobar nada. */}
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.5 }}>
        <Typography variant="caption" sx={{ color: BRAND.gray }}>
          Next {formatWhen(schedule.nextRunAt)}
        </Typography>
        {schedule.lastRunAt ? (
          <>
            <Typography variant="caption" sx={{ color: BRAND.gray }}>·</Typography>
            <Tooltip title={`Last run ${formatWhen(schedule.lastRunAt)}`}>
              <Chip
                size="small"
                variant="outlined"
                color={runStatusColor(schedule.lastRunStatus)}
                label={runStatusLabel(schedule.lastRunStatus)}
                sx={{ height: 20, fontSize: TEXT.xs }}
              />
            </Tooltip>
          </>
        ) : (
          <>
            <Typography variant="caption" sx={{ color: BRAND.gray }}>· never run yet</Typography>
          </>
        )}
      </Stack>

      <Menu open={Boolean(menuEl)} anchorEl={menuEl} onClose={cerrar}>
        <MenuItem onClick={hacer(onRun)}>
          <PlayArrowOutlinedIcon fontSize="small" sx={{ mr: 1 }} /> Run now
        </MenuItem>
        <MenuItem onClick={hacer(onEdit)}>
          <EditOutlinedIcon fontSize="small" sx={{ mr: 1 }} /> Edit
        </MenuItem>
        {/*
          Sin "Duplicate", a propósito: duplicar una programación mensual deja
          dos mandando el mismo informe a la misma gente, y el error se
          descubre un mes después. Quien quiera dos parte de "New schedule",
          que obliga a elegir el tipo y los destinatarios.
        */}
        <MenuItem onClick={hacer(onDelete)} sx={{ color: BRAND.alert?.errorText }}>
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} /> Delete
        </MenuItem>
      </Menu>
    </SectionPaper>
  );
}
