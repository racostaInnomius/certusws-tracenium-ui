// El mapa del historial: qué le pide a Leaflet y, sobre todo, qué NO le pide.
//
// Leaflet necesita APIs de DOM que jsdom no trae completas, así que se simula y
// se afirma sobre las decisiones del componente — el mismo patrón que
// FleetLocationMap.test.jsx, y por la misma razón: lo que puede romperse aquí
// son las decisiones, no el dibujo.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

afterEach(cleanup);

const leaflet = { polylines: 0, bounds: [] };

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position, icon, eventHandlers }) => (
    <button
      type="button"
      data-testid="marker"
      data-pos={position.join(",")}
      data-html={icon?.html ?? ""}
      onClick={eventHandlers?.click}
    />
  ),
  Circle: ({ center, radius }) => (
    <div data-testid="circle" data-pos={center.join(",")} data-radius={radius} />
  ),
  useMap: () => ({
    setView: vi.fn(),
    fitBounds: (b) => leaflet.bounds.push(b),
  }),
}));

vi.mock("leaflet", () => ({
  default: {
    divIcon: (o) => o,
    latLngBounds: (pts) => pts,
    // Si alguien añade un recorrido, este contador lo delata.
    polyline: () => {
      leaflet.polylines += 1;
      return { addTo: vi.fn() };
    },
  },
}));

vi.mock("leaflet/dist/leaflet.css", () => ({}));

import DeviceLocationHistoryMap from "./DeviceLocationHistoryMap";

const entrada = (over = {}) => ({
  id: "geo:a",
  label: "Casa",
  labelKind: "site",
  lat: 19.3197,
  lon: -99.2422,
  accuracyM: 35,
  hitCount: 5,
  mappable: true,
  ...over,
});

describe("DeviceLocationHistoryMap", () => {
  it("pinta un marcador por cada posición ploteable", () => {
    render(
      <DeviceLocationHistoryMap
        entries={[
          entrada(),
          entrada({ id: "geo:b", lat: 19.4068, lon: -99.1672 }),
        ]}
      />
    );
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
  });

  it("⚠️ no plotea las filas sin coordenadas, y lo DICE", () => {
    // El mapa es siempre un subconjunto: subnet y public_ip no tienen posición.
    // Un mapa con 1 pin de 3 posiciones se lee como el historial completo si
    // nadie declara la cobertura.
    render(
      <DeviceLocationHistoryMap
        entries={[
          entrada(),
          { id: "subnet:x", label: "10.0.0.0/24", mappable: false, hitCount: 3 },
          { id: "city:us", label: "—", mappable: false, hitCount: 1 },
        ]}
      />
    );
    expect(screen.getAllByTestId("marker")).toHaveLength(1);
    expect(screen.getByText("1 of 3 positions mappable")).toBeInTheDocument();
    expect(
      screen.getByText(/derived from the network range, which has no coordinates/i)
    ).toBeInTheDocument();
  });

  it("cuando están todas, no insinúa que falte algo", () => {
    render(<DeviceLocationHistoryMap entries={[entrada(), entrada({ id: "geo:b" })]} />);
    expect(screen.getByText("2 positions")).toBeInTheDocument();
  });

  it("⚠️ NUNCA dibuja una línea de recorrido", () => {
    // Es lo primero que pide el ojo y lo que los datos no soportan: los rangos
    // firstSeen→lastSeen SE SOLAPAN entre filas, así que unir pines
    // consecutivos dibujaría un viaje que nunca ocurrió, con la autoridad
    // visual de un GPS de verdad.
    leaflet.polylines = 0;
    render(
      <DeviceLocationHistoryMap
        entries={[
          entrada(),
          entrada({ id: "geo:b", lat: 19.4068, lon: -99.1672 }),
          entrada({ id: "geo:c", lat: 19.5, lon: -99.3 }),
        ]}
      />
    );
    expect(leaflet.polylines).toBe(0);
  });

  it("el círculo de precisión es SÓLO el de la seleccionada", () => {
    // Diez círculos de entre 23 y 500 m son una mancha, y una mancha sugiere
    // una certidumbre que no tenemos.
    const { rerender } = render(
      <DeviceLocationHistoryMap
        entries={[entrada(), entrada({ id: "geo:b", lat: 19.4068, lon: -99.1672, accuracyM: 120 })]}
      />
    );
    expect(screen.queryByTestId("circle")).not.toBeInTheDocument();

    rerender(
      <DeviceLocationHistoryMap
        entries={[entrada(), entrada({ id: "geo:b", lat: 19.4068, lon: -99.1672, accuracyM: 120 })]}
        selectedId="geo:b"
      />
    );
    const circulos = screen.getAllByTestId("circle");
    expect(circulos).toHaveLength(1);
    expect(circulos[0].dataset.radius).toBe("120");
  });

  it("no inventa un círculo cuando la lectura no declaró precisión", () => {
    render(
      <DeviceLocationHistoryMap
        entries={[entrada({ accuracyM: null })]}
        selectedId="geo:a"
      />
    );
    expect(screen.queryByTestId("circle")).not.toBeInTheDocument();
  });

  it("encuadra TODAS las posiciones, no sólo la seleccionada", () => {
    leaflet.bounds = [];
    render(
      <DeviceLocationHistoryMap
        entries={[entrada(), entrada({ id: "geo:b", lat: 19.4068, lon: -99.1672 })]}
        selectedId="geo:a"
      />
    );
    expect(leaflet.bounds[0]).toHaveLength(2);
  });

  it("hacer clic en un pin lo selecciona, y volver a hacerlo lo suelta", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <DeviceLocationHistoryMap entries={[entrada()]} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByTestId("marker"));
    expect(onSelect).toHaveBeenCalledWith("geo:a");

    rerender(<DeviceLocationHistoryMap entries={[entrada()]} selectedId="geo:a" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("marker"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("la más reciente se distingue de las anteriores", () => {
    // La lista llega ordenada por lastSeenAt DESC: la primera ploteable es la
    // más nueva. Va rellena; las anteriores huecas — el mismo vocabulario que
    // DeviceLocationMap usa para una posición que no se ha refrescado.
    render(
      <DeviceLocationHistoryMap
        entries={[entrada(), entrada({ id: "geo:b", lat: 19.4068, lon: -99.1672 })]}
      />
    );
    const [nueva, vieja] = screen.getAllByTestId("marker");
    expect(nueva.dataset.html).toContain("background:#");
    expect(vieja.dataset.html).toContain("background:transparent");
  });

  it("el pin pesa más cuanto más se ha visto esa posición", () => {
    // El sitio principal se lee de un vistazo sin leer la tabla.
    render(
      <DeviceLocationHistoryMap
        entries={[
          entrada({ id: "geo:a", hitCount: 1 }),
          entrada({ id: "geo:b", lat: 19.4068, lon: -99.1672, hitCount: 200 }),
        ]}
      />
    );
    const [pocos, muchos] = screen.getAllByTestId("marker").map((m) => {
      const match = m.dataset.html.match(/width:(\d+)px/);
      return Number(match[1]);
    });
    expect(muchos).toBeGreaterThan(pocos);
    // Y acotado: un 200 no puede tapar el mapa.
    expect(muchos).toBeLessThanOrEqual(22);
  });

  it("sin nada que plotear no se pinta nada", () => {
    expect(
      render(<DeviceLocationHistoryMap entries={[{ id: "a", mappable: false }]} />).container
    ).toBeEmptyDOMElement();
    cleanup();
    expect(render(<DeviceLocationHistoryMap entries={[]} />).container).toBeEmptyDOMElement();
  });
});
