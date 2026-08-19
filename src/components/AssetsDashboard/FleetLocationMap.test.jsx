// El mapa de flota tiene tres estados vacíos que NO significan lo mismo, y
// confundirlos fue el bug real: un backend sin desplegar se veía igual que una
// flota que no reporta nada.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Leaflet necesita un DOM con APIs que jsdom no trae completas; el mapa en sí
// no es lo que se prueba aquí, sino qué mensaje se elige.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }) => <div>{children}</div>,
  Circle: () => null,
  Popup: ({ children }) => <div>{children}</div>,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn() }),
}));
vi.mock("leaflet", () => ({ default: { divIcon: () => ({}) } }));

import FleetLocationMap from "./FleetLocationMap";

describe("FleetLocationMap — estados vacíos", () => {
  it("un fallo de carga NO se reporta como flota sin posiciones", () => {
    // El bug: .catch() ponía {devices: []} y el mapa afirmaba que ningún equipo
    // reporta posición. Si no pudimos preguntar, no nos toca afirmarlo.
    render(<FleetLocationMap devices={[]} loadError="failed" />);
    expect(screen.getByText(/could not load device positions/i)).toBeInTheDocument();
    expect(screen.queryByText(/no device is reporting/i)).not.toBeInTheDocument();
  });

  it("un endpoint ausente dice que falta desplegar, no que no hay datos", () => {
    render(<FleetLocationMap devices={[]} loadError="unavailable" />);
    expect(screen.getByText(/does not expose the fleet positions endpoint/i)).toBeInTheDocument();
  });

  it("sin error y sin pines, sí afirma que nadie reporta", () => {
    render(<FleetLocationMap devices={[]} withoutPosition={14} />);
    expect(screen.getByText(/no device is reporting a position yet/i)).toBeInTheDocument();
  });

  it("con pines, pinta el mapa y el conteo de los que faltan", () => {
    render(
      <FleetLocationMap
        devices={[{ agentId: "a1", hostname: "MB-Rodrigo", lat: 19.36, lon: -99.16, source: "gps" }]}
        withoutPosition={14}
      />
    );
    expect(screen.getByTestId("map")).toBeInTheDocument();
    expect(screen.getByText(/14 devices without a position/i)).toBeInTheDocument();
  });
});
