// src/auth/AuthShell.jsx
//
// El marco de TODAS las pantallas previas a la sesión: la entrada al portal,
// «Access not enabled» y los errores del IdP. Vivía dentro de AuthGate; se
// sacó aquí cuando la entrada (SignInLanding) pasó a necesitarlo, para que
// siga habiendo UNA sola implementación del fondo, el cristal y el logo.

import * as React from "react";
import { Box, Paper, Typography } from "@mui/material";

import Logo from "../assets/T.png";
import { BRAND, NEUTRAL, TEXT } from "../theme/brand";

export default function AuthShell({
  title,
  description,
  children,
  maxWidth = 420,
  minHeight = 390,
}) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        width: "100%",
        display: "grid",
        placeItems: "center",
        px: 2,
        background:
          "radial-gradient(circle at top, #1d4d54 0, #020617 55%, #000 100%)",
        backgroundSize: "200% 200%",
        animation: "bgShift 12s ease infinite",
        "@keyframes bgShift": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth,
          minHeight,
          px: { xs: 4, sm: 4 },
          py: { xs: 4, sm: 4 },
          borderRadius: "16px",
          border: "1px solid rgba(116,249,253,0.4)",
          background: "rgba(255,255,255,0.05)",
          boxShadow: "0 0 25px rgba(116,249,253,0.18)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <Box
          sx={{
            width: 84,
            height: 84,
            mb: 2.5,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Box
            component="img"
            src={Logo}
            alt="Tracenium"
            sx={{
              width: { xs: 92, sm: 96 },
              height: "auto",
              objectFit: "contain",
              filter: "drop-shadow(0 0 10px rgba(116,249,253,0.35))",
            }}
          />
        </Box>

        <Typography
          sx={{
            color: BRAND.surface,
            fontWeight: 600,
            fontSize: { xs: 28, sm: 30 },
            lineHeight: 1.2,
            mb: 1.5,
          }}
        >
          {title}
        </Typography>

        <Typography
          sx={{
            color: NEUTRAL[200],
            fontSize: TEXT.base,
            lineHeight: 1.6,
            maxWidth: 320,
            mb: 3,
          }}
        >
          {description}
        </Typography>

        {children}
      </Paper>
    </Box>
  );
}
