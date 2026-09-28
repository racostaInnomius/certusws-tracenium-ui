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
    mdmManaged: statuses.filter((k) => k === "enrolled" || k === "stale" || k === "enrolling").length,
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
