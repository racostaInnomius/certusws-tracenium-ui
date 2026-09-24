// La entrada al portal (variante A, 24-sep-2026).
//
// Antes: un bootstrap 401 hacía `window.location = /auth/login`, así que la
// primera pantalla de Tracenium era la de SafeCertus — sin logo, sin contexto
// y sin vuelta atrás. Cerrar sesión terminaba igual. Ahora se enseña la
// entrada y al IdP se va SÓLO pulsando el botón.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { consumeSignedOut, landingNotice, markSignedOut } from "./ssoError";

vi.mock("./AuthContext", () => ({ useAuthContext: () => ({ refreshAuth: vi.fn() }) }));
vi.mock("../api/http", () => ({
  clearApiCache: vi.fn(),
  setApiCacheSessionScope: vi.fn(),
  getActiveTenantId: () => null,
  // AuthGate atiende este evento para apagar el salto de seguridad de http.js.
  AUTH_REQUIRED_EVENT: "tracenium:auth-required",
}));
vi.mock("../hooks/useCachedFetch", () => ({
  clearCachedFetch: vi.fn(),
  setCachedFetchSessionScope: vi.fn(),
}));

import AuthGate from "./AuthGate";

describe("landingNotice", () => {
  it("sin nada que contar no hay aviso: la entrada es sólo la presentación", () => {
    expect(landingNotice()).toBeNull();
  });

  it("cerrar sesión se anuncia y ofrece volver a entrar", () => {
    expect(landingNotice({ signedOut: true })).toMatchObject({
      tone: "info",
      cta: "Sign in again",
      retry: true,
    });
  });

  // Quien cerró sesión y al reentrar recibe una negativa necesita leer la
  // negativa, no «has cerrado sesión».
  it("la negativa del IdP manda sobre la marca de cierre de sesión", () => {
    const notice = landingNotice({ ssoError: "no_service_access", signedOut: true });
    expect(notice.code).toBe("no_service_access");
    expect(notice.tone).toBe("error");
    // Reintentar no arregla una cuenta sin acceso.
    expect(notice.retry).toBe(false);
  });
});

describe("marca de cierre de sesión", () => {
  it("se consume una sola vez, así que recargar no repite el aviso", () => {
    const store = new Map();
    const fake = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };

    markSignedOut(fake);
    expect(consumeSignedOut(fake)).toBe(true);
    expect(consumeSignedOut(fake)).toBe(false);
  });

  it("sin almacenamiento utilizable no revienta", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };

    expect(() => markSignedOut(broken)).not.toThrow();
    expect(consumeSignedOut(broken)).toBe(false);
  });
});

describe("AuthGate sin sesión", () => {
  const realFetch = global.fetch;
  let assigned;

  beforeEach(() => {
    assigned = [];
    // jsdom no navega: se captura la asignación para poder afirmar que NO se
    // rebota al IdP, y a dónde iría el botón.
    delete window.location;
    window.location = {
      search: "?page=assets",
      assign: (value) => assigned.push(value),
    };
    Object.defineProperty(window.location, "href", {
      get: () => "https://portal.tracenium.com/?page=assets",
      set: (value) => {
        assigned.push(value);
      },
      configurable: true,
    });
    global.fetch = vi.fn(async () => ({ status: 401, text: async () => "UNAUTHENTICATED" }));
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    global.fetch = realFetch;
    vi.clearAllMocks();
  });

  it("⭐ enseña la entrada de Tracenium en vez de saltar al IdP", async () => {
    render(
      <AuthGate>
        <div>console</div>
      </AuthGate>
    );

    expect(await screen.findByRole("button", { name: /sign in with safecertus/i })).toBeInTheDocument();
    // El eslogan llega partido porque el «&» va en el cian de la marca, igual
    // que en el Topbar: se comprueba el texto completo y ese color.
    const tagline = screen.getByText(/Endpoint Intelligence/i).closest("span");
    expect(tagline.textContent.replace(/\s+/g, " ").trim()).toBe(
      "Endpoint Intelligence & Compliance Platform"
    );
    expect(getComputedStyle(screen.getByText("&")).color).toBe("rgb(128, 255, 246)");
    // Lo que se arregla: ningún rebote automático, y la consola sin montar.
    expect(assigned).toEqual([]);
    expect(screen.queryByText("console")).not.toBeInTheDocument();
  });

  it("el botón lleva al IdP conservando el destino", async () => {
    render(
      <AuthGate>
        <div>console</div>
      </AuthGate>
    );

    (await screen.findByRole("button", { name: /sign in with safecertus/i })).click();

    expect(assigned).toHaveLength(1);
    expect(assigned[0]).toContain("/auth/login?returnTo=");
    // Sin esto, cada enlace compartido acabaría en el Overview.
    expect(decodeURIComponent(assigned[0])).toContain("page=assets");
  });

  it("tras cerrar sesión lo dice, y el botón invita a volver a entrar", async () => {
    markSignedOut();

    render(
      <AuthGate>
        <div>console</div>
      </AuthGate>
    );

    expect(await screen.findByText(/You have signed out/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in again/i })).toBeInTheDocument();
    expect(assigned).toEqual([]);
  });
});
