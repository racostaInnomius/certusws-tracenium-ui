// src/pages/Alerts.correlation.test.jsx
//
// La ficha de una alerta de navegador trae el contexto ya resuelto: quién,
// qué grupos, si hay regla, y el paso siguiente — ir a bloquear la extensión
// con su fila abierta.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: { tenantId: "1", tenantMember: { role: "ADMIN", isActive: true } }, loading: false, refreshAuth: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));

import { CorrelationSection } from "./Alerts";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

const ID = "a".repeat(32);

describe("CorrelationSection", () => {
  it("quién, grupos (avisando de que son sólo estáticos) y el enlace que abre la extensión en Software", () => {
    const popstate = vi.fn();
    window.addEventListener("popstate", popstate);
    render(
      <CorrelationSection
        correlation={{
          who: { osUser: "ana", profile: "ana@acme.com" },
          groups: [{ id: 3, name: "Finance laptops" }],
          dynamicGroupsResolved: false,
          rule: null,
          allowOnlyMode: false,
          action: { kind: "block_extension", browser: "chrome", extensionId: ID, name: "Coupons" },
        }}
      />
    );
    expect(screen.getByText("ana · ana@acme.com")).toBeInTheDocument();
    expect(screen.getByText("Finance laptops (static groups only)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review and block Coupons" }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("page")).toBe("assets");
    expect(params.get("assetsTab")).toBe("software");
    expect(params.get("extension")).toBe(`chrome|${ID}`);
    expect(popstate).toHaveBeenCalled();
    window.removeEventListener("popstate", popstate);
  });

  it("ya bloqueada: lo dice y no ofrece el botón; sin correlación no pinta nada", () => {
    const { container } = render(<CorrelationSection correlation={{ who: {}, groups: [], dynamicGroupsResolved: false, rule: { action: "block" }, action: null }} />);
    expect(screen.getByText("Blocked by rule")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    cleanup();
    const empty = render(<CorrelationSection correlation={undefined} />);
    expect(empty.container.innerHTML).toBe("");
    expect(container).toBeTruthy();
  });
});
