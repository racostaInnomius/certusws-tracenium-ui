// src/components/Reports/FleetHealthPreview.test.jsx
//
// La pantalla es la que era (vivía en Overview como `FleetReportDialog`); lo
// que cambió es de dónde saca los datos y quién genera el fichero:
//
//   * el JSON se pide POR EL MOTOR — el mismo endpoint `/run?format=json` que
//     todo lo demás, no la ruta legacy `/api/v1/fleet-report`;
//   * los botones no descargan aquí: delegan en la página, que es la única
//     que genera, y arrastran el periodo que se está mirando.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import FleetHealthPreview from "./FleetHealthPreview";
import { previewReport } from "../../api/reports";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../../api/reports", () => ({
  previewReport: vi.fn(),
}));

const KEY = "global.fleet-health";
const props = (extra = {}) => ({ open: true, reportKey: KEY, onClose: () => {}, ...extra });

const REPORT = {
  tenant: { id: 1, name: "Banco X" },
  period: { from: "2026-06-01", to: "2026-06-30" },
  kpis: {
    devices: 40,
    onlinePct: 75,
    compliancePct: 88,
    patchCompliantPct: 70,
    licenseUtilizationPct: 80,
    openAlerts: 3,
  },
  composition: {
    osPlatform: [{ platform: "Windows", count: 25 }],
    topManufacturers: [{ manufacturer: "Dell", count: 20 }],
  },
  security: {
    complianceBySeverity: { critical: 2, high: 3, medium: 4, low: 1, info: 0 },
    patchSeverity: { critical: 1, important: 2, moderate: 1, low: 0, unknown: 0 },
    certsExpiring: { expired: 1, d7: 2, d14: 3, d30: 4 },
  },
  licensing: { used: 40, maxDevices: 50, nextAnniversary: "2027-01-01" },
  activity: {
    jobsRun: { total: 20, completed: 18, failed: 2 },
    softwareDeployed: { attempted: 9, succeeded: 8, failed: 1 },
    remoteSupportSessions: { total: 4 },
  },
  trend: [
    { date: "2026-06-01", deviceCount: 38, onlineCount: 28, compliancePct: 80 },
    { date: "2026-06-30", deviceCount: 40, onlineCount: 30, compliancePct: 88 },
  ],
  deltas: { devices: 2, compliancePct: 8, from: "2026-06-01", to: "2026-06-30" },
};

describe("FleetHealthPreview", () => {
  it("fetches and renders the KPI strip when opened", async () => {
    previewReport.mockResolvedValue({ report: REPORT });

    render(<FleetHealthPreview {...props()} />);

    await waitFor(() => expect(screen.getByText("Banco X")).toBeInTheDocument());
    expect(screen.getByText("40")).toBeInTheDocument(); // devices
    expect(screen.getByText("75%")).toBeInTheDocument(); // online
    expect(screen.getByText("88%")).toBeInTheDocument(); // compliance
    // Por el motor y con la clave del catálogo — no por la ruta legacy.
    expect(previewReport).toHaveBeenCalledWith(KEY, { from: expect.any(String), to: expect.any(String) });
  });

  it("does not fetch when closed", () => {
    render(<FleetHealthPreview {...props({ open: false })} />);
    expect(previewReport).not.toHaveBeenCalled();
  });

  it("shows an error alert when the fetch fails, and 'No report data.' rather than stale content", async () => {
    previewReport.mockRejectedValue(new Error("network down"));

    render(<FleetHealthPreview {...props()} />);

    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
    expect(screen.getByText("No report data.")).toBeInTheDocument();
  });

  it("renders dash fallbacks for null KPI values instead of blank cells", async () => {
    previewReport.mockResolvedValue({
      report: { ...REPORT, kpis: { devices: null, onlinePct: null, compliancePct: null, patchCompliantPct: null, licenseUtilizationPct: null, openAlerts: null } },
    });

    render(<FleetHealthPreview {...props()} />);

    await waitFor(() => expect(screen.getByText("Banco X")).toBeInTheDocument());
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  // ⭐ Lo que se quitó al traerlo aquí: esta pantalla ya NO descarga. Sus
  // botones antiguos llamaban a `/api/v1/fleet-report/export.pdf`, que sacaba
  // el fichero sin dejar fila en `report_runs`.
  it("no descarga: delega en la página, con el periodo que se está mirando", async () => {
    previewReport.mockResolvedValue({ report: REPORT });
    const onGenerate = vi.fn();

    render(<FleetHealthPreview {...props({ onGenerate })} />);
    await waitFor(() => expect(screen.getByText("Banco X")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /generate csv/i }));

    // Un PDF que cubriera otro rango que la pantalla sería una trampa
    // silenciosa, así que el periodo viaja con la petición.
    expect(onGenerate).toHaveBeenCalledWith("csv", { from: expect.any(String), to: expect.any(String) });
  });

  it("mientras la página genera, los dos botones se bloquean", async () => {
    previewReport.mockResolvedValue({ report: REPORT });

    const { rerender } = render(<FleetHealthPreview {...props({ onGenerate: vi.fn() })} />);
    await waitFor(() => expect(screen.getByText("Banco X")).toBeInTheDocument());

    rerender(<FleetHealthPreview {...props({ onGenerate: vi.fn(), generating: "pdf" })} />);

    expect(screen.getByRole("button", { name: /generate csv/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /generate pdf/i })).toBeDisabled();
  });

  it("dice que generar queda registrado", async () => {
    // Es la parte que el operador no ve, y la razón de que esta pantalla ya
    // no baje ficheros por su cuenta.
    previewReport.mockResolvedValue({ report: REPORT });
    render(<FleetHealthPreview {...props()} />);
    await waitFor(() => expect(screen.getByText("Banco X")).toBeInTheDocument());
    expect(screen.getByText(/records the run in this tenant's report history/i)).toBeTruthy();
  });

  it("switches the requested period when the 90d toggle is clicked", async () => {
    previewReport.mockResolvedValue({ report: REPORT });
    render(<FleetHealthPreview {...props()} />);
    await waitFor(() => expect(previewReport).toHaveBeenCalledTimes(1));
    const primerFrom = previewReport.mock.calls[0][1].from;

    fireEvent.click(screen.getByRole("button", { name: "90d" }));

    await waitFor(() => expect(previewReport).toHaveBeenCalledTimes(2));
    // Y pide DE VERDAD otro rango, no sólo otra vez el mismo.
    expect(previewReport.mock.calls[1][1].from < primerFrom).toBe(true);
  });
});
