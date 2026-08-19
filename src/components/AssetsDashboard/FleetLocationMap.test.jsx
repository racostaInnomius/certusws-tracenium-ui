// El mapa de flota tiene tres estados vacíos que NO significan lo mismo, y
// confundirlos fue el bug real: un backend sin desplegar se veía igual que una
// flota que no reporta nada.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

// Este proyecto no configura cleanup global de testing-library, asi que sin
// esto los renders se acumulan y las consultas encuentran elementos de tests
// anteriores.
afterEach(cleanup);

// Leaflet necesita un DOM con APIs que jsdom no trae completas; el mapa en sí
// no es lo que se prueba aquí, sino qué mensaje se elige.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  useMap: () => ({
    fitBounds: vi.fn(),
    setView: vi.fn(),
    addLayer: (g) => added.markers.push(g),
    removeLayer: (g) => added.removed.push(g),
  }),
}));
// Leaflet falso que REGISTRA lo que se le agrega, para poder contar capas.
// El bug de campo fue precisamente un conteo: el badge decía el doble.
const added = { markers: [], groups: [], removed: [] };
const clusterHandlers = {};
vi.mock("leaflet", () => ({
  default: {
    divIcon: (o) => o,
    marker: (latlng, opts) => ({ latlng, opts, bindPopup: vi.fn() }),
    circle: () => ({ addTo: vi.fn() }),
    markerClusterGroup: (opts) => {
      const layers = [];
      const group = {
        opts,
        layers,
        addLayer: (m) => layers.push(m),
        on: (evt, fn) => { clusterHandlers[evt] = fn; },
        getAllChildMarkers: () => layers,
      };
      added.groups.push(group);
      return group;
    },
  },
}));
vi.mock("leaflet.markercluster", () => ({}));
vi.mock("leaflet.markercluster/dist/MarkerCluster.css", () => ({}));

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

describe("FleetLocationMap — agrupación", () => {
  const two = [
    { agentId: "a1", hostname: "MB-Rodrigo", lat: 19.364695, lon: -99.161331, source: "gps", osPlatform: "macos" },
    { agentId: "a2", hostname: "W11_JPR_LAB", lat: 19.364564, lon: -99.161465, source: "gps", osPlatform: "windows" },
  ];

  beforeEach(() => {
    added.markers.length = 0;
    added.groups.length = 0;
    added.removed.length = 0;
    for (const k of Object.keys(clusterHandlers)) delete clusterHandlers[k];
  });

  it("crea EXACTAMENTE un marcador por equipo", () => {
    // El bug de campo: el badge contaba el doble porque el wrapper de React
    // construía sus propias capas además de las que React montaba. Con 1 equipo
    // decía 2; con 2, decía 4.
    render(<FleetLocationMap devices={two} />);
    expect(added.groups).toHaveLength(1);
    expect(added.groups[0].layers).toHaveLength(2);
  });

  it("un solo equipo produce un solo marcador", () => {
    render(<FleetLocationMap devices={[two[0]]} />);
    expect(added.groups[0].layers).toHaveLength(1);
  });

  it("cada marcador lleva SU device encima", () => {
    // Sin esto, pulsar el badge no puede decir de quiénes se trata — que fue
    // el segundo síntoma reportado.
    render(<FleetLocationMap devices={two} />);
    const ids = added.groups[0].layers.map((m) => m.__device?.agentId);
    expect(ids).toEqual(["a1", "a2"]);
  });

  it("al pulsar el badge se resuelven los equipos de ese grupo", () => {
    render(<FleetLocationMap devices={two} />);
    const group = added.groups[0];
    // El evento viene de Leaflet, fuera del ciclo de React, así que el
    // setState no se refleja sin act().
    act(() => clusterHandlers.clusterclick({ layer: group }));
    expect(screen.getByText(/2 devices at this location/i)).toBeInTheDocument();
    expect(screen.getByText("MB-Rodrigo")).toBeInTheDocument();
    expect(screen.getByText("W11_JPR_LAB")).toBeInTheDocument();
  });

  it("retira el grupo al desmontar, para no dejar una segunda copia", () => {
    const { unmount } = render(<FleetLocationMap devices={two} />);
    unmount();
    expect(added.removed).toHaveLength(1);
  });

  it("sigue distinguiendo el origen de cada pin en la leyenda", () => {
    render(<FleetLocationMap devices={two} />);
    expect(screen.getByText("2 device-reported")).toBeInTheDocument();
    expect(screen.getByText("0 by site")).toBeInTheDocument();
  });
});
