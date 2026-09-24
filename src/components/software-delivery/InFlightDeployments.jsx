// src/components/software-delivery/InFlightDeployments.jsx
//
// Lo que está pasando AHORA: cada despliegue en vuelo, equipo a equipo.
//
// ── Qué contesta que la página no contestaba ─────────────────────────────
//
// La franja de arriba dice «2 deployments in flight · 3 devices still to
// report». Es el titular correcto y se queda corto en las dos preguntas que
// vienen después: en qué despliegue están esos equipos, y por qué no se ha
// movido nada.
//
// ⚠️ ESTO YA NO ES UNA TARJETA APARTE (24-sep). Era `InFlightDeploymentsPanel`,
// con su propio título «In flight now», debajo de la cobertura — y decía lo
// mismo que el titular de la franja de arriba: «3 deployments in flight». Dos
// bloques para una pregunta, separados por media pantalla. Ahora son las filas
// que la franja enseña DEBAJO de su titular, en la misma tarjeta: el titular
// resume y las filas detallan, que es lo que ya hacían, pero juntos.
//
// ⚠️ LA SEGUNDA ES LA QUE NOS COSTÓ UN SUSTO. El despliegue #44 de T111 estuvo
// horas en `scheduled` sin que la UI dijera por qué; la única lectura posible
// era «se colgó». Lo retenía la ventana de mantenimiento y el dato de CUÁNDO
// saldría ya venía en la respuesta (`scheduledAt`), sin pintarse. Aquí se pinta
// —y desde que se pueden programar envíos, también POR QUÉ: una hora que
// eligió el operador no es la política del tenant.
//
// ── Decisiones ───────────────────────────────────────────────────────────
//
// ⚠️ NO SE PINTA NADA CUANDO NO HAY NADA EN VUELO. Un «0 en vuelo» es
// exactamente el tipo de hueco que hacía que esta página se sintiera vacía: el
// estado normal de una herramienta de entrega es que no haya nada corriendo, y
// ese estado ya lo cuenta el titular de la franja en una línea.
//
// ⚠️ LOS CANCELADOS NO SON NI ÉXITO NI FALLO, y tampoco «pendiente»: son
// equipos que salieron del reparto. Contarlos como pendientes dejaría una barra
// que nunca llega al final.

import * as React from "react";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";

import { BRAND, ROLE, TEXT } from "../../theme/brand";
// La frase vive en un módulo propio: la comparten este panel y el cajón de
// detalle, y decir dos cosas distintas del mismo despliegue sería peor que no
// decir nada.
import { waitingReason } from "./deploymentSchedule";

/** Estados de despliegue que todavía consumen flota. */
export const IN_FLIGHT_STATUSES = ["scheduled", "queued", "running"];

/** Desenlaces por equipo, agrupados como los lee un operador. */
export const SUCCESS_OUTCOMES = ["success", "already_installed", "reboot_required"];
export const FAILURE_OUTCOMES = ["failed", "rejected", "signature_invalid", "timed_out"];

/**
 * El reparto de equipos de un despliegue: hecho / fallado / en marcha / sin
 * empezar, y el total que cuenta para la barra.
 *
 * Puro porque es donde se puede colar un equipo dos veces o perderse uno, y
 * ninguna de las dos cosas da error: sólo una barra que no cuadra.
 */
export function deviceFunnel(counts) {
  const c = counts || {};
  const n = (key) => Number(c[key] ?? 0);
  const done = SUCCESS_OUTCOMES.reduce((acc, k) => acc + n(k), 0);
  const failed = FAILURE_OUTCOMES.reduce((acc, k) => acc + n(k), 0);
  const running = n("running");
  const pending = n("pending");
  const cancelled = n("cancelled");
  return {
    done,
    failed,
    running,
    pending,
    cancelled,
    // Los cancelados salen del reparto: si contaran, la barra no llegaría
    // nunca al final y el despliegue parecería atascado para siempre.
    total: done + failed + running + pending,
    settled: done + failed,
  };
}

/** Los que siguen en vuelo, con los que se mueven primero. */
export function inFlightDeployments(deployments) {
  const rows = Array.isArray(deployments) ? deployments : [];
  const rank = { running: 0, queued: 1, scheduled: 2 };
  return rows
    .filter((d) => IN_FLIGHT_STATUSES.includes(d?.status))
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || Number(b.id) - Number(a.id));
}

const SEGMENTS = [
  { key: "done", label: "Done", color: ROLE.positive },
  { key: "failed", label: "Failed", color: ROLE.critical },
  { key: "running", label: "Installing", color: BRAND.teal },
  { key: "pending", label: "Not started", color: BRAND.gray },
];

function titleOf(deployment) {
  const pkg = deployment?.packageSnapshot || {};
  const name = pkg.name || "Unknown package";
  // Un despliegue de inventario (ADR-0019 F1) no tiene versión de catálogo: su
  // «versión» es la que resultara estar puesta, así que no se inventa una.
  return pkg.uninstallIdentity || !pkg.version ? name : `${name} ${pkg.version}`;
}

function DeploymentRow({ deployment, formatTime, onOpen }) {
  const funnel = deviceFunnel(deployment.counts);
  const waiting = waitingReason(deployment, formatTime);
  const segments = SEGMENTS.map((s) => ({ ...s, devices: funnel[s.key] })).filter(
    (s) => s.devices > 0
  );

  return (
    <Box
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={
        onOpen
          ? `Deployment ${deployment.id}: ${funnel.settled} of ${funnel.total} devices reported`
          : undefined
      }
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      sx={{
        py: 1.25,
        borderBottom: `1px solid ${BRAND.border}`,
        cursor: onOpen ? "pointer" : "default",
        "&:last-of-type": { borderBottom: 0 },
        "&:hover": onOpen ? { bgcolor: BRAND.rowHover } : undefined,
        "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: -2 },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
          #{deployment.id} · {titleOf(deployment)}
        </Typography>
        {deployment.mode && deployment.mode !== "install" ? (
          <Chip
            size="small"
            label={deployment.mode}
            sx={{ height: 18, fontSize: TEXT.xs, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
          />
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
          {funnel.settled}/{funnel.total} reported
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "flex",
          height: 14,
          mt: 0.75,
          borderRadius: 0.5,
          overflow: "hidden",
          bgcolor: BRAND.surfaceMuted,
        }}
      >
        {segments.map((seg) => (
          <Tooltip key={seg.key} title={`${seg.label}: ${seg.devices}`}>
            <Box
              sx={{
                width: `${(seg.devices / Math.max(1, funnel.total)) * 100}%`,
                bgcolor: seg.color,
              }}
            />
          </Tooltip>
        ))}
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.25 }}>
        {segments.map((seg) => (
          <Typography key={seg.key} sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            {seg.devices} {seg.label.toLowerCase()}
          </Typography>
        ))}
        {funnel.cancelled > 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            {funnel.cancelled} cancelled
          </Typography>
        ) : null}
      </Stack>

      {waiting ? (
        <Typography
          sx={{
            fontSize: TEXT.sm,
            color: BRAND.alert.warningText,
            bgcolor: BRAND.alert.warningSoft,
            borderRadius: 0.5,
            px: 1,
            py: 0.5,
            mt: 0.75,
            display: "inline-block",
          }}
        >
          {waiting}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * Las filas de lo que está en vuelo. SIN tarjeta ni título: vive dentro de la
 * franja de estado, debajo del titular que las resume.
 */
export default function InFlightDeployments({ deployments, formatTime, onOpenDeployment }) {
  const rows = React.useMemo(() => inFlightDeployments(deployments), [deployments]);

  // Nada en vuelo es el estado NORMAL: el titular ya lo dice en una línea.
  if (rows.length === 0) return null;

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}>
      {rows.map((deployment) => (
        <DeploymentRow
          key={deployment.id}
          deployment={deployment}
          formatTime={formatTime}
          onOpen={onOpenDeployment ? () => onOpenDeployment(deployment) : undefined}
        />
      ))}
    </Box>
  );
}
