// src/components/common/BrandTimeField.jsx
//
// Un campo de hora con los colores de la marca.
//
// Sustituye a `<TextField type="time">`: el desplegable de ese input lo dibuja
// el navegador en su azul por defecto y ningún CSS lo alcanza (ver
// timeOptions.js). Éste es un Select de MUI, así que la opción elegida, el hover
// y el foco son nuestros.
//
// Mismo contrato que el nativo: `value` y el argumento de `onChange` son «HH:MM»
// en 24 h. Se muestra en el formato del navegador, como hacía aquél.

import * as React from "react";
import { MenuItem, TextField } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { buildTimeOptions, normalizeTime } from "./timeOptions";

export default function BrandTimeField({ label, value, onChange, stepMinutes = 15, locale, size = "small", ...rest }) {
  const current = normalizeTime(value);
  const options = React.useMemo(
    () => buildTimeOptions({ stepMinutes, extra: current, locale }),
    [stepMinutes, current, locale]
  );

  return (
    <TextField
      select
      size={size}
      label={label}
      value={current}
      onChange={(e) => onChange?.(e.target.value)}
      InputLabelProps={{ shrink: true }}
      SelectProps={{
        MenuProps: {
          // 96 opciones: una lista alta con scroll, que abre centrada en la
          // hora elegida (MUI desplaza hasta la seleccionada).
          PaperProps: { sx: { maxHeight: 320 } },
          sx: {
            "& .MuiMenuItem-root": { fontSize: TEXT.sm },
            "& .MuiMenuItem-root:hover": { bgcolor: BRAND.tealSoft },
            "& .MuiMenuItem-root.Mui-focusVisible": { bgcolor: BRAND.tealSoft },
            // ⚠️ Al abrir, la opción elegida lleva `Mui-selected` Y
            // `Mui-focusVisible` a la vez, y la regla de MUI para esa pareja
            // ganaba a una que sólo nombrara `Mui-selected`: el fondo salía en
            // el azul del primario por defecto. Se nombran las dos.
            // Letra en `tealText`, no en `teal`: #5A9F9F sobre su propio
            // relleno suave no llega a 4,5:1 para texto pequeño.
            "& .MuiMenuItem-root.Mui-selected, & .MuiMenuItem-root.Mui-selected:hover, & .MuiMenuItem-root.Mui-selected.Mui-focusVisible":
              {
                bgcolor: BRAND.tealSoftStrong,
                color: BRAND.tealText,
                fontWeight: 700,
              },
          },
        },
      }}
      {...rest}
    >
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
