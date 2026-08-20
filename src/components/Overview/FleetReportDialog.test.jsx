// src/components/Overview/FleetReportDialog.test.jsx

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import FleetReportDialog from "./FleetReportDialog";
import { fetchFleetReport, downloadFleetReport } from "../../api/fleetReport";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../../api/fleetReport", () => ({
  fetchFleetReport: vi.fn(),
  downloadFleetReport: vi.fn(),
}));

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

describe("FleetReportDialog", () => {
  it("fetches and renders the KPI strip when opened", async () => {
    fetchFleetReport.mockResolvedValue({ report: REPORT });

    render(<FleetReportDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("Banco X")).toBeInTheDocument());
    expect(screen.getByText("40")).toBeInTheDocument(); // devices
    expect(screen.getByText("75%")).toBeInTheDocument(); // online
    expect(screen.getByText("88%")).toBeInTheDocument(); // compliance
    expect(fetchFleetReport).toHaveBeenCalledWith({ from: expect.any(String), to: expect.any(String) });
  });

  it("does not fetch when closed", () => {
    render(<FleetReportDialog open={false} onClose={() => {}} />);
    expect(fetchFleetReport).not.toHaveBeenCalled();
  });

  it("shows an error alert when the fetch fails, and 'No report data.' rather than stale content", async () => {
    fetchFleetReport.mockRejectedValue(new Error("network down"));

    render(<FleetReportDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
    expect(screen.getByText("No report data.")).toBeInTheDocument();
  });

  it("renders dash fallbacks for null KPI values instead of blank cells", async () => {
    fetchFleetReport.mockResolvedValue({
      report: { ...REPORT, kpis: { devices: null, onlinePct: null, compliancePct: null, patchCompliantPct: null, licenseUtilizationPct: null, openAlerts: null } },
    });

    render(<FleetReportDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("Banco X")).toBeInTheDocument());
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("disables both export buttons while one download is in flight, and re-enables after", async () => {
    fetchFleetReport.mockResolvedValue({ report: REPORT });
    let resolveDownload;
    downloadFleetReport.mockReturnValue(new Promise((res) => { resolveDownload = res; }));

    render(<FleetReportDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Banco X")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /csv/i }));

    expect(screen.getByRole("button", { name: /pdf/i })).toBeDisabled();
    expect(downloadFleetReport).toHaveBeenCalledWith("csv", { from: expect.any(String), to: expect.any(String) });

    resolveDownload();
    await waitFor(() => expect(screen.getByRole("button", { name: /pdf/i })).not.toBeDisabled());
  });

  it("switches the requested period when the 90d toggle is clicked", async () => {
    fetchFleetReport.mockResolvedValue({ report: REPORT });
    render(<FleetReportDialog open onClose={() => {}} />);
    await waitFor(() => expect(fetchFleetReport).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "90d" }));

    await waitFor(() => expect(fetchFleetReport).toHaveBeenCalledTimes(2));
  });
});
