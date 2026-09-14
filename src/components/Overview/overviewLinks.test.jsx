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
import { startOfWindowLocal } from "./overviewResults";

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

  it("⭐ la ventana de la gráfica de auditoría arranca en el día UTC, como la serie del backend", () => {
    // Caso de campo: 14-sep 00:12 UTC. La serie de 7 días empieza el 8-sep
    // 00:00 UTC; Audit interpreta `auditFrom` en hora local, así que se
    // comprueba el INSTANTE que representa, sea cual sea la zona del equipo.
    const now = new Date(Date.UTC(2026, 8, 14, 0, 12));
    const instant = (s) => new Date(s).toISOString();

    expect(instant(startOfWindowLocal(7, now))).toBe("2026-09-08T00:00:00.000Z");
    expect(instant(startOfWindowLocal(1, now))).toBe("2026-09-14T00:00:00.000Z");
    expect(instant(startOfWindowLocal(30, now))).toBe("2026-08-16T00:00:00.000Z");
    expect(startOfWindowLocal(7, now)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
