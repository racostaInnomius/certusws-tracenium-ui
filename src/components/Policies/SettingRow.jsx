// src/components/Policies/SettingRow.jsx
//
// Las piezas de los editores de política de MDM / MAM (rediseño 1-oct-2026):
// una fila por ajuste —nombre y explicación a la izquierda, el control a la
// derecha, como en Ajustes del Sistema— en lugar de una rejilla de
// desplegables con la etiqueta cortada («Grace period before the passwo…»).
//
// Los booleanos son tri-estado y se ven los tres a la vez: «Not set» (sin
// opinión: el equipo o la app se quedan con su valor) no es lo mismo que
// «Off». Antes eran un desplegable por ajuste: dos clics y el estado escondido.

import * as React from "react";
import { Box, Chip, InputAdornment, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

export const EditedChip = () => (
  <Chip
    size="small"
    label="Edited"
    sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 800, bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText }}
  />
);

/** Una fila: nombre, chips, explicación y nota a la izquierda; el control a la derecha. */
export function SettingRow({ id, label, meta = null, description = null, note = null, edited = false, stacked = false, children }) {
  return (
    <Box
      data-setting={id}
      sx={{
        display: "grid",
        gridTemplateColumns: stacked ? "minmax(0,1fr)" : { xs: "minmax(0,1fr)", md: "minmax(0,1fr) auto" },
        alignItems: "center",
        columnGap: 3,
        rowGap: 1,
        px: { xs: 1.5, sm: 2 },
        py: 1.25,
        "& + &": { borderTop: `1px solid ${BRAND.border}` },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          <Typography id={`${id}-label`} sx={{ fontSize: TEXT.base, fontWeight: 600, color: BRAND.dark }}>
            {label}
          </Typography>
          {meta}
          {edited ? <EditedChip /> : null}
        </Box>
        {description ? (
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.25, maxWidth: 680 }}>{description}</Typography>
        ) : null}
        {note ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.warningText, fontWeight: 600, mt: 0.25, maxWidth: 680 }}>{note}</Typography>
        ) : null}
      </Box>
      <Box sx={{ justifySelf: stacked ? "stretch" : { xs: "start", md: "end" }, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

const toggleSx = {
  "& .MuiToggleButton-root": {
    textTransform: "none",
    fontWeight: 700,
    fontSize: TEXT.sm,
    lineHeight: 1.4,
    px: 1.5,
    py: 0.5,
    color: BRAND.dark,
    borderColor: BRAND.borderStrong,
    whiteSpace: "nowrap",
    // Sin esto el color de arriba tapaba el de deshabilitado de MUI y un
    // valor que no se puede elegir se veía igual que los demás.
    "&.Mui-disabled": { color: "text.disabled", borderColor: BRAND.border },
  },
  // «Not set» elegido se ve apagado; un valor explícito, en el color de marca.
  "& .MuiToggleButton-root.Mui-selected[value='unset']": {
    bgcolor: BRAND.darkSoft,
    color: "text.secondary",
    "&:hover": { bgcolor: BRAND.darkSoft },
  },
  "& .MuiToggleButton-root.Mui-selected:not([value='unset'])": {
    bgcolor: BRAND.tealSoftStrong,
    color: BRAND.tealText,
    "&:hover": { bgcolor: BRAND.tealSoftStrong },
  },
};

/**
 * Tri-estado: undefined/null = «Not set», true, false. `blocked` lista los
 * valores que no se pueden elegir (el que ya está puesto se deja ver).
 */
export function TriStateToggle({ id, value, onChange, labels = {}, blocked = [], disabled = false }) {
  const v = value === true ? "on" : value === false ? "off" : "unset";
  const l = { unset: "Not set", on: "On", off: "Off", ...labels };
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={v}
      disabled={disabled}
      aria-labelledby={`${id}-label`}
      onChange={(_e, next) => {
        // Pulsar el ya elegido devuelve null en un grupo exclusivo: no es un cambio.
        if (next === null || next === v) return;
        onChange(next === "on" ? true : next === "off" ? false : undefined);
      }}
      sx={toggleSx}
    >
      <ToggleButton value="unset">{l.unset}</ToggleButton>
      <ToggleButton value="on" disabled={blocked.includes(true) && v !== "on"}>
        {l.on}
      </ToggleButton>
      <ToggleButton value="off" disabled={blocked.includes(false) && v !== "off"}>
        {l.off}
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

// El valor de «Not set» en los selectores segmentados (toggleSx lo pinta apagado).
const UNSET = "unset";

/**
 * Lista cerrada corta como selector segmentado, igual que los booleanos:
 * «Not set» + cada valor con su etiqueta (`labels` del catálogo; el valor es
 * el de Apple). Para más de 4 valores, EnumSetting.
 */
export function EnumToggle({ id, value, onChange, values = [], labels = {}, disabled = false }) {
  const v = value === undefined || value === null || value === "" ? UNSET : value;
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={v}
      disabled={disabled}
      aria-labelledby={`${id}-label`}
      onChange={(_e, next) => {
        if (next === null || next === v) return;
        onChange(next === UNSET ? undefined : next);
      }}
      sx={{ ...toggleSx, flexWrap: "wrap" }}
    >
      <ToggleButton value={UNSET}>Not set</ToggleButton>
      {values.map((x) => (
        <ToggleButton key={x} value={x}>
          {labels[x] ?? x}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/**
 * Fecha y hora LOCAL del equipo, sin zona (`yyyy-mm-ddThh:mm:ss`, el formato
 * de Apple). El control del navegador da minutos; se guardan con `:00`.
 */
export function DateTimeSetting({ id, value, onChange, issue = null, help = null, disabled = false }) {
  return (
    <TextField
      size="small"
      type="datetime-local"
      value={typeof value === "string" ? value.slice(0, 16) : ""}
      onChange={(e) => onChange(e.target.value ? `${e.target.value.slice(0, 16)}:00` : undefined)}
      disabled={disabled}
      error={Boolean(issue)}
      helperText={issue || help}
      slotProps={{ htmlInput: { "aria-labelledby": `${id}-label` }, inputLabel: { shrink: true }, formHelperText: { sx: { mx: 0 } } }}
      sx={{ width: 230 }}
    />
  );
}

/** Número entero con unidad; vacío = «Not set». */
export function NumberSetting({ id, value, onChange, unit = null, min, max, help = null, issue = null, disabled = false, placeholder = "Not set" }) {
  return (
    <TextField
      size="small"
      type="number"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      disabled={disabled}
      error={Boolean(issue)}
      helperText={issue || help}
      slotProps={{
        htmlInput: { min, max, "aria-labelledby": `${id}-label` },
        input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
        formHelperText: { sx: { mx: 0 } },
      }}
      sx={{ width: 170 }}
    />
  );
}

/** Texto libre; vacío = «Not set». Los largos ocupan la fila entera. */
export function TextSetting({ id, value, onChange, maxLength, multiline = false, full = false, issue = null, disabled = false, placeholder = "Not set", width = 280 }) {
  return (
    <TextField
      size="small"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      disabled={disabled}
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      error={Boolean(issue)}
      helperText={issue || (multiline && maxLength ? `${String(value ?? "").length}/${maxLength}` : null)}
      slotProps={{ htmlInput: { maxLength, "aria-labelledby": `${id}-label` }, formHelperText: { sx: { mx: 0 } } }}
      sx={{ width: multiline || full ? "100%" : { xs: "100%", sm: width } }}
    />
  );
}

/** Lista cerrada; «Not set» primero. */
export function EnumSetting({ id, value, onChange, values = [], labels = {}, disabled = false }) {
  return (
    <TextField
      select
      size="small"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      disabled={disabled}
      slotProps={{ select: { displayEmpty: true, "aria-labelledby": `${id}-label` } }}
      sx={{ width: 220 }}
    >
      <MenuItem value="">Not set</MenuItem>
      {values.map((v) => (
        <MenuItem key={v} value={v}>
          {labels[v] ?? v}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** El contenedor de un grupo de filas, con su título y cuántos tiene puestos. */
export function SettingGroup({ id, title, count = null, children }) {
  return (
    <Box component="section" aria-labelledby={`${id}-title`} sx={{ minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.75, px: 0.25 }}>
        <Typography id={`${id}-title`} component="h3" sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>
          {title}
        </Typography>
        {count ? <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{count}</Typography> : null}
      </Box>
      <Box sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 2, bgcolor: "background.paper", minWidth: 0 }}>{children}</Box>
    </Box>
  );
}
