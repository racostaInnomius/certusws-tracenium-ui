// La pestaña Location: tres secciones, una sola evidencia.
//
// ⚠️ Lo que se vigila aquí es que las tres secciones NO consulten por su cuenta.
// `listGeofences` devuelve sitios Y transiciones en la misma llamada; pedirlas
// por sección consultaría dos veces lo mismo y dejaría que dos secciones del
// mismo tab discrepasen sobre el estado de una cerca.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LocationWorkbench from "./LocationWorkbench";

const listGeofences = vi.fn();
const saveGeofence = vi.fn();
const getHostLocations = vi.fn();
vi.mock("../../api/geofences", () => ({
  listGeofences: (...a) => listGeofences(...a),
  saveGeofence: (...a) => saveGeofence(...a),
}));
vi.mock("../../api/dashboard", () => ({
  dashboardApi: { getHostLocations: (...a) => getHostLocations(...a) },
}));
vi.mock("../../api/episodes", () => ({
  getDeviceTimeline: vi.fn().mockResolvedValue({ episodes: [], retentionDays: 30 }),
  getSiteAttendance: vi.fn().mockResolvedValue({ episodes: [], deviceCount: 0, retentionDays: 30 }),
}));

const SITIO = {
  id: "4", siteName: "City Towers Black", city: "CDMX", lat: 19.3647, lon: -99.1613,
  radiusM: 250, geofenceStatus: "monitoring", ranges: 1, inside: 1, outside: 1,
  indeterminate: 0, lastEvaluatedAt: "2026-09-09T22:26:56Z", observedAccuracyM: 40,
  observedP90DistanceM: 100, suggestedRadiusM: 250, suggestionReason: "ok",
  observedReadings: 44, radiusTooSmall: false,
};
const EVENTO = {
  id: "1", agentId: "a-2", hostname: "ETE-3X5P8F4", siteName: "City Towers Black",
  fromState: "indeterminate", toState: "outside", method: "coordinates",
  distanceM: 11884, accuracyM: 159, occurredAt: "2026-09-09T22:26:56Z",
};

beforeEach(() => {
  listGeofences.mockReset();
  getHostLocations.mockReset();
  listGeofences.mockResolvedValue({ sites: [SITIO], events: [EVENTO] });
  getHostLocations.mockResolvedValue({ devices: [{ agentId: "a-2", hostname: "ETE-3X5P8F4" }] });
});
afterEach(cleanup);

describe("LocationWorkbench", () => {
  it("ofrece las tres secciones de la misma funcionalidad", async () => {
    render(<LocationWorkbench />);
    for (const s of ["Geofences", "Location history", "Recent transitions"]) {
      expect(await screen.findByRole("tab", { name: s })).toBeInTheDocument();
    }
  });

  it("abre en Geofences", async () => {
    render(<LocationWorkbench />);
    expect(await screen.findByText("City Towers Black")).toBeInTheDocument();
  });

  it("⚠️ las tres secciones comparten UNA sola carga", async () => {
    const user = userEvent.setup();
    render(<LocationWorkbench />);
    await screen.findByText("City Towers Black");
    expect(listGeofences).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("tab", { name: "Recent transitions" }));
    await screen.findByText("ETE-3X5P8F4");
    // Cambiar de sección NO vuelve a preguntar: es el mismo dato.
    expect(listGeofences).toHaveBeenCalledTimes(1);
  });

  it("⚠️ la transición real de T1 no se rotula como una salida", async () => {
    const user = userEvent.setup();
    render(<LocationWorkbench />);
    await screen.findByText("City Towers Black");
    await user.click(screen.getByRole("tab", { name: "Recent transitions" }));

    await screen.findByText("confirmed elsewhere");
    // Se miran las ETIQUETAS, no el texto de la página: la nota de arriba
    // contiene la palabra "left" a propósito, explicando qué significa.
    const etiquetas = [...document.querySelectorAll(".MuiChip-label")].map((c) => c.textContent);
    expect(etiquetas).toContain("confirmed elsewhere");
    expect(etiquetas).not.toContain("left");
  });

  it("los equipos sólo se piden al abrir Location history", async () => {
    const user = userEvent.setup();
    render(<LocationWorkbench />);
    await screen.findByText("City Towers Black");
    expect(getHostLocations).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Location history" }));
    await waitFor(() => expect(getHostLocations).toHaveBeenCalledTimes(1));
  });

  it("⚠️ un fallo de carga no se presenta como un tenant sin cercas", async () => {
    listGeofences.mockRejectedValue(new Error("500"));
    render(<LocationWorkbench />);
    expect(await screen.findByText(/Geofences could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/A geofence is a site with a radius/i)).not.toBeInTheDocument();
  });
});
