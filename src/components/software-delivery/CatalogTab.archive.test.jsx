// src/components/software-delivery/CatalogTab.archive.test.jsx
//
// Retirar un paquete del catálogo sin borrarlo.
//
// ⚠️ EL ESTADO YA EXISTÍA Y NADIE LO USABA. `is_active` estaba en la tabla, se
// editaba desde una casilla del diálogo del paquete, y el endpoint ya aceptaba
// `?isActive=true|false`. Lo único que faltaba era que la lista lo mirara: el
// Catalog pedía todo sin filtro, así que las versiones viejas se quedaban
// mezcladas con lo desplegable para siempre.
//
// ⚠️ Y NO ES BORRAR. Un paquete que algún despliegue referencia no se puede
// borrar —la FK es RESTRICT y el backend contesta 409 «Mark it inactive
// instead»— porque borrarlo dejaría ese historial apuntando al vacío.
// Archivar es la salida que sí existe.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CatalogTab from "./CatalogTab";
import * as sdpApi from "../../api/softwareDelivery";

vi.mock("../../api/softwareDelivery");

const LIVE = {
  id: 1,
  name: "Google Chrome",
  version: "152.0.7977.83",
  platform: "windows",
  arch: "x64",
  format: "msi",
  downloadPath: "blob:intake/1/abc",
  sha256: "a".repeat(64),
  isActive: true,
};

const ARCHIVED = {
  id: 2,
  name: "Google Chrome",
  version: "151.0.7922.138",
  platform: "windows",
  arch: "x64",
  format: "msi",
  downloadPath: "blob:intake/1/def",
  sha256: "b".repeat(64),
  isActive: false,
};

function setup({ packages = [LIVE] } = {}) {
  sdpApi.listPackages.mockResolvedValue({ items: packages });
  sdpApi.listIntakes.mockResolvedValue({ items: [] });
  const notify = vi.fn();
  render(<CatalogTab canManage notify={notify} onDeployFire={vi.fn()} onNavigateTab={vi.fn()} />);
  return { notify };
}

/** Los params de la última llamada a listPackages. */
function lastListParams() {
  const calls = sdpApi.listPackages.mock.calls;
  return calls[calls.length - 1]?.[0] ?? {};
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Catalog — archivado", () => {
  it("por defecto pide sólo los activos", async () => {
    // El default ES la función: sin él, el filtro existe pero el catálogo
    // sigue llegando lleno de versiones muertas hasta que alguien lo toca.
    setup();
    await waitFor(() => expect(sdpApi.listPackages).toHaveBeenCalled());
    expect(lastListParams().isActive).toBe("true");
  });

  it("filtra en el SERVIDOR, no escondiendo filas ya traídas", async () => {
    // Filtrar en el cliente traería igualmente cada paquete retirado por la
    // red, y la lista crecería para siempre aunque se viera corta.
    const user = userEvent.setup();
    setup();
    await waitFor(() => expect(sdpApi.listPackages).toHaveBeenCalled());

    await user.click(screen.getByRole("combobox", { name: /status/i }));
    await user.click(await screen.findByRole("option", { name: /^archived$/i }));

    await waitFor(() => expect(lastListParams().isActive).toBe("false"));
  });

  it("«All» no manda el filtro en absoluto", async () => {
    const user = userEvent.setup();
    setup();
    await waitFor(() => expect(sdpApi.listPackages).toHaveBeenCalled());

    await user.click(screen.getByRole("combobox", { name: /status/i }));
    await user.click(await screen.findByRole("option", { name: /^all$/i }));

    await waitFor(() => expect(lastListParams()).not.toHaveProperty("isActive"));
  });

  it("archiva desde la fila, sin abrir el editor", async () => {
    // Antes esto era una casilla dentro del diálogo del paquete: abrir,
    // buscar el check, guardar. Nadie retiraba nada.
    const user = userEvent.setup();
    sdpApi.updatePackage.mockResolvedValue({});
    const { notify } = setup();
    await waitFor(() => expect(screen.getByText("Google Chrome")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /archive package/i }));

    await waitFor(() =>
      expect(sdpApi.updatePackage).toHaveBeenCalledWith(1, { isActive: false })
    );
    // Y se recarga: con el filtro en «Active» la fila tiene que irse, y quién
    // pertenece al filtro lo decide el servidor.
    await waitFor(() => expect(sdpApi.listPackages.mock.calls.length).toBeGreaterThan(1));
    expect(notify).toHaveBeenCalledWith("success", expect.stringMatching(/archived/i));
  });

  it("un archivado ofrece restaurar, no archivar otra vez", async () => {
    const user = userEvent.setup();
    sdpApi.updatePackage.mockResolvedValue({});
    setup({ packages: [ARCHIVED] });
    await waitFor(() => expect(screen.getByText("Google Chrome")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /archive package/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: /restore to catalog/i }));
    await waitFor(() =>
      expect(sdpApi.updatePackage).toHaveBeenCalledWith(2, { isActive: true })
    );
  });

  it("un fallo del servidor no miente diciendo que se archivó", async () => {
    // El handler NO es optimista a propósito: con el filtro en «Active»,
    // archivar hace desaparecer la fila, y pintar esa desaparición para luego
    // resucitarla es peor que esperar el viaje.
    const user = userEvent.setup();
    sdpApi.updatePackage.mockRejectedValue({ body: { message: "nope" } });
    const { notify } = setup();
    await waitFor(() => expect(screen.getByText("Google Chrome")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /archive package/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", "nope"));
    // La fila sigue ahí, y sigue ofreciendo archivar.
    expect(screen.getByRole("button", { name: /archive package/i })).toBeInTheDocument();
  });

  it("el chip y el filtro usan la MISMA palabra", async () => {
    // Con dos nombres para un estado —«inactive» en la tabla, «Archived» en el
    // filtro— quien archiva desde la fila no encuentra después lo que archivó.
    setup({ packages: [ARCHIVED] });
    await waitFor(() => expect(screen.getByText("Google Chrome")).toBeInTheDocument());

    const grid = screen.getByRole("grid");
    expect(within(grid).getByText("archived")).toBeInTheDocument();
    expect(within(grid).queryByText("inactive")).toBeNull();
  });
});
