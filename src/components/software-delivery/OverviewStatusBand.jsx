// src/components/software-delivery/OverviewStatusBand.jsx
//
// La franja de arriba contesta; no inventaria.
//
// EL PROBLEMA QUE RESUELVE
//
// Arriba había cinco SummaryCard: Packages · Active deployments · Success rate
// · Intakes to review · Site coverage. Medido en tenant 111 el 6 de septiembre,
// la fila decía: 2 · 0 · 0 · 2/2. Tres de cuatro eran cero, y ocupaban la
// franja más valiosa de la página para no decir nada. Un operador que llega
// quiere saber si hay algo que atender AHORA; le contestábamos con un
// inventario.
//
// ⚠️ «2 paquetes» ERA FALSO, ADEMÁS. La tarjeta contaba `packages.length`, y
// los dos paquetes de ese tenant tienen `is_active = false`. Un catálogo sin
// una sola cosa desplegable leía «2». `activePackages` ya se calculaba en el
// Overview y no lo usaba nadie.
//
// ⚠️ Y «Catalog by platform: Windows 100%» era una barra sola. Una barra al
// 100 % no es una gráfica, es una frase con más tinta. La mezcla de
// plataformas cabe al lado del número de paquetes, que es donde se pregunta.

import * as React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";

import SectionPaper from "../common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

/** El último día con actividad, o null. Los buckets vienen ordenados por día. */
export function lastActivityDay(buckets) {
  const rows = Array.isArray(buckets) ? buckets : [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const b = rows[i];
    if (Number(b?.succeeded ?? 0) > 0 || Number(b?.failed ?? 0) > 0) {
      return String(b.bucket ?? "") || null;
    }
  }
  return null;
}

/**
 * El titular de la página, en una frase.
 *
 * Puro y con un solo trabajo: decidir QUÉ se dice arriba del todo. Hay tres
 * estados y sólo tres, porque son las tres respuestas distintas a "¿tengo algo
 * que hacer?": hay trabajo en vuelo, hubo trabajo y paró, o nunca hubo.
 */
export function headlineFor({ inFlightCount = 0, devicesInFlight = 0, buckets, today } = {}) {
  if (inFlightCount > 0) {
    return {
      kind: "running",
      headline: `${inFlightCount} deployment${inFlightCount === 1 ? "" : "s"} in flight`,
      detail: devicesInFlight
        ? `${devicesInFlight} device${devicesInFlight === 1 ? "" : "s"} still to report`
        : "No devices pending",
    };
  }

  const last = lastActivityDay(buckets);
  if (!last) {
    return {
      kind: "never",
      headline: "No installs in this window",
      detail: "Nothing has been deployed from the catalog yet",
    };
  }

  // ⚠️ Los días se cuentan entre FECHAS, no entre instantes.
  //
  // Con el instante, una instalación de esta misma madrugada mirada por la
  // tarde daba 18 h → `round` → "parado 1 día", en un día en el que sí hubo
  // actividad. Truncar el momento a su fecha UTC es lo que hace que "hoy" sea
  // hoy. `today` entra por parámetro para no depender del reloj de quien corre
  // el test.
  const ref = (today ? new Date(today) : new Date()).toISOString().slice(0, 10);
  const days = Math.max(
    0,
    Math.round((new Date(`${ref}T00:00:00Z`) - new Date(`${last}T00:00:00Z`)) / 86400000)
  );
  return {
    kind: "idle",
    headline: days === 0 ? "Last install today" : `No activity for ${days} day${days === 1 ? "" : "s"}`,
    detail: `Last install on ${last}`,
  };
}

/** Cómo se lee el catálogo: lo desplegable manda, lo retirado se menciona. */
export function catalogSummary(packages) {
  const rows = Array.isArray(packages) ? packages : [];
  const active = rows.filter((p) => p.isActive);
  const platforms = active.reduce((acc, p) => {
    const key = p.platform || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const names = Object.keys(platforms).sort((a, b) => platforms[b] - platforms[a]);
  return {
    active: active.length,
    retired: rows.length - active.length,
    // Con una sola plataforma se dice el nombre; con varias, el reparto. Ni un
    // caso ni el otro necesitan una barra.
    platformLabel:
      names.length === 0
        ? null
        : names.length === 1
          ? PLATFORM_NAMES[names[0]] ?? names[0]
          : names.map((n) => `${PLATFORM_NAMES[n] ?? n} ${platforms[n]}`).join(" · "),
  };
}

const PLATFORM_NAMES = { windows: "Windows", macos: "macOS", linux: "Linux" };

/**
 * Un dato de la franja; con `onClick`, un control de verdad.
 *
 * ⚠️ Las SummaryCard que esto sustituye eran alcanzables con el teclado.
 * Cambiarlas por un `div` con `onClick` habría retirado en silencio ese acceso
 * —la clase de pérdida que un refactor de "quitar superficie" cuela sin que
 * nadie lo note— así que lo que navega lleva rol, foco y Enter/Espacio.
 */
function Fact({ label, value, tone, hint, onClick }) {
  const body = (
    <Box
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${label}: ${value}` : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        cursor: onClick ? "pointer" : "default",
        borderRadius: 1,
        "&:hover": onClick ? { "& .v": { color: BRAND.teal } } : undefined,
        "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 },
      }}
    >
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{label}</Typography>
      <Typography
        className="v"
        sx={{ fontSize: TEXT.md, fontWeight: 700, color: tone || BRAND.dark }}
      >
        {value}
      </Typography>
    </Box>
  );
  return hint ? <Tooltip title={hint}>{body}</Tooltip> : body;
}

export default function OverviewStatusBand({
  loading,
  packages,
  inFlightCount,
  devicesInFlight,
  buckets,
  settled,
  failed,
  pendingIntakes,
  intakesCapped,
  coveredSites,
  totalActiveSites,
  uncoveredSites,
  onNavigateTab,
}) {
  const status = React.useMemo(
    () => headlineFor({ inFlightCount, devicesInFlight, buckets }),
    [inFlightCount, devicesInFlight, buckets]
  );
  const catalog = React.useMemo(() => catalogSummary(packages), [packages]);

  if (loading) {
    return (
      <SectionPaper variant="card" sx={{ p: 2 }}>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>Loading…</Typography>
      </SectionPaper>
    );
  }

  return (
    <SectionPaper variant="card" sx={{ p: 2 }}>
      <Stack
        direction="row"
        spacing={3}
        sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: TEXT.base,
              fontWeight: 800,
              color: status.kind === "running" ? BRAND.dark : BRAND.dark,
            }}
          >
            {status.headline}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{status.detail}</Typography>
        </Box>

        <Box sx={{ flex: 1 }} />

        <Fact
          label="Deployable packages"
          // ⚠️ Los retirados NO se suman. Un catálogo de dos paquetes
          // desactivados no es un catálogo de dos.
          value={
            catalog.retired
              ? `${catalog.active} · ${catalog.retired} retired`
              : String(catalog.active)
          }
          tone={catalog.active === 0 ? ROLE.caution : undefined}
          hint="Active packages in the catalog. Retired ones cannot be deployed."
          onClick={() => onNavigateTab?.("catalog")}
        />

        {catalog.platformLabel ? (
          <Fact label="Platform" value={catalog.platformLabel} hint="Platforms covered by the deployable packages." />
        ) : null}

        {/* ⚠️ Sin fallos, el resultado SÍ es la noticia — y era lo único que
            aportaba la tarjeta «Success rate», que esta franja sustituyó. Con
            fallos no se pinta: el bloque de cabecera ya dice «8 de 9 fallaron»
            y además lleva a la causa; repetirlo aquí como porcentaje suelto es
            la versión decorativa del mismo dato. */}
        {settled > 0 && !failed ? (
          <Fact
            label="Outcome"
            value={`All ${settled} succeeded`}
            tone={ROLE.positive}
            hint="Every settled per-device install in the sampled deployments landed successfully."
          />
        ) : null}

        {pendingIntakes > 0 ? (
          <Fact
            label="Awaiting review"
            value={`${pendingIntakes}${intakesCapped ? "+" : ""}`}
            tone={ROLE.caution}
            hint="Uploads verified and awaiting an approve/reject decision."
            onClick={() => onNavigateTab?.("catalog", { reviewQueue: true })}
          />
        ) : null}

        {/* `0/0` no es cobertura del 0 %: es un tenant sin sitios. */}
        {totalActiveSites > 0 ? (
          <Fact
            label="Sites with a DP"
            value={`${coveredSites}/${totalActiveSites}`}
            tone={uncoveredSites > 0 ? ROLE.caution : ROLE.positive}
            hint="Sites with at least one active distribution point. Uncovered sites download from CDN or origin instead of the LAN."
            onClick={() => onNavigateTab?.("distribution")}
          />
        ) : null}
      </Stack>
    </SectionPaper>
  );
}
