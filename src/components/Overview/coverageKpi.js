// src/components/Overview/coverageKpi.js
//
// Una señal de cobertura como KPI, en la fila de KPIs de su bloque:
//   · Fleet & operations → "Blind spots" (inventario), en el sitio que tenía
//     "Unread alerts" — esa cifra ya vive en la campana de la barra superior.
//   · Security & access  → "Compliance reporting".
// Pulsarlo abre la lista de esos equipos; sin hueco no es un botón (no hay
// nada que abrir).

import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { barColor, gapText } from "./signalCoverageModel";

const ROLE_OF = { error: "critical", warning: "caution", success: "positive" };

export function coverageKpiCard(signal, fleet, onOpenDevices, title = "Compliance reporting") {
  const role = ROLE_OF[barColor(signal)] ?? null;
  const blind = signal.blind > 0;
  return {
    title,
    value: `${signal.reporting}/${fleet}`,
    subtitle: gapText(signal),
    icon: blind ? VisibilityOffOutlinedIcon : FactCheckOutlinedIcon,
    accent: role ? ROLE[role] : BRAND.teal,
    tint: role ? ROLE[`${role}Soft`] : BRAND.tealSoft,
    onClick: blind ? () => onOpenDevices?.(signal) : undefined,
  };
}
