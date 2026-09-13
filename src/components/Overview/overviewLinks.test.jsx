// src/components/Overview/overviewLinks.test.jsx
//
// A dónde lleva cada tarjeta del Overview. Validado contra el portal real
// (T111, 13-sep-2026): estos enlaces aterrizaban en páginas que ignoraban el
// parámetro o enseñaban otra cifra.
//
//   · Failed jobs (5)      → Jobs sin filtrar; con `status=failed`, 1 fila.
//   · Reports generated (8)→ el Catálogo, no el Historial donde están.
//   · Audit (~600/día)     → Audit abre el carril admin (983 en 30 días).
//   · Certs caducando      → `tab=expiring`, que PKI no tiene (lee `pkiTab`).
//   · Jobs (gráfica)       → `window`, que Jobs no lee.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import HeroKpis from "./HeroKpis";
import AttentionPanel from "./AttentionPanel";
import { ReportsCard } from "./PluginSummaryCards";
import { startOfWindowLocal } from "./AuditTimeseriesChart";

afterEach(cleanup);

const ok = (value) => ({ status: "fulfilled", value });

describe("enlaces del Overview", () => {
  it("⭐ Failed jobs lleva a Jobs con failed+timeout de los últimos 7 días (lo que suma la cifra)", () => {
    const onNavigate = vi.fn();
    render(
      <HeroKpis
        onNavigate={onNavigate}
        results={{ jobsTimeseries: ok({ buckets: [{ failed: 4 }, { failed: 1 }] }) }}
      />
    );

    fireEvent.click(screen.getByText("Failed jobs"));
    expect(onNavigate).toHaveBeenCalledWith("jobs", { status: "failed,timeout", since: "7d" });
  });

  it("Reports generated lleva al Historial, donde están esos informes", () => {
    const onNavigate = vi.fn();
    render(<ReportsCard onNavigate={onNavigate} results={{ reportRuns: ok({ total: 8, runs: [] }) }} />);

    fireEvent.click(screen.getByText(/Reports →/));
    expect(onNavigate).toHaveBeenCalledWith("reports", { reportsTab: "history" });
  });

  it("los certificados que caducan van a PKI sin un parámetro que PKI no lee", () => {
    const onNavigate = vi.fn();
    render(<AttentionPanel onNavigate={onNavigate} results={{ expiringCerts: ok({ count: 2 }) }} />);

    fireEvent.click(screen.getByText("agent certificates expiring <30d"));
    expect(onNavigate).toHaveBeenCalledWith("pki");
  });

  it("la ventana de la gráfica de auditoría se traduce al `auditFrom` que Audit sí lee", () => {
    // 13-sep a las 15:00 → una ventana de 7 días empieza el 7-sep a las 00:00.
    expect(startOfWindowLocal(7, new Date(2026, 8, 13, 15, 0))).toBe("2026-09-07T00:00");
    expect(startOfWindowLocal(1, new Date(2026, 8, 13, 15, 0))).toBe("2026-09-13T00:00");
    expect(startOfWindowLocal(30, new Date(2026, 8, 13, 15, 0))).toBe("2026-08-15T00:00");
  });
});
