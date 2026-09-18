// El IdP puede denegar el acceso ANTES de que haya sesión (el usuario pulsa
// «Not now» en «añade Tracenium a tu cuenta», o entitlement en enforce). El
// backend devuelve a la UI con ?auth_error=...; si AuthGate corriera su
// bootstrap, el 401 dispararía /auth/login y volvería el bucle de redirects.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { consumeSsoError, readSsoError, ssoErrorCopy } from "./ssoError";

vi.mock("./AuthContext", () => ({ useAuthContext: () => ({ refreshAuth: vi.fn() }) }));
vi.mock("../api/http", () => ({
  clearApiCache: vi.fn(),
  setApiCacheSessionScope: vi.fn(),
  getActiveTenantId: () => null,
}));
vi.mock("../hooks/useCachedFetch", () => ({
  clearCachedFetch: vi.fn(),
  setCachedFetchSessionScope: vi.fn(),
}));

import AuthGate from "./AuthGate";

describe("readSsoError", () => {
  it("devuelve el código conocido", () => {
    expect(readSsoError("?auth_error=service_join_declined")).toBe("service_join_declined");
    expect(readSsoError("?auth_error=no_service_access")).toBe("no_service_access");
  });

  it("degrada un código desconocido y no lo devuelve tal cual", () => {
    expect(readSsoError("?auth_error=<script>")).toBe("sso_error");
  });

  it("sin parámetro no hay error", () => {
    expect(readSsoError("")).toBeNull();
    expect(readSsoError("?returnTo=/assets")).toBeNull();
  });
});

describe("consumeSsoError", () => {
  it("borra el parámetro de la URL y conserva el resto", () => {
    const replaceState = vi.fn();
    const loc = {
      href: "https://portal.example/?auth_error=sso_error&page=assets",
      search: "?auth_error=sso_error&page=assets",
    };

    expect(consumeSsoError(loc, { replaceState })).toBe("sso_error");
    expect(replaceState).toHaveBeenCalledWith({}, "", "/?page=assets");
  });
});

describe("copy", () => {
  // Reintentar no arregla una falta de acceso: hay que asignarlo en el IdP.
  it("no ofrece reintento cuando la cuenta no tiene el servicio", () => {
    expect(ssoErrorCopy("no_service_access").retry).toBe(false);
    expect(ssoErrorCopy("service_join_declined").retry).toBe(true);
  });
});

describe("AuthGate con ?auth_error", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve({ status: 401, text: async () => "" }));
    window.history.replaceState({}, "", "/?auth_error=service_join_declined");
  });

  afterEach(() => {
    global.fetch = realFetch;
    window.history.replaceState({}, "", "/");
  });

  it("enseña la pantalla terminal sin llamar al bootstrap", async () => {
    render(
      <AuthGate>
        <div>app</div>
      </AuthGate>
    );

    expect(await screen.findByText(/Tracenium was not added to your account/i)).toBeInTheDocument();
    // Lo que rompía el bucle: ni bootstrap (y por tanto ni su 401 → /auth/login)
    // ni la app montada.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("app")).not.toBeInTheDocument();
    expect(window.location.search).toBe("");
  });
});
