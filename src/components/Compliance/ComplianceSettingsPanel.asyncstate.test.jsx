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
  // Sprint 4 — the panel also lists frameworks for the compliance-pack
  // section; resolve empty so these AsyncState tests stay focused.
  getFrameworks: vi.fn(async () => ({ ok: true, frameworks: [] })),
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

// ── El Refresh del anfitrión ─────────────────────────────────────────
// Embebido como pestaña de Security Compliance, el panel leía una sola vez al
// montarse: el botón Refresh de la cabecera no llegaba hasta aquí. `reloadKey`
// lo trae — pero un refresco no puede tragarse lo que alguien está
// escribiendo, y esta página se refresca sola cada 60 s por defecto.
describe("ComplianceSettingsPanel — reloadKey", () => {
  it("recarga cuando el anfitrión refresca", async () => {
    getComplianceSettings.mockResolvedValue({ ok: true, settings });
    const { rerender } = render(<ComplianceSettingsPanel embedded reloadKey={0} onToast={() => {}} />);
    await waitFor(() => expect(getComplianceSettings).toHaveBeenCalledTimes(1));

    rerender(<ComplianceSettingsPanel embedded reloadKey={1} onToast={() => {}} />);
    await waitFor(() => expect(getComplianceSettings).toHaveBeenCalledTimes(2));
  });

  it("NO recarga si hay cambios sin guardar — el refresco no pisa el borrador", async () => {
    const { fireEvent } = await import("@testing-library/react");
    getComplianceSettings.mockResolvedValue({ ok: true, settings });
    const { rerender } = render(<ComplianceSettingsPanel embedded reloadKey={0} onToast={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Minimum applicable checks for scoring")).toBeInTheDocument()
    );
    expect(getComplianceSettings).toHaveBeenCalledTimes(1);

    // Activar el override del primer ajuste ensucia el borrador: siembra un
    // valor propio donde el servidor no tiene ninguno.
    fireEvent.click(screen.getAllByRole("switch")[0]);
    await waitFor(() => expect(screen.getByRole("spinbutton")).toBeInTheDocument());

    rerender(<ComplianceSettingsPanel embedded reloadKey={1} onToast={() => {}} />);

    // Margen suficiente para que la recarga hubiera llegado de no estar el
    // guard: sin esta espera el test pasaría también con la llamada en vuelo.
    await new Promise((r) => setTimeout(r, 50));
    expect(getComplianceSettings).toHaveBeenCalledTimes(1);
    // Y el campo que estaba editando sigue en pantalla.
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });
});
