// src/components/software-delivery/InstallActivitySection.test.jsx
//
// Los dos paneles de esta sección se pintan UNO AL LADO DEL OTRO bajo la lista
// de despliegues, y hasta el 25-sep sólo uno obedecía al filtro.
//
// 🔴 EL SÍNTOMA EXACTO, medido en producción: con `Status = Failed` la
// izquierda decía «14 installs · 5 succeeded · 9 failed» y la derecha «13
// installs · Failed 13 · 100%». Ninguna estaba mal por dentro. Juntas eran una
// contradicción sobre un filtro que el operador acababa de poner.
//
// ⚠️ LO QUE SE FIJA AQUÍ ES QUE EL FILTRO LLEGUE A LA PETICIÓN. Comprobar sólo
// los números pintados no habría distinguido «el panel filtra» de «hoy no hay
// datos que se noten»: el doble tiene que ver el parámetro.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { calendarScope } from "./InstallActivitySection";

const calls = [];

vi.mock("../../api/softwareDelivery", () => ({
  getDeploymentTimeseries: (window, status) => {
    calls.push({ window, status });
    return Promise.resolve({ ok: true, buckets: [] });
  },
}));

import InstallActivitySection from "./InstallActivitySection";

afterEach(() => {
  cleanup();
  calls.length = 0;
});

describe("calendarScope", () => {
  it("sin filtro describe la ventana y nada más", () => {
    expect(calendarScope("all")).toMatch(/one square per day/i);
    expect(calendarScope(null)).toMatch(/one square per day/i);
  });

  it("🔴 con filtro DICE de qué despliegues son esas instalaciones", () => {
    // El calendario y el desglose no comparten ventana a propósito, así que
    // sus totales pueden diferir. Lo que no puede es no decirse.
    expect(calendarScope("failed")).toMatch(/failed deployments/i);
  });
});

describe("InstallActivitySection", () => {
  it("🔴 el filtro de la lista VIAJA a la serie temporal", async () => {
    render(<InstallActivitySection deployments={[]} status="failed" />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls.at(-1)).toEqual({ window: "30d", status: "failed" });
  });

  it("⚠️ «all» NO se manda como estado: es la ausencia de filtro", async () => {
    // Mandar `status=all` haría que el backend buscara un despliegue en estado
    // «all», que no existe, y el calendario saldría vacío siempre.
    render(<InstallActivitySection deployments={[]} status="all" />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls.at(-1)).toEqual({ window: "30d", status: null });
  });

  it("⚠️ cambiar de filtro vuelve a pedir la serie", async () => {
    // Sin `status` en las dependencias del efecto el panel se quedaría con los
    // datos del filtro anterior: el fallo original, sólo que más difícil de ver.
    const { rerender } = render(<InstallActivitySection deployments={[]} status="all" />);
    await waitFor(() => expect(calls.length).toBe(1));

    rerender(<InstallActivitySection deployments={[]} status="cancelled" />);
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls.at(-1).status).toBe("cancelled");
  });

  it("el vacío también se explica con el filtro puesto", async () => {
    render(<InstallActivitySection deployments={[]} status="failed" />);
    expect(await screen.findByText(/No installs from failed deployments/i)).toBeInTheDocument();
  });
});
