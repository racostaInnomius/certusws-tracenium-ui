// src/components/AssetsDashboard/evidenceView.js
//
// ADR-0032 F3 — lo que la pantalla de evidencia dice de cada captura. PURO.
//
// Tres cosas se deciden aquí, y las tres son de honestidad, no de estilo:
//
//   1. LA HORA ES LA DEL EQUIPO. Una captura se lee para reconstruir una
//      mañana concreta, y el equipo puede estar en otro huso que quien mira.
//      En el caso que originó este módulo el servidor iba en UTC-5 y quien
//      reportó la incidencia en UTC-6: esa hora de diferencia colocaba el
//      reporte del usuario antes o después de la última actividad registrada.
//      Por eso se pinta la hora del EQUIPO y se dice cuál es su desfase cuando
//      no coincide con el del operador.
//
//   2. `partial` NO ES UN FALLO, y tampoco es un éxito. Es un paquete con lo
//      que se pudo recoger y la constancia de lo que no. La pantalla lo dice
//      con esas palabras y enseña el motivo de cada ausencia.
//
//   3. DESCARGAR AVISA DE LO QUE CONTIENE. Un paquete lleva nombres de
//      usuario, direcciones y rutas del cliente. Quien lo descarga debe saber
//      qué se lleva antes de llevárselo, y que queda a su nombre.

/** Estados que devuelve el backend, en palabras. */
export const CAPTURE_STATUS = Object.freeze({
  pending: {
    label: "Requested",
    tone: "info",
    hint: "The device has been asked for its state. Nothing has arrived yet.",
  },
  uploading: {
    label: "Uploading",
    tone: "info",
    hint: "The device is sending the package.",
  },
  complete: {
    label: "Complete",
    tone: "positive",
    hint: "Everything that was asked for was collected.",
  },
  partial: {
    label: "Partial",
    tone: "caution",
    hint: "Some collectors could not run. The package says which, and why.",
  },
  failed: {
    label: "Failed",
    tone: "critical",
    hint: "Nothing could be collected. The reason is in the package.",
  },
  expired: {
    label: "Expired",
    tone: "muted",
    hint: "The device never answered within the capture window.",
  },
});

export function captureStatusMeta(status) {
  return CAPTURE_STATUS[status] ?? { label: String(status || "Unknown"), tone: "muted", hint: "" };
}

/** Lo que disparó la captura, en palabras de operador. */
export const TRIGGER_LABEL = Object.freeze({
  manual: "Requested by an operator",
  alert: "Triggered by an alert",
  unclean_shutdown: "Automatic, after an unclean shutdown",
});

export function triggerLabel(trigger) {
  return TRIGGER_LABEL[trigger] ?? "Requested";
}

/** `1.2 MB`, `812 KB`, `0 B`. Sin decimales cuando no aportan. */
export function formatBytes(bytes) {
  // ⚠️ `Number(null)` es 0, así que un tamaño DESCONOCIDO se pintaría como
  // «0 B» — que afirma que el artefacto está vacío cuando lo cierto es que no
  // se sabe. Lo que no viene se dice con una raya.
  if (bytes === null || bytes === undefined || bytes === "") return "—";
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** `UTC-5`, `UTC+5:30`, `UTC` — el desfase tal como lo escribe una persona. */
export function formatOffset(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return null;
  const m = Number(minutes);
  if (m === 0) return "UTC";
  const sign = m < 0 ? "-" : "+";
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${h}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

/** El desfase del navegador, para saber si hay que avisar de la diferencia. */
export function operatorOffsetMinutes(now = new Date()) {
  // ⚠️ getTimezoneOffset devuelve el signo al revés de como se escribe un huso.
  return -now.getTimezoneOffset();
}

const TIME_OPTS = { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

/**
 * La hora de la captura EN EL EQUIPO, y si conviene avisar.
 *
 * Devuelve `{ text, offset, differsFromOperator }`. Cuando el equipo y quien
 * mira están en husos distintos, la pantalla lo dice: es el error que estuvo a
 * punto de fechar mal un incidente real.
 */
export function deviceCapturedAt(capture, now = new Date()) {
  const iso = capture?.capturedAtUtc;
  const offset = capture?.deviceUtcOffsetMinutes;
  if (!iso) return { text: null, offset: null, differsFromOperator: false };

  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { text: null, offset: null, differsFromOperator: false };

  if (offset === null || offset === undefined) {
    // Sin desfase no se inventa una hora local: se dice en UTC y se marca.
    return { text: `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`, offset: null, differsFromOperator: false };
  }

  const shifted = new Date(at.getTime() + Number(offset) * 60_000);
  const text = shifted.toLocaleString("en-US", { ...TIME_OPTS, timeZone: "UTC" });
  return {
    text,
    offset: formatOffset(offset),
    differsFromOperator: Number(offset) !== operatorOffsetMinutes(now),
  };
}

/** Qué se recogió y qué no, contado para la cabecera del detalle. */
export function artifactTally(artifacts = []) {
  const ok = artifacts.filter((a) => a.status === "ok").length;
  const failed = artifacts.filter((a) => a.status === "failed").length;
  const skipped = artifacts.filter((a) => a.status === "skipped").length;
  const bytes = artifacts.reduce((sum, a) => sum + (a.status === "ok" ? Number(a.bytes) || 0 : 0), 0);
  return { ok, failed, skipped, bytes };
}

/**
 * Lo que un paquete contiene, para avisar ANTES de descargarlo.
 *
 * No es una advertencia genérica: se construye con los colectores que SÍ
 * trajeron algo, porque «contiene sesiones y usuarios» sobre un paquete que
 * sólo tiene el espacio en disco sería una alarma falsa, y las alarmas falsas
 * enseñan a ignorar las de verdad.
 */
const SENSITIVE = {
  sessions: "user names and the addresses they connected from",
  processes: "running programs and their owners",
  network: "addresses this device was talking to",
  event_logs: "Windows event logs, including sign-ins",
  scheduled_tasks: "scheduled task definitions and their accounts",
  agent_self: "agent logs",
};

export function packageContains(artifacts = []) {
  const collectors = [...new Set(artifacts.filter((a) => a.status === "ok").map((a) => a.collector))];
  return collectors.map((c) => SENSITIVE[c]).filter(Boolean);
}

export function downloadWarning(artifacts = []) {
  const items = packageContains(artifacts);
  if (!items.length) return null;
  // ⚠️ Punto y coma, no «and»: varios de estos elementos YA llevan un «and»
  // dentro («user names and the addresses…»), y encadenarlos con otro produce
  // una frase que hay que releer. Un aviso que cuesta leer no avisa.
  const list = items.join("; ");
  return `This package contains ${list}. The download is recorded against your account.`;
}

/** Un artefacto sólo se descarga si de verdad llegó. */
export function canDownload(artifact) {
  return artifact?.status === "ok" && Number(artifact?.bytes) > 0;
}

/**
 * ¿Se puede borrar? No, mientras esté retenido por incidencia: soltarlo es una
 * decisión aparte, con nombre y hora en la auditoría.
 */
export function canDelete(capture) {
  return Boolean(capture) && !capture.heldReason;
}

/** Los colectores que se pierden al reiniciar, para decirlo al pedir. */
export function volatileCollectors(catalog = []) {
  return catalog.filter((c) => c.volatile).map((c) => c.key);
}

/**
 * El aviso del botón de capturar. Se enseña SIEMPRE, no sólo cuando el equipo
 * ya está mal: el momento de pulsarlo es antes de reiniciar, y para entonces
 * nadie lee la documentación.
 */
export function captureHint(catalog = []) {
  const n = volatileCollectors(catalog).length;
  if (!n) return "Collects the device's current state into an evidence package.";
  return "Collects the device's current state. Sessions, processes and network connections only exist while the machine is up — capture before restarting it.";
}
