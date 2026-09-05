// src/components/RemoteControl/SessionDetailDrawer.timeline.test.jsx
//
// ⚠️ La historia de una sesión, que hasta ahora no se guardaba.
//
// `remote_sessions` se sobrescribe a sí misma, así que el detalle solo
// podía enseñar el estado final. Esta línea de tiempo viene de una tabla
// append-only y es lo único que conserva el orden real de los hechos.
//
// Lo que se fija aquí son las dos lecturas que se pueden estropear sin
// romper nada: que una sesión ANTIGUA no parezca una en la que no pasó
// nada, y que un break-glass no se lea como un evento más de la lista.

import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSessionDetail = vi.fn();
const getSessionFileTransfers = vi.fn();
vi.mock("../../api/remoteControl", () => ({
  getSessionDetail: (...a) => getSessionDetail(...a),
  getSessionFileTransfers: (...a) => getSessionFileTransfers(...a)
}));

import SessionDetailDrawer from "./SessionDetailDrawer";

const SESSION = { sessionId: "sess-1", type: "shell", status: "closed" };

function detailWith(extra) {
  return {
    session: {
      sessionId: "sess-1",
      deviceId: "dev-a",
      hostname: "SRV-DC01",
      operator: "javier@example.com",
      type: "shell",
      status: "closed",
      startedAt: "2026-09-09T10:00:00Z",
      endedAt: "2026-09-09T10:05:00Z",
      durationSec: 300,
      consentRequired: false,
      accessRecord: null,
      operatorIp: null,
      timeline: [],
      ...extra
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionFileTransfers.mockResolvedValue({ items: [] });
});

afterEach(() => cleanup());

describe("la línea de tiempo", () => {
  it("⚠️ una sesión antigua dice que no se anotaba, no que no pasó nada", async () => {
    // Una lista vacía se lee como "esta sesión no hizo nada". Es lo contrario
    // de la verdad, que es "todavía no lo estábamos registrando".
    getSessionDetail.mockResolvedValue(detailWith({ timeline: [] }));
    render(<SessionDetailDrawer session={SESSION} onClose={vi.fn()} />);

    expect(
      await screen.findByText(/predates the audit log/i)
    ).toBeInTheDocument();
  });

  it("enseña los hechos en el orden en que llegaron", async () => {
    getSessionDetail.mockResolvedValue(
      detailWith({
        timeline: [
          { occurredAt: "2026-09-09T10:00:00Z", event: "requested", actor: "javier@example.com", actorIp: "203.0.113.5", source: "operator", detail: null },
          { occurredAt: "2026-09-09T10:00:02Z", event: "connected", actor: null, actorIp: null, source: "agent", detail: null },
          { occurredAt: "2026-09-09T10:05:00Z", event: "closed", actor: null, actorIp: null, source: "system", detail: null }
        ]
      })
    );
    render(<SessionDetailDrawer session={SESSION} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Session requested")).toBeInTheDocument());
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    // Quién y desde dónde, juntos: es la pareja que responde la pregunta.
    expect(screen.getByText(/javier@example\.com · 203\.0\.113\.5/)).toBeInTheDocument();
  });

  it("⚠️ el break-glass no se lee como un evento más", async () => {
    // Es la única fila de la lista que hay que mirar. Si se ve igual que
    // "Connected", el expediente lo entierra.
    getSessionDetail.mockResolvedValue(
      detailWith({
        timeline: [
          { occurredAt: "2026-09-09T10:00:00Z", event: "break_glass", actor: "javier@example.com", actorIp: "203.0.113.5", source: "operator", detail: null }
        ]
      })
    );
    render(<SessionDetailDrawer session={SESSION} onClose={vi.fn()} />);

    const row = await screen.findByText(/Break-glass override/i);
    expect(row).toBeInTheDocument();
    // Distinto del resto: en negrita y en el color de lo crítico.
    expect(getComputedStyle(row).fontWeight).toBe("700");
  });

  it("⚠️ una negativa del usuario se lee en palabras, no como un código", async () => {
    // `consent_denied` sin etiqueta se enseña crudo, y el operador lee un
    // identificador donde debería leer que una persona dijo que no. Es la
    // fila más importante que puede tener una sesión de pantalla.
    getSessionDetail.mockResolvedValue(
      detailWith({
        timeline: [
          { occurredAt: "2026-09-09T10:00:00Z", event: "requested", actor: "javier@example.com", actorIp: null, source: "operator", detail: null },
          { occurredAt: "2026-09-09T10:00:20Z", event: "consent_denied", actor: null, actorIp: null, source: "agent", detail: { reason: "consent_denied" } },
          { occurredAt: "2026-09-09T10:00:20Z", event: "closed", actor: null, actorIp: null, source: "system", detail: null }
        ]
      })
    );
    render(<SessionDetailDrawer session={SESSION} onClose={vi.fn()} />);

    expect(await screen.findByText(/The person at the device declined/i)).toBeInTheDocument();
    expect(screen.queryByText("consent_denied")).not.toBeInTheDocument();
  });

  it("el aviso caducado se distingue del rechazo", async () => {
    // Nadie contestó y alguien dijo que no son cosas distintas: la primera
    // se reintenta llamando por teléfono, la segunda no se reintenta.
    getSessionDetail.mockResolvedValue(
      detailWith({
        timeline: [
          { occurredAt: "2026-09-09T10:00:20Z", event: "consent_timeout", actor: null, actorIp: null, source: "agent", detail: null }
        ]
      })
    );
    render(<SessionDetailDrawer session={SESSION} onClose={vi.fn()} />);
    expect(await screen.findByText(/Nobody answered on the device/i)).toBeInTheDocument();
  });

  it("aprobar y denegar tienen cada uno su fila", async () => {
    getSessionDetail.mockResolvedValue(
      detailWith({
        timeline: [
          { occurredAt: "2026-09-09T09:59:00Z", event: "gated", actor: "javier@example.com", actorIp: null, source: "system", detail: null },
          { occurredAt: "2026-09-09T09:59:30Z", event: "denied", actor: "jefa@example.com", actorIp: null, source: "operator", detail: null }
        ]
      })
    );
    render(<SessionDetailDrawer session={SESSION} onClose={vi.fn()} />);
    expect(await screen.findByText("Approval refused")).toBeInTheDocument();
  });

  it("parar la pantalla no dice 'cerrada'", async () => {
    // El flujo de vídeo y la sesión son dos cosas: confundirlas es lo que
    // hacía el backend, y una etiqueta que dijera "Closed" aquí volvería a
    // contarlo mal en la pantalla.
    getSessionDetail.mockResolvedValue(
      detailWith({
        timeline: [
          { occurredAt: "2026-09-09T10:04:00Z", event: "screen_stopped", actor: null, actorIp: null, source: "agent", detail: { width: 1920, height: 1080 } }
        ]
      })
    );
    render(<SessionDetailDrawer session={SESSION} onClose={vi.fn()} />);
    expect(await screen.findByText("Screen sharing stopped")).toBeInTheDocument();
    expect(screen.queryByText("Closed")).not.toBeInTheDocument();
  });

  it("un evento sin etiqueta se enseña tal cual en vez de esconderse", async () => {
    // El que nadie ha traducido todavía es justo el que alguien va a citar
    // preguntando qué pasó.
    getSessionDetail.mockResolvedValue(
      detailWith({
        timeline: [
          { occurredAt: "2026-09-09T10:00:00Z", event: "algo_nuevo", actor: null, actorIp: null, source: "system", detail: null }
        ]
      })
    );
    render(<SessionDetailDrawer session={SESSION} onClose={vi.fn()} />);
    expect(await screen.findByText("algo_nuevo")).toBeInTheDocument();
  });
});

describe("la IP del operador", () => {
  it("se enseña cuando se conoce", async () => {
    getSessionDetail.mockResolvedValue(detailWith({ operatorIp: "203.0.113.5" }));
    render(<SessionDetailDrawer session={SESSION} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("203.0.113.5")).toBeInTheDocument());
  });

  it("⚠️ un guion, no una casilla en blanco, cuando no se registró", async () => {
    // "No lo sabemos" y "entró desde aquí" no pueden verse igual en una
    // pantalla que se lee como prueba.
    getSessionDetail.mockResolvedValue(detailWith({ operatorIp: null }));
    render(<SessionDetailDrawer session={SESSION} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("From")).toBeInTheDocument());
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
