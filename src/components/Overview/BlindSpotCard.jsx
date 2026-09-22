// src/components/Overview/BlindSpotCard.jsx
//
// "Blind spots" del bloque Fleet & operations: cuántos equipos NO mandan
// inventario, en la fila de cards (ocupa el sitio de "Latest alerts", que
// repetía lo que ya enseña la campana de la barra superior).
//
// "N never reported" / "N silent…" no se quedan en cifra: "See devices" abre
// la lista de esos equipos.

import * as React from "react";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import SummaryStatCard from "./SummaryStatCard";

export default function BlindSpotCard({ signal, fleet, loading = false, onOpenDevices }) {
  const stats = [{ label: "Reporting", value: `${signal.reporting}/${fleet}`, tone: signal.blind > 0 ? "caution" : "positive" }];
  if (signal.never > 0) stats.push({ label: "Never reported", value: signal.never, tone: "caution" });
  if (signal.stale > 0) {
    stats.push({ label: `Silent for over ${signal.staleAfterDays} days`, value: signal.stale, tone: "caution" });
  }
  return (
    <SummaryStatCard
      title="Blind spots"
      subtitle={signal.label}
      inlineSubtitle
      icon={VisibilityOffOutlinedIcon}
      loading={loading}
      empty={signal.blind === 0 ? `All ${fleet} devices are reporting ${signal.label.toLowerCase()}.` : null}
      stats={stats}
      openLabel="See devices"
      onOpen={signal.blind > 0 ? () => onOpenDevices?.(signal) : undefined}
    />
  );
}
