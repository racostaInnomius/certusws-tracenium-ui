import { describe, expect, it } from "vitest";
import {
  appDeviceView,
  canRevokeEnrollment,
  describeMissing,
  enrollmentStatus,
  isEnrollmentActive,
  mdmDeviceStatus,
  mdmOverview,
  mdmPlatform,
  looksLikePem,
  buildOsUpdateRequest,
  formatDeviceLocalDateTime,
  osUpdateInstallState,
  pushCertificateStatus,
  requestBlocker,
  STALE_AFTER_MS,
  detectedOsUpdates,
  detectedUpdateLabel,
  manualVersionNote,
} from "./mdmModel";

const NOW = Date.parse("2026-09-28T20:00:00Z");
const future = new Date(NOW + 3_600_000).toISOString();
const past = new Date(NOW - 3_600_000).toISOString();

describe("estado de un alta", () => {
  it("❗ lo que pasó en el equipo manda sobre el enlace (revocado o caducado)", () => {
    const e = { revokedAt: past, expiresAt: past, device: { state: "enrolled" } };
    expect(enrollmentStatus(e, NOW).key).toBe("enrolled");
    expect(enrollmentStatus({ ...e, device: { state: "checked_out" } }, NOW).key).toBe("removed");
  });

  it("sin equipo: revocado, caducado, descargado, aviso aceptado, sin abrir", () => {
    expect(enrollmentStatus({ revokedAt: past, expiresAt: future }, NOW).key).toBe("revoked");
    expect(enrollmentStatus({ expiresAt: past, downloadCount: 2 }, NOW).key).toBe("expired");
    expect(enrollmentStatus({ expiresAt: future, downloadCount: 1, noticeAcceptedAt: past }, NOW).key).toBe("downloaded");
    expect(enrollmentStatus({ expiresAt: future, noticeAcceptedAt: past }, NOW).key).toBe("accepted");
    expect(enrollmentStatus({ expiresAt: future }, NOW).key).toBe("waiting");
  });

  it("activo sólo si sigue vigente, sin revocar y sin equipo", () => {
    expect(isEnrollmentActive({ expiresAt: future }, NOW)).toBe(true);
    expect(isEnrollmentActive({ expiresAt: future, device: { state: "enrolled" } }, NOW)).toBe(false);
    expect(isEnrollmentActive({ expiresAt: future, revokedAt: past }, NOW)).toBe(false);
    expect(isEnrollmentActive({ expiresAt: past }, NOW)).toBe(false);
  });

  it("se puede revocar mientras el enlace sirva para descargar", () => {
    expect(canRevokeEnrollment({ expiresAt: future }, NOW)).toBe(true);
    // Ya enrolado: revocar corta más descargas (re-enrolar), no saca al equipo.
    expect(canRevokeEnrollment({ expiresAt: future, device: { state: "enrolled" } }, NOW)).toBe(true);
    expect(canRevokeEnrollment({ expiresAt: past }, NOW)).toBe(false);
    expect(canRevokeEnrollment({ expiresAt: future, revokedAt: past }, NOW)).toBe(false);
  });
});

describe("estado de un equipo MDM", () => {
  it("perfil quitado, enrolándose, sin check-in 7+ días, enrolado", () => {
    expect(mdmDeviceStatus({ enrollmentState: "checked_out" }, NOW).key).toBe("removed");
    expect(mdmDeviceStatus({ enrollmentState: "authenticated" }, NOW).key).toBe("enrolling");
    const old = new Date(NOW - STALE_AFTER_MS - 1000).toISOString();
    expect(mdmDeviceStatus({ enrollmentState: "enrolled", lastSeenAt: old }, NOW).key).toBe("stale");
    expect(mdmDeviceStatus({ enrollmentState: "enrolled", lastSeenAt: past }, NOW).key).toBe("enrolled");
  });

  it("❗ enrolado con otro Topic: hay que re-enrolarlo (y sigue contando como gestionado)", () => {
    const d = { enrollmentState: "enrolled", lastSeenAt: past, needsReEnrollment: true };
    expect(mdmDeviceStatus(d, NOW)).toMatchObject({ key: "reenroll", tone: "caution" });
    // `null` = sin certificado de la organización todavía: no se sabe.
    expect(mdmDeviceStatus({ ...d, needsReEnrollment: null }, NOW).key).toBe("enrolled");
    // Un perfil quitado manda sobre el Topic.
    expect(mdmDeviceStatus({ ...d, enrollmentState: "checked_out" }, NOW).key).toBe("removed");
    expect(mdmOverview({ now: NOW, devices: [d] }).mdmManaged).toBe(1);
  });

  it("la plataforma sale de lo que reporta el equipo", () => {
    expect(mdmPlatform({ productName: "Mac15,7" })).toBe("macos");
    expect(mdmPlatform({ productName: "iPhone16,2" })).toBe("ios");
    expect(mdmPlatform({ productName: "iPad14,3" })).toBe("ipados");
    expect(mdmPlatform({})).toBeNull();
  });
});

describe("cifras del Overview", () => {
  it("cuenta gestionados, app, altas pendientes, retirados y sin check-in", () => {
    const old = new Date(NOW - STALE_AFTER_MS - 1000).toISOString();
    const out = mdmOverview({
      now: NOW,
      devices: [
        { enrollmentState: "enrolled", lastSeenAt: past },
        { enrollmentState: "enrolled", lastSeenAt: old },
        { enrollmentState: "checked_out" },
      ],
      enrollments: [{ expiresAt: future }, { expiresAt: future, device: { state: "enrolled" } }, { expiresAt: past }],
      appDevices: [{}, {}],
    });
    expect(out).toEqual({ mdmManaged: 2, app: 2, pendingEnrollments: 1, removed: 1, stale: 1 });
  });
});

describe("textos", () => {
  it("lo que falta, en una frase", () => {
    expect(describeMissing(["apns_topic"])).toBe("the Apple push topic");
    expect(describeMissing(["enrollment_url", "apns_topic"])).toBe("the enrollment address and the Apple push topic");
    expect(describeMissing([])).toBe("");
  });

  it("un cliente de la app se nombra por su hostname", () => {
    expect(appDeviceView({ deviceId: "d1", hostname: "iPhone de Ana", platform: "iOS" })).toMatchObject({
      id: "d1",
      name: "iPhone de Ana",
      platform: "ios",
    });
  });
});

describe("Apple setup", () => {
  it("el estado del certificado, con los días que le quedan", () => {
    expect(pushCertificateStatus(null)).toMatchObject({ key: "missing", label: "Not set up" });
    expect(pushCertificateStatus({ state: "valid" })).toMatchObject({ key: "valid", tone: "positive" });
    expect(pushCertificateStatus({ state: "expiring", daysLeft: 12 }).label).toBe("Expires in 12 days");
    expect(pushCertificateStatus({ state: "expiring", daysLeft: 1 }).label).toBe("Expires in 1 day");
    expect(pushCertificateStatus({ state: "expiring", daysLeft: 0 }).label).toBe("Expires today");
    expect(pushCertificateStatus({ state: "expired" })).toMatchObject({ key: "expired", tone: "critical" });
  });

  it("❗ por qué no se puede descargar la solicitud — o null si se puede", () => {
    expect(requestBlocker({ available: true, vendorCertificate: "ok", keyStorage: true })).toBeNull();
    expect(requestBlocker({ available: false, vendorCertificate: "not_configured", keyStorage: true })).toMatch(
      /waiting for Apple to issue its MDM vendor certificate/
    );
    expect(requestBlocker({ available: false, vendorCertificate: "expired", keyStorage: true })).toMatch(/expired/);
    expect(requestBlocker({ available: false, vendorCertificate: "ok", keyStorage: false })).toMatch(/private key/);
  });

  it("un .pem se reconoce antes de mandarlo", () => {
    expect(looksLikePem("-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n")).toBe(true);
    expect(looksLikePem("hola")).toBe(false);
  });
});

describe("actualización del sistema (DDM)", () => {
  const now = new Date("2026-09-30T15:00:00Z");
  it("❗ la hora va tal cual la escribe el operador: es la del Mac, no la del navegador", () => {
    expect(buildOsUpdateRequest({ version: "27.0.1", build: "26A434", date: "2026-10-02", time: "18:00" }, now)).toEqual({
      body: { targetOSVersion: "27.0.1", targetBuildVersion: "26A434", targetLocalDateTime: "2026-10-02T18:00:00" },
    });
    expect(buildOsUpdateRequest({ version: "27.0.1", build: "", date: "2026-10-02", time: "18:00" }, now).body).not.toHaveProperty("targetBuildVersion");
  });

  it("rechaza lo que el servidor rechazaría", () => {
    expect(buildOsUpdateRequest({ version: "27", date: "2026-10-02", time: "18:00" }, now).error).toMatch(/27\.0\.1/);
    expect(buildOsUpdateRequest({ version: "27.0.1", build: "26A 4", date: "2026-10-02", time: "18:00" }, now).error).toMatch(/build/);
    expect(buildOsUpdateRequest({ version: "27.0.1", date: "2026-09-28", time: "18:00" }, now).error).toMatch(/next 60 days/);
    expect(buildOsUpdateRequest({ version: "27.0.1", date: "2026-02-30", time: "18:00" }, now).error).toMatch(/valid date/);
    expect(buildOsUpdateRequest({ version: "27.0.1", date: "", time: "18:00" }, now).error).toMatch(/date and time/);
  });

  it("estados que informa el Mac y fecha legible", () => {
    expect(osUpdateInstallState("downloading")).toMatchObject({ label: "Downloading", tone: "info" });
    expect(osUpdateInstallState("failed").tone).toBe("critical");
    expect(osUpdateInstallState(undefined).label).toBe("No report yet");
    expect(formatDeviceLocalDateTime("2026-10-02T18:00:00")).toBe("Oct 02, 2026 at 18:00");
  });
});

describe("versión del escaneo del agente", () => {
  const U = { version: "26.7.1", build: "25G241", label: "macOS Tahoe 26.7.1-25G241", title: "macOS Tahoe 26.7.1" };

  it("sólo un Mac enlazado ofrece candidatas", () => {
    expect(detectedOsUpdates({ status: "linked", updates: [U] })).toEqual([U]);
    expect(detectedOsUpdates({ status: "no_agent" })).toEqual([]);
    expect(detectedOsUpdates(undefined)).toEqual([]);
  });

  it("la etiqueta: el nombre de Apple y el build", () => {
    expect(detectedUpdateLabel(U)).toBe("macOS Tahoe 26.7.1 (25G241)");
    expect(detectedUpdateLabel({ ...U, title: null })).toBe("macOS 26.7.1 (25G241)");
  });

  it("a mano, dice por qué — y nada si el backend no manda `detected`", () => {
    expect(manualVersionNote(undefined)).toBeNull();
    expect(manualVersionNote({ status: "linked", updates: [U] }, { chosen: true })).toMatch(/not confirmed by a scan/i);
    expect(manualVersionNote({ status: "linked", updates: [] }, { when: "2 hours ago" })).toMatch(/last scan of this Mac \(2 hours ago\) found no macOS update/);
    expect(manualVersionNote({ status: "no_agent" })).toMatch(/no tracenium agent reports this mac's serial number/i);
    expect(manualVersionNote({ status: "unavailable" })).toMatch(/couldn't read this mac's scan/i);
  });
});
