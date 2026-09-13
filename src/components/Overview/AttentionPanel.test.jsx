// src/components/Overview/AttentionPanel.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AttentionPanel from "./AttentionPanel";

afterEach(cleanup);

const ok = (value) => ({ status: "fulfilled", value });

describe("AttentionPanel", () => {
  it("⭐ los equipos sin verse salen de `inactiveAssets7d`, el campo que el summary SÍ devuelve", () => {
    // Leía `offlineOver24h`, que /dashboard/summary no ha devuelto nunca: la
    // fila valía 0 siempre y no apareció jamás.
    render(<AttentionPanel results={{ dashboardSummary: ok({ inactiveAssets7d: 3 }) }} />);

    expect(screen.getByText("devices not seen in 7 days")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("cuenta las instalaciones de software fallidas de los 30 días y lleva a Software Delivery", () => {
    const onNavigate = vi.fn();
    render(
      <AttentionPanel
        onNavigate={onNavigate}
        results={{
          sdpTimeseries: ok({ buckets: [{ failed: 2 }, { failed: 1 }, { failed: 0 }] }),
        }}
      />
    );

    fireEvent.click(screen.getByText("software installs failed · 30d"));
    expect(onNavigate).toHaveBeenCalledWith("software-delivery");
  });

  it("los certificados que caducan se cuentan con `count` de /expiring", () => {
    render(<AttentionPanel results={{ expiringCerts: ok({ count: 4, certificates: [] }) }} />);

    expect(screen.getByText("agent certificates expiring <30d")).toBeTruthy();
  });

  it("ya no pinta hallazgos de compliance ni errores de auditoría: no son de todos los planes", () => {
    render(
      <AttentionPanel
        results={{
          complianceSummary: ok({ summary: { openFindings: { critical: 5, high: 5 } } }),
          auditSummary: ok({ summary: { error_count: 9 } }),
        }}
      />
    );

    expect(screen.queryByText(/compliance findings/)).toBeNull();
    expect(screen.queryByText(/failed events/)).toBeNull();
    expect(screen.getByText("All clear")).toBeTruthy();
  });
});
