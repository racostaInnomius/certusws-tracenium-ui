// src/components/Compliance/SlaPanel.test.jsx
//
// El compromiso de remediación en pantalla. Lo que se fija:
//
//   · sin objetivos NO se dice "cumpliendo": se dice que no se mide, y se
//     invita a fijarlos. Estrenar la función con incumplimientos que nadie
//     prometió sería declarar el compromiso por el cliente y reprochárselo;
//   · un campo vacío al guardar manda `null` y RETIRA el objetivo — si se
//     tratara como "no tocar", nadie podría dejar de sostener un compromiso;
//   · el riesgo aceptado se cuenta aparte: ni incumple ni desaparece;
//   · quien sólo lee ve el reloj pero no lo cambia.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

vi.mock("../../api/compliance", () => ({
  getComplianceSla: vi.fn(),
  updateComplianceSettings: vi.fn(),
}));

import { getComplianceSla, updateComplianceSettings } from "../../api/compliance";
import SlaPanel, { headline, targetText } from "./SlaPanel";

const row = (severity, over = {}) => ({
  severity, targetDays: 7, onTime: 0, atRisk: 0, breached: 0, excluded: 0, oldestOpenDays: null, ...over,
});

const sla = (over = {}) => ({
  configured: true,
  targets: { critical: 7, high: 30, medium: 90, low: null },
  measured: 4, onTime: 1, atRisk: 1, breached: 2, compliancePct: 50,
  noTarget: 1, excluded: 1,
  bySeverity: [
    row("critical", { breached: 1, atRisk: 1, onTime: 1, excluded: 1, oldestOpenDays: 10 }),
    row("high", { targetDays: 30, breached: 1 }),
    row("medium", { targetDays: 90 }),
    row("low", { targetDays: null }),
  ],
  worst: [
    { deviceId: "d2", checkId: "c2", hostname: "SRV-02", title: "SMBv1 disabled", overdueDays: 10, ageDays: 40 },
  ],
  generatedAt: "2026-09-20T12:00:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getComplianceSla.mockResolvedValue(sla());
  updateComplianceSettings.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("el titular", () => {
  it("sin objetivos dice que no se mide, no que se cumple", () => {
    const h = headline({ configured: false, compliancePct: null, breached: 0 });
    expect(h.tone).toBe("info");
    expect(h.text).toMatch(/no remediation targets set/i);
  });

  it("con objetivos pero sin nada que medir tampoco dice que se cumple", () => {
    expect(headline({ configured: true, compliancePct: null, breached: 0 }).tone).toBe("info");
  });

  it("con incumplimientos, los cuenta", () => {
    const h = headline({ configured: true, compliancePct: 50, breached: 2 });
    expect(h.tone).toBe("error");
    expect(h.text).toMatch(/2 open findings past the committed time/i);
  });

  it("todo dentro de plazo sí es verde", () => {
    expect(headline({ configured: true, compliancePct: 100, breached: 0 }).tone).toBe("success");
  });

  it("una severidad sin objetivo lo dice con palabras", () => {
    expect(targetText({ targetDays: null })).toBe("no target");
    expect(targetText({ targetDays: 7 })).toBe("7 d");
  });
});

describe("la tabla", () => {
  it("enseña objetivo, vencidos, a punto y el más viejo abierto", async () => {
    render(<SlaPanel canManage />);
    expect(await screen.findByText("Remediation targets")).toBeInTheDocument();
    expect(screen.getByText("7 d")).toBeInTheDocument();
    expect(screen.getByText("30 d")).toBeInTheDocument();
    expect(screen.getByText("no target")).toBeInTheDocument();
    // "10 d" sale dos veces —el más viejo abierto y el retraso del peor—, así
    // que se busca en la FILA de critical, que es lo que este test afirma.
    const criticalRow = screen.getByText("Critical").closest("tr");
    expect(within(criticalRow).getByText("10 d")).toBeInTheDocument();
  });

  it("cuenta aparte lo que está fuera del reloj, sin esconderlo", async () => {
    render(<SlaPanel canManage />);
    expect(await screen.findByText(/1 with an accepted exception/i)).toBeInTheDocument();
    expect(screen.getByText(/1 with no target for their severity/i)).toBeInTheDocument();
  });

  it("los más vencidos salen con su retraso y su equipo", async () => {
    render(<SlaPanel canManage />);
    expect(await screen.findByText(/SRV-02/)).toBeInTheDocument();
    expect(screen.getByText(/SMBv1 disabled/)).toBeInTheDocument();
  });
});

describe("fijar los objetivos", () => {
  it("un campo vacío se guarda como null y retira el compromiso", async () => {
    render(<SlaPanel canManage onToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /edit targets/i }));

    const critical = screen.getByLabelText(/critical target in days/i);
    fireEvent.change(critical, { target: { value: "" } });
    const high = screen.getByLabelText(/high target in days/i);
    fireEvent.change(high, { target: { value: "14" } });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(updateComplianceSettings).toHaveBeenCalledWith({
        slaDaysCritical: null,
        slaDaysHigh: 14,
        slaDaysMedium: 90,
        slaDaysLow: null,
      })
    );
  });

  it("sin objetivos, el botón invita a fijarlos", async () => {
    getComplianceSla.mockResolvedValue(
      sla({ configured: false, targets: { critical: null, high: null, medium: null, low: null }, measured: 0, breached: 0, compliancePct: null })
    );
    render(<SlaPanel canManage />);
    expect(await screen.findByRole("button", { name: /set targets/i })).toBeInTheDocument();
  });

  it("quien sólo lee ve el reloj y no puede tocarlo", async () => {
    render(<SlaPanel canManage={false} />);
    await screen.findByText("Remediation targets");
    expect(screen.queryByRole("button", { name: /targets/i })).not.toBeInTheDocument();
  });

  // El toast de la página pinta `toast.message`: el aviso viaja como objeto,
  // no como dos argumentos sueltos (si no, el Alert sale en blanco).
  it("un fallo al guardar se cuenta", async () => {
    const onToast = vi.fn();
    updateComplianceSettings.mockRejectedValue({ body: { error: "INVALID" } });
    render(<SlaPanel canManage onToast={onToast} />);
    fireEvent.click(await screen.findByRole("button", { name: /edit targets/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith({ severity: "error", message: "INVALID" })
    );
  });
});

describe("la criticidad en el SLA", () => {
  it("el titular dice cuántos vencidos caen en equipos críticos", () => {
    const h = headline({ configured: true, compliancePct: 50, breached: 4, breachedOnCritical: 2 });
    expect(h.text).toMatch(/4 open findings past the committed time — 2 on critical devices/);
  });

  it("null o 0 no añaden nada: «0 on critical» afirmaría lo que no se sabe", () => {
    expect(headline({ configured: true, compliancePct: 50, breached: 4, breachedOnCritical: null }).text).not.toMatch(/critical/);
    expect(headline({ configured: true, compliancePct: 50, breached: 4, breachedOnCritical: 0 }).text).not.toMatch(/critical/);
  });
});
