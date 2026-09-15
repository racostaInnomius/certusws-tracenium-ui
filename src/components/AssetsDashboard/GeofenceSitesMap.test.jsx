// El mapa de geocercas: qué le pide a Leaflet. Mismo patrón que
// DeviceLocationHistoryMap.test.jsx — se afirman las decisiones, no el dibujo.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(cleanup);

const leaflet = { bounds: [] };

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position, icon, eventHandlers, children }) => (
    <button
      type="button"
      data-testid="marker"
      data-pos={position.join(",")}
      data-html={icon?.html ?? ""}
      onClick={eventHandlers?.click}
    >
      {children}
    </button>
  ),
  Tooltip: ({ children }) => <span>{children}</span>,
  Circle: ({ radius, pathOptions }) => (
    <div data-testid="circle" data-radius={radius} data-dash={pathOptions?.dashArray || ""} />
  ),
  useMap: () => ({ fitBounds: (b) => leaflet.bounds.push(b) }),
}));
vi.mock("leaflet", () => ({ default: { divIcon: (o) => o } }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import GeofenceSitesMap from "./GeofenceSitesMap";

const sitios = [
  { id: "a", siteName: "HQ", lat: 19.3, lon: -99.2, radiusM: 400, geofenceStatus: "monitoring" },
  { id: "b", siteName: "Warehouse", lat: 19.4, lon: -99.1, radiusM: 300, geofenceStatus: "off" },
  { id: "c", siteName: "Cowork", lat: 19.5, lon: -99.0, radiusM: null, geofenceStatus: "off" },
  { id: "d", siteName: "No pin", lat: null, lon: null, radiusM: 500, geofenceStatus: "off" },
];

describe("GeofenceSitesMap", () => {
  it("un pin por sitio con coordenadas, y círculo sólo donde hay radio guardado", () => {
    render(<GeofenceSitesMap sites={sitios} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(3);
    const circulos = screen.getAllByTestId("circle");
    expect(circulos.map((c) => c.dataset.radius)).toEqual(["400", "300"]);
    // La cerca apagada conserva el contorno, discontinuo.
    expect(circulos.map((c) => c.dataset.dash)).toEqual(["", "6 6"]);
    expect(screen.getByText("Cowork · no radius · off")).toBeInTheDocument();
  });

  it("encuadra los sitios y avisa qué pin se pulsó", () => {
    const onSelect = vi.fn();
    leaflet.bounds = [];
    render(<GeofenceSitesMap sites={sitios} onSelect={onSelect} />);
    expect(leaflet.bounds).toHaveLength(1);
    fireEvent.click(screen.getAllByTestId("marker")[1]);
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("sin ningún pin no pinta un mapa vacío", () => {
    render(<GeofenceSitesMap sites={[sitios[3]]} />);
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });
});
