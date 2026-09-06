// src/components/software-delivery/IntakeReviewDrawer.test.jsx
//
// Fase 3: "AI Intake" deja de ser una pestaña y la cola de revisión pasa a
// colgar del catálogo.
//
// Lo que estas pruebas fijan no es el aspecto del cajón, sino las dos cosas
// que un movimiento así rompe en silencio: que la puerta duplicada NO viaje
// con él, y que aprobar avise al catálogo de detrás.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import IntakeReviewDrawer from "./IntakeReviewDrawer";
import * as sdpApi from "../../api/softwareDelivery";

vi.mock("../../api/softwareDelivery");

const PENDING = {
  id: 7,
  filename: "winzip.exe",
  sha256: "a".repeat(64),
  status: "pending_review",
  verdict: "warn",
  verification: { verdict: "warn", reasons: ["unsigned"] },
  facts: { platform: "windows", format: "exe", name: "WinZip", version: "27.0" },
  createdAt: "2026-09-01T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  sdpApi.listIntakes.mockResolvedValue({ items: [PENDING] });
});
afterEach(cleanup);

function open(props = {}) {
  return render(
    <IntakeReviewDrawer
      open
      onClose={vi.fn()}
      canManage
      notify={vi.fn()}
      onChanged={vi.fn()}
      {...props}
    />
  );
}

describe("IntakeReviewDrawer · la cola vive fuera de la barra de pestañas", () => {
  it("lista lo que espera revisión", async () => {
    open();
    expect(await screen.findByText("winzip.exe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^review$/i })).toBeInTheDocument();
  });

  // ⚠️ LA PUERTA DUPLICADA NO VIAJA CON LA COLA.
  //
  // La pestaña traía su propio botón "Upload installer" y su propio diálogo,
  // duplicando lo que la fase 2 había unificado en el catálogo. Mover la
  // pestaña conservando su botón habría dejado otra vez dos puertas — que es
  // el problema que las fases 2 y 3 existen para cerrar.
  it("NO ofrece subir un instalador: esa puerta es del catálogo", async () => {
    open();
    await screen.findByText("winzip.exe");

    expect(screen.queryByRole("button", { name: /upload installer/i })).toBeNull();
    expect(screen.queryByText(/choose file/i)).toBeNull();
  });

  // El estado vacío tiene que nombrar la puerta que EXISTE. El catálogo ya
  // falló así una vez: su vacío mandaba a un botón renombrado.
  it("cuando no hay nada, apunta al botón real del catálogo", async () => {
    sdpApi.listIntakes.mockResolvedValue({ items: [] });
    open();
    expect(await screen.findByText(/add package/i)).toBeInTheDocument();
  });

  it("no ofrece acciones a un operador de sólo lectura", async () => {
    open({ canManage: false });
    await screen.findByText("winzip.exe");
    expect(screen.queryByRole("button", { name: /^review$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^reject$/i })).toBeNull();
  });
});

describe("IntakeReviewDrawer · avisa al catálogo de detrás", () => {
  // ⚠️ Aprobar CREA un paquete y rechazar cambia la cola. Sin el aviso, el
  // catálogo que está debajo del cajón sigue mostrando una lista a la que le
  // falta justo lo que acabas de publicar — y el contador del banner tampoco
  // se entera.
  it("llama a onChanged tras rechazar", async () => {
    const onChanged = vi.fn();
    sdpApi.rejectIntake.mockResolvedValue({ ok: true });
    open({ onChanged });
    await screen.findByText("winzip.exe");

    await userEvent.click(screen.getByRole("button", { name: /^reject$/i }));

    await waitFor(() => expect(sdpApi.rejectIntake).toHaveBeenCalledWith(7));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("no avisa cuando la acción falló", async () => {
    const onChanged = vi.fn();
    sdpApi.rejectIntake.mockRejectedValue(new Error("boom"));
    open({ onChanged });
    await screen.findByText("winzip.exe");

    await userEvent.click(screen.getByRole("button", { name: /^reject$/i }));

    await waitFor(() => expect(sdpApi.rejectIntake).toHaveBeenCalled());
    expect(onChanged).not.toHaveBeenCalled();
  });

  // Cerrado no debe pedir la cola: el cajón vive junto al catálogo y cargarla
  // en cada render de la página sería trabajo que nadie mira.
  it("sólo carga la cola cuando está abierto", () => {
    render(<IntakeReviewDrawer open={false} onClose={vi.fn()} canManage notify={vi.fn()} />);
    expect(sdpApi.listIntakes).not.toHaveBeenCalled();
  });
});
