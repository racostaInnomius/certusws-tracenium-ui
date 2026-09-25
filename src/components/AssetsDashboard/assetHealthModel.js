// src/components/AssetsDashboard/assetHealthModel.js
//
// Lo que pintan las dos tarjetas de salud del Dashboard de Asset Management
// (`/dashboard/asset-health`), en puro.

import { ROLE, BRAND } from "../../theme/brand";

/**
 * Tramos del último check-in, del más reciente al más viejo. El color dice
 * cuánto hay que fiarse de lo que se ve: verde = de ahora, rojo = de hace más
 * de una semana (lo mismo que cuenta "Inactive assets").
 */
const CHECK_IN_SLICES = [
  { key: "lt1h", name: "< 1 hour", color: ROLE.positive },
  { key: "lt24h", name: "< 24 hours", color: BRAND.teal },
  { key: "lt7d", name: "1–7 days", color: ROLE.caution },
  { key: "gt7d", name: "> 7 days", color: ROLE.critical },
  { key: "never", name: "Never", color: BRAND.gray },
];

/** Datos para la DonutCard. Los tramos vacíos no se pintan. */
export function checkInDonutData(checkIn) {
  if (!checkIn || typeof checkIn !== "object") return [];
  return CHECK_IN_SLICES.map((s) => ({ name: s.name, value: Number(checkIn[s.key] || 0), color: s.color })).filter(
    (d) => d.value > 0
  );
}

/** "1–7 days" → "lt7d": la rebanada pulsada, como filtro `checkIn` de /hosts. */
export function checkInKeyOfName(name) {
  return CHECK_IN_SLICES.find((s) => s.name === name)?.key ?? null;
}

/** "lt7d" → "1–7 days": para resaltar la rebanada y rotular el chip. */
export function checkInNameOfKey(key) {
  return CHECK_IN_SLICES.find((s) => s.key === key)?.name ?? null;
}

export const CHECK_IN_KEYS = new Set(CHECK_IN_SLICES.map((s) => s.key));

/**
 * Las filas de "Needs attention". Cada una con su barra sobre el TOTAL de la
 * flota —no sobre la suma de filas: un equipo puede estar en varias— y con su
 * "no sabemos" aparte, nunca sumado.
 *
 * `fleetFilter` = el filtro de Hardware Inventory al que lleva la fila, cuando
 * existe.
 */
export function attentionRows(attention) {
  if (!attention || typeof attention !== "object") return [];
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const devices = n(attention.devices);
  const rows = [
    {
      key: "disk",
      label: `Disk ≥ ${n(attention.diskThresholdPct) || 85}% full`,
      count: n(attention.diskHigh),
      unknown: n(attention.diskUnknown),
      unknownLabel: "not reporting disk",
      tone: "critical",
      fleetFilter: "disk_high",
    },
    {
      key: "memory",
      label: `Memory ≤ ${n(attention.memoryFloorGb) || 8} GB`,
      count: n(attention.lowMemory),
      unknown: n(attention.memoryUnknown),
      unknownLabel: "not reporting memory",
      tone: "caution",
      fleetFilter: "low_memory",
    },
    {
      key: "os_unsupported",
      label: "OS out of support",
      count: n(attention.osUnsupported),
      unknown: 0,
      tone: "critical",
    },
    {
      key: "os_ending",
      label: "OS support ending soon",
      count: n(attention.osEndingSoon),
      unknown: n(attention.osUnknown),
      unknownLabel: "OS not in the lifecycle catalog",
      tone: "caution",
    },
    {
      key: "boot",
      label: `No restart in ${n(attention.staleBootDays) || 30}+ days`,
      count: n(attention.staleBoot),
      unknown: n(attention.bootUnknown),
      unknownLabel: "last boot unknown",
      tone: "caution",
      hint: "Only devices seen this week — an offline device is counted under Last check-in instead.",
    },
  ];
  return rows.map((r) => ({ ...r, percent: devices > 0 ? (r.count / devices) * 100 : 0 }));
}
