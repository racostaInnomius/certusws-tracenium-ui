// src/components/patch-management/CriticalDevicesNote.jsx
//
// «2 critical» bajo el conteo de equipos de un CVE: cuántos de los afectados
// están en un grupo de activos marcado Critical. No toca el score —el mismo
// CVE vale lo mismo en todos los tenants—; desempata el orden y se señala.
//
// null (no se pudo saber) y 0 no pintan nada: «0 critical» afirmaría algo que
// con null no se sabe, y con 0 sólo sería ruido.

import * as React from "react";
import { Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

export function criticalDevicesText(count) {
  if (count == null || !(count > 0)) return null;
  return `${count} critical`;
}

export default function CriticalDevicesNote({ count }) {
  const text = criticalDevicesText(count);
  if (!text) return null;
  return (
    <Tooltip title="Affected devices in an asset group marked Critical. At equal risk score, these CVEs go first." arrow>
      <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.alert.errorText, mt: 0.25, cursor: "help" }}>
        {text}
      </Typography>
    </Tooltip>
  );
}
