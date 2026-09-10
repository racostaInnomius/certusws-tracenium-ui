// DeploymentDetailDrawer.hostname.test.jsx
//
// El detalle de un despliegue rotulaba sus filas con el UUID del equipo. Saber
// CUÁL máquina falló es justo para lo que se abre este cajón, y un UUID no le
// dice nada a nadie: es el mismo bug que ya se arregló en «Tenant Job History».
//
// Los resultados viven en la base de CONTROL y sólo llevan `device_id`; el
// hostname está en la del TENANT, así que hace falta un cruce entre bases —y el
// backend lo hace reutilizando `resolveDeviceHostnames`, que sabe caer a la
// lápida de `device_lifecycle` para los equipos ya purgados.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import DeploymentDetailDrawer from "./DeploymentDetailDrawer";
import * as sdpApi from "../../api/softwareDelivery";
import * as pmApi from "../../api/patchManagement";

vi.mock("../../api/softwareDelivery");
vi.mock("../../api/patchManagement");

const DEPLOYMENT = {
  id: 24,
  status: "completed",
  targetKind: "devices",
  deviceIds: ["d1", "d2"],
  createdAt: "2026-09-09T10:00:00.000Z",
  counts: {},
  packageSnapshot: { name: "7-Zip", version: "23.01", platform: "windows", arch: "x64", format: "msi" },
};

beforeEach(() => {
  vi.resetAllMocks();
  pmApi.listDeploymentSnapshots.mockResolvedValue({ ok: true, data: { snapshots: [] } });
});
afterEach(() => cleanup());

function show(items) {
  sdpApi.listDeploymentResults.mockResolvedValue({ items });
  render(
    <DeploymentDetailDrawer
      open
      deployment={DEPLOYMENT}
      canManage
      notify={() => {}}
      onChanged={() => {}}
      onClose={() => {}}
    />
  );
}

describe("los equipos se nombran, no se enumeran", () => {
  it("rotula la fila con el hostname y no con el UUID", async () => {
    show([
      {
        id: 1,
        deviceId: "7d1162d7-4a1b-4c9e-8f22-3f5b6c7d8e90",
        hostname: "RAV-LAB-HI",
        outcome: "failed",
      },
    ]);

    expect(await screen.findByText("RAV-LAB-HI")).toBeTruthy();
    expect(screen.queryByText("7d1162d7-4a1b-4c9e-8f22-3f5b6c7d8e90")).toBeNull();
  });

  it("⚠️ pero cae al id cuando no hay nombre que resolver", async () => {
    // Un equipo purgado del que tampoco quedó lápida no se puede nombrar. El
    // id es feo pero es la verdad; esconder la fila sería peor, porque su
    // resultado cuenta para el recuento del despliegue.
    show([{ id: 2, deviceId: "abc12345-0000-0000-0000-000000000000", hostname: null, outcome: "success" }]);
    expect(await screen.findByText("abc12345-0000-0000-0000-000000000000")).toBeTruthy();
  });

  it("mezcla ambos sin esconder ninguna fila", async () => {
    show([
      { id: 1, deviceId: "d1", hostname: "T111-VENTAS", outcome: "success" },
      { id: 2, deviceId: "d2-sin-nombre", hostname: null, outcome: "failed" },
    ]);
    expect(await screen.findByText("T111-VENTAS")).toBeTruthy();
    expect(screen.getByText("d2-sin-nombre")).toBeTruthy();
  });

  it("⚠️ el confirm de rollback identifica la VM por hostname", async () => {
    // Ese diálogo descarta TODO lo escrito en la VM desde el snapshot. Pedir
    // que se apruebe algo irreversible sobre una máquina que el operador no
    // puede identificar es la peor versión de este bug.
    // La forma EXACTA que `isRevertable` exige: outcome created, sin limpiar y
    // con moref. Inventarse un `status: "ready"` habría dejado el botón sin
    // renderizar y el test pasando sin comprobar nada.
    pmApi.listDeploymentSnapshots.mockResolvedValue({
      ok: true,
      data: {
        snapshots: [
          { id: 9, deviceId: "d1", outcome: "created", cleanedAt: null, snapshotMoref: "snapshot-42" },
        ],
      },
    });
    show([{ id: 1, deviceId: "d1", hostname: "T111-VENTAS", outcome: "success" }]);

    await waitFor(() => expect(screen.getByText("T111-VENTAS")).toBeTruthy());
    const boton = await screen.findByLabelText(/back to its pre-patch snapshot/);
    expect(boton.getAttribute("aria-label")).toContain("T111-VENTAS");
  });
});
