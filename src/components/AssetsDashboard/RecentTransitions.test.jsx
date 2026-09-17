// Qué dicen las geocercas, y qué cambió de verdad.
//
// ⚠️ Este fichero existe por DOS defectos que estuvieron en producción:
//
//  1. El rótulo `toState === "inside" ? "entered" : "left"` decía "left" de una
//     transición que venía de `indeterminate` — afirmaba que un equipo salió de
//     un sitio donde nunca se le confirmó dentro.
//  2. La vista era una lista plana. En T111, 39 de 41 eventos eran la carga
//     inicial de la cerca (`indeterminate -> inside`, uno por equipo): una
//     pared de filas casi idénticas de la que no se podía sacar ni cuántos
//     están dentro ni si alguien se fue.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecentTransitions, { transitionLabel, classifyTransition } from "./RecentTransitions";

afterEach(cleanup);

const ev = (over = {}) => ({
  id: "1", agentId: "abc-123", hostname: "ETE-3X5P8F4", siteName: "Mountainside IG",
  fromState: "indeterminate", toState: "inside", method: "coordinates",
  distanceM: 40, accuracyM: 30, occurredAt: "2026-09-09T22:26:56Z",
  ...over,
});
const cerca = (over = {}) => ({
  id: "4", siteName: "Mountainside IG", geofenceStatus: "monitoring",
  inside: 39, outside: 2, indeterminate: 4, ...over,
});

describe("classifyTransition", () => {
  it("⚠️ sólo un cambio entre dos estados CONOCIDOS es un movimiento", () => {
    expect(classifyTransition("inside", "outside")).toBe("movement");
    expect(classifyTransition("outside", "inside")).toBe("movement");
  });

  it("⚠️ la carga inicial NO es un movimiento", () => {
    // El caso de T111: 39 eventos así el día que se encendió la cerca.
    expect(classifyTransition("indeterminate", "inside")).toBe("first");
    expect(classifyTransition(null, "outside")).toBe("first");
  });

  it("perder la certeza tampoco es un movimiento", () => {
    // ⚠️ Hoy la BD no lo permite (`to_state` sólo acepta inside/outside), pero
    // el clasificador lo contempla: si mañana se admitiera, no puede colarse
    // entre los movimientos.
    expect(classifyTransition("inside", "indeterminate")).toBe("lost");
  });
});

describe("transitionLabel", () => {
  it("⚠️ sólo inside→outside es una SALIDA", () => {
    expect(transitionLabel("inside", "outside")).toEqual({ text: "left", tone: "alert" });
  });

  it("⚠️ indeterminate→outside NO se rotula como salida", () => {
    const r = transitionLabel("indeterminate", "outside");
    expect(r.text).toBe("confirmed elsewhere");
    expect(r.tone).not.toBe("alert");
  });

  it("volver se distingue de confirmarse por primera vez", () => {
    expect(transitionLabel("outside", "inside").text).toBe("came back");
    expect(transitionLabel("indeterminate", "inside").text).toBe("confirmed here");
  });
});

describe("RecentTransitions", () => {
  it("⚠️ abre con el ESTADO de cada cerca, que es a lo que se viene", () => {
    render(<RecentTransitions events={[]} sites={[cerca()]} />);
    expect(screen.getByText("39 inside")).toBeInTheDocument();
    expect(screen.getByText("2 outside")).toBeInTheDocument();
    expect(screen.getByText("4 unclear")).toBeInTheDocument();
  });

  it("⭐ las cifras contestan de un vistazo: dentro, fuera, sin certeza y salidas", () => {
    render(
      <RecentTransitions
        events={[]}
        sites={[cerca()]}
        days={30}
        activity={{
          totals: { all: 45, movements: 6, departures: 4, returns: 2, firstConfirmations: 39, lastDepartureAt: "2026-09-15T10:00:00Z" },
          daily: [], window: { from: "2026-08-18T00:00:00Z", to: "2026-09-17T00:00:00Z" }, limit: 200, truncated: false,
        }}
      />
    );
    expect(screen.getByText("Inside now")).toBeInTheDocument();
    expect(screen.getByText("Departures · 30 days")).toBeInTheDocument();
    // La cifra de salidas sale de los TOTALES del servidor, no de contar la
    // página devuelta: con el tope puesto, contar aquí diría de menos.
    const tarjeta = screen.getByText("Departures · 30 days").parentElement;
    expect(tarjeta.textContent).toContain("4");
    expect(screen.getByText(/last one/i)).toBeInTheDocument();
  });

  it("⚠️ un recorte del servidor se dice, porque los totales sí son del periodo entero", () => {
    render(
      <RecentTransitions
        events={[ev({ id: "1", fromState: "inside", toState: "outside" })]}
        sites={[cerca()]}
        activity={{
          totals: { all: 900, movements: 900, departures: 400, returns: 500, firstConfirmations: 0, lastDepartureAt: null },
          daily: [], window: {}, limit: 200, truncated: true,
        }}
      />
    );
    expect(screen.getByText(/Only the 200 most recent entries/i)).toBeInTheDocument();
  });

  it("una cerca apagada no aparece: no está afirmando nada", () => {
    render(<RecentTransitions events={[]} sites={[cerca({ geofenceStatus: "off" })]} />);
    expect(screen.queryByText("39 inside")).not.toBeInTheDocument();
    expect(screen.getByText(/No fence is switched on/i)).toBeInTheDocument();
  });

  it("⚠️ cero equipos evaluados no se presenta como 'nadie está aquí'", () => {
    render(<RecentTransitions events={[]} sites={[cerca({ inside: 0, outside: 0, indeterminate: 0 })]} />);
    expect(screen.getByText(/no device evaluated yet/i)).toBeInTheDocument();
  });

  it("⚠️ 39 primeras confirmaciones se CUENTAN, no se listan una a una", () => {
    // Es el caso real de T111. Listarlas era la pared de filas inútil.
    const eventos = Array.from({ length: 39 }, (_, i) =>
      ev({ id: String(i), agentId: `a-${i}`, hostname: `PC-${i}` }));
    render(<RecentTransitions events={eventos} sites={[cerca()]} />);

    const fila = screen.getByText(/devices were first confirmed inside Mountainside IG/i);
    expect(fila.textContent).toMatch(/^39 devices were first confirmed inside/);
    // Ni un solo hostname suelto: no son sucesos.
    expect(screen.queryByText("PC-0")).not.toBeInTheDocument();
  });

  it("…pero se pueden desplegar: contar no es esconder", async () => {
    const user = userEvent.setup();
    const eventos = Array.from({ length: 3 }, (_, i) =>
      ev({ id: String(i), agentId: `a-${i}`, hostname: `PC-${i}` }));
    render(<RecentTransitions events={eventos} sites={[cerca()]} />);

    await user.click(screen.getByRole("button", { name: /Show the 3 devices/i }));
    expect(screen.getByText("PC-0")).toBeInTheDocument();
    expect(screen.getByText("PC-2")).toBeInTheDocument();
  });

  it("⚠️ con movimientos, la vista abre filtrada por ellos y el ruido inicial no estorba", async () => {
    const user = userEvent.setup();
    const eventos = [
      ev({ id: "9", fromState: "inside", toState: "outside", hostname: "PC-MOVIDO" }),
      ...Array.from({ length: 5 }, (_, i) => ev({ id: `f${i}`, hostname: `PC-${i}` })),
    ];
    render(
      <RecentTransitions
        events={eventos}
        sites={[cerca()]}
        activity={{ totals: { all: 6, movements: 1, departures: 1, returns: 0, firstConfirmations: 5, lastDepartureAt: "2026-09-15T10:00:00Z" }, daily: [], window: {}, limit: 200, truncated: false }}
      />
    );
    expect(screen.getByText("PC-MOVIDO")).toBeInTheDocument();
    expect(screen.queryByText(/devices were first confirmed/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Everything/i }));
    expect(screen.getByText(/devices were first confirmed inside/i)).toBeInTheDocument();
    expect(screen.getByText("PC-MOVIDO")).toBeInTheDocument();
  });

  it("un movimiento REAL sí se lista, con su equipo", () => {
    render(
      <RecentTransitions
        events={[ev({ id: "9", fromState: "inside", toState: "outside", hostname: "PC-MOVIDO" })]}
        sites={[cerca()]}
      />
    );
    expect(screen.getByText("PC-MOVIDO")).toBeInTheDocument();
    expect(screen.getByText("left")).toBeInTheDocument();
  });

  it("⚠️ sin movimientos lo dice como RESULTADO, y explica por qué puede tardar", () => {
    render(<RecentTransitions events={[ev()]} sites={[cerca()]} />);
    const t = screen.getByText(/No device has moved between a confirmed inside/i).textContent;
    expect(t).toMatch(/reporting interval a move can take hours/i);
  });

  it("⚠️ un fallo de carga no se presenta como 'no ha pasado nada'", () => {
    render(<RecentTransitions events={null} sites={null} error="500" />);
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/No fence is switched on/i)).not.toBeInTheDocument();
  });

  it("⚠️ perder la certeza no se cuela entre los movimientos", () => {
    // La BD no lo permite hoy, pero si llegara: no es un movimiento, y su
    // rótulo no puede ser "left".
    render(
      <RecentTransitions
        events={[ev({ id: "7", fromState: "inside", toState: "indeterminate", hostname: "PC-DUDA" })]}
        sites={[cerca()]}
        activity={{ totals: { all: 1, movements: 0, departures: 0, returns: 0, firstConfirmations: 0, lastDepartureAt: null }, daily: [], window: {}, limit: 200, truncated: false }}
      />
    );
    expect(screen.getByText(/No device has moved/i)).toBeInTheDocument();
    const etiquetas = [...document.querySelectorAll(".MuiChip-label")].map((c) => c.textContent);
    expect(etiquetas).not.toContain("left");
    expect(etiquetas).toContain("no longer certain");
  });
});
