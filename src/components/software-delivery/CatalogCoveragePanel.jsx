// src/components/software-delivery/CatalogCoveragePanel.jsx
//
// Cuánta flota tiene cada título del catálogo, y en qué versión.
//
// ── Por qué este bloque manda en el Overview ─────────────────────────────
//
// La página medía sólo ACTIVIDAD de la herramienta —28 instalaciones en 30
// días en el tenant 111— y por eso se veía vacía: esa pregunta casi no tiene
// respuestas. El inventario sí las tiene, todos los días. Medido el 20-sep en
// ese mismo tenant, con 56 equipos reportando: Edge en 55, Chrome en 30 (26 sin
// él, estando publicado) y Firefox en 1.
//
// Y son respuestas ACCIONABLES: «26 sin instalar» es un despliegue, no una
// cifra para mirar.
//
// ── Decisiones de lectura ────────────────────────────────────────────────
//
// ⚠️ LA BARRA AGRUPA POR ESTADO, NO POR VERSIÓN. Edge tiene nueve versiones
// vivas en T111: nueve segmentos serían nueve rayas ilegibles de 1 px. El
// estado (al día / por delante / por detrás) es lo que se decide; la dispersión
// de versiones se cuenta con palabras debajo, que es donde cabe.
//
// ⚠️ «POR DELANTE» NO ES UN FALLO y por eso no es rojo: Chrome y Edge se
// auto-actualizan, así que lo normal es que la flota adelante al paquete. Lo
// que sí es noticia es que TODOS vayan por delante — entonces el paquete del
// catálogo es el que está viejo, y eso se dice con una frase, no con un color
// de alarma.
//
// ⚠️ «Sin instalar» se dibuja con trama y no con relleno: no es una parte de lo
// instalado, es el hueco. Con relleno sólido compite visualmente con los
// estados y la fila se lee como si todo el mundo tuviera el título.
//
// ⚠️ UNA FILA ES UN TÍTULO, NO UN PAQUETE (24-sep). Un tenant publica Chrome
// dos veces —Windows y macOS— y la pantalla enseñaba las dos filas con los
// MISMOS números, porque el servidor casaba sólo por nombre y ninguna miraba la
// plataforma del equipo. En T111, que no tiene ni un Mac, la fila de macOS
// decía «30 equipos» y los 30 eran PCs. Ahora el servidor agrupa por título y
// cada plataforma es una variante con sus propios números.
//
// ⚠️ Y EL DENOMINADOR DE LA BARRA ES `eligibleDevices`, los equipos donde ese
// título SE PUEDE desplegar. Un título sólo de Windows no deja «sin Chrome» a
// los Macs de la casa: los deja fuera de la pregunta.

import * as React from "react";
import { Box, Skeleton, Stack, Tooltip, Typography } from "@mui/material";

import SectionPaper from "../common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

/** Cómo se pinta cada estado. El orden ES el de la barra, de mejor a peor. */
const STATES = [
  { key: "current", label: "On the catalog version", color: ROLE.positive },
  { key: "ahead", label: "Ahead (self-updated)", color: BRAND.teal },
  { key: "behind", label: "Behind", color: ROLE.caution },
  { key: "unknown", label: "Version not comparable", color: BRAND.gray },
];

/** Nombres de plataforma como los lee un operador. */
const PLATFORM_NAMES = { windows: "Windows", macos: "macOS", linux: "Linux" };

/** Los equipos a los que este título se puede desplegar. */
export function eligibleOf(item, totalDevices) {
  // ⚠️ El respaldo es para una respuesta ANTERIOR al 24-sep, que no traía
  // `eligibleDevices` porque medía todo contra la flota entera. Durante un
  // despliegue escalonado la UI puede recibirla, y una barra vacía se leería
  // como «nadie lo tiene».
  const eligible = item?.eligibleDevices;
  return Number(eligible ?? totalDevices) || 0;
}

/**
 * La línea de debajo del nombre: qué versión se publicó, y para qué.
 *
 * ⚠️ NO SE ELIGE UNA VERSIÓN CUANDO LAS PLATAFORMAS PUBLICAN DISTINTO. Enseñar
 * «catalog 154» cuando en macOS se publicó la 153 sería inventar la mitad del
 * dato; el servidor manda `catalogVersion: null` justo para eso.
 */
export function catalogLine(item) {
  const versions = Array.isArray(item?.catalogVersions) ? item.catalogVersions : [];
  const platforms = (Array.isArray(item?.platforms) ? item.platforms : [])
    .map((p) => PLATFORM_NAMES[p] ?? p)
    .filter(Boolean);

  if (item?.catalogVersion) {
    const where = platforms.length > 0 ? ` · ${platforms.join(" · ")}` : "";
    return `catalog ${item.catalogVersion}${where}`;
  }
  if (versions.length > 0) {
    return `catalog ${versions
      .map((v) => `${v.version} (${PLATFORM_NAMES[v.platform] ?? (v.platform || "?")})`)
      .join(" · ")}`;
  }
  return "catalog —";
}

/**
 * Los tramos de la barra de una fila, en porcentaje sobre los equipos DONDE SE
 * PUEDE DESPLEGAR.
 *
 * Puro y exportado porque es donde se puede equivocar el cálculo sin que se
 * note: el denominador nunca es lo instalado —una barra llena para un título
 * que tiene 1 de 56— y tampoco la flota entera, o un título sólo de Windows
 * saldría medio vacío en una casa con Macs que no pueden tenerlo.
 */
export function coverageSegments(item, totalDevices) {
  const total = eligibleOf(item, totalDevices);
  if (total <= 0) return [];
  const pct = (n) => (Number(n) || 0) / total * 100;
  const segments = STATES.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
    devices: Number(item?.[s.key] ?? 0),
    pct: pct(item?.[s.key]),
  })).filter((s) => s.devices > 0);

  const missing = Number(item?.missingDevices ?? 0);
  if (missing > 0) {
    segments.push({ key: "missing", label: "Not installed", color: null, devices: missing, pct: pct(missing) });
  }
  return segments;
}

/**
 * La frase de debajo del título: dispersión de versiones y la más extendida.
 *
 * Separada de la barra porque contesta otra pregunta ("¿cuánta deriva hay?") y
 * porque nueve versiones no caben en una barra pero sí en una línea.
 */
export function versionSummary(item) {
  const versions = Array.isArray(item?.versions) ? item.versions : [];
  if (versions.length === 0) return null;
  const top = versions[0];
  const plural = versions.length === 1 ? "version" : "versions";
  return `${versions.length} ${plural} in the fleet · most common ${top.version} (${top.devices})`;
}

/** true cuando NADIE tiene la versión publicada y todos la adelantan. */
export function catalogLagsFleet(item) {
  return Number(item?.installedDevices ?? 0) > 0 &&
    Number(item?.current ?? 0) === 0 &&
    Number(item?.behind ?? 0) === 0 &&
    Number(item?.ahead ?? 0) === Number(item?.installedDevices ?? 0);
}

/** Un control de verdad: foco, Enter y Espacio. No un `div` con `onClick`. */
function pressable(onPress, label) {
  if (typeof onPress !== "function") return {};
  return {
    onClick: onPress,
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPress();
      }
    },
  };
}

function CoverageRow({ item, totalDevices, onOpen, onOpenCell }) {
  const segments = coverageSegments(item, totalDevices);
  const summary = versionSummary(item);
  const installed = Number(item.installedDevices ?? 0);
  const eligible = eligibleOf(item, totalDevices);
  const percent = eligible > 0 ? Math.round((installed / eligible) * 100) : 0;
  const cell = (key) =>
    typeof onOpenCell === "function" ? () => onOpenCell(item, key) : undefined;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "minmax(150px, 1.1fr) 2fr auto" },
        gap: 1.5,
        alignItems: "center",
        py: 1.25,
        borderBottom: `1px solid ${BRAND.border}`,
        "&:last-of-type": { borderBottom: 0 },
      }}
    >
      {/* ⚠️ La navegación al catálogo vive AQUÍ y no en la fila entera: desde
          que los tramos se pueden pulsar, una fila-botón los dejaría anidados
          dentro de otro botón —inválido para un lector de pantalla— y cada clic
          en un tramo dispararía además la navegación. */}
      <Box
        {...pressable(onOpen, `${item.name}: installed on ${installed} of ${eligible} devices`)}
        sx={{
          minWidth: 0,
          borderRadius: 1,
          cursor: onOpen ? "pointer" : "default",
          "&:hover": onOpen ? { "& .n": { color: BRAND.teal } } : undefined,
          "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 },
        }}
      >
        <Typography className="n" sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }} noWrap>
          {item.name}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }} noWrap>
          {catalogLine(item)}
        </Typography>
      </Box>

      <Box>
        <Box
          sx={{
            display: "flex",
            height: 22,
            borderRadius: 0.5,
            overflow: "hidden",
            // La trama es el hueco: lo que NO está instalado.
            backgroundImage:
              `repeating-linear-gradient(45deg, ${BRAND.surfaceMuted}, ${BRAND.surfaceMuted} 4px, rgba(190,190,190,0.22) 4px, rgba(190,190,190,0.22) 8px)`,
          }}
        >
          {segments.map((seg) => (
            <Tooltip key={seg.key} title={`${seg.label}: ${seg.devices}`}>
              {/* ⚠️ ATAJO DE RATÓN, NO UN CONTROL. El tramo no lleva rol ni
                  foco a propósito: el contador de debajo hace exactamente lo
                  mismo y SÍ es alcanzable con el teclado. Con los dos como
                  botones, un lector de pantalla leería cada celda dos veces y
                  la fila tendría ocho paradas de tabulación en vez de cuatro. */}
              <Box
                onClick={cell(seg.key)}
                sx={{
                  width: `${seg.pct}%`,
                  bgcolor: seg.color ?? "transparent",
                  display: "grid",
                  placeItems: "center",
                  color: seg.key === "behind" ? BRAND.alert.warningText : BRAND.surface,
                  fontSize: TEXT.xs,
                  fontWeight: 700,
                  cursor: onOpenCell ? "pointer" : "default",
                }}
              >
                {seg.pct >= 12 ? seg.devices : ""}
              </Box>
            </Tooltip>
          ))}
        </Box>

        {/* ⚠️ LOS CONTADORES SON EL BOTÓN DE VERDAD. Un tramo del 1 % mide dos
            píxeles: pulsable en teoría, inalcanzable con el ratón. Y son justo
            los pequeños —«2 por detrás»— los que llevan a la acción. */}
        <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.25 }}>
          {segments.map((seg) => (
            <Typography
              key={seg.key}
              {...pressable(cell(seg.key), `${item.name}, ${seg.label}: ${seg.devices} devices`)}
              sx={{
                fontSize: TEXT.sm,
                color: BRAND.gray,
                borderRadius: 0.5,
                cursor: onOpenCell ? "pointer" : "default",
                textDecoration: onOpenCell ? "underline dotted" : "none",
                textUnderlineOffset: 3,
                "&:hover": onOpenCell ? { color: BRAND.teal } : undefined,
                "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 },
              }}
            >
              {seg.devices} {seg.label.toLowerCase()}
            </Typography>
          ))}
        </Stack>

        {summary ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 0.25 }} noWrap>
            {summary}
            {catalogLagsFleet(item) ? " · nobody is on the published version" : ""}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 0.25 }}>
            Not installed anywhere in the fleet
          </Typography>
        )}
      </Box>

      <Box sx={{ textAlign: { xs: "left", sm: "right" }, whiteSpace: "nowrap" }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
          {installed}/{eligible}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
          {item.missingDevices > 0 ? `${item.missingDevices} without it` : `${percent}%`}
        </Typography>
      </Box>
    </Box>
  );
}

export default function CatalogCoveragePanel({
  loading,
  coverage,
  failed,
  onNavigateTab,
  onOpenCell,
}) {
  const totalDevices = Number(coverage?.totalDevices ?? 0);
  const items = Array.isArray(coverage?.items) ? coverage.items : [];

  return (
    <SectionPaper variant="card" sx={{ p: 2 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
        flexWrap="wrap"
        gap={1}
        sx={{ mb: 1 }}
      >
        <Box>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
            Catalog coverage
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            Devices per version against what you published
          </Typography>
        </Box>
        {totalDevices > 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            {totalDevices} device{totalDevices === 1 ? "" : "s"} reporting inventory
          </Typography>
        ) : null}
      </Stack>

      {loading ? (
        <Skeleton variant="rounded" height={160} />
      ) : failed ? (
        // ⚠️ Un panel que se esfuma es indistinguible de uno sin datos: ya nos
        // pasó con el de LAN. Si la llamada falla, se dice.
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.alert.warningText }}>
          Couldn’t load catalog coverage. The rest of the page is unaffected.
        </Typography>
      ) : items.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>
          No deployable packages in the catalog yet.
        </Typography>
      ) : totalDevices === 0 ? (
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>
          No device has reported a software inventory yet, so there is nothing to compare against.
        </Typography>
      ) : (
        <>
          {items.map((item) => (
            <CoverageRow
              // La fila es el TÍTULO: Chrome para Windows y para macOS son una
              // cosa que el operador mantiene, no dos. `packageId` es el
              // respaldo para una respuesta anterior al 24-sep.
              key={item.titleKey ?? item.packageId}
              item={item}
              totalDevices={totalDevices}
              onOpen={onNavigateTab ? () => onNavigateTab("catalog") : undefined}
              onOpenCell={onOpenCell}
            />
          ))}

          <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mt: 1.5, rowGap: 0.5 }}>
            {STATES.map((s) => (
              <Stack key={s.key} direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: s.color }} />
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{s.label}</Typography>
              </Stack>
            ))}
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: 0.5,
                  backgroundImage: `repeating-linear-gradient(45deg, ${BRAND.surfaceMuted}, ${BRAND.surfaceMuted} 2px, rgba(190,190,190,0.35) 2px, rgba(190,190,190,0.35) 4px)`,
                }}
              />
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>Not installed</Typography>
            </Stack>
          </Stack>

          {coverage?.truncated ? (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.warningText, mt: 1 }}>
              The inventory returned more rows than this view reads, so these counts are a floor.
            </Typography>
          ) : null}
        </>
      )}
    </SectionPaper>
  );
}
