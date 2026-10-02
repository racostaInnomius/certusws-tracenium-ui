// src/components/Compliance/ComplianceCategoryBreakdown.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";

vi.mock("../../api/compliance", () => ({
  getCategorySummary: vi.fn(),
  getCategoryDevices: vi.fn(),
  getCategoryFailingChecks: vi.fn(),
  getCategoryCheckDevices: vi.fn(),
}));
import { getCategorySummary, getCategoryDevices, getCategoryFailingChecks } from "../../api/compliance";
import ComplianceCategoryBreakdown from "./ComplianceCategoryBreakdown";

const ITEMS = {
  ok: true,
  items: [
    {
      category: "firewall",
      total: 37,
      passed: 2,
      failed: 17,
      errored: 0,
      notApplicable: 18,
      highSeverityFails: 17,
      devices: 15,
      devicesFailing: 15,
      passRate: 11,
    },
    {
      category: "network_sharing",
      total: 34,
      passed: 27,
      failed: 1,
      errored: 0,
      notApplicable: 6,
      highSeverityFails: 1,
      devices: 14,
      devicesFailing: 1,
      passRate: 96,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ComplianceCategoryBreakdown", () => {
  it("lists categories alphabetically by label, all with a capital first letter", async () => {
    // The API answers in its own order (worst first); the table does not.
    // `audit` and `services` have no entry in categoryMeta and used to
    // render in lowercase next to "Firewall".
    const row = (category) => ({ ...ITEMS.items[0], category });
    getCategorySummary.mockResolvedValue({ ok: true, items: [row("services"), row("network_sharing"), row("audit"), row("firewall")] });
    render(<ComplianceCategoryBreakdown />);

    await screen.findByText("Firewall");
    // The exact labels (capitalised) exist, and each one renders before the next.
    const labels = ["Audit", "Firewall", "Network sharing", "Services"].map((t) => screen.getByText(t));
    for (let i = 0; i < labels.length - 1; i++) {
      expect(labels[i].compareDocumentPosition(labels[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders a row per category with prettified names and pass rates", async () => {
    getCategorySummary.mockResolvedValue(ITEMS);
    render(<ComplianceCategoryBreakdown />);

    expect(await screen.findByText("Firewall")).toBeInTheDocument();
    // Display labels now come from categoryMeta.js, so the rendered
    // text is "Network sharing", not the raw key with its underscore
    // swapped for a space.
    expect(screen.getByText("Network sharing")).toBeInTheDocument();
    expect(screen.getByText("11%")).toBeInTheDocument();
    expect(screen.getByText("96%")).toBeInTheDocument();
  });

  it("abre plegada y se despliega desde la cabecera", async () => {
    // Una fila por categoría entre el titular y la tabla de equipos: plegada
    // por defecto, como «Posture by framework».
    getCategorySummary.mockResolvedValue(ITEMS);
    render(<ComplianceCategoryBreakdown />);
    await screen.findByText("Firewall");
    const header = screen.getByRole("button", { name: "Posture by category" });
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the empty state when there are no findings", async () => {
    getCategorySummary.mockResolvedValue({ ok: true, items: [] });
    render(<ComplianceCategoryBreakdown />);
    expect(await screen.findByText(/No compliance findings reported yet/i)).toBeInTheDocument();
  });

  it("surfaces a load error", async () => {
    getCategorySummary.mockRejectedValue({ body: { message: "boom" } });
    render(<ComplianceCategoryBreakdown />);
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });

  it("expanding a failing category opens the drill-in by CHECK (CategoryDrilldown)", async () => {
    // The drill-in itself is tested in CategoryDrilldown.test.jsx; here, only
    // that the row wires it: the check axis loads, the device list does not.
    getCategorySummary.mockResolvedValue(ITEMS);
    getCategoryFailingChecks.mockResolvedValue({
      ok: true,
      items: [{ checkId: "windows.firewall.domain", title: "Domain firewall on", severity: "high", deviceCount: 15, devicesEvaluated: 32, agentRemediable: false }],
      total: 1,
    });
    render(<ComplianceCategoryBreakdown />);
    const firewallCell = await screen.findByText("Firewall");
    // Plegada por defecto: se abre antes de pulsar una fila de dentro.
    fireEvent.click(screen.getByRole("button", { name: "Posture by category" }));
    fireEvent.click(within(firewallCell.closest("tr")).getByRole("button"));

    expect(await screen.findByText("Domain firewall on")).toBeInTheDocument();
    expect(getCategoryFailingChecks).toHaveBeenCalledWith("firewall", { limit: 25, offset: 0, assetGroupId: "", framework: "" });
    expect(getCategoryDevices).not.toHaveBeenCalled();
  });

  it("does not fetch drill-in devices until a category is expanded", async () => {
    getCategorySummary.mockResolvedValue(ITEMS);
    render(<ComplianceCategoryBreakdown />);
    await screen.findByText("Firewall");
    expect(getCategoryDevices).not.toHaveBeenCalled();
    expect(getCategoryFailingChecks).not.toHaveBeenCalled();
  });
});

describe("ComplianceCategoryBreakdown — the page's filters (walkthrough 25-sep #7)", () => {
  it("asks for the group and framework, and asks again when either changes", async () => {
    getCategorySummary.mockResolvedValue(ITEMS);
    const { rerender } = render(<ComplianceCategoryBreakdown assetGroupId="7" framework="nist_csf_2.0" />);
    await waitFor(() => expect(getCategorySummary).toHaveBeenCalledWith({ assetGroupId: "7", framework: "nist_csf_2.0" }));
    rerender(<ComplianceCategoryBreakdown assetGroupId="7" framework="" />);
    await waitFor(() => expect(getCategorySummary).toHaveBeenLastCalledWith({ assetGroupId: "7", framework: "" }));
    rerender(<ComplianceCategoryBreakdown assetGroupId="" framework="" />);
    await waitFor(() => expect(getCategorySummary).toHaveBeenLastCalledWith({ assetGroupId: "", framework: "" }));
    expect(getCategorySummary).toHaveBeenCalledTimes(3);
  });

  it("the drill-in inherits them", async () => {
    getCategorySummary.mockResolvedValue(ITEMS);
    getCategoryFailingChecks.mockResolvedValue({ ok: true, items: [], total: 0 });
    render(<ComplianceCategoryBreakdown assetGroupId="7" framework="nist_csf_2.0" />);
    const firewallCell = await screen.findByText("Firewall");
    fireEvent.click(screen.getByRole("button", { name: "Posture by category" }));
    fireEvent.click(within(firewallCell.closest("tr")).getByRole("button"));
    await waitFor(() =>
      expect(getCategoryFailingChecks).toHaveBeenCalledWith("firewall", { limit: 25, offset: 0, assetGroupId: "7", framework: "nist_csf_2.0" })
    );
  });
});
