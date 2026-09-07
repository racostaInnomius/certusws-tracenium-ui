// src/components/software-delivery/GlobalCatalogSegment.test.jsx
//
// ADR-0016 F2 — el catálogo de Tracenium visto por un tenant.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GlobalCatalogSegment, { groupCatalog, platformsOf } from "./GlobalCatalogSegment";
import * as api from "../../api/softwareDelivery";

vi.mock("../../api/softwareDelivery");

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const base = {
  titleKey: "google-chrome", title: "Google Chrome", vendor: "Google LLC",
  platform: "windows", arch: "x64", isActive: true, linkCount: 0,
  linkedPackageId: null, linkedVersionOfTitle: null,
};
const V152 = { ...base, id: 1, version: "152.0.7977.83", publishedAt: "2026-09-01T00:00:00Z", supersededBy: 2 };
const V153 = { ...base, id: 2, version: "153.0.1.1", publishedAt: "2026-09-07T00:00:00Z", supersededBy: null };
const EDGE = {
  ...base, id: 3, titleKey: "microsoft-edge", title: "Microsoft Edge", vendor: "Microsoft",
  version: "141.0.1", publishedAt: "2026-09-05T00:00:00Z", supersededBy: null,
};
const MAC = { ...base, id: 4, version: "153.0.1.1", platform: "macos", arch: "arm64", supersededBy: null };

function setup(entries = [V152, V153, EDGE]) {
  api.getGlobalCatalog.mockResolvedValue({ entries });
  return render(<GlobalCatalogSegment notify={vi.fn()} onLinked={vi.fn()} />);
}

describe("groupCatalog · el título es la unidad", () => {
  // ⚠️ D9. Con 5 plataformas × 5 versiones × 10 títulos son 250 filas; los
  // filtros las tratarían como iguales y obligarían a leerlas todas.
  it("junta las variantes bajo su título", () => {
    const g = groupCatalog([V152, V153, EDGE, MAC]);
    expect(g.map((x) => x.title)).toEqual(["Google Chrome", "Microsoft Edge"]);
    expect(g[0].variants).toHaveLength(3);
  });

  it("la vigente va primero", () => {
    expect(groupCatalog([V152, V153])[0].variants[0].id).toBe(V153.id);
  });

  it("reúne las plataformas del título", () => {
    expect(groupCatalog([V153, MAC])[0].platformList).toEqual(["macos", "windows"]);
  });

  it("el filtro de plataforma se aplica antes de agrupar", () => {
    const g = groupCatalog([V153, MAC], { platform: "macos" });
    expect(g[0].variants).toHaveLength(1);
    expect(g[0].variants[0].platform).toBe("macos");
  });

  // ⚠️ EL AVISO DE D5. Hay novedad cuando el tenant tiene ALGUNA versión del
  // título pero NO la vigente. Sin las dos condiciones, un tenant al día
  // recibiría un aviso permanente.
  it("hay novedad si tiene una versión vieja y no la vigente", () => {
    const g = groupCatalog([
      { ...V152, linkedPackageId: 77, linkedVersionOfTitle: "152.0.7977.83" },
      { ...V153, linkedVersionOfTitle: "152.0.7977.83" },
    ]);
    expect(g[0].hasUpdate).toBe(true);
    expect(g[0].linkedVersion).toBe("152.0.7977.83");
  });

  it("no hay novedad si ya tiene la vigente", () => {
    const g = groupCatalog([
      { ...V153, linkedPackageId: 88, linkedVersionOfTitle: "153.0.1.1" },
    ]);
    expect(g[0].hasUpdate).toBe(false);
  });

  it("no hay novedad si no tiene ninguna", () => {
    expect(groupCatalog([V152, V153])[0].hasUpdate).toBe(false);
  });

  it("aguanta lo vacío y lo ausente", () => {
    expect(groupCatalog([])).toEqual([]);
    expect(groupCatalog(undefined)).toEqual([]);
    expect(platformsOf(undefined)).toEqual([]);
  });
});

describe("GlobalCatalogSegment · lista títulos, no variantes", () => {
  it("enseña un título por producto y las versiones al abrir", async () => {
    setup();
    await screen.findByText("Google Chrome");

    // Cerrado: no se ven las versiones.
    expect(screen.queryByText("153.0.1.1")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /google chrome/i }));
    expect(await screen.findByText("153.0.1.1")).toBeInTheDocument();
    expect(screen.getByText("152.0.7977.83")).toBeInTheDocument();
  });

  it("se abre con el teclado", async () => {
    setup();
    await screen.findByText("Google Chrome");
    screen.getByRole("button", { name: /google chrome/i }).focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("153.0.1.1")).toBeInTheDocument();
  });

  it("busca por título y por fabricante", async () => {
    setup();
    await screen.findByText("Google Chrome");

    await userEvent.type(screen.getByPlaceholderText(/search by title/i), "microsoft");
    await waitFor(() => expect(screen.queryByText("Google Chrome")).toBeNull());
    expect(screen.getByText("Microsoft Edge")).toBeInTheDocument();
  });
});

describe("GlobalCatalogSegment · el aviso de versión nueva", () => {
  it("dice qué tiene y qué hay, sin re-enlazar solo", async () => {
    setup([
      { ...V152, linkedPackageId: 77, linkedVersionOfTitle: "152.0.7977.83" },
      { ...V153, linkedVersionOfTitle: "152.0.7977.83" },
    ]);
    expect(
      await screen.findByText(/you have 152\.0\.7977\.83 · 153\.0\.1\.1 available/i)
    ).toBeInTheDocument();
    // No se ha llamado a nada: el tenant decide.
    expect(api.linkGlobalEntry).not.toHaveBeenCalled();
  });

  it("una versión ya enlazada no ofrece añadirla otra vez", async () => {
    setup([{ ...V153, linkedPackageId: 88 }]);
    // Cerrado, el resumen lo dice una vez.
    expect(await screen.findByText("In your catalog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /google chrome/i }));

    // ⚠️ Y abierto SIGUE diciéndolo UNA vez: la variante lo dice y la cabecera
    // se calla. La misma frase dos veces en una tarjeta hace dudar de si
    // hablan de cosas distintas.
    expect(screen.getAllByText("In your catalog")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /add to my catalog/i })).toBeNull();
  });
});

describe("GlobalCatalogSegment · enlazar", () => {
  it("enlaza y recarga", async () => {
    setup([V153]);
    api.linkGlobalEntry.mockResolvedValue({ ok: true });
    await userEvent.click(await screen.findByRole("button", { name: /google chrome/i }));
    await userEvent.click(screen.getByRole("button", { name: /add to my catalog/i }));

    expect(api.linkGlobalEntry).toHaveBeenCalledWith(V153.id);
    await waitFor(() => expect(api.getGlobalCatalog).toHaveBeenCalledTimes(2));
  });

  // El 409 trae el motivo útil («ya tienes un paquete con ese nombre»); tirarlo
  // y decir "error" desperdicia lo único accionable.
  it("pasa el mensaje del servidor al aviso", async () => {
    const notify = vi.fn();
    api.getGlobalCatalog.mockResolvedValue({ entries: [V153] });
    api.linkGlobalEntry.mockRejectedValue({ body: { message: "already has a package" } });
    render(<GlobalCatalogSegment notify={notify} />);

    await userEvent.click(await screen.findByRole("button", { name: /google chrome/i }));
    await userEvent.click(screen.getByRole("button", { name: /add to my catalog/i }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("error", expect.stringContaining("already has a package"))
    );
  });
});

describe("GlobalCatalogSegment · los estados que no son datos", () => {
  // Un panel que desaparece es indistinguible de uno sin datos.
  it("dice que no pudo cargar", async () => {
    api.getGlobalCatalog.mockRejectedValue(new Error("500"));
    render(<GlobalCatalogSegment notify={vi.fn()} />);
    expect(await screen.findByText(/couldn't load the tracenium catalog/i)).toBeInTheDocument();
  });

  // Y «no hay nada publicado» no es lo mismo que «tu búsqueda no encuentra».
  it("distingue el catálogo vacío de una búsqueda sin resultados", async () => {
    setup([]);
    expect(await screen.findByText(/hasn't published anything yet/i)).toBeInTheDocument();

    cleanup();
    setup([V153]);
    await screen.findByText("Google Chrome");
    await userEvent.type(screen.getByPlaceholderText(/search by title/i), "zzz");
    expect(await screen.findByText(/nothing matches that search/i)).toBeInTheDocument();
  });

  // La aceptación de responsabilidad se dice donde se acepta (D7).
  it("explica qué significa añadirlo", async () => {
    setup();
    expect(await screen.findByText(/your decision to deploy it/i)).toBeInTheDocument();
  });
});
