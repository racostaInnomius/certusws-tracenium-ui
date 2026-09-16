// src/pages/Assessments.report.test.jsx
//
// El botón "Report" de Assessment Suite lleva al informe del motor
// (`asp.assessment`). Pide ADMIN/OWNER + `assessment_service`: a un USER no se
// le ofrece una puerta que acaba en "no disponible".

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { clearCachedFetch } from "../hooks/useCachedFetch";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

const { authState } = vi.hoisted(() => ({ authState: { role: "ADMIN" } }));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 111, tenantMember: { role: authState.role, isActive: true, tenantId: 111 } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

import Assessments from "./Assessments";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
  window.history.replaceState({}, "", "/");
  authState.role = "ADMIN";
});

function mount(onNavigate = vi.fn()) {
  server.use(
    http.get(/.*\/api\/v1\/asp\/instances$/, () => HttpResponse.json({ instances: [], detected: [], license: { activeInstances: 0 } }))
  );
  render(
    <ConfirmProvider>
      <Assessments onNavigate={onNavigate} />
    </ConfirmProvider>
  );
  return onNavigate;
}

describe("Assessment Suite — cabecera", () => {
  it("un ADMIN ve Report, que navega a Reports con el informe de Assessment Suite", async () => {
    const onNavigate = mount();
    await userEvent.click(await screen.findByRole("button", { name: /^report$/i }));
    expect(onNavigate).toHaveBeenCalledWith("reports");
    expect(new URL(window.location.href).searchParams.get("reportKey")).toBe("asp.assessment");
  });

  it("⚠️ un USER no lo ve: el informe pide ADMIN/OWNER", async () => {
    authState.role = "USER";
    mount();
    expect(await screen.findByRole("button", { name: /^refresh$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
  });
});
