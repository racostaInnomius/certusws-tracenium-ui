// F4.2 del plan de gates por tier: hasta ahora la UI NO tenía forma de saber a
// qué plugins tiene derecho el tenant — el endpoint del catálogo devolvía la
// lista estática (con `tier_required`) pero no el conjunto contratado. Sin eso,
// Security Compliance ofrecía "Fix now" y "Set to auto-remediate" a cualquiera,
// y la API los rechazaba después con 402.
//
// Lo que se fija aquí es la regla de ausencia, que es lo delicado: `entitled`
// puede venir null (cargando, o el backend no pudo resolverlo) y eso NO es lo
// mismo que "no tienes ninguno". Con null la UI no debe esconder nada — es una
// pista, no un control; los cierres reales son el gate 402 de las rutas y el
// recorte de la política al proyectarla al agente.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getPluginCatalog = vi.fn();
vi.mock("../api/policies", () => ({
  getPluginCatalog: (...a) => getPluginCatalog(...a),
}));

import { usePluginCatalog } from "./usePluginCatalog";
import { clearCachedFetch } from "./useCachedFetch";

const CATALOG = [
  { key: "amp", required: true, tier_required: "starter" },
  { key: "scp", tier_required: "professional" },
  { key: "pmp", tier_required: "enterprise" },
];

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

describe("usePluginCatalog — derechos de suscripción", () => {
  it("professional: isEntitled dice que no a pmp y que sí a scp", async () => {
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["amp", "scp", "rcp", "sdp"] });
    const { result } = await mount();
    expect(result.current.isEntitled("pmp")).toBe(false);
    expect(result.current.isEntitled("scp")).toBe(true);
    expect(result.current.entitled).toBeInstanceOf(Set);
  });

  it("enterprise: pmp entitled", async () => {
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["amp", "scp", "pmp", "cdp"] });
    const { result } = await mount();
    expect(result.current.isEntitled("pmp")).toBe(true);
  });

  it("entitled ausente (backend viejo o no resoluble) → NO esconde nada", async () => {
    // Si esto devolviera false, un despliegue del frontend por delante del
    // backend escondería la remediación a todos los tenants de golpe.
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG });
    const { result } = await mount();
    expect(result.current.entitled).toBeNull();
    expect(result.current.isEntitled("pmp")).toBe(true);
  });

  it("lista vacía SÍ es una respuesta: no hay derecho a nada", async () => {
    // [] es distinto de null — es el impago / sin suscripción.
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: [] });
    const { result } = await mount();
    expect(result.current.isEntitled("pmp")).toBe(false);
    expect(result.current.isEntitled("amp")).toBe(false);
  });

  it("la clave se compara en minúsculas", async () => {
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["PMP"] });
    const { result } = await mount();
    expect(result.current.isEntitled("pmp")).toBe(true);
    expect(result.current.isEntitled("PmP")).toBe(true);
  });

  it("el catálogo sigue llegando igual (cambio aditivo)", async () => {
    getPluginCatalog.mockResolvedValue({ ok: true, catalog: CATALOG, entitled: ["amp"] });
    const { result } = await mount();
    expect(result.current.catalog).toEqual(CATALOG);
    expect(result.current.isRequiredKey("amp")).toBe(true);
  });
});
