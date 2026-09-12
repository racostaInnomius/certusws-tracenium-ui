// src/components/CryptoDiscovery/CdpCatalystStrip.test.jsx
//
// La tira que enseña los certificados con firma alternativa post-cuántica.
//
// Lo que se fija aquí no es el maquetado: es que (1) no presuma cuando no
// hay nada que presumir, (2) diga la mitad incómoda —siguen contando como
// quantum-broken— porque si no, contradice al KPI de arriba, y (3) el
// botón lleve al filtro que SÍ los encuentra, que no es el de familia.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import CdpCatalystStrip from "./CdpCatalystStrip";

afterEach(() => cleanup());

describe("CdpCatalystStrip", () => {
  it("⭐ no se pinta si el tenant no tiene ninguno: un logro a cero es ruido", () => {
    const { container } = render(<CdpCatalystStrip pqAlt={{ certificates: 0, devices: 0, anchors: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tampoco con el bloque ausente (tenant viejo, backend sin desplegar)", () => {
    const { container } = render(<CdpCatalystStrip pqAlt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("⭐ enseña cuántos certificados y en cuántos equipos", () => {
    render(<CdpCatalystStrip pqAlt={{ certificates: 4, devices: 2, anchors: 2 }} />);
    expect(screen.getByLabelText(/post-quantum alternative signature/i)).toHaveTextContent("4");
    expect(screen.getByText(/on 2 devices/i)).toBeInTheDocument();
  });

  it("⭐ cuando hay anclas, lo dice: la cadena entera es la noticia, no una hoja", () => {
    render(<CdpCatalystStrip pqAlt={{ certificates: 4, devices: 2, anchors: 2 }} />);
    expect(screen.getByText(/2 of them are trust anchors/i)).toBeInTheDocument();
  });

  it("sin anclas no inventa la frase de la cadena", () => {
    render(<CdpCatalystStrip pqAlt={{ certificates: 1, devices: 1, anchors: 0 }} />);
    expect(screen.queryByText(/trust anchors/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ML-DSA-65/)).toBeInTheDocument();
  });

  it("⚠️ dice que SIGUEN contando como quantum-broken, o contradice al KPI de arriba", () => {
    render(<CdpCatalystStrip pqAlt={{ certificates: 4, devices: 2, anchors: 2 }} />);
    expect(screen.getByText(/still count as quantum-broken/i)).toBeInTheDocument();
    expect(screen.getByText(/classical\s+half/i)).toBeInTheDocument();
  });

  it("⭐ el botón lleva al filtro `catalyst`, que es el ÚNICO que los encuentra", () => {
    const onDrillDown = vi.fn();
    render(<CdpCatalystStrip pqAlt={{ certificates: 4, devices: 2, anchors: 2 }} onDrillDown={onDrillDown} />);
    fireEvent.click(screen.getByRole("button", { name: /see which ones/i }));
    expect(onDrillDown).toHaveBeenCalledWith({ catalyst: true }, { replace: true });
    // Por familia NO se llega: un catalyst es `quantum_broken` a propósito.
    expect(onDrillDown).not.toHaveBeenCalledWith(expect.objectContaining({ family: expect.anything() }), expect.anything());
  });

  it("singulariza con uno solo", () => {
    render(<CdpCatalystStrip pqAlt={{ certificates: 1, devices: 1, anchors: 0 }} />);
    expect(screen.getByText(/certificate on 1 device/i)).toBeInTheDocument();
  });
});
