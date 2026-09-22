// src/components/common/SideSectionLayout.jsx
//
// El "sub-side panel" de una pestaña: la lista de secciones a la izquierda,
// la elegida a la derecha. Nació en Patch Management → Configure y el usuario
// lo pidió igual para Asset Management → Windows Domain y → Location; eran ya
// tres copias del mismo nav, así que vive aquí.
//
// Sólo es el marco. Qué sección se pinta lo decide quien lo usa, con
// `children`: los paneles que ya existían se meten tal cual.
//
// En pantallas estrechas el nav pasa arriba (una columna), igual que antes.
// La sección elegida lleva `aria-current`, para lector de pantalla y tests.

import * as React from "react";
import { Box, List, ListItemButton, ListItemText } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

/**
 * @param sections  [{ key, label, blurb? }]
 * @param active    key de la sección elegida
 * @param onSelect  (key) => void
 * @param ariaLabel nombre del nav
 */
export default function SideSectionLayout({ sections, active, onSelect, ariaLabel, children }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "248px 1fr" },
        gap: { xs: 2, md: 3 },
        alignItems: "start",
      }}
    >
      <Box
        component="nav"
        aria-label={ariaLabel}
        sx={{
          border: `1px solid ${BRAND.border}`,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: BRAND.surface,
        }}
      >
        <List disablePadding>
          {sections.map((s) => {
            const selected = s.key === active;
            return (
              <ListItemButton
                key={s.key}
                selected={selected}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect?.(s.key)}
                sx={{
                  alignItems: "flex-start",
                  py: 1.25,
                  borderLeft: `3px solid ${selected ? BRAND.teal : "transparent"}`,
                  "&.Mui-selected": {
                    bgcolor: BRAND.tealSoft,
                    "&:hover": { bgcolor: BRAND.tealSoft },
                  },
                }}
              >
                <ListItemText
                  primary={s.label}
                  secondary={s.blurb}
                  primaryTypographyProps={{
                    fontSize: TEXT.sm,
                    fontWeight: 700,
                    color: selected ? BRAND.tealText : BRAND.dark,
                  }}
                  secondaryTypographyProps={{ fontSize: TEXT.xs }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}
