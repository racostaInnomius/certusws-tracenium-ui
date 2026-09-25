// La vista previa del informe ejecutivo de Asset Management.
//
// ⚠️ Prod, 24-sep: «Preview» enseñaba el JSON crudo. Aquí se afirma que se
// pintan las cifras que abren el documento, que un bloque ausente se dice como
// ausente (no como cero) y que generar pasa por la página.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AssetExecutivePreview from "./AssetExecutivePreview";
import { previewReport } from "../../api/reports";

vi.mock("../../api/reports", () => ({
  previewReport: vi.fn(),
}));

// Forma real: la vista previa de T1 del 25-sep, recortada.
const REPORT = {
  tenant: { id: 1, name: "Certus ITM LLC" },
  period: { month: "2026-08", from: "2026-08-01", to: "2026-08-31" },
  population: { enrolledActive: 17, lifecycleHidden: 0, fleet: 17, reportingInventory: 17 },
  freshness: { last24h: 12, last7d: 17, last30d: 17, stale: 0, neverReported: 0 },
  hygiene: {
    awaitingPurge: [
      { deviceId: "af87", hostname: "RAV-LAB-HI", purgeAfter: "2026-10-11T23:11:35Z" },
      { deviceId: "7d11", hostname: "W11-JPR-Lab01", purgeAfter: "2026-10-11T02:29:24Z" },
    ],
    overduePurge: [],
    enrolledNeverReported: [],
  },
  composition: { physical: 13, virtual: 4, unknownVirtualization: 0, byPlatform: [{ platform: "macos", count: 8 }], topModels: [] },
  agentVersions: [{ version: "1.1.80", count: 13 }],
  osVersions: [{ name: "macOS", build: "27.0", count: 3 }],
  software: null,
  change: { enrolled: [], decommissioned: [] },
  _warnings: ["software"],
};

beforeEach(() => {
  previewReport.mockResolvedValue({ ok: true, report: REPORT });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props = (over = {}) => ({
  open: true,
  onClose: vi.fn(),
  reportKey: "amp.asset-executive",
  reportLabel: "Asset Management Executive Report",
  formats: ["pdf", "csv", "json"],
  onGenerate: vi.fn(),
  ...over,
});

describe("AssetExecutivePreview", () => {
  it("⭐ pinta la reconciliación, no un volcado de JSON", async () => {
    render(<AssetExecutivePreview {...props()} />);
    expect(await screen.findByText("Certus ITM LLC")).toBeInTheDocument();
    expect(screen.getByText("Fleet")).toBeInTheDocument();
    expect(screen.getByText("Seen in 24 h")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Retired, awaiting purge")).toBeInTheDocument();
    expect(screen.queryByLabelText("Report preview JSON")).not.toBeInTheDocument();
    expect(previewReport).toHaveBeenCalledWith("amp.asset-executive");
  });

  it("⚠️ un bloque ausente se dice como tal, no como cero", async () => {
    render(<AssetExecutivePreview {...props()} />);
    await screen.findByText("Software estate");
    expect(screen.getByText(/Not measured/)).toBeInTheDocument();
    expect(screen.getByText(/Some sections could not be measured: software/)).toBeInTheDocument();
  });

  it("generar pasa por la página (onGenerate), no descarga aquí", async () => {
    const p = props();
    render(<AssetExecutivePreview {...p} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate PDF" }));
    expect(p.onGenerate).toHaveBeenCalledWith("pdf");
  });
});
