// Los cambios de veredicto de las cercas.
//
// ⚠️ Este fichero existe por un rótulo FALSO que estuvo en producción: el panel
// decía `toState === "inside" ? "entered" : "left"`, sin mirar de dónde venía.
// Las dos primeras transiciones reales (T1, 09-sep) fueron
// `indeterminate → outside` y se habrían pintado como "left" — afirmando que un
// equipo salió de un sitio donde nunca se le confirmó dentro.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import RecentTransitions, { transitionLabel } from "./RecentTransitions";

afterEach(cleanup);

const ev = (over = {}) => ({
  id: "1", agentId: "abc-123", hostname: "ETE-3X5P8F4", siteName: "City Towers Black",
  fromState: "indeterminate", toState: "outside", method: "coordinates",
  distanceM: 11884, accuracyM: 159, occurredAt: "2026-09-09T22:26:56Z",
  ...over,
});

describe("transitionLabel", () => {
  it("⚠️ sólo inside→outside es una SALIDA", () => {
    expect(transitionLabel("inside", "outside")).toEqual({ text: "left", tone: "alert" });
  });

  it("⚠️ indeterminate→outside NO es una salida", () => {
    // El caso real de T1. El equipo no se fue de ningún sitio: quedó
    // confirmado en otra parte, viniendo de "no lo sé".
    const r = transitionLabel("indeterminate", "outside");
    expect(r.text).toBe("confirmed elsewhere");
    expect(r.text).not.toMatch(/left/);
    expect(r.tone).not.toBe("alert");
  });

  it("un primer veredicto sin estado previo tampoco es una salida", () => {
    expect(transitionLabel(null, "outside").text).toBe("confirmed elsewhere");
  });

  it("volver de fuera se distingue de confirmarse por primera vez", () => {
    expect(transitionLabel("outside", "inside").text).toBe("came back");
    expect(transitionLabel("indeterminate", "inside").text).toBe("confirmed here");
  });

  it("perder la certeza no es un movimiento", () => {
    expect(transitionLabel("inside", "indeterminate")).toEqual({
      text: "no longer certain", tone: "neutral",
    });
  });
});

describe("RecentTransitions", () => {
  it("pinta el hostname, no el UUID", () => {
    render(<RecentTransitions events={[ev()]} />);
    expect(screen.getByText("ETE-3X5P8F4")).toBeInTheDocument();
    expect(screen.queryByText("abc-123")).not.toBeInTheDocument();
  });

  it("sin hostname cae al agentId en vez de dejar el hueco", () => {
    render(<RecentTransitions events={[ev({ hostname: null })]} />);
    expect(screen.getByText("abc-123")).toBeInTheDocument();
  });

  it("dice por qué método se decidió, y con qué margen", () => {
    // "Por red" y "por coordenadas" no merecen la misma confianza.
    render(<RecentTransitions events={[ev(), ev({ id: "2", method: "network", distanceM: null, accuracyM: null })]} />);
    expect(screen.getByText(/by coordinates · 11884 m · ±159 m/i)).toBeInTheDocument();
    expect(screen.getByText(/by network/i)).toBeInTheDocument();
  });

  it("⚠️ un fallo de carga NO se presenta como 'no se ha movido nadie'", () => {
    render(<RecentTransitions events={null} error="500" />);
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/No transition recorded yet/i)).not.toBeInTheDocument();
  });

  it("una lista vacía explica las tres razones por las que puede estarlo", () => {
    render(<RecentTransitions events={[]} />);
    const t = screen.getByText(/No transition recorded yet/i).textContent;
    expect(t).toMatch(/switched on/i);      // la cerca puede estar apagada
    expect(t).toMatch(/check in twice/i);   // hace falta la histéresis
    expect(t).toMatch(/hours/i);            // y la cadencia lo hace lento
  });

  it("declara que sólo 'left' significa que el equipo se fue", () => {
    render(<RecentTransitions events={[ev()]} />);
    expect(
      screen.getByText(/changes in what is known, not\s+movements/i)
    ).toBeInTheDocument();
  });
});
