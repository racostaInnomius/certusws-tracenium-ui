// src/components/common/PageTabs.jsx
//
// La barra de pestañas de página: su propio panel (sin padding, recortado),
// fila scrollable de 62 px con flechas también en móvil, indicador teal
// redondeado, icono pequeño delante y etiqueta sin mayúsculas forzadas. Antes
// cada página con pestañas tenía su copia de `TAB_SX` y del envoltorio (y dos
// se habían quedado en 56 y 58 px); aquí vive una sola, igual para todas.
//
// Lo que la página sigue decidiendo:
//   - qué pestaña está activa y cómo se guarda (`?pmTab=`, `?scpTab=`, …):
//     `value` y `onChange` pasan tal cual a MUI `Tabs` — `onChange(event, next)`.
//   - las pestañas: `items` = [{ value, label, icon, ...props del Tab }], donde
//     el resto (`id`, `aria-controls`, …) llega al `Tab`. Las condicionales se
//     quitan de la lista antes de pasarla (los `null`/`false` se ignoran).
//   - `aria-label` de la barra y `sx` del panel (Alerts no lleva `mb`: su
//     página separa con `gap`).

import * as React from "react";
import { Tab, Tabs } from "@mui/material";
import SectionPaper from "./SectionPaper";
import { BRAND } from "../../theme/brand";

const HEIGHT = 62;

const TAB_SX = {
  textTransform: "none",
  fontWeight: 700,
  minHeight: HEIGHT,
  color: "text.secondary",
  "&.Mui-selected": { color: BRAND.dark },
};

export default function PageTabs({ value, onChange, items, "aria-label": ariaLabel, sx = null }) {
  return (
    <SectionPaper variant="panel" sx={{ mb: 2, p: 0, overflow: "hidden", ...sx }}>
      <Tabs
        value={value}
        onChange={onChange}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label={ariaLabel}
        sx={{
          px: { xs: 1, sm: 2 },
          minHeight: HEIGHT,
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
            sx={TAB_SX}
          />
        ))}
      </Tabs>
    </SectionPaper>
  );
}
