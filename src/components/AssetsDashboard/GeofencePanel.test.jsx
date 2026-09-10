// El panel de geocercas — y sobre todo, lo que avisa.
//
// ⚠️ El aviso del radio no es un detalle de UX: es lo que separa "la cerca está
// bien configurada" de "la cerca no confirmará a nadie nunca". La regla de
// dentro es `distancia + precisión < radio`, y con la telemetría real de esta
// flota (Wi-Fi, 23–500 m de precisión, p90 de 318 m al pin) un radio de oficina
// no da NINGUNA coincidencia. El operador no ve un error: ve una cerca muda.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import GeofencePanel from "./GeofencePanel";

afterEach(cleanup);

const sitio = (over = {}) => ({
  id: "1",
  siteName: "Cowork - Cruz Blanca",
  city: "Mexico City",
  lat: 19.31974,
  lon: -99.24232,
  radiusM: 400,
  geofenceStatus: "monitoring",
  ranges: 1,
  inside: 3,
  outside: 1,
  indeterminate: 2,
  lastEvaluatedAt: "2026-09-09T10:00:00Z",
  observedAccuracyM: 35,
  observedP90DistanceM: 318,
  suggestedRadiusM: 400,
  suggestionReason: "ok",
  observedReadings: 44,
  radiusTooSmall: false,
  ...over,
});

describe("GeofencePanel", () => {
  it("⚠️ declara la latencia: no es tiempo real", () => {
    // "Geofencing" sugiere vigilancia continua. Esto evalúa cuando el equipo
    // reporta, que en esta flota es una o dos veces al día. Callarlo sería
    // vender otra cosa.
    render(<GeofencePanel sites={[sitio()]} onSave={vi.fn()} />);
    const nota = screen.getByText(/Evaluated when a device checks in, not continuously/i);
    expect(nota).toBeInTheDocument();
    expect(nota.textContent).toMatch(/keeps\s+its last state instead of leaving the fence/i);
    expect(nota.textContent).toMatch(/Two consecutive readings/i);
  });

  it("⚠️ avisa cuando el radio guardado es demasiado pequeño, y dice CUÁNTO", () => {
    render(
      <GeofencePanel
        sites={[sitio({ radiusM: 100, suggestedRadiusM: 400, radiusTooSmall: true })]}
        onSave={vi.fn()}
      />
    );
    const aviso = screen.getByText(/smaller than this site's own readings support/i);
    // Dice lo que PASARÍA, no "valor inválido": el número es legal.
    expect(aviso.textContent).toMatch(/No device would ever be confirmed\s+inside/i);
    // Y trae las dos medidas que lo justifican, más el número que sí funciona.
    expect(aviso.textContent).toContain("35");
    expect(aviso.textContent).toContain("318");
    expect(aviso.textContent).toContain("400");
  });

  it("⚠️ avisa MIENTRAS se teclea, no sólo después de guardar", () => {
    render(<GeofencePanel sites={[sitio({ radiusM: 400 })]} onSave={vi.fn()} />);
    expect(screen.queryByText(/smaller than this site's own readings/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Radius/i), { target: { value: "80" } });
    expect(screen.getByText(/smaller than this site's own readings/i)).toBeInTheDocument();
  });

  it("⚠️ sin lecturas cerca NO propone un número inventado", () => {
    render(
      <GeofencePanel
        sites={[sitio({ observedAccuracyM: null, observedP90DistanceM: null,
                        suggestedRadiusM: null, suggestionReason: "no_readings",
                        observedReadings: 0 })]}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText(/no measured radius to\s+suggest/i)).toBeInTheDocument();
  });

  it("⚠️ con pocas lecturas dice CUÁNTAS, no 'no hay radio'", () => {
    // Las tres razones para no aconsejar piden acciones distintas. "Todavía no
    // hay suficientes" se resuelve esperando; las otras dos no.
    render(
      <GeofencePanel
        sites={[sitio({ suggestedRadiusM: null, suggestionReason: "too_few_readings",
                        observedReadings: 6 })]}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText(/Only 6 positions reported near this site/i)).toBeInTheDocument();
    expect(screen.getByText(/appears once there are enough/i)).toBeInTheDocument();
  });

  it("⚠️ si las lecturas se dispersan kilómetros, lo dice y pide arreglar el sitio", () => {
    // El caso real: seis lecturas, dos a 4,7 km, y la primera versión aconsejaba
    // 4.800 m. Un radio así daría una cerca que confirma "dentro" a media ciudad.
    render(
      <GeofencePanel
        sites={[sitio({ suggestedRadiusM: null, suggestionReason: "too_scattered",
                        observedReadings: 200 })]}
        onSave={vi.fn()}
      />
    );
    const aviso = screen.getByText(/spread over kilometres/i);
    expect(aviso.textContent).toMatch(/not one site/i);
    expect(aviso.textContent).toMatch(/Fix the pin or split the site/i);
  });

  it("un sitio sin pin no puede ser cerca, y lo dice en vez de fallar al guardar", () => {
    render(
      <GeofencePanel
        sites={[sitio({ lat: null, lon: null, geofenceStatus: "off", radiusM: null })]}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText(/no map pin, so it cannot be a geofence/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Monitor/i })).toBeDisabled();
  });

  it("⚠️ muestra 'unclear' aunque sea cero", () => {
    // Es el estado que dice "la medición no alcanza". Esconderlo haría creer
    // que la cerca tiene una opinión sobre todos los equipos.
    render(<GeofencePanel sites={[sitio({ indeterminate: 0 })]} onSave={vi.fn()} />);
    expect(screen.getByText("unclear")).toBeInTheDocument();
  });

  it("una cerca apagada no enseña recuentos que no está midiendo", () => {
    render(<GeofencePanel sites={[sitio({ geofenceStatus: "off" })]} onSave={vi.fn()} />);
    expect(screen.queryByText("inside")).not.toBeInTheDocument();
  });

  it("encendida pero sin evaluar todavía lo explica", () => {
    render(
      <GeofencePanel sites={[sitio({ lastEvaluatedAt: null })]} onSave={vi.fn()} />
    );
    expect(screen.getByText(/no device has reported a position since/i)).toBeInTheDocument();
  });

  it("encender manda el radio y el estado juntos", () => {
    const onSave = vi.fn();
    render(
      <GeofencePanel
        sites={[sitio({ geofenceStatus: "off", radiusM: 400 })]}

        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Monitor/i }));
    expect(onSave).toHaveBeenCalledWith("1", { radiusM: 400, geofenceStatus: "monitoring" });
  });

  it("sin sitios explica qué es una cerca en vez de dejar un hueco", () => {
    render(<GeofencePanel sites={[]} onSave={vi.fn()} />);
    expect(screen.getByText(/A geofence is a site with a radius/i)).toBeInTheDocument();
  });
});
