// src/pages/SecurityBaselines.embedded.test.jsx
//
// Cómo se comporta esta página cuando NO es una página, sino la pestaña
// "Baselines" de Security Compliance.
//
// Dos cosas que se descubrieron juntas: la cabecera de Security Compliance
// escondía sus mandos fuera de Fleet status, y aquí dentro había un
// RefreshControl propio — de modo que en esa pestaña había un refresco, pero
// en otro sitio, con otra cadencia y sin relación con el de la cabecera. Ahora
// manda el anfitrión y esto obedece por `reloadKey`.
//
// Y el guard que va con ello: recargar resiembra el formulario, y esta página
// se refresca sola cada 60 s. Editar una baseline y esperar un minuto
// deshacía los cambios sin nada que lo explicara.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: "1", tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../hooks/useEffectiveTenantId", () => ({ useEffectiveTenantId: () => "1" }));
vi.mock("../api/roles", () => ({
  getMyCapabilities: vi.fn(async () => ({ role: "ADMIN", permissions: ["security_compliance"] })),
}));
vi.mock("../hooks/usePluginCatalog", () => ({
  // `capabilityAuto` lo consume SecurityPolicySection, no esta página — pero
  // el doble tiene que tener la forma del llamador real o el árbol no monta.
  usePluginCatalog: () => ({ isEntitled: () => true, capabilityAuto: () => true }),
}));
vi.mock("../api/policies", () => ({
  getTenantPolicy: vi.fn(),
  patchTenantPolicyDomain: vi.fn(),
  pushTenantPolicy: vi.fn(),
}));
vi.mock("../api/compliance", () => ({
  getCategorySummary: vi.fn(async () => ({ items: [] })),
  getComplianceSummary: vi.fn(async () => ({ summary: null })),
}));

import { getTenantPolicy } from "../api/policies";
import SecurityBaselines from "./SecurityBaselines";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const POLICY = {
  ok: true,
  policy: { policy_version: 3, policy_hash: "abc", policy_json: { security: { defaultMode: "report-only" } } },
};

function montar(props = {}) {
  return render(
    <ConfirmProvider>
      <SecurityBaselines embedded reloadKey={0} onNavigate={() => {}} {...props} />
    </ConfirmProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenantPolicy.mockResolvedValue(POLICY);
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("SecurityBaselines embebido en Security Compliance", () => {
  it("no pinta refresco propio: el de la cabecera del anfitrión es el único", async () => {
    montar();
    await waitFor(() => expect(getTenantPolicy).toHaveBeenCalled());

    // ⚠️ Se afirma la AUSENCIA. Había dos controles de refresco, uno encima
    // de otro, con dos cadencias distintas contra los mismos endpoints; si
    // vuelve el de aquí, vuelven los dos.
    expect(screen.queryByRole("button", { name: /^Refresh$/ })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Auto refresh" })).toBeNull();
  });

  it("recarga cuando el anfitrión sube el reloadKey", async () => {
    const { rerender } = montar();
    await waitFor(() => expect(getTenantPolicy).toHaveBeenCalledTimes(1));

    rerender(
      <ConfirmProvider>
        <SecurityBaselines embedded reloadKey={1} onNavigate={() => {}} />
      </ConfirmProvider>
    );
    await waitFor(() => expect(getTenantPolicy).toHaveBeenCalledTimes(2));
  });

  it("una recarga NO deshace una edición sin guardar", async () => {
    const { rerender } = montar();
    await waitFor(() => expect(getTenantPolicy).toHaveBeenCalled());

    // "Save baseline" está deshabilitado mientras el formulario esté limpio,
    // así que habilitarlo es la señal observable de que hay una edición viva.
    const guardar = await screen.findByRole("button", { name: /Save baseline/i });
    expect(guardar).toBeDisabled();

    fireEvent.click(screen.getAllByRole("switch")[0]);
    await waitFor(() => expect(guardar).toBeEnabled());

    rerender(
      <ConfirmProvider>
        <SecurityBaselines embedded reloadKey={1} onNavigate={() => {}} />
      </ConfirmProvider>
    );

    // La lectura ocurre —la evidencia de sólo lectura sí se refresca— pero el
    // formulario se queda como estaba.
    await waitFor(() => expect(getTenantPolicy).toHaveBeenCalledTimes(2));
    expect(guardar).toBeEnabled();
  });
});
