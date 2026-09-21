// Qué dice el aviso tras «Deploy fix».
//
// La remediación de un CVE espera a la ventana de mantenimiento. El aviso decía
// «Deploying … to N device(s)» también cuando el despliegue quedaba retenido
// hasta la noche: se leía como «ya está», y no se movía nada.

import { describe, it, expect } from "vitest";
import { describeRemediationOutcome } from "./remediationOutcome";

const cve = { title: "google chrome", cveId: "CVE-2026-11645" };

describe("describeRemediationOutcome", () => {
  it("sin ventana: sale ahora, y lo dice", () => {
    const r = describeRemediationOutcome(
      { deployed: true, deviceCount: 1, deployment: { status: "pending", scheduledReason: null } },
      cve
    );
    expect(r).toEqual({ severity: "success", message: "Deploying the google chrome fix to 1 device now." });
  });

  it("⭐ retenido por la ventana: dice que espera y CUÁNDO abre", () => {
    const r = describeRemediationOutcome(
      {
        deployed: true,
        deviceCount: 55,
        deployment: { status: "scheduled", scheduledReason: "maintenance_window", scheduledAt: "2026-09-22T03:00:00Z" },
      },
      cve,
      { timeZone: "America/Chicago" }
    );
    expect(r.severity).toBe("info");
    expect(r.message).toBe(
      "Held for the maintenance window: the google chrome fix goes to 55 devices when it opens (Mon, Sep 21, 10:00 PM)."
    );
    // Lo que NO puede decir es «Deploying»: no se está desplegando nada todavía.
    expect(r.message).not.toMatch(/Deploying/);
  });

  it("retenido sin hora conocida: no se inventa una", () => {
    const r = describeRemediationOutcome(
      { deployed: true, deviceCount: 2, deployment: { scheduledReason: "maintenance_window", scheduledAt: null } },
      cve
    );
    expect(r.message).toBe(
      "Held for the maintenance window: the google chrome fix goes to 2 devices when the next window opens."
    );
  });

  it("nada vulnerable: nada desplegado, dicho así", () => {
    const r = describeRemediationOutcome({ deployed: false, deviceCount: 0 }, cve);
    expect(r).toEqual({
      severity: "info",
      message: "No device is vulnerable to CVE-2026-11645 right now — nothing was deployed.",
    });
  });
});
