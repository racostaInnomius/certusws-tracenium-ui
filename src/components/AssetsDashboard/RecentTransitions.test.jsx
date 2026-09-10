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
import { render, screen, cleanup, within } from "@testing-library/react";
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

    expect(screen.getByText("39")).toBeInTheDocument();
    expect(screen.getByText(/devices were first confirmed inside Mountainside IG/i)).toBeInTheDocument();
    // Ni un solo hostname suelto: no son sucesos.
    expect(screen.queryByText("PC-0")).not.toBeInTheDocument();
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

  it("la pérdida de certeza va en su propio bloque, no entre los movimientos", () => {
    render(
      <RecentTransitions
        events={[ev({ id: "7", fromState: "inside", toState: "indeterminate", hostname: "PC-DUDA" })]}
        sites={[cerca()]}
      />
    );
    const bloque = screen.getByText(/Certainty lost/i).parentElement.parentElement;
    expect(within(bloque).getByText("PC-DUDA")).toBeInTheDocument();
    expect(screen.getByText(/No device has moved/i)).toBeInTheDocument();
  });
});
