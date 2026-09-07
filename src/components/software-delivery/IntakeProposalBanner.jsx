// src/components/software-delivery/IntakeProposalBanner.jsx
//
// Lo que la IA propone, en piezas separadas.
//
// EL PROBLEMA QUE RESUELVE
//
// Este bloque enseñaba dos cosas: la confianza del modelo y `notes` como un
// único párrafo. Con el MSI de Chrome (7-sep-2026, la primera propuesta que el
// pipeline generó de verdad) esas notas eran 900 caracteres seguidos con CINCO
// advertencias distintas dentro: las líneas de comando completas, que el
// ProductCode de Chrome cambia en casi cada versión, la vista del registro en
// x64, que no hace falta reiniciar, y una propiedad opcional para silenciar los
// pings de actualización. Todo junto se lee como un muro y no se lee.
//
// Y los PARÁMETROS —lo que de verdad se va a ejecutar— no estaban aquí: iban
// sólo al formulario de abajo. Así que el bloque titulado "AI proposal" no
// enseñaba la propuesta.
//
// ⚠️ SIGUE SIN APLICARSE NADA SOLO. El backend genera esto para "surfaced in
// the UI, never auto-applied"; enseñarlo mejor no lo convierte en una decisión
// tomada. El formulario de abajo sigue siendo el que manda.

import * as React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";

// Low confidence is the loud one — it means "look harder before you publish".
const CONFIDENCE_META = {
  high: { label: "High confidence", bg: BRAND.alert?.successSoft, fg: BRAND.alert?.success },
  medium: { label: "Medium confidence", bg: BRAND.alert?.warningSoft, fg: BRAND.alert?.warningText },
  low: { label: "Low confidence", bg: BRAND.alert?.errorSoft, fg: BRAND.alert?.error },
};

/**
 * Las notas, partidas en frases.
 *
 * ⚠️ CONSERVADOR A PROPÓSITO. Sólo se parte en `. ` seguido de MAYÚSCULA y
 * cuando el carácter anterior NO es un dígito: sin esa segunda condición,
 * "152.0.7977.83" y "HKLM\\...\\CurrentVersion" se parten por la mitad y el
 * remedio queda peor que la enfermedad. Si el texto no tiene esa forma se
 * devuelve entero — una nota de una sola frase no gana nada partida.
 */
export function splitNotes(notes) {
  const text = typeof notes === "string" ? notes.trim() : "";
  if (!text) return [];
  const parts = text
    .split(/(?<=[a-z)\]"'][.;])\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

/**
 * Los parámetros propuestos, como pares etiqueta/valor.
 *
 * Sólo lo que existe: un campo ausente no se pinta como "—", porque una fila
 * vacía ocupa lo mismo que una llena y no dice nada.
 */
export function proposalFields(cfg) {
  if (!cfg) return [];
  const rows = [];
  const add = (label, value, mono = false) => {
    if (value === null || value === undefined || value === "") return;
    rows.push({ label, value: String(value), mono });
  };

  add("Install arguments", cfg.silentInstallArgs, true);
  add("Uninstall arguments", cfg.silentUninstallArgs, true);
  if (Array.isArray(cfg.expectedExitCodes) && cfg.expectedExitCodes.length) {
    add("Success exit codes", cfg.expectedExitCodes.join(", "), true);
  }
  if (cfg.requiresReboot !== null && cfg.requiresReboot !== undefined) {
    add("Reboot", cfg.requiresReboot ? "Required" : "Not required");
  }
  const d = cfg.detectionRule;
  if (d && typeof d === "object") {
    // La regla de detección es un objeto anidado; aplanarla aquí evita que el
    // operador tenga que leer JSON para saber cómo se comprobará la instalación.
    add("Detection", d.type);
    add("Product code", d.productCode, true);
    add("Display name", d.displayNamePattern);
    add("Version", d.versionPattern, true);
  }
  return rows;
}

function Field({ label, value, mono }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline", py: 0.25 }}>
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, minWidth: 132, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: TEXT.sm,
          color: BRAND.dark,
          fontWeight: 600,
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          wordBreak: "break-word",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export default function IntakeProposalBanner({ intake }) {
  const cfg = intake?.proposedConfig || null;
  if (!cfg) return null; // blocked or AI-failed intake → no proposal to describe

  const conf =
    CONFIDENCE_META[cfg.confidence] || {
      label: cfg.confidence ? `${cfg.confidence} confidence` : "confidence unknown",
      bg: BRAND.darkSoft,
      fg: BRAND.gray,
    };
  const fields = proposalFields(cfg);
  const notes = splitNotes(cfg.notes);
  const description = typeof cfg.description === "string" ? cfg.description.trim() : "";

  return (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: BRAND.tealSoft, border: `1px solid ${BRAND.border}`, mt: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
        <AutoAwesomeOutlinedIcon sx={{ fontSize: ICON.md, color: BRAND.tealText }} />
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>AI proposal</Typography>
        <Chip
          size="small"
          label={conf.label}
          sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 800, bgcolor: conf.bg, color: conf.fg }}
        />
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
          · review + edit below before publishing; nothing is auto-applied
        </Typography>
      </Stack>

      {description ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, mt: 1 }}>{description}</Typography>
      ) : null}

      {fields.length ? (
        <Box
          sx={{
            mt: 1.25,
            pt: 1,
            borderTop: `1px solid ${BRAND.border}`,
          }}
        >
          {fields.map((f) => (
            <Field key={f.label} {...f} />
          ))}
        </Box>
      ) : null}

      {notes.length ? (
        <Box sx={{ mt: 1.25, pt: 1, borderTop: `1px solid ${BRAND.border}` }}>
          <Typography
            sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontWeight: 700, mb: 0.5 }}
          >
            Things to check
          </Typography>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
            {notes.map((n) => (
              <Typography key={n} component="li" sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                {n}
              </Typography>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
}
