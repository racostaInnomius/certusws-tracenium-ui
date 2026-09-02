// La matriz de remediación de PMP llega en la misma respuesta que `entitled`.
// Lo que se fija aquí es la regla de ausencia, igual que con `entitled`: si el
// backend aún no la sirve (despliegue a medias, versión vieja), la UI cae al
// flag estático `enforcer` de policyTransforms.js — que un test de contrato
// del backend mantiene igual a la matriz — y NUNCA a «todo apagado».
//
// El caso que originó esto: `shares` decía «auto coming soon» a mano mientras
// su handler era el único validado en producción. Con la matriz servida, la
// card no puede decir algo distinto de lo que el agente sabe hacer.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getPluginCatalog = vi.fn();
vi.mock("../api/policies", () => ({
  getPluginCatalog: (...a) => getPluginCatalog(...a),
}));

import { usePluginCatalog } from "./usePluginCatalog";
import { clearCachedFetch } from "./useCachedFetch";

const CATALOG = [{ key: "pmp", tier_required: "enterprise" }];

const MATRIX = {
  rows: [],
  capabilities: {
    firewall: { autoAvailable: true, fixAvailable: true, readOnly: false, verified: true,
      platforms: [{ platform: "linux" }, { platform: "windows" }, { platform: "macos" }] },
    shares: { autoAvailable: false, fixAvailable: true, readOnly: false, verified: true,
      platforms: [{ platform: "windows" }] },
    sip: { autoAvailable: false, fixAvailable: false, readOnly: true, verified: false,
      platforms: [{ platform: "macos" }] },
    bitlocker: { autoAvailable: false, fixAvailable: false, readOnly: false, verified: false,
      platforms: [] },
  },
};

beforeEach(() => {
  getPluginCatalog.mockReset();
  clearCachedFetch();
});
afterEach(() => clearCachedFetch());

async function mount() {
  const hook = renderHook(() => usePluginCatalog());
  await waitFor(() => expect(hook.result.current.catalog.length).toBeGreaterThan(0));
  return hook;
}

describe("usePluginCatalog — matriz de remediación", () => {
  it("con matriz, `auto` sale de la matriz y no del flag estático", async () => {
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["pmp"], remediation: MATRIX });
    const { result } = await mount();

    // El flag estático dice lo contrario a propósito: la matriz manda.
    expect(result.current.capabilityAuto("firewall", false)).toBe(true);
    expect(result.current.capabilityAuto("shares", true)).toBe(false);
    expect(result.current.capabilityAuto("sip", true)).toBe(false);
  });

  it("⭐ sin matriz cae al flag estático, no a «todo apagado»", async () => {
    // Un backend viejo o un despliegue a medias no puede dejar las cards mudas.
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["pmp"] });
    const { result } = await mount();

    expect(result.current.remediation).toBeNull();
    expect(result.current.capabilityAuto("firewall", true)).toBe(true);
    expect(result.current.capabilityAuto("firewall", false)).toBe(false);
  });

  it("una capability que la matriz no conoce usa el flag estático", async () => {
    // Una capability nueva en la UI antes que en la matriz: no se apaga sola.
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["pmp"], remediation: MATRIX });
    const { result } = await mount();

    expect(result.current.capabilityAuto("usb", true)).toBe(true);
  });

  it("expone las plataformas con handler, y null cuando no hay matriz", async () => {
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["pmp"], remediation: MATRIX });
    const { result } = await mount();

    expect(result.current.capabilityPlatforms("firewall")).toEqual(["linux", "windows", "macos"]);
    expect(result.current.capabilityPlatforms("bitlocker")).toEqual([]);
    expect(result.current.capabilityPlatforms("nope")).toBeNull();
  });

  it("una matriz malformada cuenta como ausente", async () => {
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["pmp"], remediation: "no" });
    const { result } = await mount();

    expect(result.current.remediation).toBeNull();
    expect(result.current.capabilityAuto("firewall", true)).toBe(true);
  });
});
