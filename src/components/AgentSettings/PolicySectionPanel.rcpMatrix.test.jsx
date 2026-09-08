// src/components/AgentSettings/PolicySectionPanel.rcpMatrix.test.jsx
//
// ⚠️ Dónde se configura el vistobueno, y dónde NO.
//
// La matriz vivía en la pestaña Access de Remote Control, al lado de la cola
// de aprobaciones. El 2026-09-07 pasó lo que tenía que pasar: a un operador
// el gate le frenó una shell, y en la MISMA pantalla tenía el interruptor
// para apagarlo. Lo apagó — que es lo razonable cuando estás bloqueado y
// llevas prisa.
//
// Un control que existe para obligar a que intervenga una segunda persona no
// puede estar desactivable por la primera sin salir de donde está esperando.
// Vive en los ajustes del agente, adonde hay que ir a propósito.
//
// Los dos tests que importan son de AUSENCIA: que no vuelva a aparecer
// donde estaba, y que no aparezca editando el parche de un equipo.

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const getAccessPolicy = vi.fn(async () => ({
  ok: true,
  items: [
    { capability: "rcp.shell", deviceClass: "server", requiresApproval: true, jitMinutes: 60 }
  ],
  approvers: { eligible: 2, canApprove: true }
}));
vi.mock("../../api/remoteControl", () => ({
  getAccessPolicy: (...a) => getAccessPolicy(...a),
  setAccessPolicyCell: vi.fn(async () => ({ ok: true })),
  listAccessRequests: vi.fn(async () => ({ ok: true, items: [] }))
}));

import PolicySectionPanel from "./PolicySectionPanel";
import AccessTab from "../RemoteControl/AccessTab";

const RCP = { id: "rcp", label: "Remote Control", description: "Sesiones remotas." };

function renderPanel(over = {}) {
  return render(
    <PolicySectionPanel
      section={RCP}
      form={{ plugins: { enabled: ["rcp"] }, features: {} }}
      onChange={vi.fn()}
      scope="tenant"
      {...over}
    />
  );
}

const matrixTitle = () => screen.queryByText("Privileged access policy");

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("la matriz de vistobueno vive en los ajustes", () => {
  it("aparece en la sección Remote Control, en ámbito tenant", async () => {
    renderPanel();
    await waitFor(() => expect(matrixTitle()).toBeInTheDocument());
  });

  it("⚠️ NO aparece editando el parche de un equipo", async () => {
    // La matriz es del tenant entero. Enseñarla mientras se edita el override
    // de una máquina diría que es suya, y apagar ahí una celda apagaría el
    // gate para toda la flota creyendo tocar un equipo.
    renderPanel({ scope: "device", deviceLabel: "SRV-DC01" });
    await new Promise((r) => setTimeout(r, 0));
    expect(matrixTitle()).not.toBeInTheDocument();
    expect(getAccessPolicy).not.toHaveBeenCalled();
  });

  it("tampoco en solo lectura", async () => {
    // Mirar una versión anterior de la política no es configurar el gate.
    renderPanel({ readOnly: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(matrixTitle()).not.toBeInTheDocument();
  });

  it("ni en la sección de otro plugin", async () => {
    renderPanel({ section: { id: "amp", label: "Asset Management", description: "Inventario." } });
    await new Promise((r) => setTimeout(r, 0));
    expect(matrixTitle()).not.toBeInTheDocument();
  });
});

describe("⚠️ y ya NO vive en la pestaña Access de Remote Control", () => {
  it("la pestaña se queda con la evidencia, sin el interruptor", async () => {
    // Este es el test que impide que vuelva: quien reintroduzca la matriz
    // aquí lo verá en rojo, con el motivo en la cabecera del fichero.
    render(<AccessTab />);
    await new Promise((r) => setTimeout(r, 0));

    expect(matrixTitle()).not.toBeInTheDocument();
    expect(getAccessPolicy).not.toHaveBeenCalled();
  });
});
