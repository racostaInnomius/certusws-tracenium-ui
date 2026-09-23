// src/components/Overview/signalCoverageModel.js
//
// "¿De cuántos equipos no sabemos nada?", repartido por los bloques del
// Overview.
//
// Era la tarjeta "Blind spots" de Asset Management, pero de sus cuatro señales
// sólo una (inventario) es de esa página: compliance, parches y certificados
// son de SCP, PMP y CDP. En el Overview cada señal va al bloque de SU plugin
// —la misma regla que cualquier card de la página—, junto a los números que
// pone en duda:
//   · Fleet & operations → KPI "Blind spots" (inventario), en el sitio que
//     tenía "Unread alerts"
//   · Security & access  → quinto KPI "Compliance reporting"
//   · Patching & crypto  → una pieza sobre cada card (parches | certificados)
// Y cada hueco abre la lista de ESOS equipos (SignalGapDrawer).
//
// Dos cosas que NO hace, y que son las que la hacen creíble:
//
//   · No enseña lo que el plan no incluye. Una señal sin plan no es un hueco,
//     y su bloque ni se monta; el aviso de plan ya dice qué falta.
//   · No suma equipos entre señales para el titular: el mismo portátil suele
//     estar callado en varias. `devicesWithAnyGap` llega deduplicado del
//     backend.

import { formatRelative } from "../../utils/format";

/** El texto del hueco. Distingue "nunca" de "hace mucho": no son el mismo problema. */
export function gapText(signal) {
  if (!signal.entitled) return "Not in plan — nothing is expected from these devices.";
  if (signal.blind === 0) return "Every device is reporting.";
  const parts = [];
  if (signal.never > 0) parts.push(`${signal.never} never reported`);
  if (signal.stale > 0) parts.push(`${signal.stale} silent for over ${signal.staleAfterDays} days`);
  return parts.join(" · ");
}

/** Verde no es "0 huecos": es "0 huecos Y algo que contar". */
export function barColor(signal) {
  if (!signal.entitled) return "inherit";
  if (signal.blindPct >= 25) return "error";
  if (signal.blindPct > 0) return "warning";
  return "success";
}

/**
 * Una señal de la respuesta, si el plan la incluye (si no, no es un hueco y no
 * se pinta). Cada bloque del Overview pide las SUYAS por clave.
 *
 * @param coverage respuesta de /dashboard/signal-coverage (o null: 403 sin
 *                 `assets_view`, o fallo — entonces no hay nada que pintar)
 */
export function entitledSignal(coverage, key) {
  if (!coverage || !Array.isArray(coverage.signals) || !(Number(coverage.fleet) > 0)) return null;
  return coverage.signals.find((s) => s.key === key && s.entitled) ?? null;
}

/**
 * El titular de la cabecera, o null si no hay nada que decir todavía.
 * `anyGap` es lo que decide el tono: con huecos se lee como aviso.
 */
export function headline(coverage) {
  const fleet = Number(coverage?.fleet) || 0;
  if (!coverage || fleet === 0) return null;
  const anyGap = Number(coverage.devicesWithAnyGap) || 0;
  if (anyGap === 0) {
    return { tone: "ok", text: `All ${fleet} devices report every signal in your plan` };
  }
  return {
    tone: "warning",
    text: `${anyGap} of ${fleet} devices are missing at least one signal`,
  };
}

/** "Never reported" / "Last report 12 days ago" — el porqué de cada equipo del hueco. */
export function gapReason(device) {
  if (device.reason === "never" || !device.lastReportAt) return "Never reported";
  return `Last report ${formatRelative(device.lastReportAt)}`;
}
