// src/components/Compliance/FirstVisitNote.jsx
//
// Tres frases, una vez: qué es esta página y por dónde empezar.
//
// El usuario que motivó el rediseño no sabía qué estaba mirando — y lo que la
// página nunca le dijo es lo más básico: que compara el estado REAL de sus
// equipos contra los controles que él ha elegido. Sin esa frase, un score del
// 81% no significa nada.
//
// Se descarta y no vuelve. La preferencia vive en localStorage y NO en el
// backend a propósito: es ruido de bienvenida, no configuración del tenant, y
// no merece una columna ni un endpoint. El coste de equivocarse es que alguien
// la vea otra vez en otro navegador.
//
// ⚠️ localStorage puede lanzar (modo privado, cookies bloqueadas, políticas de
// empresa). Si no se puede leer, se ENSEÑA la franja: molestar una vez de más
// es mejor que reventar la página por una nota informativa.

import * as React from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import { BRAND, TEXT, ICON } from "../../theme/brand";

const KEY = "tnm:scp:welcome-dismissed";

function readDismissed() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export default function FirstVisitNote() {
  const [dismissed, setDismissed] = React.useState(readDismissed);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // Se cierra igual en esta sesión; volverá en la siguiente. Aceptable
      // para una nota, inaceptable para una preferencia real.
    }
  }, []);

  if (dismissed) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        p: 1.5,
        mb: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.teal}`,
        bgcolor: BRAND.tealSoft,
      }}
    >
      <LightbulbOutlinedIcon sx={{ fontSize: ICON.md, color: BRAND.tealText, mt: "2px" }} />
      <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
          New here?
        </Typography>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
          This page compares how your devices are actually configured against the controls you
          chose to follow. The score is how much of that they meet — start with{" "}
          <Box component="span" sx={{ fontWeight: 700 }}>What to fix first</Box>, which lists the
          controls the most devices are failing right now.
        </Typography>
      </Stack>
      <IconButton size="small" aria-label="Dismiss this note" onClick={dismiss}>
        <CloseOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.gray }} />
      </IconButton>
    </Box>
  );
}
