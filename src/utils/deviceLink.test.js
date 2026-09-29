// src/utils/deviceLink.test.js
//
// El enlace a la ficha de un equipo navega dentro del portal en un clic
// normal, pero deja al navegador Cmd/Ctrl-clic y el botón central: abrir el
// equipo en otra pestaña sin perder la alerta de la que se viene.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deviceAssetsHref, handleDeviceLinkClick } from "./deviceLink";

function clic(over = {}) {
  return { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault: vi.fn(), ...over };
}

beforeEach(() => window.history.replaceState({}, "", "/?page=alerts&alertsTab=feed&alertsAutoRefresh=1"));
afterEach(() => window.history.replaceState({}, "", "/"));

describe("deviceLink", () => {
  it("el href lleva a la ficha, sin los filtros de la página de origen", () => {
    const q = new URL(deviceAssetsHref("a-1"), "http://localhost").searchParams;
    expect(q.get("page")).toBe("assets");
    expect(q.get("device")).toBe("a-1");
    expect(q.get("alertsTab")).toBeNull();
  });

  it("⚠️ `//` tras un redirect de login no convierte el href en protocol-relative", () => {
    window.history.replaceState({}, "", `${window.location.origin}//?page=alerts`);
    expect(window.location.pathname).toBe("//");
    expect(deviceAssetsHref("a-1").startsWith("//")).toBe(false);
  });

  it("clic normal: navega aquí", () => {
    const e = clic();
    handleDeviceLinkClick(e, "a-1");
    expect(e.preventDefault).toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("device")).toBe("a-1");
  });

  it.each([
    ["Cmd", { metaKey: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Shift", { shiftKey: true }],
    ["botón central", { button: 1 }]
  ])("%s-clic: se deja al navegador (otra pestaña)", (_, over) => {
    const e = clic(over);
    handleDeviceLinkClick(e, "a-1");
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("page")).toBe("alerts");
  });
});
