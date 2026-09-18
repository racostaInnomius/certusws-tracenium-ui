// src/components/patch-management/CveCatalogManager.test.jsx
//
// ⚠️ EL FALLO (17-sep): esta pestaña pedía el catálogo SIN límite y pintaba
// todas las filas. Con 51.988 CVEs tras la sincronización con NVD, abrirla
// tiraba la pestaña del navegador por memoria («Aw, Snap!», código 5). Lo que
// se prueba aquí es que nunca vuelve a pedirlo entero.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const api = vi.hoisted(() => ({
  listCveCatalog: vi.fn(),
  createCveCatalog: vi.fn(),
  updateCveCatalog: vi.fn(),
  deleteCveCatalog: vi.fn(),
  triggerNvdSync: vi.fn(),
  getNvdSyncStatus: vi.fn(async () => ({ status: { status: "idle" } })),
  triggerKevSync: vi.fn(),
  getKevSyncStatus: vi.fn(async () => ({ status: { status: "idle" } })),
}));
vi.mock("../../api/patchManagement", () => api);
vi.mock("../../msp/MspContext", () => ({ useMspOptional: () => null }));

import CveCatalogManager from "./CveCatalogManager";

const entry = (over = {}) => ({
  id: 1,
  cveId: "CVE-2026-40058",
  title: "CrowdStrike Falcon sensor",
  publisher: "CrowdStrike",
  platform: "windows",
  cvssScore: 8.8,
  cvssSeverity: "high",
  introducedVersion: null,
  fixedVersion: null,
  affectedVersions: null,
  packageId: null,
  isActive: true,
  ...over,
});

function page(items, total) {
  return { ok: true, items, total, limit: 50, offset: 0 };
}

beforeEach(() => {
  api.listCveCatalog.mockReset();
  api.listCveCatalog.mockResolvedValue(page([entry()], 51988));
});
afterEach(cleanup);

describe("CveCatalogManager", () => {
  it("🔴 pide una PÁGINA, nunca el catálogo entero", async () => {
    render(<CveCatalogManager canManage notify={vi.fn()} />);
    await waitFor(() => expect(api.listCveCatalog).toHaveBeenCalled());
    expect(api.listCveCatalog).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    // Y enseña el tamaño real de la búsqueda, no el de la página.
    expect(await screen.findByText(/of 51,988 CVEs/)).toBeInTheDocument();
  });

  it("⭐ «No version data» en vez de «* → ∞» cuando NVD aún no publicó versiones", async () => {
    render(<CveCatalogManager canManage notify={vi.fn()} />);
    const row = await waitFor(() => screen.getByText("CVE-2026-40058").closest("tr"));
    expect(within(row).getByText("No version data")).toBeInTheDocument();
    expect(within(row).queryByText(/∞/)).toBeNull();
  });

  it("un rango conocido se sigue viendo como rango", async () => {
    api.listCveCatalog.mockResolvedValue(page([entry({ introducedVersion: "21.00", fixedVersion: "23.00" })], 1));
    render(<CveCatalogManager canManage notify={vi.fn()} />);
    expect(await screen.findByText("21.00 → 23.00")).toBeInTheDocument();
  });

  it("la búsqueda va al SERVIDOR, una vez, y vuelve a la primera página", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<CveCatalogManager canManage notify={vi.fn()} />);
      await waitFor(() => expect(api.listCveCatalog).toHaveBeenCalledTimes(1));

      fireEvent.change(screen.getByLabelText("Search"), { target: { value: "40058" } });
      // Sin esperar no hay consulta: se espera a que pare de teclear.
      expect(api.listCveCatalog).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(400);
      await waitFor(() => expect(api.listCveCatalog).toHaveBeenCalledTimes(2));
      expect(api.listCveCatalog).toHaveBeenLastCalledWith({ limit: 50, offset: 0, search: "40058" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("pasar de página pide el siguiente tramo", async () => {
    render(<CveCatalogManager canManage notify={vi.fn()} />);
    await waitFor(() => expect(api.listCveCatalog).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(api.listCveCatalog).toHaveBeenLastCalledWith({ limit: 50, offset: 50 }));
  });

  it("filtrar por severidad también va al servidor", async () => {
    render(<CveCatalogManager canManage notify={vi.fn()} />);
    await waitFor(() => expect(api.listCveCatalog).toHaveBeenCalledTimes(1));

    fireEvent.mouseDown(screen.getByLabelText("Severity"));
    fireEvent.click(await screen.findByRole("option", { name: /critical/i }));
    await waitFor(() => expect(api.listCveCatalog).toHaveBeenLastCalledWith({ limit: 50, offset: 0, severity: "critical" }));
  });

  it("⚠️ un backend anterior sin `total` no rompe la tabla", async () => {
    api.listCveCatalog.mockResolvedValue({ ok: true, items: [entry()] });
    render(<CveCatalogManager canManage notify={vi.fn()} />);
    expect(await screen.findByText(/of 1 CVEs/)).toBeInTheDocument();
  });
});
