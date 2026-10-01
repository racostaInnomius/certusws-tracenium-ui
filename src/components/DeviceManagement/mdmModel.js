// src/components/DeviceManagement/mdmModel.js
//
// Lo que la página MDM / MAM decide sin pintar nada: en qué estado está un
// alta o un equipo, y las cifras del Overview. Puro y probado aparte
// (mdmModel.test.js), para que las pestañas sólo pinten.
//
// El estado sale de hechos que da el servidor (`/api/v1/mdm/*`), nunca de
// intenciones: un alta está «Enrolled» sólo si un equipo autenticó con ella.

/** Una semana sin check-in: lo que el plan MDM/MAM marca como «needs attention». */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const time = (value) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
};

/**
 * Estado de un alta (enlace de enrolamiento). Orden de prioridad: lo que pasó
 * en el equipo manda sobre lo que pasa con el enlace.
 * `tone`: positive | info | caution | critical | muted
 */
export function enrollmentStatus(enrollment, now = Date.now()) {
  const device = enrollment?.device ?? null;
  if (device?.state === "checked_out") return { key: "removed", label: "Profile removed", tone: "critical" };
  if (device?.state === "enrolled") return { key: "enrolled", label: "Enrolled", tone: "positive" };
  if (device?.state === "authenticated") return { key: "enrolling", label: "Enrolling", tone: "info" };
  if (enrollment?.revokedAt) return { key: "revoked", label: "Revoked", tone: "muted" };
  const expires = time(enrollment?.expiresAt);
  if (expires !== null && expires <= now) return { key: "expired", label: "Expired", tone: "muted" };
  if (Number(enrollment?.downloadCount) > 0) {
    return { key: "downloaded", label: "Profile downloaded", tone: "info" };
  }
  if (enrollment?.noticeAcceptedAt) return { key: "accepted", label: "Notice accepted", tone: "info" };
  return { key: "waiting", label: "Not opened yet", tone: "caution" };
}

/** Un enlace que todavía puede llevar a un equipo a enrolarse. */
export function isEnrollmentActive(enrollment, now = Date.now()) {
  if (!enrollment || enrollment.revokedAt || enrollment.device) return false;
  const expires = time(enrollment.expiresAt);
  return expires !== null && expires > now;
}

/** Revocar tiene sentido mientras el enlace siga sirviendo para descargar. */
export function canRevokeEnrollment(enrollment, now = Date.now()) {
  if (!enrollment || enrollment.revokedAt) return false;
  const expires = time(enrollment.expiresAt);
  return expires !== null && expires > now;
}

/** Estado de un equipo MDM. */
export function mdmDeviceStatus(device, now = Date.now()) {
  if (device?.enrollmentState === "checked_out") {
    return { key: "removed", label: "Profile removed", tone: "critical" };
  }
  if (device?.enrollmentState === "authenticated") return { key: "enrolling", label: "Enrolling", tone: "info" };
  // Enrolado con otro Topic que el del certificado de la organización (el
  // provisional, o el de un certificado anterior): no se le puede despertar.
  // Lo decide el servidor (`needsReEnrollment`); `null` = no se sabe todavía.
  if (device?.needsReEnrollment === true) {
    return { key: "reenroll", label: "Re-enroll needed", tone: "caution" };
  }
  const seen = time(device?.lastSeenAt);
  if (seen !== null && now - seen > STALE_AFTER_MS) {
    return { key: "stale", label: "No check-in 7+ days", tone: "caution" };
  }
  return { key: "enrolled", label: "Enrolled", tone: "positive" };
}

export function ownershipLabel(mode) {
  if (mode === "corporate") return "Organization-owned";
  if (mode === "byod") return "Personal";
  return "—";
}

/** Plataforma de un equipo MDM a partir de lo que reporta (`ProductName`). */
export function mdmPlatform(device) {
  const product = String(device?.productName || device?.model || "");
  if (/^iphone/i.test(product)) return "ios";
  if (/^ipad/i.test(product)) return "ipados";
  if (/^mac|^imac|^macbook/i.test(product)) return "macos";
  return null;
}

export function mdmDeviceName(device) {
  return device?.deviceName || device?.serialNumber || device?.udid || "—";
}

/** Nombre, plataforma y último contacto de un cliente de la app (MAM). */
export function appDeviceView(row) {
  return {
    id: String(row?.deviceId || row?.device_id || row?.id || row?.agentId || ""),
    name: row?.hostname || row?.deviceName || row?.device_name || row?.name || row?.deviceId || "—",
    platform: String(row?.platform || row?.os || "").toLowerCase() || null,
    lastSeenAt: row?.lastSeenAt || row?.last_seen_at || row?.lastSeen || row?.lastHeartbeat || null,
  };
}

/** Las cifras del Overview. */
export function mdmOverview({ devices = [], enrollments = [], appDevices = [], now = Date.now() } = {}) {
  const statuses = devices.map((d) => mdmDeviceStatus(d, now).key);
  return {
    mdmManaged: statuses.filter((k) => ["enrolled", "stale", "enrolling", "reenroll"].includes(k)).length,
    app: appDevices.length,
    pendingEnrollments: enrollments.filter((e) => isEnrollmentActive(e, now)).length,
    removed: statuses.filter((k) => k === "removed").length,
    stale: statuses.filter((k) => k === "stale").length,
  };
}

const MISSING_LABELS = {
  enrollment_url: "the enrollment address",
  apns_topic: "the Apple push topic",
};

/** «Device enrollment isn't configured yet: …» — para el operador del portal. */
export function describeMissing(missing = []) {
  const parts = missing.map((m) => MISSING_LABELS[m] || m);
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Mismo criterio que el servidor (enrollment.service, createEnrollment). */
export const CLIENT_IDENTIFIER_RE = /^[A-Za-z0-9._-]{1,128}$/;

export const EXPIRY_OPTIONS = [
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
];

// ── Apple setup ─────────────────────────────────────────────────────────────

/**
 * Estado del certificado de push de la organización, tal como lo resume el
 * servidor (`pushCertificate.state`: missing | valid | expiring | expired).
 */
export function pushCertificateStatus(pushCertificate) {
  const state = pushCertificate?.state;
  if (state === "valid") return { key: "valid", label: "Installed", tone: "positive" };
  if (state === "expiring") {
    const days = Number(pushCertificate.daysLeft);
    const label = Number.isFinite(days)
      ? days <= 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`
      : "Expires soon";
    return { key: "expiring", label, tone: "caution" };
  }
  if (state === "expired") return { key: "expired", label: "Expired", tone: "critical" };
  return { key: "missing", label: "Not set up", tone: "caution" };
}

const REQUEST_BLOCKERS = {
  not_configured:
    "Tracenium can't sign push certificate requests yet: it's waiting for Apple to issue its MDM vendor certificate.",
  incomplete: "The MDM vendor certificate is only partly installed on this server.",
  unreadable: "The MDM vendor certificate installed on this server can't be read.",
  key_mismatch: "The MDM vendor certificate on this server doesn't match its private key.",
  expired: "The MDM vendor certificate on this server has expired.",
};

/**
 * Por qué no se puede descargar la solicitud, o `null` si se puede. Son
 * piezas del operador de la plataforma, no del cliente: la frase lo deja
 * claro para que nadie busque el fallo en su cuenta de Apple.
 */
export function requestBlocker(requests) {
  if (!requests || requests.available) return null;
  if (requests.vendorCertificate && requests.vendorCertificate !== "ok") {
    return REQUEST_BLOCKERS[requests.vendorCertificate] || REQUEST_BLOCKERS.not_configured;
  }
  if (requests.keyStorage === false) {
    return "This server isn't set up to store the push certificate's private key yet.";
  }
  return REQUEST_BLOCKERS.not_configured;
}

/** Texto de un `.pem` razonable antes de mandarlo: el servidor decide el resto. */
export function looksLikePem(text) {
  return /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(String(text || ""));
}

export const APPLE_ACCOUNT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Actualización del sistema forzada (DDM) ─────────────────────────────────

const INSTALL_STATES = {
  none: { label: "Up to date", tone: "positive" },
  downloading: { label: "Downloading", tone: "info" },
  prepared: { label: "Ready to install", tone: "info" },
  installing: { label: "Installing", tone: "info" },
  failed: { label: "Failed", tone: "critical" },
};

/**
 * El fallo que informa el equipo, en una frase, o null si no hay. Sin fallos
 * Apple manda `{}` o `{count: 0}` —el panel lo pintaba como «{}» en rojo
 * (30-sep)—; el backend ya lo normaliza, esto cubre uno anterior.
 */
export function describeOsUpdateFailure(failure) {
  if (!failure || typeof failure !== "object") return null;
  const count = Number(failure.count) > 0 ? Math.trunc(Number(failure.count)) : 0;
  const reason = typeof failure.reason === "string" && failure.reason.trim() ? failure.reason.trim() : null;
  if (!count && !reason) return null;
  const times = count > 1 ? ` ${count} times` : "";
  return `The update failed${times}${reason ? `: ${reason}` : "."}`;
}

/** Lo que dice el propio equipo (softwareupdate.install-state). */
export function osUpdateInstallState(state) {
  return INSTALL_STATES[state] ?? { label: "No report yet", tone: "muted" };
}

const OS_VERSION_RE = /^\d{1,3}(\.\d{1,3}){1,2}$/;
const OS_BUILD_RE = /^[0-9A-Za-z]{4,12}$/;
export const OS_UPDATE_MAX_DAYS = 60;

/**
 * El cuerpo de la petición, o `{ error }`. La hora es la LOCAL del equipo
 * (Apple: `yyyy-mm-ddThh:mm:ss` sin zona), no la del navegador: se envía tal
 * cual la escribe el operador. Mismas reglas que el servidor
 * (os-update.service.ts, validateOsUpdateRequest).
 */
export function buildOsUpdateRequest({ version, build, date, time }, now = new Date()) {
  const v = String(version || "").trim();
  if (!OS_VERSION_RE.test(v)) return { error: "Enter the version as it appears in Software Update, for example 27.0.1." };
  const b = String(build || "").trim();
  if (b && !OS_BUILD_RE.test(b)) return { error: "The build looks like 26A434, or leave it empty." };
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  const t = /^(\d{2}):(\d{2})$/.exec(String(time || ""));
  if (!d || !t) return { error: "Choose the date and time." };
  const asUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], 0);
  if (new Date(asUtc).getUTCDate() !== +d[3]) return { error: "Choose a valid date." };
  const ms = now.getTime();
  if (asUtc < ms - 14 * 3600 * 1000 || asUtc > ms + OS_UPDATE_MAX_DAYS * 24 * 3600 * 1000) {
    return { error: `Choose a time in the next ${OS_UPDATE_MAX_DAYS} days.` };
  }
  return {
    body: {
      targetOSVersion: v,
      ...(b ? { targetBuildVersion: b } : {}),
      targetLocalDateTime: `${d[0]}T${t[1]}:${t[2]}:00`,
    },
  };
}

/** «Oct 02, 2026 at 18:00» a partir de `yyyy-mm-ddThh:mm:ss` sin zona (hora del equipo). */
export function formatDeviceLocalDateTime(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!m) return "—";
  const month = new Date(Date.UTC(2000, +m[2] - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${m[3]}, ${m[1]} at ${m[4]}:${m[5]}`;
}

// ── La versión, del escaneo del agente (30-sep) ─────────────────────────────
//
// El backend busca el agente de Tracenium con el mismo número de serie y
// devuelve las actualizaciones de macOS que su escaneo encontró
// (detected-os-updates.ts). Elegir una evita teclear versión y build: una
// errata sólo se vería horas después, cuando el Mac dice que falló.

/** Las actualizaciones que se pueden elegir, o [] si no hay escaneo que las respalde. */
export function detectedOsUpdates(detected) {
  return detected?.status === "linked" && Array.isArray(detected.updates) ? detected.updates : [];
}

export function detectedUpdateKey(u) {
  return `${u.version}-${u.build}`;
}

/** «macOS Tahoe 26.7.1 (25G241)»: el nombre que da Apple y el build. */
export function detectedUpdateLabel(u) {
  return `${u.title || `macOS ${u.version}`} (${u.build})`;
}

/**
 * Por qué se escribe a mano, o null si no hay nada que decir (un backend
 * anterior que no manda `detected`). `when` es la hora del escaneo ya
 * formateada, o null.
 */
export function manualVersionNote(detected, { chosen = false, when = null } = {}) {
  if (!detected) return null;
  if (chosen) {
    return "Not confirmed by a scan of this Mac: a typo only shows up hours later, when the Mac reports that the update failed.";
  }
  if (detected.status === "linked") {
    return `The agent's last scan of this Mac${when ? ` (${when})` : ""} found no macOS update. Enter one only if Software Update on the Mac offers it.`;
  }
  if (detected.status === "no_agent") {
    return "No Tracenium agent reports this Mac's serial number, so no scan confirms the version. Copy it from Software Update on the Mac.";
  }
  return "Couldn't read this Mac's scan. Copy the version from Software Update on the Mac.";
}
