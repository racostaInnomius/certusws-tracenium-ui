// src/components/AssetsDashboard/WindowsDomainPanel.test.jsx
//
// GPOs y Coverage fundidas en una pestaña, formato Patch Management →
// Configure: un nav a la izquierda, la sección elegida a la derecha. Se
// simulan WindowsGpos y CoveragePanel (cada uno tiene su propio test) — aquí
// sólo importa que el panel elige bien y que la sección se puede controlar
// desde fuera, como hace Assets.jsx con los enlaces viejos.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../pages/WindowsGpos", () => ({
  default: ({ refreshNonce }) => <div data-testid="gpos-panel">gpos:{refreshNonce}</div>,
}));
vi.mock("../discovery/CoveragePanel", () => ({
  default: ({ refreshNonce, canManage }) => (
    <div data-testid="coverage-panel">coverage:{refreshNonce}:{String(canManage)}</div>
  ),
}));

import WindowsDomainPanel from "./WindowsDomainPanel";

afterEach(() => cleanup());

describe("WindowsDomainPanel", () => {
  it("⭐ abre en Group Policy por defecto; el nav cambia a Coverage", async () => {
    render(<WindowsDomainPanel refreshNonce={0} canManage />);
    expect(screen.getByTestId("gpos-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("coverage-panel")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /coverage/i }));
    await waitFor(() => expect(screen.getByTestId("coverage-panel")).toBeInTheDocument());
    expect(screen.queryByTestId("gpos-panel")).toBeNull();
    expect(screen.getByTestId("coverage-panel")).toHaveTextContent("coverage:0:true");
  });

  it("⚠️ un enlace viejo a ?assetsTab=coverage controla qué sección abre", async () => {
    render(<WindowsDomainPanel refreshNonce={0} section="coverage" onSectionChange={vi.fn()} />);
    expect(await screen.findByTestId("coverage-panel")).toBeInTheDocument();
  });

  it("cambiar de sección avisa al padre (para que el enlace consumido no vuelva a abrirla)", async () => {
    const onSectionChange = vi.fn();
    render(<WindowsDomainPanel refreshNonce={0} section="gpos" onSectionChange={onSectionChange} />);
    await userEvent.click(screen.getByRole("button", { name: /coverage/i }));
    expect(onSectionChange).toHaveBeenCalledWith("coverage");
  });
});
