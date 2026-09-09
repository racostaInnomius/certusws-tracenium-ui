import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("../api/locationSites", () => ({
  listLocationSites: vi.fn(),
  createLocationSite: vi.fn(),
  updateLocationSite: vi.fn(),
  deleteLocationSite: vi.fn(),
}));

import {
  listLocationSites,
  createLocationSite,
} from "../api/locationSites";
import { ConfirmProvider } from "../components/common/ConfirmDialog";
import LocationSites from "./LocationSites";

// The page calls useConfirm(), which needs the provider that main.tsx mounts.
function renderPage(props = {}) {
  return render(
    <ConfirmProvider>
      <LocationSites {...props} />
    </ConfirmProvider>
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("LocationSites", () => {
  it("shows the empty state, explaining the fallback", async () => {
    listLocationSites.mockResolvedValue({ ok: true, items: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Devices show their raw subnet until you add one/i)).toBeInTheDocument()
    );
  });

  it("⚠️ un sitio se lista UNA vez, con todas sus redes", async () => {
    // El caso real de T111: "Mountainside IG" eran cinco filas en la lista,
    // una por subred, con el nombre y el pin repetidos en todas.
    listLocationSites.mockResolvedValue({
      ok: true,
      items: [
        {
          id: 1,
          siteName: "Mountainside IG",
          city: "McAllen TX",
          description: "planta",
          lat: 26.17178,
          lon: -97.9737,
          ranges: [
            { id: 1, cidr: "10.10.17.0/24" },
            { id: 2, cidr: "10.100.2.0/24" },
            { id: 3, cidr: "10.100.17.0/24" },
          ],
        },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("Mountainside IG")).toBeInTheDocument());
    // Un solo nombre, tres redes.
    expect(screen.getAllByText("Mountainside IG")).toHaveLength(1);
    expect(screen.getByText("10.10.17.0/24")).toBeInTheDocument();
    expect(screen.getByText("10.100.2.0/24")).toBeInTheDocument();
    expect(screen.getByText("10.100.17.0/24")).toBeInTheDocument();
    expect(screen.getByText("planta")).toBeInTheDocument();
  });

  it("un sitio sin redes dice si puede o no emparejar algo", async () => {
    // Con pin etiqueta por cercanía; sin pin no etiqueta nada, y eso hay que
    // decirlo en vez de dejar un hueco que parece un fallo de carga.
    listLocationSites.mockResolvedValue({
      ok: true,
      items: [
        { id: 1, siteName: "Sólo pin", lat: 19.4, lon: -99.1, ranges: [] },
        { id: 2, siteName: "Ni pin ni redes", lat: null, lon: null, ranges: [] },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("Sólo pin")).toBeInTheDocument());
    expect(screen.getByText(/matched by proximity to its pin/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot match any device yet/i)).toBeInTheDocument();
  });

  it("surfaces a fetch failure with a retry", async () => {
    listLocationSites.mockRejectedValue(new Error("sites boom"));
    renderPage();
    await waitFor(() => expect(screen.getByText(/sites boom/i)).toBeInTheDocument());
  });

  it("crea un sitio con VARIAS redes de una vez", async () => {
    listLocationSites.mockResolvedValue({ ok: true, items: [] });
    createLocationSite.mockResolvedValue({ ok: true, site: { id: 9 } });
    renderPage();

    await waitFor(() => expect(listLocationSites).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /add site/i }));

    fireEvent.change(screen.getByLabelText(/Site name/i), { target: { value: "Oficina CDMX" } });
    fireEvent.change(screen.getByLabelText(/Network range/i), { target: { value: "10.20.30.0/24" } });
    fireEvent.click(screen.getByRole("button", { name: /add range/i }));
    // La segunda casilla no lleva etiqueta propia; se toma por posición.
    const casillas = screen.getAllByPlaceholderText("10.20.30.0/24");
    fireEvent.change(casillas[1], { target: { value: "10.20.90.0/24" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(createLocationSite).toHaveBeenCalledWith(
        expect.objectContaining({
          siteName: "Oficina CDMX",
          ranges: ["10.20.30.0/24", "10.20.90.0/24"],
        })
      )
    );
  });

  it("⚠️ las casillas de red vacías no se mandan", async () => {
    // Si no, el operador recibe "A network range is required" por una casilla
    // que dejó en blanco a propósito.
    listLocationSites.mockResolvedValue({ ok: true, items: [] });
    createLocationSite.mockResolvedValue({ ok: true, site: { id: 9 } });
    renderPage();

    await waitFor(() => expect(listLocationSites).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /add site/i }));
    fireEvent.change(screen.getByLabelText(/Site name/i), { target: { value: "Sólo pin" } });
    fireEvent.click(screen.getByRole("button", { name: /add range/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(createLocationSite).toHaveBeenCalledWith(expect.objectContaining({ ranges: [] }))
    );
  });

  it("puts a backend field error on the offending input, not in a toast", async () => {
    listLocationSites.mockResolvedValue({ ok: true, items: [] });
    // The real backend answers a pasted host address with this shape.
    createLocationSite.mockResolvedValue({
      ok: false,
      error: "CIDR_HAS_HOST_BITS",
      field: "ranges",
      message: "That is a host address, not a network. Did you mean 10.20.30.0/24?",
    });
    renderPage();

    await waitFor(() => expect(listLocationSites).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /add site/i }));
    fireEvent.change(screen.getByLabelText(/Site name/i), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText(/Network range/i), { target: { value: "10.20.30.41/24" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByText(/host address, not a network/i)).toBeInTheDocument()
    );
    // Dialog stays open so the operator can fix the value in place.
    expect(screen.getByLabelText(/Network range/i)).toBeInTheDocument();
  });

  it("offers a way back to Settings when onNavigate is provided", async () => {
    listLocationSites.mockResolvedValue({ ok: true, items: [] });
    const onNavigate = vi.fn();
    renderPage({ onNavigate });

    await waitFor(() => expect(listLocationSites).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Settings/i }));
    expect(onNavigate).toHaveBeenCalledWith("configurations");
  });
});
