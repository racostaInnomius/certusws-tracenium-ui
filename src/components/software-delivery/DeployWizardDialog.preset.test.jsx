// DeployWizardDialog.preset.test.jsx
//
// Abrir el wizard con los equipos YA elegidos.
//
// Es lo que convierte «29 por detrás» en un despliegue: el operador pulsa el
// tramo de la gráfica, ve los 29 y desde ahí manda el paquete. La selección
// entra por `preset`.
//
// ⚠️ LO QUE SE FIJA AQUÍ ES QUE RELLENE, NO QUE SALTE. El wizard sigue pidiendo
// las mismas decisiones (anillos, ventana, hora) y sigue enseñando la revisión
// antes de disparar. Un atajo que mandara directo convertiría un clic en una
// gráfica en un despliegue a 29 máquinas.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DeployWizardDialog from "./DeployWizardDialog";
import * as jobsApi from "../../api/jobs";
import * as groupsApi from "../../api/assetGroups";

vi.mock("../../api/jobs");
vi.mock("../../api/assetGroups");

const PKG = { id: 9, name: "Google Chrome", version: "152.0.7977.83", platform: "windows", arch: "x64", format: "msi" };

const PRESET = {
  deviceIds: ["aaaa-1111", "bbbb-2222"],
  hostnames: { "aaaa-1111": "PC-ANA", "bbbb-2222": "PC-BETO" },
};

beforeEach(() => {
  vi.resetAllMocks();
  groupsApi.listAssetGroups.mockResolvedValue({ items: [] });
  jobsApi.listAllKnownDevices.mockResolvedValue({ items: [], total: 0 });
  jobsApi.listKnownDevices.mockResolvedValue({ items: [], total: 0 });
});

afterEach(() => cleanup());

function open(props = {}) {
  return render(
    <DeployWizardDialog
      open
      pkg={PKG}
      onClose={() => {}}
      onConfirm={vi.fn()}
      notify={() => {}}
      {...props}
    />
  );
}

/** El modo de objetivo que trae marcado el paso 1. */
const targetChecked = (name) => screen.getByRole("radio", { name }).checked;

describe("deploy wizard con selección de entrada", () => {
  it("⭐ arranca con la lista de equipos como objetivo, no con un grupo", async () => {
    // Sin preset el wizard arranca en «grupo de activos»; con él, el objetivo
    // ES esa lista, porque el operador ya eligió a quién al pulsar la gráfica.
    open({ preset: PRESET });
    await waitFor(() => expect(groupsApi.listAssetGroups).toHaveBeenCalled());
    expect(targetChecked(/manual device list/i)).toBe(true);
  });

  it("⭐ la revisión enseña los equipos y sus HOSTNAMES, no UUIDs", async () => {
    // El cajón los sabe; sin pasarlos, la última pantalla antes de disparar
    // enseñaría dos UUID y el operador no podría comprobar nada.
    open({ preset: PRESET });
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));

    expect(await screen.findByText(/Device list \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText("PC-ANA")).toBeInTheDocument();
    expect(screen.getByText("PC-BETO")).toBeInTheDocument();
  });

  it("⚠️ NO dispara solo: la revisión sigue en medio", async () => {
    // Un atajo que mandara directo convertiría un clic en una gráfica en un
    // despliegue a 29 máquinas.
    const onConfirm = vi.fn();
    open({ preset: PRESET, onConfirm });
    await waitFor(() => expect(groupsApi.listAssetGroups).toHaveBeenCalled());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("sin selección se comporta como siempre", async () => {
    open();
    await waitFor(() => expect(groupsApi.listAssetGroups).toHaveBeenCalled());
    expect(targetChecked(/asset group/i)).toBe(true);
  });

  it("⚠️ una selección vacía no fuerza el modo de lista", async () => {
    // Abrir en «lista de equipos» con cero equipos dejaría al operador en un
    // paso que no puede completar, sin decirle por qué.
    open({ preset: { deviceIds: [], hostnames: {} } });
    await waitFor(() => expect(groupsApi.listAssetGroups).toHaveBeenCalled());
    expect(targetChecked(/asset group/i)).toBe(true);
  });
});
