// src/components/Policies/MdmPlatformSection.jsx
//
// Sección de autoría del modelo de intención MDM para UNA plataforma.
//
// Por qué una sección por plataforma y no una lista unificada: las
// políticas de macOS e iOS no son las mismas, y forzarlas a un esquema
// común produce un mínimo común denominador que no sirve bien a ninguna
// (ADR-0002 #7). Cada sección guarda su propio dominio de política
// (`mdm-macos` / `mdm-ios`), así que un guardado de macOS no puede pisar
// el bloque de iOS ni el de MAM.
//
// Los controles se renderizan DESDE EL CATÁLOGO del backend: esta vista no
// conoce ningún ajuste por su nombre. Añadir una clave al catálogo la hace
// aparecer aquí sin tocar la UI.
//
// Booleanos tri-estado (Unset / On / Off) igual que MAM: "Unset" significa
// "sin opinión, deja el default de la plataforma" — distinto de "Off".

import * as React from "react";
import { Alert, Box, Chip, MenuItem, TextField, Tooltip, Typography } from "@mui/material";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";

// Etiquetas legibles para los grupos derivados de la clave.
const GROUP_LABELS = {
  desktop: "Escritorio",
  screen: "Pantalla y bloqueo",
  apps: "Aplicaciones",
  softwareUpdate: "Actualizaciones",
  passcode: "Código de acceso",
  general: "General",
};

/** Lee un valor del bloque de política por su ruta con puntos. */
export function readByPath(block, key) {
  const parts = String(key).split(".").slice(1); // quita el prefijo de plataforma
  let node = block;
  for (const p of parts) {
    if (node === null || node === undefined || typeof node !== "object") return undefined;
    node = node[p];
  }
  return node;
}

/**
 * Escribe (o borra) un valor por ruta, devolviendo un bloque NUEVO.
 * `undefined` elimina la clave y poda los objetos que queden vacíos — así
 * el documento guardado solo contiene lo que el operador configuró de
 * verdad, sin objetos vacíos que el consumidor tenga que interpretar.
 */
export function writeByPath(block, key, value) {
  const parts = String(key).split(".").slice(1);
  const clone = structuredClone(block ?? {});

  const walk = (node, idx) => {
    const p = parts[idx];
    if (idx === parts.length - 1) {
      if (value === undefined) delete node[p];
      else node[p] = value;
      return;
    }
    if (node[p] === null || typeof node[p] !== "object") node[p] = {};
    walk(node[p], idx + 1);
    if (Object.keys(node[p]).length === 0) delete node[p];
  };

  walk(clone, 0);
  return clone;
}

function SupervisionChip() {
  return (
    <Tooltip
      arrow
      title="Solo surte efecto en equipos supervisados (ABM/ADE). En equipos enrolados sin supervisión se guarda pero no se aplica."
    >
      <Chip
        size="small"
        icon={<ShieldOutlinedIcon sx={{ fontSize: ICON.sm }} />}
        label="Requiere supervisión"
        sx={{
          height: 20,
          fontSize: TEXT.xs,
          fontWeight: 800,
          bgcolor: "rgba(234,179,8,0.14)",
          color: "#8a6d00",
        }}
      />
    </Tooltip>
  );
}

function SettingControl({ setting, value, onChange, readOnly }) {
  const spec = setting.spec || {};

  if (spec.kind === "boolean") {
    const v = value === true ? "on" : value === false ? "off" : "unset";
    return (
      <TextField
        select
        size="small"
        label={setting.label || setting.key}
        value={v}
        onChange={(e) => {
          const next =
            e.target.value === "on" ? true : e.target.value === "off" ? false : undefined;
          onChange(next);
        }}
        disabled={readOnly}
        helperText={setting.description}
        fullWidth
      >
        <MenuItem value="unset">Sin definir (default del sistema)</MenuItem>
        <MenuItem value="on">Activado</MenuItem>
        <MenuItem value="off">Desactivado</MenuItem>
      </TextField>
    );
  }

  if (spec.kind === "integer") {
    return (
      <TextField
        size="small"
        type="number"
        label={setting.label || setting.key}
        placeholder="sin definir"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        disabled={readOnly}
        inputProps={{ min: spec.min, max: spec.max }}
        helperText={
          setting.description ||
          (spec.min !== undefined ? `Entre ${spec.min} y ${spec.max}. Vacío = sin definir.` : undefined)
        }
        fullWidth
      />
    );
  }

  if (spec.kind === "enum") {
    return (
      <TextField
        select
        size="small"
        label={setting.label || setting.key}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        disabled={readOnly}
        helperText={setting.description}
        fullWidth
      >
        <MenuItem value="">Sin definir</MenuItem>
        {(spec.values || []).map((v) => (
          <MenuItem key={v} value={v}>
            {v}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  // string (default)
  return (
    <TextField
      size="small"
      label={setting.label || setting.key}
      placeholder="sin definir"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      disabled={readOnly}
      inputProps={{ maxLength: spec.maxLength }}
      helperText={setting.description}
      fullWidth
    />
  );
}

export default function MdmPlatformSection({
  platform,
  groups,
  block,
  onChangeBlock,
  readOnly = false,
  /** Nº de equipos de esta plataforma que NO están supervisados. */
  unsupervisedCount = null,
}) {
  // Aviso de aplicabilidad: si el operador configuró alguna clave que
  // exige supervisión y hay equipos sin supervisar, decirlo. Sin esto
  // configuraría algo que silenciosamente no ocurre en parte del parque.
  const configuredSupervisionKeys = React.useMemo(() => {
    const out = [];
    for (const g of groups) {
      for (const s of g.items) {
        if (!s.requiresSupervision) continue;
        if (readByPath(block, s.key) !== undefined) out.push(s.label || s.key);
      }
    }
    return out;
  }, [groups, block]);

  if (!groups.length) {
    return (
      <Typography variant="body2" sx={{ color: BRAND.gray }}>
        No hay ajustes en el catálogo para esta plataforma todavía.
      </Typography>
    );
  }

  return (
    <Box>
      {configuredSupervisionKeys.length > 0 && unsupervisedCount > 0 ? (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
          <strong>
            {configuredSupervisionKeys.length} ajuste
            {configuredSupervisionKeys.length === 1 ? "" : "s"} no se aplicará
            {configuredSupervisionKeys.length === 1 ? "" : "n"} en {unsupervisedCount} equipo
            {unsupervisedCount === 1 ? "" : "s"}
          </strong>{" "}
          sin supervisión: {configuredSupervisionKeys.join(", ")}. Se guardan, pero solo
          surten efecto en equipos supervisados (ABM/ADE).
        </Alert>
      ) : null}

      {groups.map((group) => (
        <Box key={group.name} sx={{ mb: 2.5 }}>
          <Typography
            variant="overline"
            sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.1 }}
          >
            {GROUP_LABELS[group.name] || group.name}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 2,
              mt: 1,
            }}
          >
            {group.items.map((s) => (
              <Box key={s.key}>
                {s.requiresSupervision ? (
                  <Box sx={{ mb: 0.5 }}>
                    <SupervisionChip />
                  </Box>
                ) : null}
                <SettingControl
                  setting={s}
                  value={readByPath(block, s.key)}
                  onChange={(v) => onChangeBlock(writeByPath(block, s.key, v))}
                  readOnly={readOnly}
                />
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
