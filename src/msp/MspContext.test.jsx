// src/msp/MspContext.test.jsx
//
// 27-sep, prod: cambiar de cliente DOS veces desde el selector de la cabecera
// dejaba el portal en «Backend unavailable». El selector volvía a pasar su
// lista ya reducida ({ id, name }) y `enterTenant` la leía como si trajera
// `tenantId`: todos los ids pasaban a "undefined", el segundo cambio mandaba
// X-Tenant-Id: undefined y hasta el bootstrap contestaba 400.

import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { vi } from "vitest";
import { useEffect } from "react";

vi.mock("./mspApi", () => ({ fetchPortfolio: async () => ({ level: "vendor", items: [] }) }));
vi.mock("../auth/AuthContext", () => ({ useAuthContext: () => ({ refreshAuth: async () => {} }) }));

import { MspProvider, useMsp, slimClients } from "./MspContext";
import { getActiveTenantId, setActiveTenantId, normalizeTenantId } from "../api/http";

describe("slimClients", () => {
  it("acepta las dos formas: items del portfolio (tenantId) y la lista del selector (id)", () => {
    expect(slimClients([{ tenantId: 1, name: "Certus" }])).toEqual([{ id: "1", name: "Certus" }]);
    expect(slimClients([{ id: "111", name: "Mountainside" }])).toEqual([{ id: "111", name: "Mountainside" }]);
  });

  it("⭐ reducir dos veces no pierde los ids (antes: todos «undefined»)", () => {
    const once = slimClients([{ tenantId: 1, name: "A" }, { tenantId: 111, name: "B" }]);
    expect(slimClients(once)).toEqual(once);
  });

  it("⭐ una entrada sin id válido se descarta; una lista ya corrupta se limpia", () => {
    expect(slimClients([{ id: "undefined", name: "A" }, { name: "B" }, { id: "5", name: "C" }])).toEqual([{ id: "5", name: "C" }]);
  });
});

describe("normalizeTenantId", () => {
  it("⭐ «undefined», «null», vacío o NaN no son un tenant", () => {
    for (const v of [undefined, null, "", "  ", "undefined", "null", "NaN"]) expect(normalizeTenantId(v)).toBeNull();
    expect(normalizeTenantId(111)).toBe("111");
  });

  it("⭐ setActiveTenantId nunca deja «undefined» como tenant activo", () => {
    setActiveTenantId("undefined");
    expect(getActiveTenantId()).toBeNull();
    setActiveTenantId(undefined);
    expect(getActiveTenantId()).toBeNull();
  });
});

/** Expone el contexto al test tras cada render (sin mutar nada durante el render). */
function Probe({ onValue }) {
  const value = useMsp();
  useEffect(() => {
    onValue(value);
  });
  return null;
}

describe("enterTenant desde el selector", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActiveTenantId(null);
  });

  it("⭐ dos cambios seguidos con la lista del selector llevan al tenant correcto", async () => {
    const box = { msp: null };
    render(
      <MspProvider>
        <Probe onValue={(v) => (box.msp = v)} />
      </MspProvider>
    );
    // Primera entrada desde el portfolio (forma con tenantId).
    await act(async () => box.msp.enterTenant(1, "Certus", [{ tenantId: 1, name: "Certus" }, { tenantId: 111, name: "Mountainside" }]));
    // Dos cambios desde el selector: le pasa SU lista, ya reducida.
    await act(async () => box.msp.enterTenant(box.msp.switchableClients[1].id, "Mountainside", box.msp.switchableClients));
    await act(async () => box.msp.enterTenant(box.msp.switchableClients[0].id, "Certus", box.msp.switchableClients));
    expect(getActiveTenantId()).toBe("1");
    expect(box.msp.switchableClients.map((c) => c.id)).toEqual(["1", "111"]);
    expect(JSON.parse(sessionStorage.getItem("tr_switchable_clients")).map((c) => c.id)).toEqual(["1", "111"]);
  });

  it("un id inválido no cambia nada (mejor quedarse que dejar el portal sin arrancar)", async () => {
    const box = { msp: null };
    render(
      <MspProvider>
        <Probe onValue={(v) => (box.msp = v)} />
      </MspProvider>
    );
    await act(async () => box.msp.enterTenant(111, "Mountainside", []));
    await act(async () => box.msp.enterTenant("undefined", "Roto", []));
    expect(getActiveTenantId()).toBe("111");
  });
});

// 30-sep, prod: con la ficha de un Mac de T1 abierta, cambiar a Gtec dejaba
// `?device=<id de T1>` en la URL; al recargar, la ficha pedía ese equipo a Gtec
// (404) y pintaba un equipo fantasma.
describe("cambiar de cliente deja sólo la página en la URL", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActiveTenantId(null);
  });

  function mount() {
    const box = { msp: null };
    render(
      <MspProvider>
        <Probe onValue={(v) => (box.msp = v)} />
      </MspProvider>
    );
    return box;
  }

  it("⭐ otro cliente: fuera `device` y los filtros; se quedan la página y el auto-refresco", async () => {
    const box = mount();
    await act(async () => box.msp.enterTenant(1, "Certus", []));
    window.history.replaceState({}, "", "/?page=assets&device=8200bb2b&assetsTab=software&assetsAutoRefresh=1200");
    await act(async () => box.msp.enterTenant(113, "Gtec", []));
    expect(window.location.search).toBe("?assetsAutoRefresh=1200&page=assets");
  });

  it("volver al portfolio también la limpia", async () => {
    const box = mount();
    await act(async () => box.msp.enterTenant(1, "Certus", []));
    window.history.replaceState({}, "", "/?page=assets&device=8200bb2b");
    await act(async () => box.msp.exitTenant());
    expect(window.location.search).toBe("?page=assets");
  });

  it("volver a entrar al MISMO cliente no toca la URL (la ficha abierta sigue)", async () => {
    const box = mount();
    await act(async () => box.msp.enterTenant(1, "Certus", []));
    window.history.replaceState({}, "", "/?page=assets&device=8200bb2b");
    await act(async () => box.msp.enterTenant(1, "Certus", []));
    expect(window.location.search).toBe("?page=assets&device=8200bb2b");
  });
});
