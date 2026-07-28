// Branch coverage for the loading / error / content states that were folded
// into <AsyncState>. The panel had no tests before this migration, so these
// pin the observable outcomes — in particular that the settings rows only read
// `settings` once it has arrived (AsyncState children evaluate eagerly, so the
// reads had to become optional-chained).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

vi.mock("../../api/compliance", () => ({
  getComplianceSettings: vi.fn(),
  updateComplianceSettings: vi.fn(),
}));

import { getComplianceSettings } from "../../api/compliance";
import ComplianceSettingsPanel from "./ComplianceSettingsPanel";

const settings = {
  overrides: {},
  systemDefaults: { complianceMinChecks: 5, complianceBandGoodMin: 90, complianceBandWarningMin: 70 },
  effective: { complianceMinChecks: 5, complianceBandGoodMin: 90, complianceBandWarningMin: 70 },
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ComplianceSettingsPanel states", () => {
  it("does not fetch while closed", () => {
    render(<ComplianceSettingsPanel open={false} onClose={() => {}} onToast={() => {}} />);
    expect(getComplianceSettings).not.toHaveBeenCalled();
  });

  it("renders the settings rows once loaded", async () => {
    getComplianceSettings.mockResolvedValue({ ok: true, settings });
    render(<ComplianceSettingsPanel open onClose={() => {}} onToast={() => {}} />);
    await waitFor(() => expect(getComplianceSettings).toHaveBeenCalled());
    // One row per SETTINGS_DEFS entry — assert the dialog rendered real content
    // rather than the loading or empty branch.
    await waitFor(() =>
      expect(screen.getByText("Minimum applicable checks for scoring")).toBeInTheDocument()
    );
    expect(screen.getByText("Healthy band threshold")).toBeInTheDocument();
    expect(screen.getByText("Warning band threshold")).toBeInTheDocument();
  });

  it("surfaces a backend failure message instead of the rows", async () => {
    getComplianceSettings.mockResolvedValue({ ok: false, message: "settings boom" });
    render(<ComplianceSettingsPanel open onClose={() => {}} onToast={() => {}} />);
    await waitFor(() => expect(screen.getByText("settings boom")).toBeInTheDocument());
  });

  it("surfaces a thrown error too", async () => {
    getComplianceSettings.mockRejectedValue(new Error("network down"));
    render(<ComplianceSettingsPanel open onClose={() => {}} onToast={() => {}} />);
    await waitFor(() => expect(screen.getByText(/network down/i)).toBeInTheDocument());
  });
});
