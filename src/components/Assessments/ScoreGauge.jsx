// src/components/Assessments/ScoreGauge.jsx
//
// ADR-0022 — el score de una instancia como gauge de media luna:
//   · el arco de fondo lleva las TRES bandas del tenant (Action required /
//     Needs attention / On track) en tono suave, para que se vea dónde empieza
//     cada una;
//   · el arco lleno llega hasta el score, con el color de su banda;
//   · una marca cruza el arco en el objetivo, con su número;
//   · sin score (ninguna corrida completa) el arco queda vacío y el centro dice
//     «—», nunca un 0 que parecería una nota.
//
// SVG a mano y no Recharts: son tres arcos y una línea, y así la geometría se
// prueba sin montar un gráfico.

import * as React from "react";
import { BRAND, TEXT_MUTED } from "../../theme/brand";
import { DEFAULT_BANDS, scoreBandRole, scoreBandSoftRole } from "../../theme/scoreBands";
import { GAUGE, clampScore, gaugeArc, gaugePoint } from "./gaugeGeometry";

const STROKE = GAUGE.stroke;
const R = GAUGE.r;
const CX = GAUGE.cx;
const CY = GAUGE.cy;

export default function ScoreGauge({ score, target, bands = DEFAULT_BANDS, size = 400 }) {
  const hasScore = Number.isFinite(score);
  const segments = [
    { from: 0, to: bands.warningMin, color: scoreBandSoftRole(0, bands) },
    { from: bands.warningMin, to: bands.goodMin, color: scoreBandSoftRole(bands.warningMin, bands) },
    { from: bands.goodMin, to: 100, color: scoreBandSoftRole(100, bands) },
  ].filter((s) => s.to > s.from);

  const hasTarget = Number.isFinite(target);
  const tickIn = gaugePoint(target, R - STROKE / 2 - 5);
  const tickOut = gaugePoint(target, R + STROKE / 2 + 5);
  const labelAt = gaugePoint(target, R + STROKE / 2 + 16);
  const anchor = target > 60 ? "start" : target < 40 ? "end" : "middle";

  const label = hasScore
    ? `Score ${score} of 100${hasTarget ? `, target ${target}` : ""}`
    : `No score yet${hasTarget ? `, target ${target}` : ""}`;

  return (
    <svg viewBox="-62 -28 324 146" width="100%" style={{ maxWidth: size, display: "block", margin: "0 auto" }} role="img" aria-label={label}>
      {segments.map((s) => (
        <path key={s.from} d={gaugeArc(s.from, s.to)} fill="none" stroke={s.color} strokeWidth={STROKE} />
      ))}
      {hasScore && score > 0 ? (
        <path data-testid="gauge-value" d={gaugeArc(0, clampScore(score))} fill="none" stroke={scoreBandRole(score, bands)} strokeWidth={STROKE} />
      ) : null}
      {hasTarget ? (
        <g data-testid="gauge-target">
          <line x1={tickIn.x} y1={tickIn.y} x2={tickOut.x} y2={tickOut.y} stroke={BRAND.dark} strokeWidth={3} strokeLinecap="round" />
          <text x={labelAt.x} y={labelAt.y} textAnchor={anchor} dominantBaseline="middle" fontSize="11" fontWeight="700" fill={BRAND.dark}>
            Target {target}
          </text>
        </g>
      ) : null}
      <text x={CX} y={CY - 8} textAnchor="middle" fontSize="40" fontWeight="800" fill={BRAND.dark}>
        {hasScore ? score : "—"}
      </text>
      <text x={CX - R} y={CY + 16} textAnchor="middle" fontSize="10" fill={TEXT_MUTED}>0</text>
      <text x={CX + R} y={CY + 16} textAnchor="middle" fontSize="10" fill={TEXT_MUTED}>100</text>
    </svg>
  );
}
