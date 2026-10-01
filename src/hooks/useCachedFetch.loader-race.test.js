// src/hooks/useCachedFetch.loader-race.test.js
//
// 🔴 28-sep, Patch Management: al pasar de Certus a Mountainside IG la pestaña
// Patches decía «Devices reporting 0» hasta pulsar Refresh, con la API
// devolviendo 56 equipos.
//
// La clave de la página lleva `pmpEnabled` («devices:B:on» / «devices:B:off») y
// el cargador también: con PMP apagado devuelve null. Al cambiar de tenant la
// clave va on → off → on en un par de renders (la política del tenant nuevo aún
// no está). El hook arrancaba la carga de «on», pero leía el cargador en una
// microtarea, cuando el ref ya apuntaba al de «off»: guardaba null bajo «on»,
// fresco, y al volver a «on» no había nada que recargar.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCachedFetch, clearCachedFetch } from "./useCachedFetch";
import { setApiCacheSessionScope, setActiveTenantId } from "../api/http";

beforeEach(() => {
  window.localStorage.clear();
  clearCachedFetch();
  setApiCacheSessionScope("user-a");
  setActiveTenantId(null);
});

afterEach(() => {
  window.localStorage.clear();
  clearCachedFetch();
});

function useDevices({ tenant, enabled }) {
  const loader = async () => (enabled ? { items: [`${tenant}-1`, `${tenant}-2`] } : null);
  return useCachedFetch(`devices:${tenant}:${enabled ? "on" : "off"}`, loader);
}

describe("useCachedFetch — el cargador es el de la clave que se carga", () => {
  it("🔴 on → off → on antes de que arranque la carga no guarda null bajo «on»", async () => {
    const { result, rerender } = renderHook((props) => useDevices(props), {
      initialProps: { tenant: "A", enabled: true },
    });
    await waitFor(() => expect(result.current.data).toEqual({ items: ["A-1", "A-2"] }));

    // El cambio de tenant: la política vieja aún dice «on» y en el render
    // siguiente se vacía («off»), los dos antes de que arranque la carga de «on».
    act(() => rerender({ tenant: "B", enabled: true }));
    act(() => rerender({ tenant: "B", enabled: false }));
    // La política del tenant nuevo llega por red, más tarde.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    act(() => rerender({ tenant: "B", enabled: true }));

    await waitFor(() => expect(result.current.data).toEqual({ items: ["B-1", "B-2"] }));
  });
});

// 🔴 1-oct, Assets: cambiar un filtro estando en la página 3 lanzaba dos cargas;
// si la de la clave VIEJA llegaba última, la tabla enseñaba su resultado bajo
// el filtro nuevo («No hosts found»).
describe("useCachedFetch — una respuesta de otra clave no se pinta", () => {
  it("🔴 la carga lenta de la clave anterior no pisa a la de la clave vigente", async () => {
    const delays = { old: 60, new: 5 };
    const { result, rerender } = renderHook(
      ({ key }) =>
        useCachedFetch(`hosts:${key}`, () => new Promise((r) => setTimeout(() => r({ key }), delays[key]))),
      { initialProps: { key: "old" } }
    );
    act(() => rerender({ key: "new" }));
    await waitFor(() => expect(result.current.data).toEqual({ key: "new" }));
    // La vieja llega después: no cambia nada.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 90));
    });
    expect(result.current.data).toEqual({ key: "new" });
    expect(result.current.loading).toBe(false);
  });
});
