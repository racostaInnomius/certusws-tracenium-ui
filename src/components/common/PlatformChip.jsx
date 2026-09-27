// src/components/common/PlatformChip.jsx
//
// La plataforma de un equipo o de un binario, como la pinta Asset Management:
// pastilla con el color canónico del SO (utils/platform) y su nombre bien
// escrito — «macOS», no «macos»; «Windows Server», no «windows server».
//
// ⚠️ Había DOS copias casi iguales (la tabla de equipos y la de inactivos) y
// una tercera pantalla, las descargas del agente, que enseñaba el valor crudo
// en minúsculas. Esto es una sola implementación para las tres: el mismo dato
// se lee igual en toda la consola.
//
// `unknown`: la tabla de equipos pinta una raya (no sabemos la plataforma de
// ESE equipo), mientras que la de inactivos tiene un cajón «unknown» al que se
// puede filtrar y necesita la pastilla. De ahí el modo.

import * as React from "react";
import { Chip, Typography } from "@mui/material";

import { normalizePlatform, platformColor, platformLabel } from "../../utils/platform";
import { TEXT } from "../../theme/brand";

export default function PlatformChip({ platform, unknownAs = "dash", sx }) {
  const normalized = normalizePlatform(platform);

  if (!normalized && unknownAs === "dash") {
    return (
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        —
      </Typography>
    );
  }

  const key = normalized ?? "unknown";
  const style = platformColor(key);

  return (
    <Chip
      size="small"
      label={platformLabel(key)}
      sx={{
        height: 20,
        fontWeight: 700,
        fontSize: TEXT.xs,
        bgcolor: style.bg,
        color: style.fg,
        border: `1px solid ${style.fg}33`,
        ...sx,
      }}
    />
  );
}
