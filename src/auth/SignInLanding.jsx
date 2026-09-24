// src/auth/SignInLanding.jsx
//
// La entrada al portal: lo primero que ve quien escribe portal.tracenium.com
// sin sesión, y donde aterriza quien cierra sesión.
//
// ⚠️ POR QUÉ EXISTE
//
// Hasta ahora, un bootstrap 401 disparaba `window.location = /auth/login` y la
// primera pantalla de Tracenium era la de SafeCertus: sin logo, sin contexto y
// sin forma de volver. Lo mismo al cerrar sesión. Ahora el salto al IdP ocurre
// SÓLO cuando la persona pulsa el botón.
//
// Esta pantalla es además donde se cuentan los estados que antes se resolvían
// con un rebote: sesión cerrada y las dos negativas del IdP
// (`service_join_declined`, `no_service_access`).
//
// ⚠️ EL DESTINO SE CONSERVA. Un enlace profundo (`/?page=assets`) llega aquí
// sin sesión; sin `returnTo` toda URL compartida acabaría en el Overview.

import * as React from "react";
import { Box, Button, Typography } from "@mui/material";

import AuthShell from "./AuthShell";
import PlatformTagline from "../components/common/PlatformTagline";
import { BRAND, TEXT } from "../theme/brand";

const TONE = {
  info: { border: "rgba(143, 253, 255, 0.35)", bg: "rgba(143, 253, 255, 0.08)", fg: "rgb(143, 253, 255)" },
  warning: { border: "rgba(248, 181, 52, 0.45)", bg: "rgba(248, 181, 52, 0.10)", fg: BRAND.alert.warningOnDark },
  error: { border: "rgba(227, 125, 120, 0.45)", bg: "rgba(227, 125, 120, 0.10)", fg: "rgb(240, 189, 186)" },
};

export default function SignInLanding({ notice = null, onSignIn }) {
  const tone = TONE[notice?.tone] ?? TONE.info;
  // Sin aviso, la pantalla es la presentación del producto; con aviso, el
  // titular ES el motivo — enterarse de por qué no entraste importa más que
  // volver a leer el nombre del portal.
  const title = notice?.title ?? "Tracenium";
  // Sin aviso, el subtítulo es el eslogan del producto, con su «&» en cian —
  // el mismo componente que pinta el Topbar.
  const description = notice?.description ?? <PlatformTagline />;
  const canSignIn = notice ? notice.retry !== false : true;

  return (
    <AuthShell title={title} description={description} maxWidth={notice ? 500 : 440} minHeight={420}>
      {notice ? (
        <Box
          sx={{
            width: "100%",
            maxWidth: 380,
            mb: 2.5,
            px: 2,
            py: 1.5,
            borderRadius: "14px",
            border: `1px solid ${tone.border}`,
            background: tone.bg,
            textAlign: "center",
          }}
        >
          <Typography sx={{ color: tone.fg, fontWeight: 700, fontSize: TEXT.md }}>
            {notice.code}
          </Typography>
        </Box>
      ) : null}

      {canSignIn ? (
        <Button
          variant="contained"
          fullWidth
          onClick={onSignIn}
          sx={{
            maxWidth: 380,
            textTransform: "none",
            fontWeight: 700,
            borderRadius: "12px",
            py: 1.25,
            background: "rgb(70,157,159)",
            "&:hover": { background: "rgb(60,140,142)" },
          }}
        >
          {notice?.cta ?? "Sign in with SafeCertus"}
        </Button>
      ) : (
        <Button
          variant="outlined"
          fullWidth
          href="https://tracenium.com"
          sx={{
            maxWidth: 380,
            textTransform: "none",
            fontWeight: 700,
            borderRadius: "12px",
            py: 1.25,
            color: "rgb(116,249,253)",
            borderColor: "rgba(116,249,253,0.45)",
            "&:hover": { borderColor: "rgb(116,249,253)", background: "rgba(116,249,253,0.08)" },
          }}
        >
          Back to tracenium.com
        </Button>
      )}

    </AuthShell>
  );
}
