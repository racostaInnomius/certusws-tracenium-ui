// src/components/software-delivery/LanSavingsPanel.test.jsx
//
// Fase 5: el ahorro del distribution point deja de estar enterrado.
//
// El panel anterior leía SÓLO software de terceros y concluía sobre los DPs.
// En tenant 111, 30 días: terceros 9 eventos, updates de agente 397 (304 dp).
// Llegó a mostrar "0% served from the LAN" mientras el DP servía casi
// cuatrocientas descargas — justo al revés del argumento de producto para un
// cliente con ancho de banda reducido.

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import LanSavingsPanel, { lanSplit } from "./LanSavingsPanel";

afterEach(cleanup);

const T111_AGENT = { dp: 304, cdn: 0, origin: 93, unknown: 0, total: 397 };
const T111_SOFTWARE = { dp: 5, cdn: 0, origin: 0, unknown: 4, total: 9 };

describe("lanSplit · el porcentaje se calcula sobre lo REGISTRADO", () => {
  // ⚠️ EL DENOMINADOR ES LA DECISIÓN IMPORTANTE.
  //
  // Con 5 dp y 4 sin registrar, dividir por el TOTAL da 56% y castiga al DP por
  // un fallo de instrumentación nuestro. Sobre lo registrado da 100%, que es lo
  // que de verdad se sabe: de las descargas que pudimos observar, todas fueron
  // por LAN. El hueco se declara aparte.
  it("no castiga al DP por nuestro propio hueco de telemetría", () => {
    const s = lanSplit(T111_SOFTWARE);
    expect(s.share).toBe(100);
    expect(s.unknown).toBe(4);
    expect(s.recorded).toBe(5);
  });

  it("cuenta cdn y origin juntos como internet", () => {
    expect(lanSplit({ dp: 1, cdn: 2, origin: 1, unknown: 0 }).internet).toBe(3);
  });

  it("da el 77% real de los updates de agente en T111", () => {
    expect(lanSplit(T111_AGENT).share).toBe(77);
  });

  // Sin nada registrado no hay porcentaje que dar. `null` y `0%` son cosas
  // distintas: el segundo afirmaría que el DP no sirvió nada.
  it("devuelve null, no cero, cuando no hay nada registrado", () => {
    expect(lanSplit({ dp: 0, cdn: 0, origin: 0, unknown: 7 }).share).toBeNull();
    expect(lanSplit(null).share).toBeNull();
    expect(lanSplit(undefined).total).toBe(0);
  });
});

describe("LanSavingsPanel · sin distribution points configurados", () => {
  // ⚠️ El 0% no es un resultado, es una función sin activar. Enseñarlo como
  // métrica —lo que hacía el panel anterior con su "0% served from the LAN"—
  // se lee como "los DPs no sirven de nada".
  it("dice que no hay DPs en vez de enseñar un 0%", () => {
    render(
      <LanSavingsPanel
        agentStats={{ dp: 0, cdn: 0, origin: 12, unknown: 0 }}
        softwareStats={null}
        hasDistributionPoints={false}
      />
    );

    expect(screen.getByText(/no distribution points yet/i)).toBeInTheDocument();
    expect(screen.queryByText("0%")).toBeNull();
  });

  // ⚠️ EL DATO MANDA SOBRE LA CONFIGURACIÓN, Y ESTO LO FIJA.
  //
  // Si hay descargas servidas por LAN, evidentemente hubo un DP sirviéndolas:
  // la lista puede venir vacía porque se retiró después, o porque esa llamada
  // degradó a []. La primera versión enseñaba el mensaje de "no hay DPs" y
  // escondía tráfico ya medido. Lo cazó un test del Overview que sembraba
  // dp:90 sin DPs configurados.
  it("enseña el ahorro medido aunque la lista de DPs venga vacía", () => {
    render(
      <LanSavingsPanel
        agentStats={{ dp: 90, cdn: 8, origin: 2, unknown: 0 }}
        softwareStats={null}
        hasDistributionPoints={false}
      />
    );

    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.queryByText(/no distribution points yet/i)).toBeNull();
  });

  // Y explica lo que se está perdiendo, que es la razón de configurarlos.
  it("nombra el ahorro que un DP haría", () => {
    render(<LanSavingsPanel agentStats={null} softwareStats={null} hasDistributionPoints={false} />);
    expect(screen.getByText(/limited\s+bandwidth/i)).toBeInTheDocument();
  });
});

describe("LanSavingsPanel · con DPs, las dos poblaciones por separado", () => {
  function full() {
    return render(
      <LanSavingsPanel
        agentStats={T111_AGENT}
        softwareStats={T111_SOFTWARE}
        hasDistributionPoints
      />
    );
  }

  // ⚠️ SEPARADAS Y ETIQUETADAS. Sumarlas daría una cifra más bonita y menos
  // cierta: una población está bien instrumentada y la otra casi no tiene
  // eventos. Cada fila lleva su propio denominador.
  it("enseña updates de agente y software de terceros como filas distintas", () => {
    full();
    expect(screen.getByText("Agent updates")).toBeInTheDocument();
    expect(screen.getByText("Software installs")).toBeInTheDocument();
    expect(screen.getByText("77%")).toBeInTheDocument();
  });

  it("dice cuántas descargas fueron por LAN y cuántas por internet", () => {
    full();
    expect(
      screen.getByText(/304 from a distribution point · 93 from the internet/i)
    ).toBeInTheDocument();
  });

  // ⚠️ "Sin registrar" NO es un origen de descarga: es un hueco nuestro. En el
  // panel anterior competía en la misma barra que dp/cdn/origin, así que un
  // tenant a medio instrumentar parecía uno que no usa el DP.
  it("declara el hueco de telemetría aparte, no como un origen más", () => {
    full();
    const hueco = screen.getByText(/4 not recorded/i);
    expect(hueco).toBeInTheDocument();
    // No aparece dentro de la frase que enumera orígenes reales.
    expect(hueco.textContent).not.toMatch(/distribution point|internet/i);
  });

  it("omite una población que no tiene ningún evento", () => {
    render(
      <LanSavingsPanel
        agentStats={T111_AGENT}
        softwareStats={{ dp: 0, cdn: 0, origin: 0, unknown: 0 }}
        hasDistributionPoints
      />
    );
    expect(screen.getByText("Agent updates")).toBeInTheDocument();
    expect(screen.queryByText("Software installs")).toBeNull();
  });

  it("con DPs pero sin datos, lo dice sin inventar un porcentaje", () => {
    render(<LanSavingsPanel agentStats={null} softwareStats={null} hasDistributionPoints />);
    expect(screen.getByText(/no downloads recorded/i)).toBeInTheDocument();
  });
});

describe("LanSavingsPanel · una llamada rota se DICE, no se esconde", () => {
  // ⚠️ ESTE ES EL FALLO QUE LLEGÓ A PRODUCCIÓN.
  //
  // La fila de updates de agente no se pintaba y el panel quedaba idéntico al
  // de un tenant que no usa el DP — con 398 eventos detrás. La causa no era el
  // panel sino el `.catch(() => null)` del Overview, pero el panel lo hacía
  // indistinguible: sin datos y sin poder preguntar se veían igual.
  it("enseña la fila caída en vez de omitirla", () => {
    render(
      <LanSavingsPanel
        agentStats={null}
        softwareStats={T111_SOFTWARE}
        hasDistributionPoints
        agentFailed
      />
    );

    expect(screen.getByText("Agent updates")).toBeInTheDocument();
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    // Y no inventa un porcentaje para lo que no pudo leer.
    expect(screen.queryByText("0%")).toBeNull();
  });

  // Sin datos Y sin fallo, la fila sigue sobrando: esto fija que el arreglo no
  // se pasó de frenada resucitando filas vacías.
  it("sigue omitiendo la fila cuando simplemente no hay eventos", () => {
    render(
      <LanSavingsPanel
        agentStats={{ dp: 0, cdn: 0, origin: 0, unknown: 0 }}
        softwareStats={T111_SOFTWARE}
        hasDistributionPoints
      />
    );
    expect(screen.queryByText("Agent updates")).toBeNull();
  });

  // ⚠️ Con TODO caído, "No downloads recorded" es una afirmación sobre la
  // flota que no podemos sostener: no llegamos ni a preguntar.
  it("no afirma que no hubo descargas cuando no pudo preguntar", () => {
    render(
      <LanSavingsPanel agentStats={null} softwareStats={null} hasDistributionPoints agentFailed softwareFailed />
    );
    expect(screen.queryByText(/no downloads recorded/i)).toBeNull();
    expect(screen.getAllByText(/couldn't load/i)).toHaveLength(2);
  });

  // Ni ofrece el discurso de "configura un DP" apoyado en un dato que no leyó.
  it("no vende el setup de DPs sobre una llamada caída", () => {
    render(<LanSavingsPanel agentStats={null} softwareStats={null} hasDistributionPoints={false} agentFailed />);
    expect(screen.queryByText(/no distribution points yet/i)).toBeNull();
  });
});
