// src/components/CryptoDiscovery/OrphanKeysPanel.test.jsx
//
// ADR-0011 decisión 9.d.
//
// Además de que MONTE —el fallo que dejó en blanco la pestaña de anclas
// era un identificador usado sin importar, que es ReferenceError en
// render y no en compilación—, aquí se defiende la honestidad del panel
// vacío: «no hay huérfanas registradas» no es «no hay huérfanas», y
// confundirlas devolvería la falsa tranquilidad que motivó la decisión.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listOrphanKeys = vi.fn();
const destroyEndpointKey = vi.fn();

vi.mock("../../api/cdp", () => ({
  listOrphanKeys: (...a) => listOrphanKeys(...a),
  destroyEndpointKey: (...a) => destroyEndpointKey(...a)
}));

import OrphanKeysPanel from "./OrphanKeysPanel";

const HUERFANA = {
  agentId: "356b64ba-9b01-41dd-a8bc-159d5c90a67f",
  keyId: "prueba-e2e-0901",
  subject: "CN=jpr-macbookpro.local,O=CertusWS",
  createdAt: "2026-09-01T20:00:00.000Z",
  requestId: "req-1",
  orphan: true,
  ageDays: 21
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OrphanKeysPanel", () => {
  it("⭐ el panel vacío dice que no hemos MIRADO, no que no hay", async () => {
    listOrphanKeys.mockResolvedValue({ ok: true, items: [], total: 0 });
    render(<OrphanKeysPanel refreshNonce={0} />);
    // La frase importa: es la diferencia entre un inventario y una falsa
    // tranquilidad como la de `purge_after`.
    expect(await screen.findByText(/sin que eso signifique que no hay ninguna/i)).toBeInTheDocument();
  });

  it("lista las huérfanas con su antigüedad y su solicitud", async () => {
    listOrphanKeys.mockResolvedValue({ ok: true, items: [HUERFANA], total: 1 });
    render(<OrphanKeysPanel refreshNonce={0} />);
    expect(await screen.findByText("prueba-e2e-0901")).toBeInTheDocument();
    expect(screen.getByText("21 d")).toBeInTheDocument();
    // De qué solicitud salió es lo que la hace accionable: sin eso una
    // huérfana es un dato y no una tarea.
    expect(screen.getByText("req-1")).toBeInTheDocument();
  });

  it("un fallo de carga se dice, no se pinta como lista vacía", async () => {
    listOrphanKeys.mockRejectedValue(new Error("backend caído"));
    render(<OrphanKeysPanel refreshNonce={0} />);
    expect(await screen.findByText(/backend caído/i)).toBeInTheDocument();
    // Y NO se muestra el mensaje de "no hay registradas", que sugeriría
    // que la consulta funcionó.
    expect(screen.queryByText(/sin que eso signifique/i)).not.toBeInTheDocument();
  });

  it("⭐ destruir exige expediente y avisa de que es irreversible", async () => {
    const user = userEvent.setup();
    listOrphanKeys.mockResolvedValue({ ok: true, items: [HUERFANA], total: 1 });
    render(<OrphanKeysPanel refreshNonce={0} />);
    await screen.findByText("prueba-e2e-0901");

    // Por su etiqueta accesible: un botón de solo icono sin nombre es
    // invisible para un lector de pantalla, y también para este test.
    await user.click(screen.getByRole("button", { name: /Destruir la clave prueba-e2e-0901/i }));

    expect(await screen.findByText(/irreversible/i)).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: /^Destruir$/i });
    expect(boton).toBeDisabled();

    await user.type(screen.getByLabelText(/Motivo/i), "clave de una prueba manual");
    await user.type(screen.getByLabelText(/^Ticket/i), "OPS-1");
    await waitFor(() => expect(screen.getByRole("button", { name: /^Destruir$/i })).toBeEnabled());

    destroyEndpointKey.mockResolvedValue({ ok: true, status: "dispatched", jobId: "j9" });
    await user.click(screen.getByRole("button", { name: /^Destruir$/i }));

    await waitFor(() => expect(destroyEndpointKey).toHaveBeenCalledOnce());
    expect(destroyEndpointKey.mock.calls[0][0]).toMatchObject({
      deviceId: HUERFANA.agentId,
      keyId: HUERFANA.keyId,
      ticketRef: "OPS-1"
    });
  }, 20000);
});
