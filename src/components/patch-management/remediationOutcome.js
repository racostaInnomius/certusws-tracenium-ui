// src/components/patch-management/remediationOutcome.js
//
// Qué decirle al operador cuando pulsa «Deploy fix» en Vulnerabilities. PURO.
//
// ⚠️ POR QUÉ (21-sep). Tras el clic el aviso siempre decía «Deploying the fix
// to N device(s)», pero la remediación de un CVE ESPERA A LA VENTANA DE
// MANTENIMIENTO (cve-remediation.service: `waitForMaintenanceWindow: true` —
// interrumpe, así que no sale a media mañana). En un tenant con ventana cerrada
// el despliegue se crea retenido y no pasa nada visible hasta la noche: el
// aviso decía «desplegando» sobre algo que aún no se movía. Aquí se distingue
// «sale ahora» de «queda esperando a la ventana, que abre a tal hora».

function formatWhen(iso, timeZone) {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(t));
  } catch {
    return null;
  }
}

/**
 * `{ severity, message }` para la respuesta de POST .../remediate.
 *
 * `timeZone` sólo existe para los tests: en el navegador se usa la zona del
 * operador, que es en la que va a leer la hora.
 */
export function describeRemediationOutcome(res, { title, cveId } = {}, { timeZone } = {}) {
  const what = title ? `the ${title} fix` : "the fix";
  const n = Number(res?.deviceCount) || 0;
  const devices = `${n} device${n === 1 ? "" : "s"}`;

  if (!res?.deployed) {
    return {
      severity: "info",
      message: `No device is vulnerable to ${cveId || "this CVE"} right now — nothing was deployed.`,
    };
  }

  const dep = res.deployment || {};
  if (dep.scheduledReason === "maintenance_window") {
    const when = formatWhen(dep.scheduledAt, timeZone);
    return {
      severity: "info",
      message: when
        ? `Held for the maintenance window: ${what} goes to ${devices} when it opens (${when}).`
        : `Held for the maintenance window: ${what} goes to ${devices} when the next window opens.`,
    };
  }

  return { severity: "success", message: `Deploying ${what} to ${devices} now.` };
}
