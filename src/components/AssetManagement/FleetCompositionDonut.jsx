// src/components/AssetManagement/FleetCompositionDonut.jsx
//
// De qué está hecha la flota — una dona.
//
// ⚠️ Es la ÚNICA gráfica de esta página que de verdad reparte un todo: cuatro
// categorías que suman los equipos del tenant. Por eso es la única que merece
// forma circular; un pie con muchas rebanadas o con tamaños parecidos es
// ilegible, y 26/15/11/1 se lee de un golpe.
//
// Y por eso está EN MEDIO de los dos histogramas: separa dos gráficas de
// columnas que juntas se leían como una sola con un hueco en medio.
//
// ⚠️ Los equipos virtuales van al CENTRO, no al anillo. `formFactor` e
// `isVirtual` son ejes independientes (ver device-form-factor.ts): en esta
// flota los 11 virtuales SON los 11 servidores, así que como rebanada la dona
// sumaría 64 sobre 53 equipos. En el centro son lo que son — una lectura que
// atraviesa las cuatro categorías.
//
// El dibujo (anillo, centro, leyenda) vive en Charts/RingCard, que comparten
// Agent versions, OS platform y OS patch recency: este layout fue el que se
// homologó en todas.

import * as React from "react";
import { BRAND } from "../../theme/brand";
import RingCard from "../Charts/RingCard";

const SEGMENTS = [
  { key: "laptop", label: "Laptops", color: BRAND.teal },
  { key: "desktop", label: "Desktops", color: BRAND.tealText },
  { key: "server", label: "Servers", color: BRAND.dark },
  { key: "unknown", label: "Unclassified", color: BRAND.gray },
];

// `sx` deja que el Overview la vista como sus vecinas de fila (radio 2, sin
// sombra) sin cambiar cómo se ve en Hardware Inventory.
export default function FleetCompositionDonut({ composition, total, activeFilter, onSelect, loading = false, sx = null }) {
  const slices = SEGMENTS.map((s) => ({ ...s, value: Number(composition?.[s.key] || 0) }));
  const sum = slices.reduce((acc, s) => acc + s.value, 0);
  const virtual = Number(composition?.virtual || 0);

  return (
    <RingCard
      title="Fleet composition"
      subtitle="What the fleet is made of"
      slices={slices}
      total={Number(total || sum)}
      ariaNoun="devices"
      centerLabel={virtual > 0 ? `${virtual} virtual` : null}
      centerLabelColor={BRAND.tealText}
      onCenterLabelClick={virtual > 0 ? () => onSelect?.("virtual") : null}
      activeKey={activeFilter}
      onSliceClick={(s) => onSelect?.(s.key)}
      loading={loading}
      emptyLabel="No devices to classify"
      sx={{ minHeight: 260, ...(sx || {}) }}
    />
  );
}
