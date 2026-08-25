// La vista de equipos enrolados que nunca reportaron.
//
// Lo que se fija aquí es lo que hace útil la pantalla: que las dos fallas se
// distingan y que un fallo de carga NO se muestre como "todo bien".

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import SilentEnrollmentsTable from "./SilentEnrollmentsTable";

vi.mock("../../api/devices", () => ({ listSilentEnrollments: vi.fn() }));
import { listSilentEnrollments } from "../../api/devices";

const fila = (o = {}) => ({
  deviceId: "fb27bbd6-ca85-4e7e-89c9-b3d0b945e8d3",
  hostname: "FTP-SPS",
  agentVersion: "1.1.30",
  enrolledAt: "2026-08-12T17:28:00Z",
  lastSeenAt: null,
  reason: "never_connected",
  hoursSinceEnroll: 309,
  ...o,
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SilentEnrollmentsTable", () => {
  it("muestra el hostname, que es el dato que faltaba", async () => {
    // El problema original: tres equipos y sólo UUIDs para nombrarlos.
    listSilentEnrollments.mockResolvedValue({ items: [fila()] });
    render(<SilentEnrollmentsTable />);
    expect(await screen.findByText("FTP-SPS")).toBeInTheDocument();
  });

  it("⚠️ distingue las dos fallas y dice a quién mandar cada una", async () => {
    // Confundirlas manda a revisar el firewall de una máquina cuyo tráfico ya
    // está pasando.
    listSilentEnrollments.mockResolvedValue({
      items: [
        fila({ deviceId: "a", reason: "never_connected" }),
        fila({ deviceId: "b", hostname: "DESKTOP-CAS-AV2", reason: "connected_silent", lastSeenAt: "2026-08-25T02:19:00Z" }),
      ],
    });
    render(<SilentEnrollmentsTable />);
    expect(await screen.findByText("Never connected")).toBeInTheDocument();
    expect(screen.getByText("Connected, no data")).toBeInTheDocument();
    expect(screen.getByText(/never connected — check firewall/)).toBeInTheDocument();
    expect(screen.getByText(/connected but silent — check the agent/)).toBeInTheDocument();
  });

  it("sin nombre sigue mostrando la fila: un UUID es mejor que el silencio", async () => {
    listSilentEnrollments.mockResolvedValue({ items: [fila({ hostname: null })] });
    render(<SilentEnrollmentsTable />);
    expect(await screen.findByText("(name unknown)")).toBeInTheDocument();
  });

  it("⚠️ un fallo de carga NO se muestra como 'todo bien'", async () => {
    // Cero filas significa "ningún equipo mudo". Afirmarlo sin haber podido
    // preguntar es la mentira tranquilizadora que esta vista existe para evitar.
    listSilentEnrollments.mockRejectedValue(new Error("boom"));
    render(<SilentEnrollmentsTable />);
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(screen.queryByText(/Every enrolled device is reporting/)).not.toBeInTheDocument();
  });

  it("sin equipos mudos sí dice que todo está bien", async () => {
    listSilentEnrollments.mockResolvedValue({ items: [] });
    render(<SilentEnrollmentsTable />);
    expect(await screen.findByText(/Every enrolled device is reporting/)).toBeInTheDocument();
  });
});
