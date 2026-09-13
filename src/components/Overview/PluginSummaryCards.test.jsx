// src/components/Overview/PluginSummaryCards.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  CryptoDiscoveryCard,
  PatchManagementCard,
  ReportsCard,
  SoftwareDeliveryCard,
} from "./PluginSummaryCards";

afterEach(cleanup);

const ok = (value) => ({ status: "fulfilled", value });
const failed = { status: "rejected", reason: new Error("boom") };

describe("cards de plugin del Overview", () => {
  it("⭐ una petición fallida dice que falló, NO pinta ceros", () => {
    render(<PatchManagementCard results={{ patchSummary: failed }} />);

    const card = screen.getByRole("region", { name: "Patch management" });
    expect(within(card).getByText(/Couldn't load/)).toBeTruthy();
    expect(within(card).queryByText("0")).toBeNull();
  });

  it("PMP sin equipos reportando explica que es opt-in en vez de una fila de ceros", () => {
    render(<PatchManagementCard results={{ patchSummary: ok({ summary: { devicesReporting: 0 } }) }} />);

    expect(screen.getByText(/opt-in: enable it in Agent Settings/)).toBeTruthy();
  });

  it("PMP con datos: equipos con actualizaciones y parches críticos + importantes", () => {
    render(
      <PatchManagementCard
        results={{
          patchSummary: ok({
            summary: {
              devicesReporting: 10,
              statusBreakdown: { updates_available: 4, reboot_required: 1, healthy: 5 },
              severityBreakdown: { critical: 2, important: 7 },
            },
          }),
        }}
      />
    );

    expect(screen.getByText("10 devices reporting")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
  });

  it("Software Delivery calcula la tasa de éxito de los 30 días y cuenta lo que queda en cola", () => {
    render(
      <SoftwareDeliveryCard
        results={{
          sdpTimeseries: ok({ buckets: [{ bucket: "a", succeeded: 9, failed: 1 }, { bucket: "b", succeeded: 10, failed: 0 }] }),
          sdpRunning: ok({ items: [{}, {}] }),
          sdpQueued: ok({ items: [{}] }),
        }}
      />
    );

    expect(screen.getByText("95%")).toBeTruthy();
    expect(screen.getByText("Deployments queued").parentElement.parentElement.textContent).toMatch(/1$/);
  });

  it("⭐ Software Delivery sin fila 'running' (la KPI de arriba ya la cuenta) ni enlace al pie: la card entera navega", () => {
    const onNavigate = vi.fn();
    render(
      <SoftwareDeliveryCard
        onNavigate={onNavigate}
        results={{
          sdpTimeseries: ok({ buckets: [{ bucket: "a", succeeded: 3, failed: 0 }] }),
          sdpRunning: ok({ items: [{}] }),
          sdpQueued: ok({ items: [] }),
        }}
      />
    );

    expect(screen.queryByText("Deployments running")).toBeNull();
    expect(screen.queryByText(/Software Delivery →/)).toBeNull();
    const card = screen.getByRole("button", { name: "Software delivery" });
    // El subtítulo va en la fila del título, no debajo.
    expect(screen.getByText("Software delivery").parentElement).toBe(
      screen.getByText("Installs over the last 30 days").parentElement
    );

    fireEvent.click(card);
    expect(onNavigate).toHaveBeenCalledWith("software-delivery");
  });

  it("⚠️ Reports sin acceso a programaciones (403) no dice '0 schedules'", () => {
    render(
      <ReportsCard
        results={{
          reportRuns: ok({ total: 5, runs: [{ key: "global.fleet-health", outcome: "ok", occurredAt: "2026-09-10T10:00:00Z" }] }),
          reportSchedules: failed,
        }}
      />
    );

    expect(screen.getByText("Reports generated")).toBeTruthy();
    expect(screen.queryByText("Active schedules")).toBeNull();
  });

  it("CDP pone caducado-con-clave delante y avisa de los que caducan", () => {
    render(
      <CryptoDiscoveryCard
        results={{ cdpSummary: ok({ summary: { devicesReporting: 3, totalCerts: 40, expiredWithKey: 2, expiring30d: 6, expiring7d: 1 } }) }}
      />
    );

    const labels = screen.getAllByText(/Expired, with private key|Expiring in 30 days/).map((n) => n.textContent);
    expect(labels).toEqual(["Expired, with private key", "Expiring in 30 days"]);
  });
});
