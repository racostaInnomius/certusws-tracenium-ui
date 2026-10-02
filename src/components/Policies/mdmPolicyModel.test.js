// src/components/Policies/mdmPolicyModel.test.js
//
// El modelo de la pestaña Policies de MDM / MAM (rediseño 1-oct-2026).

import { describe, expect, it } from "vitest";
import {
  isLocalDateTime,
  pairingIssue,
  deliveryOf,
  filterGroups,
  groupLabel,
  keepEditsAfterReload,
  mamStats,
  platformStats,
  policyDirty,
  policyReach,
  readByPath,
  sameValue,
  settingIssue,
  settingLabel,
  unitFor,
  valueIsDelivered,
  writeByPath,
} from "./mdmPolicyModel";
import { readManagedAppFromPolicy } from "./policyTransforms";

const bool = (key, label, extra = {}) => ({ key, label, spec: { kind: "boolean" }, delivery: { by: "profile" }, ...extra });
const GROUPS = [
  {
    name: "screen",
    items: [
      { key: "macos.screen.idleTimeoutSeconds", label: "Idle time before the screen saver", spec: { kind: "integer", min: 60, max: 3600 }, delivery: { by: "profile" } },
      bool("macos.screen.requirePasswordAfterIdle", "Require a password after the screen saver or sleep"),
    ],
  },
  {
    name: "safari",
    items: [
      bool("macos.safari.showFullURL", "Safari: show the full website address"),
      bool("macos.safari.preventCrossSiteTracking", "Safari: prevent cross-site tracking", { delivery: { by: "profile", values: [true] } }),
    ],
  },
  {
    name: "softwareUpdate",
    items: [{ key: "macos.softwareUpdate.enforcedMinimumVersion", label: "Minimum required OS version", spec: { kind: "string", maxLength: 32 }, delivery: null }],
  },
];

describe("rutas del bloque", () => {
  it("escribir y borrar poda los objetos vacíos", () => {
    const b = writeByPath({}, "macos.safari.showFullURL", true);
    expect(b).toEqual({ safari: { showFullURL: true } });
    expect(readByPath(b, "macos.safari.showFullURL")).toBe(true);
    expect(writeByPath(b, "macos.safari.showFullURL", undefined)).toEqual({});
  });

  it("❗ quitar y volver a poner un ajuste no cuenta como cambio (antes, el orden de claves sí)", () => {
    const loaded = { safari: { showFullURL: true, warnFraudulentWebsites: true } };
    let b = writeByPath(loaded, "macos.safari.showFullURL", undefined);
    b = writeByPath(b, "macos.safari.showFullURL", true);
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(loaded));
    expect(sameValue(b, loaded)).toBe(true);
  });
});

describe("etiquetas", () => {
  it("grupos legibles, también los que no están en la tabla", () => {
    expect(groupLabel("passwordPolicy")).toBe("Passwords");
    expect(groupLabel("menuBar")).toBe("Menu bar");
    expect(groupLabel("newThingHere")).toBe("New thing here");
  });

  it("el prefijo del grupo sobra dentro del grupo", () => {
    expect(settingLabel({ label: "Safari: show the full website address" }, "safari")).toBe("Show the full website address");
    expect(settingLabel({ label: "Allow Siri" }, "siri")).toBe("Allow Siri");
  });

  it("unidad por el nombre de la clave", () => {
    expect(unitFor({ key: "macos.screen.idleTimeoutSeconds" })).toBe("sec");
    expect(unitFor({ key: "macos.softwareUpdate.deferralDays" })).toBe("days");
    expect(unitFor({ key: "macos.passwordPolicy.minLength" })).toBeNull();
  });
});

describe("valores que no valen", () => {
  const idle = GROUPS[0].items[0];
  it("fuera de rango o no entero", () => {
    expect(settingIssue(idle, 30)).toBe("Must be 60–3600");
    expect(settingIssue(idle, 90.5)).toBe("Enter a whole number");
    expect(settingIssue(idle, 900)).toBeNull();
    expect(settingIssue(idle, undefined)).toBeNull();
  });
});

describe("qué llega al equipo", () => {
  const [, , safari, sw] = [null, null, GROUPS[1].items[1], GROUPS[2].items[0]];
  it("entregado, parcial, sólo guardado y desconocido (backend anterior)", () => {
    expect(deliveryOf(GROUPS[1].items[0]).state).toBe("sent");
    expect(deliveryOf(safari)).toEqual({ state: "partial", values: [true], by: "profile" });
    expect(deliveryOf({ key: "macos.softwareUpdate.deferMinorDays", delivery: { by: "ddm" } })).toEqual({ state: "sent", by: "ddm" });
    expect(deliveryOf(sw).state).toBe("saved");
    expect(deliveryOf({ key: "x", spec: { kind: "boolean" } }).state).toBe("unknown");
  });

  it("❗ «Off» en un ajuste que sólo escribe «On» no llega; «Not set» siempre", () => {
    expect(valueIsDelivered(safari, true)).toBe(true);
    expect(valueIsDelivered(safari, false)).toBe(false);
    expect(valueIsDelivered(safari, undefined)).toBe(true);
    expect(valueIsDelivered(sw, "27.0")).toBe(false);
  });
});

describe("platformStats", () => {
  it("cuenta lo puesto, lo cambiado, lo que no vale y lo que no se entrega", () => {
    const loaded = { safari: { showFullURL: true } };
    const block = { safari: { showFullURL: true, preventCrossSiteTracking: false }, screen: { idleTimeoutSeconds: 10 }, softwareUpdate: { enforcedMinimumVersion: "27.0" } };
    const s = platformStats(GROUPS, block, loaded);
    expect(s).toMatchObject({ total: 5, configured: 4 });
    expect(s.changed.sort()).toEqual(["macos.safari.preventCrossSiteTracking", "macos.screen.idleTimeoutSeconds", "macos.softwareUpdate.enforcedMinimumVersion"]);
    expect(s.issues).toEqual([{ key: "macos.screen.idleTimeoutSeconds", label: "Idle time before the screen saver", issue: "Must be 60–3600" }]);
    expect(s.notDelivered.sort()).toEqual(["macos.safari.preventCrossSiteTracking", "macos.softwareUpdate.enforcedMinimumVersion"]);
  });
});

describe("filterGroups", () => {
  const loaded = { safari: { showFullURL: true } };
  it("busca por nombre, explicación, clave o grupo", () => {
    expect(filterGroups(GROUPS, { query: "website" }).map((g) => g.items.map((s) => s.key))).toEqual([["macos.safari.showFullURL"]]);
    expect(filterGroups(GROUPS, { query: "safari" })[0].items).toHaveLength(2);
    expect(filterGroups(GROUPS, { query: "nada de esto" })).toEqual([]);
  });

  it("⭐ «Configured» enseña lo puesto y lo que se acaba de quitar (no desaparece bajo el cursor)", () => {
    const block = { screen: { requirePasswordAfterIdle: true } }; // showFullURL quitado sin guardar
    const shown = filterGroups(GROUPS, { block, loadedBlock: loaded, onlyConfigured: true });
    expect(shown.flatMap((g) => g.items.map((s) => s.key))).toEqual(["macos.screen.requirePasswordAfterIdle", "macos.safari.showFullURL"]);
  });
});

describe("MAM", () => {
  it("cuenta lo puesto y lo cambiado; un idle fuera de rango es un problema, no se tira en silencio", () => {
    const loaded = readManagedAppFromPolicy({ mam: { requireUserAuth: true } });
    const form = { ...loaded, requireBiometrics: true, idleTimeoutSeconds: 5 };
    const s = mamStats(form, loaded);
    expect(s.configured).toBe(2); // el idle 5 no entra en la política
    expect(s.changed.sort()).toEqual(["idleTimeoutSeconds", "requireBiometrics"]);
    expect(s.issues).toEqual([{ key: "idleTimeoutSeconds", label: "Idle timeout", issue: "Must be 15–86400" }]);
  });

  it("espacios alrededor de la versión mínima no son un cambio", () => {
    const loaded = readManagedAppFromPolicy({ mam: { minimumAppVersion: "2.0.0" } });
    expect(mamStats({ ...loaded, minimumAppVersion: " 2.0.0 " }, loaded).changed).toEqual([]);
  });
});

describe("policyDirty", () => {
  const baseline = { macos: { safari: { showFullURL: true } }, ios: {}, app: readManagedAppFromPolicy({}) };
  it("por política, y nada antes de cargar", () => {
    const edits = { ...baseline, ios: { passcode: { required: true } } };
    expect(policyDirty("ios", edits, baseline)).toBe(true);
    expect(policyDirty("macos", edits, baseline)).toBe(false);
    expect(policyDirty("app", { ...edits, app: { ...baseline.app, requireAppPIN: true } }, baseline)).toBe(true);
    expect(policyDirty("ios", edits, null)).toBe(false);
  });
});

describe("⭐ keepEditsAfterReload — guardar una política no borra lo editado en otra", () => {
  const loaded = { macos: { a: 1 }, ios: {}, app: { x: null } };
  const current = { macos: { a: 2 }, ios: { b: true }, app: { x: true } };

  it("se conserva lo editado si en el servidor sigue igual", () => {
    const server = { macos: { a: 2 }, ios: {}, app: { x: null } }; // se acaba de guardar macOS
    const { values, replaced } = keepEditsAfterReload({ server, loaded, current, keep: ["ios", "app"] });
    expect(values).toEqual({ macos: { a: 2 }, ios: { b: true }, app: { x: true } });
    expect(replaced).toEqual([]);
  });

  it("❗ si otra persona la cambió, manda el servidor y se dice", () => {
    const server = { macos: { a: 2 }, ios: { c: 1 }, app: { x: null } };
    const { values, replaced } = keepEditsAfterReload({ server, loaded, current, keep: ["ios", "app"] });
    expect(values.ios).toEqual({ c: 1 });
    expect(values.app).toEqual({ x: true });
    expect(replaced).toEqual(["ios"]);
  });

  it("sin `keep`, todo del servidor (recarga normal)", () => {
    const server = { macos: {}, ios: {}, app: { x: null } };
    expect(keepEditsAfterReload({ server, loaded, current }).values).toEqual(server);
  });
});

describe("policyReach", () => {
  it("macOS se entrega, iPhone & iPad no, la app la aplica ella", () => {
    expect(policyReach("macos", { macCount: 1 })).toEqual({ tone: "positive", label: "Sent by MDM", detail: "Reaches 1 Mac enrolled in MDM" });
    expect(policyReach("macos", { macCount: 0 }).tone).toBe("muted");
    // iOS (2-oct-2026): ya se entrega.
    expect(policyReach("ios", { iosCount: 1 })).toEqual({ tone: "positive", label: "Sent by MDM", detail: "Reaches 1 iPhone and iPad enrolled in MDM" });
    expect(policyReach("ios")).toMatchObject({ tone: "muted", detail: "No iPhones or iPads enrolled in MDM yet" });
    expect(policyReach("app", { appCount: 2 }).detail).toBe("2 devices with the app");
  });
});

// Actualizaciones por DDM (1-oct-2026): versión con forma de versión, fecha
// LOCAL real, y la mínima nunca sin su fecha límite (como valida el backend).
describe("ajustes de actualización por DDM", () => {
  const VERSION = {
    key: "macos.softwareUpdate.enforcedMinimumVersion",
    label: "Minimum required macOS version",
    spec: { kind: "string", maxLength: 12, pattern: "^\\d{1,3}(\\.\\d{1,3}){1,2}$", patternHint: "A version like 27.0.1" },
    requires: "macos.softwareUpdate.enforcedMinimumDeadline",
    delivery: { by: "ddm" },
  };
  const DEADLINE = {
    key: "macos.softwareUpdate.enforcedMinimumDeadline",
    label: "Deadline for the minimum version",
    spec: { kind: "localDateTime" },
    requires: "macos.softwareUpdate.enforcedMinimumVersion",
    delivery: { by: "ddm" },
  };
  const GROUPS = [{ name: "softwareUpdate", items: [VERSION, DEADLINE] }];

  it("versión y fecha con su forma", () => {
    expect(settingIssue(VERSION, "latest")).toBe("A version like 27.0.1");
    expect(settingIssue(VERSION, "27.0.1")).toBeNull();
    expect(settingIssue(DEADLINE, "2026-10-15T21:00:00")).toBeNull();
    expect(settingIssue(DEADLINE, "2026-02-30T21:00:00")).toBe("Pick a date and time");
    expect(isLocalDateTime("2026-10-15T21:00")).toBe(false);
  });

  it("❗ la que falta de la pareja lo dice, y no se puede guardar", () => {
    const block = { softwareUpdate: { enforcedMinimumVersion: "27.0.1" } };
    const byKey = new Map([[VERSION.key, VERSION], [DEADLINE.key, DEADLINE]]);
    expect(pairingIssue(DEADLINE, block, byKey)).toBe("Needed with “Minimum required macOS version”");
    expect(pairingIssue(VERSION, block, byKey)).toBeNull();
    expect(platformStats(GROUPS, block, {}).issues).toEqual([
      { key: DEADLINE.key, label: "Deadline for the minimum version", issue: "Needed with “Minimum required macOS version”" },
    ]);
    expect(platformStats(GROUPS, { softwareUpdate: { enforcedMinimumVersion: "27.0.1", enforcedMinimumDeadline: "2026-10-15T21:00:00" } }, {}).issues).toEqual([]);
  });
});
