// src/components/Alerts/ruleGroups.test.js
//
// El catálogo de reglas agrupado por plugin. El plugin de cada fila lo dice
// el backend; aquí sólo se agrupa, se ordena y se cuenta.

import { describe, it, expect } from "vitest";
import { groupRules, describeUnavailable, availabilityOf, PLATFORM_GROUP, OTHER_GROUP } from "./ruleGroups";

const CATALOG = [
  { key: "amp", label: "AMP", title: "Asset Management" },
  { key: "scp", label: "SCP", title: "Security Compliance" },
  { key: "cdp", label: "CDP", title: "Crypto Discovery" },
];
const t = (templateId, plugin) => ({ templateId, source: templateId, plugin });

describe("groupRules", () => {
  it("agrupa por plugin: plataforma primero, luego el orden del catálogo", () => {
    const groups = groupRules({
      templates: [t("scp.score", "scp"), t("offline", null), t("amp.disk", "amp")],
      rules: [],
      catalog: CATALOG,
    });
    expect(groups.map((g) => [g.key, g.title, g.label])).toEqual([
      [PLATFORM_GROUP, "Platform", null],
      ["amp", "Asset Management", "AMP"],
      ["scp", "Security Compliance", "SCP"],
    ]);
  });

  it("⚠️ los grupos bloqueados bajan al final: arriba lo que se puede usar", () => {
    const groups = groupRules({
      templates: [t("cdp.cert", "cdp"), t("scp.score", "scp"), t("offline", null)],
      rules: [],
      catalog: CATALOG,
      availability: { cdp: { available: false, reason: "not_entitled", tierRequired: "business" } },
    });
    expect(groups.map((g) => g.key)).toEqual([PLATFORM_GROUP, "scp", "cdp"]);
    expect(groups.at(-1)).toMatchObject({ available: false, reason: "not_entitled", tierRequired: "business" });
  });

  it("cuenta encendidas y pausadas, plantillas y reglas propias", () => {
    const [cdp] = groupRules({
      templates: [t("cdp.cert", "cdp"), t("cdp.weak", "cdp")],
      rules: [
        { id: "r1", templateId: "cdp.cert", enabled: true, paused: true, plugin: "cdp" },
        { id: "r2", templateId: null, enabled: true, paused: true, plugin: "cdp", source: "cdp_trust_anchor" },
      ],
      catalog: CATALOG,
    });
    expect(cdp).toMatchObject({ total: 3, enabled: 2, paused: 2 });
    expect(cdp.items.find((i) => i.template.templateId === "cdp.cert").primary.id).toBe("r1");
    expect(cdp.custom.map((r) => r.id)).toEqual(["r2"]);
  });

  it("sin `plugin` en la fila (backend anterior) va a 'Other', nunca se inventa que es de plataforma", () => {
    const [g] = groupRules({ templates: [{ templateId: "x", source: "x" }], rules: [], catalog: CATALOG });
    expect(g).toMatchObject({ key: OTHER_GROUP, title: "Other", available: true });
  });

  it("sin disponibilidad conocida no se bloquea nada — no saber no es 'no tienes'", () => {
    const groups = groupRules({ templates: [t("cdp.cert", "cdp")], rules: [], catalog: CATALOG, availability: null });
    expect(groups[0].available).toBe(true);
    expect(availabilityOf(null, "cdp").available).toBe(true);
  });
});

describe("describeUnavailable — el motivo, en palabras que se pueden hacer", () => {
  it("plan frente a interruptor", () => {
    expect(describeUnavailable({ reason: "not_entitled", tierRequired: "business" })).toBe("Requires the Business plan");
    expect(describeUnavailable({ reason: "not_entitled", tierRequired: null })).toBe("Not included in your plan");
    expect(describeUnavailable({ reason: "disabled" })).toBe("Turned off in Agent Settings");
  });
});
