// src/components/software-delivery/InstallFailuresPanel.jsx
//
// Lo que el operador tiene que hacer ahora, cuando hay fallos.
//
// EL PROBLEMA QUE RESUELVE (fase 4)
//
// El Overview informaba y no orientaba. En tenant 111 la página mostraba
// `SUCCESS RATE 11%` —8 de 9 instalaciones fallidas— como una tarjeta más entre
// otras cuatro, cuatro de ellas en cero. El número más alarmante de la pantalla
// era decorativo: no decía CUÁLES fallaron, ni POR QUÉ, ni llevaba a ningún
// sitio. Para averiguarlo había que ir a Deployments y abrir despliegues uno a
// uno.
//
// Este bloque agrupa los fallos POR CAUSA, dice en qué despliegues ocurrió cada
// una, y lleva allí. La causa es lo accionable: seis firmas inválidas y dos
// timeouts son dos problemas distintos con dos arreglos distintos, y el
// agregado "8 fallidas" los mezcla.
//
// ⚠️ EL ENLACE VA AL DESPLIEGUE, NO A UN FILTRO POR RESULTADO.
//
// `DeploymentsTab` filtra por ESTADO DEL DESPLIEGUE (completed / failed /
// running), que no es lo mismo que el resultado por equipo: un despliegue
// `completed` puede contener equipos con la firma inválida. Enlazar a
// `status=failed` habría parecido correcto y habría dejado fuera justo esos.
// Por eso se enlaza al despliegue concreto —la página ya sabe abrirlo por id— y
// el detalle de ese despliegue es donde viven los resultados por equipo.

import * as React from "react";
import { Box, Stack, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

import SectionPaper from "../common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

/**
 * Las causas de fallo, con el MISMO nombre que usa el panel de resultados.
 *
 * ⚠️ Si dos sitios de la misma página llaman distinto a lo mismo, el operador
 * tiene que traducir mentalmente entre ellos. Estas etiquetas son las de
 * `outcomeItems` en OverviewTab, a propósito.
 */
const CAUSE_LABELS = {
  signature_invalid: "Signature invalid",
  failed: "Failed",
  timed_out: "Timed out",
  rejected: "Rejected",
};

/**
 * Fallos agrupados por causa, con los despliegues donde ocurrió cada una.
 *
 * Puro: recibe la misma lista de despliegues que el Overview ya trae y no pide
 * nada nuevo al servidor. Cada despliegue viene con sus `counts` por resultado.
 */
export function failureBreakdown(deployments, causes = Object.keys(CAUSE_LABELS)) {
  const rows = Array.isArray(deployments) ? deployments : [];

  return causes
    .map((key) => {
      const where = rows.filter((d) => Number(d?.counts?.[key] ?? 0) > 0);
      const count = where.reduce((acc, d) => acc + Number(d?.counts?.[key] ?? 0), 0);
      return { key, label: CAUSE_LABELS[key] ?? key, count, deployments: where };
    })
    .filter((c) => c.count > 0)
    // La causa más frecuente primero: es por donde se empieza.
    .sort((a, b) => b.count - a.count);
}

export default function InstallFailuresPanel({ deployments, failed, settled, onOpen }) {
  const causes = React.useMemo(() => failureBreakdown(deployments), [deployments]);

  // Sin fallos no hay nada que encabezar. El Overview enseña entonces su
  // tarjeta de tasa de éxito, que en ese caso sí es la noticia.
  if (!failed) return null;

  return (
    <SectionPaper
      variant="card"
      sx={{ p: 2, borderLeft: `4px solid ${ROLE.critical}` }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        <ErrorOutlineIcon fontSize="small" sx={{ color: ROLE.critical }} />
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
          {/* El titular es el hecho, no el porcentaje: "8 de 9" se entiende sin
              hacer la cuenta, y un 11% suelto no dice cuántos equipos son. */}
          {settled
            ? `${failed} of ${settled} installs failed`
            : `${failed} installs failed`}
        </Typography>
      </Stack>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
        Grouped by cause. Open a deployment to see which devices.
      </Typography>

      <Stack spacing={0.5}>
        {causes.map((cause) => {
          // Con un solo despliegue detrás se puede abrir ESE; con varios, la
          // lista. Prometer más que eso sería llevar al operador a un sitio que
          // no contesta su pregunta.
          const single = cause.deployments.length === 1 ? cause.deployments[0] : null;
          return (
            <Box
              key={cause.key}
              role="button"
              tabIndex={0}
              aria-label={`${cause.count} ${cause.label}`}
              onClick={() => onOpen?.(cause, single)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen?.(cause, single);
                }
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1.5,
                py: 1,
                borderRadius: 2,
                cursor: "pointer",
                border: `1px solid ${BRAND.border}`,
                "&:hover": { bgcolor: BRAND.darkSoft },
                "&:focus-visible": { outline: `2px solid ${BRAND.teal}` },
              }}
            >
              <Typography
                sx={{ fontSize: TEXT.xl, fontWeight: 800, color: ROLE.critical, minWidth: 36 }}
              >
                {cause.count}
              </Typography>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
                  {cause.label}
                </Typography>
                <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                  {single
                    ? `in ${single.packageName || single.package || `deployment #${single.id}`}`
                    : `across ${cause.deployments.length} deployments`}
                </Typography>
              </Box>
              <ChevronRightIcon fontSize="small" sx={{ color: BRAND.gray }} />
            </Box>
          );
        })}
      </Stack>
    </SectionPaper>
  );
}
