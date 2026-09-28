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
  STALE_AFTER_MS,
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
