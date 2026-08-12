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

  it("lists the existing mappings", async () => {
    listLocationSites.mockResolvedValue({
      ok: true,
      items: [
        { id: 1, cidr: "10.20.0.0/16", siteName: "HQ", description: null },
        { id: 2, cidr: "10.20.90.0/24", siteName: "HQ · Warehouse", description: "piso 1" },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("HQ")).toBeInTheDocument());
    expect(screen.getByText("10.20.90.0/24")).toBeInTheDocument();
    expect(screen.getByText("HQ · Warehouse")).toBeInTheDocument();
    expect(screen.getByText("piso 1")).toBeInTheDocument();
  });

  it("surfaces a fetch failure with a retry", async () => {
    listLocationSites.mockRejectedValue(new Error("sites boom"));
    renderPage();
    await waitFor(() => expect(screen.getByText(/sites boom/i)).toBeInTheDocument());
  });

  it("creates a mapping from the dialog", async () => {
    listLocationSites.mockResolvedValue({ ok: true, items: [] });
    createLocationSite.mockResolvedValue({ ok: true, site: { id: 9 } });
    renderPage();

    await waitFor(() => expect(listLocationSites).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /add site/i }));

    fireEvent.change(screen.getByLabelText(/Network range/i), { target: { value: "10.20.30.0/24" } });
    fireEvent.change(screen.getByLabelText(/Site name/i), { target: { value: "Oficina CDMX" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(createLocationSite).toHaveBeenCalledWith(
        expect.objectContaining({ cidr: "10.20.30.0/24", siteName: "Oficina CDMX" })
      )
    );
  });

  it("puts a backend field error on the offending input, not in a toast", async () => {
    listLocationSites.mockResolvedValue({ ok: true, items: [] });
    // The real backend answers a pasted host address with this shape.
    createLocationSite.mockResolvedValue({
      ok: false,
      error: "CIDR_HAS_HOST_BITS",
      field: "cidr",
      message: "That is a host address, not a network. Did you mean 10.20.30.0/24?",
    });
    renderPage();

    await waitFor(() => expect(listLocationSites).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /add site/i }));
    fireEvent.change(screen.getByLabelText(/Network range/i), { target: { value: "10.20.30.41/24" } });
    fireEvent.change(screen.getByLabelText(/Site name/i), { target: { value: "X" } });
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
