// src/pages/AgentReleases.test.jsx
//
// El catálogo de instaladores es UNO para todos los tenants (base de control).
// Esta tabla ofrecía "Edit" y "Delete" a quien tuviese la capacidad
// `agent_releases` — que OWNER y ADMIN traen de serie —, o sea que el dueño de
// cualquier tenant podía cambiar el paquete que descargan los demás.
//
// Los mocks conceden esa capacidad A PROPÓSITO: si alguien restaura la columna
// con su gate de antes, aparece y el test cae. Sin conceder nada, un revert
// pasaría en verde y no probaría nada.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../api/agentReleases", () => ({
  listAgentReleases: vi.fn(),
  resolveAgentReleaseDownload: vi.fn(),
  createAgentRelease: vi.fn(),
  updateAgentRelease: vi.fn(),
  deleteAgentRelease: vi.fn(),
}));
vi.mock("../api/roles", () => ({
  getMyCapabilities: vi.fn(async () => ({ permissions: ["agent_releases"] })),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: { tenantMember: { isActive: true, role: "OWNER" } } }),
}));
vi.mock("../hooks/useEffectiveTenantId", () => ({
  useEffectiveTenantId: () => "t1",
}));

import { listAgentReleases } from "../api/agentReleases";
import AgentReleases from "./AgentReleases";

const fila = {
  id: "r1",
  name: "Tracenium Agent",
  platform: "windows",
  arch: "x64",
  format: "msi",
  version: "1.1.66",
  channel: "stable",
  isActive: true,
  createdAt: "2026-09-10T10:00:00Z",
  downloadPath: "/binaries/x",
};

beforeEach(() => {
  listAgentReleases.mockResolvedValue({ items: [fila] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderizar() {
  render(<AgentReleases embedded />);
  return screen.findByRole("button", { name: /^download$/i });
}

describe("AgentReleases — catálogo global, de sólo consulta", () => {
  it("⭐ un OWNER con `agent_releases` NO ve editar ni borrar", async () => {
    await renderizar();

    expect(screen.queryByRole("columnheader", { name: /actions/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^delete$/i })).toBeNull();
  });

  it("el comando desatendido tiene su propia columna, no va dentro de Download", async () => {
    const descargar = await renderizar();

    expect(screen.getByRole("columnheader", { name: /unattended install/i })).toBeTruthy();
    const celdaDescarga = descargar.closest('[role="gridcell"]');
    expect(
      within(celdaDescarga).queryByRole("button", { name: /unattended install command/i })
    ).toBeNull();
  });

  it("el botón abre el comando de ESA fila", async () => {
    await renderizar();

    fireEvent.click(
      screen.getByRole("button", { name: "Unattended install command for windows x64 v1.1.66" })
    );

    expect(await screen.findByText(/Tracenium-Agent-1\.1\.66-x64\.msi/)).toBeTruthy();
  });
});

// 21-sep: las filas son `latest` y se reutilizan en cada release. La columna de
// fecha enseñaba cuándo se dio de alta la FILA (abril, julio) y la versión
// decía «latest»; ahora se ve lo que se instala y cuándo se publicó ese build.
describe("AgentReleases — versión y fecha del build publicado", () => {
  it("enseña la versión resuelta y la fecha del build, no la de la fila", async () => {
    listAgentReleases.mockResolvedValue({
      items: [
        {
          ...fila,
          version: "latest",
          createdAt: "2026-04-06T12:00:00Z",
          publishedVersion: "1.1.78",
          publishedAt: "2026-09-21T17:53:57Z",
        },
      ],
    });
    await renderizar();

    expect(screen.getByRole("columnheader", { name: /published/i })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /created at/i })).toBeNull();
    expect(screen.getByText("1.1.78")).toBeInTheDocument();
    const grid = screen.getByRole("grid");
    expect(within(grid).queryByText(/Apr/i)).toBeNull();
    expect(within(grid).getByText(/Sep/i)).toBeInTheDocument();
  });
});
