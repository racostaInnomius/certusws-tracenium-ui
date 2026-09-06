// src/components/common/BackToSettings.jsx
//
// El "volver" de las páginas que se abren desde una tarjeta de
// Settings › Tenant Settings.
//
// Existe porque había tres tratamientos distintos para lo mismo y dos
// páginas sin ninguno: `← Settings` como botón de texto en la esquina de
// acciones (Retention, Location sites), `Back to Settings` con flecha
// bajo la cabecera (Session security), y nada en Roles ni en PKI. Un
// operador que entra a cuatro tarjetas seguidas aprendía cuatro salidas
// diferentes — o se quedaba usando el botón del navegador, que es la
// señal de que la página no le ofreció una.
//
// Devuelve SIEMPRE a la división "Tenant Settings", fijando el parámetro
// de la URL antes de navegar: sin eso, la pestaña que se abre es la que
// quedara en la URL (un enlace profundo a `?settingsTab=agent`, por
// ejemplo), y volver de una tarjeta de tenant aterrizaba en Agent
// Settings. El destino de un "volver" no puede depender de por dónde se
// pasó antes.

import * as React from "react";
import { Button } from "@mui/material";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import { BRAND } from "../../theme/brand";
import { updateSearchParams } from "../../utils/browserState";

export default function BackToSettings({ onNavigate, label = "Tenant Settings" }) {
  // Sin `onNavigate` no hay a dónde ir: la página está montada fuera del
  // shell (un test, un futuro embebido) y un botón muerto es peor que
  // ninguno.
  if (!onNavigate) return null;

  return (
    <Button
      size="small"
      startIcon={<ArrowBackOutlinedIcon />}
      onClick={() => {
        updateSearchParams({ settingsTab: "tenant" });
        onNavigate("configurations");
      }}
      sx={{
        textTransform: "none",
        fontWeight: 700,
        color: BRAND.gray,
        "&:hover": { color: BRAND.teal, bgcolor: "transparent" },
      }}
    >
      {label}
    </Button>
  );
}
