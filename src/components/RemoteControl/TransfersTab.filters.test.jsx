// src/components/RemoteControl/TransfersTab.filters.test.jsx
//
// ⚠️ Estos tests fallan si el filtro vuelve al cliente.
//
// Filtrar en cliente sobre una página de 25 filas hacía que "status:
// failed" contestara con el histórico entero por delante: la tabla salía
// vacía y eso se lee como "no ha fallado ninguna transferencia". En una
// pantalla de auditoría, un silencio así es peor que un error.
//
// Por eso la aserción interesante no es lo que se pinta, sino lo que se
// PIDE: `getAllFileTransfers` tiene que recibir el filtro.

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getAllFileTransfers = vi.fn();
vi.mock("../../api/remoteControl", () => ({
  getAllFileTransfers: (...a) => getAllFileTransfers(...a)
}));

import TransfersTab from "./TransfersTab";
import { clearCachedFetch } from "../../hooks/useCachedFetch";

/** Una fila cualquiera: lo que se mira es la petición, no el contenido. */
function row(id, over = {}) {
  return {
    id,
    transferId: `t-${id}`,
    sessionId: "sess-1",
    deviceId: "dev-1",
    filename: `file-${id}.txt`,
    direction: "download",
    remotePath: `/tmp/file-${id}.txt`,
    sizeBytes: 10,
    transferredBytes: 10,
    status: "completed",
    startedAt: "2026-09-01T10:00:00.000Z",
    ...over
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // La caché de useCachedFetch es de módulo: sin vaciarla, el segundo test
  // renderiza con la respuesta del primero y el loader nunca corre.
  clearCachedFetch();
  getAllFileTransfers.mockResolvedValue({ ok: true, items: [row(1)], total: 1 });
});
afterEach(() => {
  // Sin desmontar, el render del test anterior sigue en el documento y
  // `getByText` encuentra dos selectores "All statuses".
  cleanup();
});

/** El argumento de la última llamada al endpoint. */
const lastQuery = () =>
  getAllFileTransfers.mock.calls[getAllFileTransfers.mock.calls.length - 1][0];

describe("⚠️ los filtros de la auditoría viajan al servidor", () => {
  it("el estado se manda en la petición, no se aplica a la página cargada", async () => {
    const user = userEvent.setup();
    render(<TransfersTab />);
    await waitFor(() => expect(getAllFileTransfers).toHaveBeenCalled());
    expect(lastQuery()).not.toHaveProperty("status");

    await user.click(screen.getByText("All statuses"));
    await user.click(within(screen.getByRole("listbox")).getByText("Failed"));

    await waitFor(() => expect(lastQuery()).toMatchObject({ status: "failed" }));
  });

  it("la dirección también", async () => {
    const user = userEvent.setup();
    render(<TransfersTab />);
    await waitFor(() => expect(getAllFileTransfers).toHaveBeenCalled());

    await user.click(screen.getByText("All directions"));
    await user.click(within(screen.getByRole("listbox")).getByText("Upload"));

    await waitFor(() => expect(lastQuery()).toMatchObject({ direction: "upload" }));
  });

  it("el nombre de fichero llega al endpoint, esperando a que se deje de teclear", async () => {
    const user = userEvent.setup();
    render(<TransfersTab />);
    await waitFor(() => expect(getAllFileTransfers).toHaveBeenCalled());
    const before = getAllFileTransfers.mock.calls.length;

    await user.type(screen.getByPlaceholderText("Filter filename…"), "pay");

    // Ni una petición por tecla: la caja de auditoría de un tenant grande
    // no se consulta tres veces por escribir tres letras.
    expect(getAllFileTransfers.mock.calls.length).toBe(before);
    await waitFor(() => expect(lastQuery()).toMatchObject({ filename: "pay" }), {
      timeout: 2000
    });
  });

  it("⚠️ cambiar un filtro vuelve a la página 1", async () => {
    // Filtrando desde la página 7, el offset 150 de un resultado de 3 filas
    // devuelve nada — y una tabla vacía con el filtro puesto se lee como
    // "no hay ninguna".
    const user = userEvent.setup();
    getAllFileTransfers.mockResolvedValue({
      ok: true,
      items: [row(1)],
      total: 300
    });
    render(<TransfersTab />);
    await waitFor(() => expect(getAllFileTransfers).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));

    await user.click(screen.getByText("All statuses"));
    await user.click(within(screen.getByRole("listbox")).getByText("Failed"));

    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 1, status: "failed" }));
  });

  it("sin filtros no se manda ninguno: 'all' no es un valor", async () => {
    render(<TransfersTab />);
    await waitFor(() => expect(getAllFileTransfers).toHaveBeenCalled());
    const q = lastQuery();
    expect(q).toEqual({ page: 1, pageSize: 25 });
  });

  it("la tabla pinta lo que llega, sin descartar filas", async () => {
    // Si volviera a filtrar en cliente, una fila 'completed' desaparecería
    // al pedir 'failed' aunque el backend la haya devuelto — y el operador
    // vería menos de lo que hay sin saberlo.
    const user = userEvent.setup();
    render(<TransfersTab />);
    // El nombre sale dos veces por fila: columna Filename y Remote path.
    await waitFor(() => expect(screen.getAllByText("file-1.txt").length).toBeGreaterThan(0));

    await user.click(screen.getByText("All statuses"));
    await user.click(within(screen.getByRole("listbox")).getByText("Failed"));

    await waitFor(() => expect(lastQuery()).toMatchObject({ status: "failed" }));
    expect(screen.getAllByText("file-1.txt").length).toBeGreaterThan(0);
  });

  it("el contador dice cuántas coinciden en TODO el histórico", async () => {
    // "3 of 25" mediría la página. Con el filtro en el servidor, `total` ya
    // es el recuento filtrado del tenant entero.
    const user = userEvent.setup();
    getAllFileTransfers.mockResolvedValue({ ok: true, items: [row(1)], total: 42 });
    render(<TransfersTab />);
    await waitFor(() => expect(screen.getByText("42 total")).toBeTruthy());

    await user.click(screen.getByText("All statuses"));
    await user.click(within(screen.getByRole("listbox")).getByText("Failed"));

    await waitFor(() => expect(screen.getByText("42 matching")).toBeTruthy());
  });
});
