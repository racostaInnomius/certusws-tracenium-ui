// La línea de tiempo — y sobre todo lo que se niega a afirmar.
//
// ⚠️ Cada estancia tiene DOS relojes: hasta cuándo se CONFIRMÓ al equipo allí,
// y cuándo se supo que ya no estaba. El hueco entre ambos es del tamaño de la
// cadencia de reporte (medido: ~1,1 h en un tenant, ~9,7 h en el más grande) y
// el equipo se fue en algún punto de él. Colapsarlos en "salió a las X" sería
// inventar el dato más caro del expediente, con formato de hecho.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DeviceLocationTimeline from "./DeviceLocationTimeline";
import { placeLabel, departureText } from "./hostHelpers";

afterEach(cleanup);

const ep = (over = {}) => ({
  id: "1",
  siteName: "Mountainside IG",
  subnetCidr: null,
  lat: 26.17178,
  lon: -97.9737,
  accuracyM: 103,
  tickCount: 12,
  firstSeenAt: "2026-09-01T09:20:00Z",
  lastSeenAt: "2026-09-03T17:40:00Z",
  endedAt: "2026-09-04T02:05:00Z",
  ...over,
});

describe("DeviceLocationTimeline", () => {
  it("⚠️ nunca dice 'salió a las X' — dice hasta cuándo se confirmó y antes de cuándo se fue", () => {
    render(<DeviceLocationTimeline episodes={[ep()]} retentionDays={30} />);
    expect(screen.getByText(/^confirmed /i)).toBeInTheDocument();
    expect(screen.getByText(/left before/i)).toBeInTheDocument();
    // Y lo explica una vez arriba, para que no haya que deducirlo de cada fila.
    expect(
      screen.getByText(/gap is the reporting\s+interval, not a measurement/i)
    ).toBeInTheDocument();
  });

  it("una estancia abierta dice que sigue ahí, no que salió", () => {
    render(<DeviceLocationTimeline episodes={[ep({ endedAt: null })]} retentionDays={30} />);
    expect(screen.getByText(/still there/i)).toBeInTheDocument();
    expect(screen.queryByText(/left before/i)).not.toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
  });

  it("declara la retención: no hay historia ilimitada", () => {
    render(<DeviceLocationTimeline episodes={[ep()]} retentionDays={30} />);
    expect(screen.getByText(/kept for 30 days/i)).toBeInTheDocument();
  });

  it("⚠️ sin estancias explica la VENTANA DE TRANSICIÓN, no un hueco", () => {
    // La tabla se escribe desde que la función existe, no hacia atrás. Un panel
    // vacío sin explicación se leería como "este equipo no se ha movido nunca",
    // que es una afirmación y no una ausencia.
    render(<DeviceLocationTimeline episodes={[]} retentionDays={30} fallbackPlaces={4} />);
    const texto = screen.getByText(/No stay recorded for this device yet/i).textContent;
    expect(texto).toMatch(/starts from when this feature was switched on/i);
    // Y dice que la lista de lugares sigue ahí, para que no parezca que se perdió.
    expect(texto).toMatch(/4 known places are still listed/i);
  });

  it("sin lugares que ofrecer, no promete una lista que no existe", () => {
    render(<DeviceLocationTimeline episodes={[]} fallbackPlaces={0} />);
    expect(screen.queryByText(/known places are still listed/i)).not.toBeInTheDocument();
  });

  it("la más reciente sólo es 'current' si sigue abierta", () => {
    render(<DeviceLocationTimeline episodes={[ep(), ep({ id: "2" })]} />);
    expect(screen.queryByText("current")).not.toBeInTheDocument();
  });
});

describe("placeLabel", () => {
  it("sitio declarado, luego red, luego posición", () => {
    expect(placeLabel({ siteName: "Oficina", subnetCidr: "10.0.0.0/24" })).toBe("Oficina");
    expect(placeLabel({ subnetCidr: "10.0.0.0/24", lat: 19.3, lon: -99.2 })).toBe("10.0.0.0/24");
    expect(placeLabel({ lat: 19.31974, lon: -99.24232 })).toBe("19.3197, -99.2423");
  });

  it("sin nada, un guion — y eso sí es una ausencia", () => {
    expect(placeLabel({})).toBe("—");
    expect(placeLabel(null)).toBe("—");
    // ⚠️ Y no cae en Null Island: sin coordenadas no se inventan unas.
    expect(placeLabel({ lat: null, lon: null })).toBe("—");
  });
});

describe("departureText", () => {
  it("⚠️ las dos únicas cosas que se pueden decir de una salida", () => {
    expect(departureText({ endedAt: null })).toMatch(/still there/i);
    expect(departureText({ endedAt: "2026-09-04T02:05:00Z" })).toMatch(/^left before /i);
    // Nunca una hora de salida a secas.
    expect(departureText({ endedAt: "2026-09-04T02:05:00Z" })).not.toMatch(/^left at/i);
  });
});
