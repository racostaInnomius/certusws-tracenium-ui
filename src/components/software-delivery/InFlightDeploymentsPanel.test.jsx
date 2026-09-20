// src/components/software-delivery/InFlightDeploymentsPanel.test.jsx
//
// El bloque de «lo que está pasando ahora».
//
// Los dos fallos que cierra son los que ya vimos en campo: un despliegue
// retenido que no decía por qué (el #44 de T111 estuvo horas en `scheduled` y
// sólo se podía leer como «se colgó»), y un reparto de equipos que no cuadra
// porque los cancelados se cuelan como pendientes.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InFlightDeploymentsPanel, {
  deviceFunnel,
  inFlightDeployments,
  waitingReason,
} from "./InFlightDeploymentsPanel";

afterEach(cleanup);

const deployment = (over = {}) => ({
  id: 44,
  status: "running",
  mode: "install",
  scheduledAt: null,
  packageSnapshot: { name: "Microsoft Edge", version: "152.0.4191.66" },
  counts: { pending: 1, running: 1, success: 1 },
  ...over,
});

const formatTime = () => "Sep 18, 26, 22:00";

describe("deviceFunnel", () => {
  it("⭐ agrupa los desenlaces como los lee un operador", () => {
    expect(
      deviceFunnel({ success: 2, already_installed: 1, reboot_required: 1, failed: 1, timed_out: 1, running: 2, pending: 3 })
    ).toMatchObject({ done: 4, failed: 2, running: 2, pending: 3, total: 11, settled: 6 });
  });

  it("⚠️ los cancelados NO cuentan para la barra", () => {
    // Si contaran como pendientes, la barra nunca llegaría al final y el
    // despliegue parecería atascado para siempre.
    const f = deviceFunnel({ success: 2, cancelled: 3 });
    expect(f.total).toBe(2);
    expect(f.settled).toBe(2);
    expect(f.cancelled).toBe(3);
  });

  it("sin recuentos no inventa equipos", () => {
    expect(deviceFunnel(undefined)).toMatchObject({ total: 0, settled: 0, done: 0 });
  });
});

describe("waitingReason", () => {
  it("⭐ un despliegue retenido dice POR QUÉ y HASTA CUÁNDO", () => {
    expect(waitingReason(deployment({ status: "scheduled", scheduledAt: "2026-09-19T03:00:00Z" }), formatTime))
      .toBe("Waiting for the maintenance window — dispatches Sep 18, 26, 22:00");
  });

  it("retenido sin hora sigue explicando la causa", () => {
    expect(waitingReason(deployment({ status: "scheduled", scheduledAt: null }), formatTime))
      .toBe("Waiting for the maintenance window to open");
  });

  it("lo que se está moviendo no necesita excusa", () => {
    expect(waitingReason(deployment({ status: "running" }), formatTime)).toBeNull();
    expect(waitingReason(deployment({ status: "queued" }), formatTime)).toBeNull();
  });
});

describe("inFlightDeployments", () => {
  it("se queda con lo que sigue en vuelo y pone delante lo que se mueve", () => {
    const rows = inFlightDeployments([
      deployment({ id: 1, status: "completed" }),
      deployment({ id: 2, status: "scheduled" }),
      deployment({ id: 3, status: "running" }),
      deployment({ id: 4, status: "queued" }),
      deployment({ id: 5, status: "cancelled" }),
    ]);
    expect(rows.map((d) => d.id)).toEqual([3, 4, 2]);
  });
});

describe("InFlightDeploymentsPanel", () => {
  it("⭐ enseña el reparto por equipo de cada despliegue vivo", async () => {
    render(<InFlightDeploymentsPanel deployments={[deployment()]} formatTime={formatTime} />);

    expect(await screen.findByText("#44 · Microsoft Edge 152.0.4191.66")).toBeInTheDocument();
    expect(screen.getByText("1/3 reported")).toBeInTheDocument();
    expect(screen.getByText("1 done")).toBeInTheDocument();
    expect(screen.getByText("1 not started")).toBeInTheDocument();
  });

  it("⚠️ el retenido explica la espera en la propia fila", async () => {
    render(
      <InFlightDeploymentsPanel
        deployments={[deployment({ status: "scheduled", scheduledAt: "2026-09-19T03:00:00Z", counts: { pending: 3 } })]}
        formatTime={formatTime}
      />
    );
    expect(await screen.findByText(/Waiting for the maintenance window — dispatches/)).toBeInTheDocument();
  });

  it("⚠️ sin nada en vuelo el panel NO se pinta", () => {
    // Una tarjeta «0 en vuelo» es el hueco que hacía sentir vacía la página:
    // el estado normal es que no haya nada corriendo, y eso ya lo dice la
    // franja de arriba en una línea.
    const { container } = render(
      <InFlightDeploymentsPanel deployments={[deployment({ status: "completed" })]} formatTime={formatTime} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("una desinstalación se marca, y no finge una versión de catálogo", async () => {
    render(
      <InFlightDeploymentsPanel
        deployments={[
          deployment({
            mode: "uninstall",
            packageSnapshot: { name: "Dropbox", uninstallIdentity: { displayNameLike: "Dropbox" } },
          }),
        ]}
        formatTime={formatTime}
      />
    );
    expect(await screen.findByText("#44 · Dropbox")).toBeInTheDocument();
    expect(screen.getByText("uninstall")).toBeInTheDocument();
  });

  it("la fila abre ESE despliegue, con teclado", async () => {
    const onOpenDeployment = vi.fn();
    render(
      <InFlightDeploymentsPanel
        deployments={[deployment()]}
        formatTime={formatTime}
        onOpenDeployment={onOpenDeployment}
      />
    );
    const row = await screen.findByRole("button", { name: /Deployment 44: 1 of 3 devices reported/i });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpenDeployment).toHaveBeenCalledWith(expect.objectContaining({ id: 44 }));
  });
});
