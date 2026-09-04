// src/hooks/useCdpFilter.test.jsx
//
// El filtro de Crypto Discovery tiene UNA fuente de verdad: la URL.
//
// Lo que se fija aquí son las dos propiedades que faltaban antes del
// refactor: que un drill-down FUNDA (no pise la búsqueda escrita) y que
// no toque los parámetros ajenos —`?page=cdp` es del AppShell, y
// perderlo sacaría al usuario de la página con un clic en un KPI.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import useCdpFilter, { readCdpFilter } from "./useCdpFilter";

beforeEach(() => {
  window.history.replaceState({}, "", "/?page=cdp&other=keep");
});
afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("useCdpFilter", () => {
  it("lee lo que hay en la URL al montar", () => {
    window.history.replaceState({}, "", "/?page=cdp&cdpTab=2&q=veeam&pk=1");
    const { result } = renderHook(() => useCdpFilter());
    expect(result.current[0]).toEqual({ tab: 2, search: "veeam", hasPrivateKey: true });
  });

  it("⭐ patch FUNDE: un drill-down no borra la búsqueda", () => {
    const { result } = renderHook(() => useCdpFilter());
    act(() => result.current[1]({ search: "veeam" }));
    act(() => result.current[1]({ flag: "weak_sig", tab: 2 }));
    expect(result.current[0]).toEqual({ tab: 2, search: "veeam", flag: "weak_sig" });
    expect(new URLSearchParams(window.location.search).get("q")).toBe("veeam");
  });

  it("replace sustituye todo menos la pestaña", () => {
    const { result } = renderHook(() => useCdpFilter());
    act(() => result.current[1]({ search: "veeam", tab: 2 }));
    act(() => result.current[2]({ hasFlags: true }));
    expect(result.current[0]).toEqual({ tab: 2, hasFlags: true });
  });

  it("⭐ no toca los parámetros ajenos", () => {
    const { result } = renderHook(() => useCdpFilter());
    act(() => result.current[1]({ status: "expired" }));
    const p = new URLSearchParams(window.location.search);
    expect(p.get("page")).toBe("cdp");
    expect(p.get("other")).toBe("keep");
    expect(p.get("status")).toBe("expired");
  });

  it("borrar una clave la quita de la URL", () => {
    const { result } = renderHook(() => useCdpFilter());
    act(() => result.current[1]({ flag: "weak_sig" }));
    act(() => result.current[1]({ flag: "" }));
    expect(new URLSearchParams(window.location.search).has("flag")).toBe(false);
    expect(readCdpFilter().flag).toBeUndefined();
  });

  it("dos instancias del hook ven el mismo cambio", () => {
    // La página y la pestaña son componentes distintos con el mismo
    // hook; si no se sincronizaran, volveríamos a tener dos estados.
    const a = renderHook(() => useCdpFilter());
    const b = renderHook(() => useCdpFilter());
    act(() => a.result.current[1]({ eku: "serverAuth" }));
    expect(b.result.current[0].eku).toBe("serverAuth");
  });
});
