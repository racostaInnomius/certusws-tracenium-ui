// src/pages/RemoteControl.approvals.test.jsx
//
// ADR-0009 fase 2 — la cola de aprobación y la matriz de política.
//
// ⚠️ Por qué existe este fichero: el smoke de páginas monta
// RemoteControl y comprueba que no revienta, pero la cola devuelve
// `null` cuando no hay pendientes y el diálogo nace cerrado — o sea que
// el smoke no renderiza NADA de esto. Sin estos tests, dos componentes
// que gobiernan la concesión de root estarían cubiertos solo por el
// build.
//
// No se pudo probar contra un backend real (la UI necesita sesión OIDC
// y aquí no hay stack levantado), así que se prueba lo que sí puede
// probarse: que renderizan lo correcto y que las acciones llaman a la
// API con los argumentos correctos.

import React from "react";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listPendingApprovals = vi.fn();
const decideApproval = vi.fn();
const getAccessPolicy = vi.fn();
const setAccessPolicyCell = vi.fn();

vi.mock("../api/remoteControl", () => ({
  listPendingApprovals: (...a) => listPendingApprovals(...a),
  decideApproval: (...a) => decideApproval(...a),
  getAccessPolicy: (...a) => getAccessPolicy(...a),
  setAccessPolicyCell: (...a) => setAccessPolicyCell(...a),
  // El módulo entero se mockea, así que hay que devolver lo que la
  // página importa aunque estos tests no lo usen.
  getRemoteControlSummary: vi.fn(async () => ({})),
  getConnectableDevices: vi.fn(async () => ({ items: [] })),
  getRemoteSessions: vi.fn(async () => ({ items: [] })),
  getAllFileTransfers: vi.fn(async () => ({ items: [] })),
  startRemoteSession: vi.fn(),
  getSessionTranscript: vi.fn(),
  getSessionFileTransfers: vi.fn(),
  listAccessRequests: vi.fn()
}));

import { ApprovalQueue, AccessPolicyDialog } from "./RemoteControl";

const pendiente = {
  requestId: "req-abc-123",
  deviceId: "SRV-DC01",
  operatorUserId: "operador@cliente.com",
  capability: "rcp.shell",
  reason: "El usuario no puede iniciar sesion tras el update",
  ticketRef: "TCK-4821",
  createdAt: "2026-09-01T10:00:00Z",
  expiresAt: "2026-09-01T11:00:00Z"
};

// Sin esto el DOM de un test se acumula sobre el siguiente y
// `findByRole` encuentra dos botones "Aprobar" — el proyecto no
// configura cleanup automático.
afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  listPendingApprovals.mockResolvedValue({ items: [] });
  getAccessPolicy.mockResolvedValue({ items: [] });
  decideApproval.mockResolvedValue({ ok: true });
  setAccessPolicyCell.mockResolvedValue({ ok: true });
});

describe("ApprovalQueue", () => {
  it("no pinta nada cuando no hay pendientes", async () => {
    const { container } = render(<ApprovalQueue refreshNonce={0} notify={vi.fn()} />);
    await waitFor(() => expect(listPendingApprovals).toHaveBeenCalled());
    // Un panel permanentemente vacío en la pantalla que más se usa se
    // vuelve invisible en una semana, y entonces no avisa el día que sí
    // hay algo.
    expect(container.firstChild).toBeNull();
  });

  it("⚠️ muestra el expediente COMPLETO, no solo un identificador", async () => {
    // Aprobar es conceder root a otra persona durante una ventana. Quien
    // aprueba sin ver quién, a qué equipo, por qué y bajo qué ticket no
    // está aprobando: está firmando.
    listPendingApprovals.mockResolvedValue({ items: [pendiente] });
    render(<ApprovalQueue refreshNonce={0} notify={vi.fn()} />);

    await screen.findByText(/operador@cliente\.com/);
    expect(screen.getByText(/SRV-DC01/)).toBeTruthy();
    expect(screen.getByText(/rcp\.shell/)).toBeTruthy();
    expect(screen.getByText(/no puede iniciar sesion/)).toBeTruthy();
    expect(screen.getByText(/TCK-4821/)).toBeTruthy();
  });

  it("aprobar llama a la API con approve=true", async () => {
    listPendingApprovals.mockResolvedValue({ items: [pendiente] });
    const notify = vi.fn();
    render(<ApprovalQueue refreshNonce={0} notify={notify} />);

    fireEvent.click(await screen.findByRole("button", { name: /Aprobar/ }));

    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith("req-abc-123", true));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("success", expect.any(String)));
  });

  it("denegar llama a la API con approve=false", async () => {
    listPendingApprovals.mockResolvedValue({ items: [pendiente] });
    render(<ApprovalQueue refreshNonce={0} notify={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /Denegar/ }));

    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith("req-abc-123", false));
  });

  it("⚠️ un 409 del backend se enseña, no se traga", async () => {
    // El backend responde 409 cuando el ESTADO no admite la decisión:
    // ya resuelta, caducada, o es la propia solicitud del aprobador.
    // Tragarse ese mensaje dejaría al aprobador pulsando un botón que
    // aparentemente no hace nada.
    listPendingApprovals.mockResolvedValue({ items: [pendiente] });
    decideApproval.mockResolvedValue({
      ok: false,
      message: "an operator cannot approve their own access request"
    });
    const notify = vi.fn();
    render(<ApprovalQueue refreshNonce={0} notify={notify} />);

    fireEvent.click(await screen.findByRole("button", { name: /Aprobar/ }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("error", expect.stringMatching(/own access request/))
    );
  });
});

describe("AccessPolicyDialog", () => {
  const matriz = [
    { capability: "rcp.shell", deviceClass: "server", requiresApproval: false, jitMinutes: 60 },
    { capability: "rcp.shell", deviceClass: "endpoint", requiresApproval: false, jitMinutes: 60 },
    { capability: "cdp.anchor.distrust", deviceClass: "server", requiresApproval: false, jitMinutes: 60 }
  ];

  it("pinta la matriz completa, incluidas las capacidades de CDP", async () => {
    // Se muestran aunque su botón todavía no exista: comparten la misma
    // matriz (ADR-0011 dec. 5 y 10), y esconderlas obligaría a rehacer
    // esta pantalla el día que se conecten.
    getAccessPolicy.mockResolvedValue({ items: matriz });
    render(<AccessPolicyDialog open onClose={vi.fn()} notify={vi.fn()} />);

    await screen.findByText("rcp.shell");
    expect(screen.getByText("cdp.anchor.distrust")).toBeTruthy();
    expect(screen.getAllByText(/Servidores|Endpoints/).length).toBeGreaterThan(1);
  });

  it("alternar una celda guarda SOLO esa celda", async () => {
    // Una por petición y no la matriz entera: un guardado masivo desde
    // una pantalla con datos viejos apagaría en silencio lo que otro
    // administrador acabara de encender.
    getAccessPolicy.mockResolvedValue({ items: matriz });
    render(<AccessPolicyDialog open onClose={vi.fn()} notify={vi.fn()} />);

    const botones = await screen.findAllByRole("button", { name: /Sin visto bueno/ });
    fireEvent.click(botones[0]);

    await waitFor(() => expect(setAccessPolicyCell).toHaveBeenCalledTimes(1));
    expect(setAccessPolicyCell).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "rcp.shell",
        deviceClass: "server",
        requiresApproval: true
      })
    );
  });

  it("explica el caso de la matriz vacía en vez de dejar el hueco", async () => {
    // Sin política cargada la pantalla estaría en blanco y el
    // administrador no sabría si es un fallo o es que no hay nada.
    getAccessPolicy.mockResolvedValue({ items: [] });
    render(<AccessPolicyDialog open onClose={vi.fn()} notify={vi.fn()} />);
    expect(await screen.findByText(/Sin política cargada/)).toBeTruthy();
  });

  it("no consulta nada mientras está cerrado", async () => {
    render(<AccessPolicyDialog open={false} onClose={vi.fn()} notify={vi.fn()} />);
    expect(getAccessPolicy).not.toHaveBeenCalled();
  });
});
