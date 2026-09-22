// src/components/common/PageTabs.jsx
//
// La barra de pestañas de página: su propio panel (sin padding, recortado),
// fila scrollable de 62 px, indicador teal redondeado, icono pequeño delante y
// etiqueta sin mayúsculas forzadas. Antes cada página con pestañas tenía su
// copia de `TAB_SX` y del envoltorio; aquí vive una sola.
//
// Lo que la página sigue decidiendo:
//   - qué pestaña está activa y cómo se guarda (`?pmTab=`, `?scpTab=`, …):
//     `value` y `onChange` pasan tal cual a MUI `Tabs` — `onChange(event, next)`.
//   - las pestañas: `items` = [{ value, label, icon, ...props del Tab }], donde
//     el resto (`id`, `aria-controls`, …) llega al `Tab`. Las condicionales se
//     quitan de la lista antes de pasarla (los `null`/`false` se ignoran).
//   - lo que alguna página hace distinto a propósito: `height` (Software
//     Delivery 56, Remote Control 58), `allowScrollButtonsMobile`, `aria-label`
//     y `sx` del panel (Alerts no lleva `mb`: su página separa con `gap`).

import * as React from "react";
import { Tab, Tabs } from "@mui/material";
import SectionPaper from "./SectionPaper";
import { BRAND } from "../../theme/brand";

export default function PageTabs({
  value,
  onChange,
  items,
  height = 62,
  allowScrollButtonsMobile = false,
  "aria-label": ariaLabel,
  sx = null,
}) {
  const tabSx = {
    textTransform: "none",
    fontWeight: 700,
    minHeight: height,
    color: "text.secondary",
    "&.Mui-selected": { color: BRAND.dark },
  };

  return (
    <SectionPaper variant="panel" sx={{ mb: 2, p: 0, overflow: "hidden", ...sx }}>
      <Tabs
        value={value}
        onChange={onChange}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile={allowScrollButtonsMobile}
        aria-label={ariaLabel}
        sx={{
          px: { xs: 1, sm: 2 },
          minHeight: height,
          "& .MuiTabs-indicator": { height: 3, borderRadius: 999, backgroundColor: BRAND.teal },
        }}
      >
        {items.filter(Boolean).map(({ value: itemValue, label, icon, ...tabProps }) => (
          <Tab
            key={itemValue}
            {...tabProps}
            value={itemValue}
            label={label}
            icon={icon ? React.cloneElement(icon, { fontSize: "small" }) : undefined}
            iconPosition="start"
            sx={tabSx}
          />
        ))}
      </Tabs>
    </SectionPaper>
  );
}
