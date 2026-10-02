// La matriz de remediación de PMP llega en la misma respuesta que `entitled`.
// Lo que se fija aquí es la regla de ausencia, igual que con `entitled`: si el
// backend no la sirve o llega malformada, `remediation` es null — nunca un
// objeto a medias.
//
// (Hasta el 1-oct el hook derivaba de ella capabilityAuto/Platforms/
// CatalogChecks para las cards de Baselines; esa pestaña se retiró.)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getPluginCatalog = vi.fn();
vi.mock("../api/policies", () => ({
  getPluginCatalog: (...a) => getPluginCatalog(...a),
}));

import { usePluginCatalog } from "./usePluginCatalog";
import { clearCachedFetch } from "./useCachedFetch";

const CATALOG = [{ key: "pmp", tier_required: "business" }];
const MATRIX = { rows: [], capabilities: { firewall: { autoAvailable: true, platforms: [{ platform: "linux" }] } } };

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
  it("la expone tal cual cuando llega", async () => {
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["pmp"], remediation: MATRIX });
    const { result } = await mount();
    expect(result.current.remediation).toEqual(MATRIX);
  });

  it("sin matriz, null", async () => {
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["pmp"] });
    const { result } = await mount();
    expect(result.current.remediation).toBeNull();
  });

  it("una matriz malformada cuenta como ausente", async () => {
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["pmp"], remediation: "no" });
    const { result } = await mount();
    expect(result.current.remediation).toBeNull();
  });
});
