// src/components/RemoteControl/DeviceClassCell.jsx
//
// La clase de un equipo: servidor o equipo de usuario.
//
// ── No es una etiqueta ───────────────────────────────────────────────
//
// De esta columna cuelgan dos decisiones de gobierno:
//
//   · `access_policy` mira la clase para decidir si entrar exige el
//     vistobueno de otra persona;
//   · el consentimiento (ADR-0012) se le pide al usuario del equipo solo
//     cuando la clase es `endpoint` — en un servidor no hay nadie sentado
//     delante a quien preguntar.
//
// Así que marcar un servidor como equipo de usuario le QUITA el vistobueno
// y le pone un aviso que nadie va a contestar. La API existía desde el
// 2026-09-01 y no había pantalla: existía el candado y no la llave.
//
// ── Por qué "sin clasificar" no se pinta como "equipo de usuario" ────
//
// La clasificación automática lee la cadena del sistema operativo y se
// equivoca por construcción: un Ubuntu de escritorio y un Ubuntu server dan
// la misma, y un equipo que reporta el SO vacío no da ninguna. Ante la duda
// el gate trata al equipo como SERVIDOR —se gobierna, no se exime—, así que
// una celda vacía que se leyera como "equipo de usuario" diría justo lo
// contrario de lo que va a pasar.
//
// ── Por qué se confirma al bajar la guardia ──────────────────────────
//
// Pasar a `endpoint` reduce el gobierno. Es exactamente el cambio que haría
// alguien diez minutos antes de entrar en un controlador de dominio, y por
// eso el backend lo deja en `security_events` con el valor anterior. Aquí se
// pide confirmación en esa dirección y no en la otra: subir la guardia no
// necesita ceremonia.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Tooltip,
  Typography
} from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

const META = {
  server: {
    label: "Server",
    fg: ROLE.caution,
    bg: ROLE.cautionSoft,
    help: "Sessions on servers can require another admin's approval, and nobody is prompted on the device."
  },
  endpoint: {
    label: "Endpoint",
    fg: BRAND.tealText,
    bg: BRAND.tealSoft,
    help: "The person using this computer is asked before a session opens."
  },
  unclassified: {
    label: "Unclassified",
    fg: BRAND.gray,
    bg: BRAND.surfaceMuted,
    help:
      "Nobody has classified this device. Until someone does, it is governed as a SERVER — approval rules for servers apply and the user is not prompted."
  }
};

/** Lo que dice el cambio, en la frase que el operador necesita leer. */
export function describeClassChange(from, to) {
  if (to === "endpoint") {
    return {
      needsConfirm: true,
      title: "Treat this device as an endpoint?",
      body:
        from === "server"
          ? "It stops being governed by the server rules — a session may no longer need another admin's approval — and the person using it will be asked for consent before each session. The change is recorded with your name."
          : "The person using it will be asked for consent before each session, and server approval rules stop applying. The change is recorded with your name."
    };
  }
  return {
    needsConfirm: false,
    title: "Treat this device as a server?",
    body:
      "Server approval rules start applying and nobody is prompted on the device. The change is recorded with your name."
  };
}

/**
 * Props:
 *   value     — "server" | "endpoint" | null
 *   source    — "manual" cuando alguien lo corrigió a mano
 *   onChange  — (next) => Promise|void. Ausente = solo lectura.
 *   busy      — bool
 */
export default function DeviceClassCell({ value, source, onChange, busy = false, deviceLabel = "" }) {
  const [pending, setPending] = React.useState(null);
  const key = value === "server" || value === "endpoint" ? value : "unclassified";
  const meta = META[key];

  const manual = source === "manual";
  const tip = manual ? `${meta.help} Set manually.` : meta.help;

  if (typeof onChange !== "function") {
    return (
      <Tooltip title={tip} arrow>
        <Chip
          size="small"
          label={meta.label}
          sx={{ bgcolor: meta.bg, color: meta.fg, fontWeight: 700, fontSize: TEXT.xs }}
        />
      </Tooltip>
    );
  }

  const apply = async (next) => {
    const { needsConfirm } = describeClassChange(value, next);
    if (needsConfirm) {
      setPending(next);
      return;
    }
    await onChange(next);
  };

  const confirm = async () => {
    const next = pending;
    setPending(null);
    if (next) await onChange(next);
  };

  return (
    <>
      <Tooltip title={tip} arrow>
        <Box component="span">
          <Select
            size="small"
            variant="standard"
            disableUnderline
            disabled={busy}
            // `value` nunca es null para MUI: "unclassified" es una opción de
            // verdad, porque es un estado real y no la ausencia de uno.
            value={key}
            onChange={(e) => apply(e.target.value)}
            inputProps={{ "aria-label": `Device class for ${deviceLabel || "device"}` }}
            sx={{
              fontSize: TEXT.xs,
              fontWeight: 700,
              color: meta.fg,
              bgcolor: meta.bg,
              borderRadius: 1,
              px: 1,
              "& .MuiSelect-select": { py: 0.25, pr: "20px !important" },
              "& .MuiSelect-icon": { color: meta.fg }
            }}
          >
            {/* Solo seleccionable si YA lo está: "sin clasificar" no es un
                destino al que alguien mande un equipo a mano. */}
            <MenuItem value="unclassified" disabled>
              {META.unclassified.label}
            </MenuItem>
            <MenuItem value="server">{META.server.label}</MenuItem>
            <MenuItem value="endpoint">{META.endpoint.label}</MenuItem>
          </Select>
        </Box>
      </Tooltip>

      <Dialog open={Boolean(pending)} onClose={() => setPending(null)} maxWidth="xs">
        <DialogTitle sx={{ fontSize: TEXT.md, fontWeight: 700 }}>
          {describeClassChange(value, pending || "endpoint").title}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: BRAND.dark }}>
            {describeClassChange(value, pending || "endpoint").body}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button size="small" variant="contained" onClick={confirm}>
            Change it
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
