// src/components/Alerts/creatableSources.test.js
//
// Qué se ofrece al crear una regla a medida. Dos propiedades:
// sólo fuentes cuyo criterio se puede escribir, y una fuente de un plugin que
// el tenant no tiene se enseña DESACTIVADA con su motivo — no se esconde, que
// es cómo alguien acaba preguntando por qué no está.

import { describe, it, expect } from "vitest";
import { creatableSources } from "./creatableSources";
import { editableSources } from "./criteriaFields";

describe("creatableSources", () => {
  it("ofrece exactamente las fuentes con criterios declarados", () => {
    const got = creatableSources().map((o) => o.source).sort();
    expect(got).toEqual([...editableSources()].sort());
    // Una fuente sin campos no puede estar: el formulario no sabría qué escribir.
    expect(got).not.toContain("security_event");
  });

  it("⚠️ la de un plugin no disponible sale desactivada, con el motivo", () => {
    const opts = creatableSources({
      sourcePlugin: { cdp_cert_expiry: "cdp", device_offline: null },
      availability: { cdp: { available: false, reason: "not_entitled", tierRequired: "business" } },
    });
    const cdp = opts.find((o) => o.source === "cdp_cert_expiry");
    expect(cdp).toMatchObject({ available: false, reason: "not_entitled", plugin: "cdp" });
    // Las usables van primero.
    expect(opts.at(-1).source).toBe("cdp_cert_expiry");
    expect(opts.find((o) => o.source === "device_offline").available).toBe(true);
  });

  it("sin saber la disponibilidad no desactiva nada", () => {
    const opts = creatableSources({ sourcePlugin: { cdp_cert_expiry: "cdp" }, availability: null });
    expect(opts.every((o) => o.available)).toBe(true);
  });
});
