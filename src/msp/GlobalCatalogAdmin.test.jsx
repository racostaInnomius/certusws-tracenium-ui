// src/msp/GlobalCatalogAdmin.test.jsx
//
// ADR-0016 F1 — el panel de publicación.
//
// ⚠️ ESTE FICHERO NO PRUEBA QUE NO SE PUBLIQUE SOFTWARE DE UN CLIENTE. Esa
// garantía (D1) vive en `publishPackage` en el servidor y se comprueba contra
// Postgres real. Aquí se fija lo que le toca a la pantalla: agrupar por título,
// no ofrecer una acción que el servidor va a rechazar, y no desaparecer cuando
// una llamada cae.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GlobalCatalogAdmin, { groupByTitle } from "./GlobalCatalogAdmin";
import * as api from "./mspApi";

vi.mock("./mspApi");

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const CHROME_152 = {
  id: 1, titleKey: "google-chrome", title: "Google Chrome", vendor: "Google LLC",
  version: "152.0.7977.83", platform: "windows", arch: "x64",
  publishedAt: "2026-09-01T00:00:00Z", supersededBy: 2, isActive: true, linkCount: 3,
};
const CHROME_153 = {
  ...CHROME_152, id: 2, version: "153.0.1.1",
  publishedAt: "2026-09-07T00:00:00Z", supersededBy: null, linkCount: 0,
};
const EDGE = {
  id: 3, titleKey: "microsoft-edge", title: "Microsoft Edge", vendor: "Microsoft",
  version: "141.0.1", platform: "windows", arch: "x64",
  publishedAt: "2026-09-05T00:00:00Z", supersededBy: null, isActive: true, linkCount: 1,
};

function setup({ entries = [CHROME_152, CHROME_153, EDGE], packages = [] } = {}) {
  api.fetchGlobalCatalog.mockResolvedValue({ entries });
  api.fetchPublishablePackages.mockResolvedValue({ packages });
  return render(<GlobalCatalogAdmin onClose={vi.fn()} />);
}

describe("groupByTitle · la unidad es el título, no la variante", () => {
  // ⚠️ ADR-0016 D9. Con 5 plataformas × 5 versiones × 10 títulos son 250 filas:
  // una lista plana las trata como iguales y obliga a leerlas todas para saber
  // «¿cuál es la de Chrome ahora?».
  it("junta las versiones de un mismo título", () => {
    const g = groupByTitle([CHROME_152, CHROME_153, EDGE]);
    expect(g.map((x) => x.title)).toEqual(["Google Chrome", "Microsoft Edge"]);
    expect(g[0].variants).toHaveLength(2);
  });

  // La vigente es la que no tiene sucesora, y va primero: es la respuesta a la
  // pregunta que se hace el operador.
  it("pone la vigente primero e identifica cuál es", () => {
    const chrome = groupByTitle([CHROME_152, CHROME_153])[0];
    expect(chrome.variants[0].id).toBe(CHROME_153.id);
    expect(chrome.current.version).toBe("153.0.1.1");
  });

  // Suma los enlaces del título entero: es lo que dice si retirar algo de aquí
  // va a molestar a alguien.
  it("suma los enlaces de todas sus versiones", () => {
    expect(groupByTitle([CHROME_152, CHROME_153])[0].linkedTotal).toBe(3);
  });

  it("aguanta la lista vacía y la ausente", () => {
    expect(groupByTitle([])).toEqual([]);
    expect(groupByTitle(undefined)).toEqual([]);
  });
});

describe("GlobalCatalogAdmin · no ofrecer lo que el servidor va a rechazar", () => {
  // ⚠️ Retirar algo que un cliente está desplegando no debería ser un clic que
  // devuelve 409. El servidor lo rechaza igual —la FK es RESTRICT— pero la
  // pantalla no debería invitar al intento.
  it("no deja retirar una versión con enlaces, y dice por qué", async () => {
    setup();
    await screen.findByText("Google Chrome");

    const conEnlaces = screen.getAllByRole("button", { name: /unpublish/i });
    // CHROME_153 (0 enlaces) habilitado; CHROME_152 (3) y EDGE (1) no.
    const habilitados = conEnlaces.filter((b) => !b.disabled);
    expect(habilitados).toHaveLength(1);
    expect(screen.getByText("3 linked")).toBeInTheDocument();
  });

  it("marca cuál es la vigente", async () => {
    setup();
    expect(await screen.findAllByText("Current")).toHaveLength(2); // Chrome 153 y Edge
    expect(screen.getByText("superseded")).toBeInTheDocument();
  });
});

describe("GlobalCatalogAdmin · publicar", () => {
  const PKG = {
    id: 9, name: "Mozilla Firefox", vendor: "Mozilla", version: "140.0",
    platform: "windows", arch: "x64", format: "msi", publishedEntryId: null,
  };

  it("ofrece sólo lo que no está publicado ya", async () => {
    setup({ packages: [PKG, { ...PKG, id: 10, name: "Ya publicado", publishedEntryId: 4 }] });
    await screen.findByText("Mozilla Firefox");
    expect(screen.queryByText("Ya publicado")).toBeNull();
  });

  it("publica y recarga", async () => {
    setup({ packages: [PKG] });
    api.publishToGlobalCatalog.mockResolvedValue({ ok: true });
    await screen.findByText("Mozilla Firefox");

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    expect(api.publishToGlobalCatalog).toHaveBeenCalledWith(9, "Mozilla Firefox");
    await waitFor(() => expect(api.fetchGlobalCatalog).toHaveBeenCalledTimes(2));
  });

  // El 409 del servidor tiene un mensaje útil («ya está publicado», «3 tenants
  // enlazados»); tirarlo y decir "error" desperdicia lo único accionable.
  it("enseña el mensaje del servidor cuando rechaza", async () => {
    setup({ packages: [PKG] });
    api.publishToGlobalCatalog.mockRejectedValue({
      body: { message: "That exact version is already published." },
    });
    await screen.findByText("Mozilla Firefox");

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    expect(await screen.findByText(/already published/i)).toBeInTheDocument();
  });

  it("dice cuándo no hay nada esperando", async () => {
    setup({ packages: [] });
    expect(await screen.findByText(/nothing waiting/i)).toBeInTheDocument();
  });
});

describe("GlobalCatalogAdmin · una llamada caída se dice", () => {
  // Misma lección que el Overview de SDP: un panel que desaparece es
  // indistinguible de uno sin datos. Aquí, además, la otra mitad sigue viéndose.
  it("mantiene la mitad que sí cargó y avisa", async () => {
    api.fetchGlobalCatalog.mockRejectedValue(new Error("500"));
    api.fetchPublishablePackages.mockResolvedValue({
      packages: [{ id: 9, name: "Mozilla Firefox", version: "140.0", platform: "windows", arch: "x64", publishedEntryId: null }],
    });
    render(<GlobalCatalogAdmin onClose={vi.fn()} />);

    expect(await screen.findByText("Mozilla Firefox")).toBeInTheDocument();
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
  });
});

describe("GlobalCatalogAdmin · la responsabilidad se dice donde se publica", () => {
  // D7: Tracenium aloja y verifica; el tenant acepta antes de desplegar. Esa
  // frase pertenece a la pantalla donde se pulsa Publish, no a una nota al pie.
  it("explica el reparto en la propia pantalla", async () => {
    setup();
    expect(await screen.findByText(/each tenant still has to accept it/i)).toBeInTheDocument();
  });
});
