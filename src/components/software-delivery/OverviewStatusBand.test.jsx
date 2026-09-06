// src/components/software-delivery/OverviewStatusBand.test.jsx
//
// La franja de arriba contesta "¿tengo algo que hacer?", no lista inventario.
//
// El caso que lo motiva es tenant 111 el 6 de septiembre: la fila de tarjetas
// decía 2 · 0 · 0 · 2/2 — tres ceros y un dos que era falso.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OverviewStatusBand, {
  catalogSummary,
  headlineFor,
  lastActivityDay,
} from "./OverviewStatusBand";

afterEach(cleanup);

const T111_PACKAGES = [
  { id: 1, platform: "windows", isActive: false },
  { id: 2, platform: "windows", isActive: false },
];

describe("catalogSummary · lo retirado no cuenta como catálogo", () => {
  // ⚠️ ESTE ERA EL DATO FALSO EN PANTALLA. La tarjeta contaba
  // `packages.length`, y los dos paquetes de T111 están desactivados: el
  // catálogo enseñaba «2» sin tener una sola cosa desplegable.
  it("no suma los paquetes desactivados", () => {
    const c = catalogSummary(T111_PACKAGES);
    expect(c.active).toBe(0);
    expect(c.retired).toBe(2);
  });

  // Una sola plataforma se dice por su nombre: «Windows 100%» en una barra era
  // tinta para una palabra.
  it("con una plataforma da el nombre, sin porcentaje", () => {
    expect(catalogSummary([{ platform: "windows", isActive: true }]).platformLabel).toBe("Windows");
  });

  it("con varias da el reparto, la más frecuente primero", () => {
    const c = catalogSummary([
      { platform: "windows", isActive: true },
      { platform: "macos", isActive: true },
      { platform: "windows", isActive: true },
    ]);
    expect(c.platformLabel).toBe("Windows 2 · macOS 1");
  });

  // La mezcla describe lo DESPLEGABLE: un retirado de macOS no pinta una
  // plataforma que no puedes usar.
  it("ignora la plataforma de los retirados", () => {
    const c = catalogSummary([
      { platform: "windows", isActive: true },
      { platform: "macos", isActive: false },
    ]);
    expect(c.platformLabel).toBe("Windows");
  });

  it("aguanta la lista vacía y la ausente", () => {
    expect(catalogSummary([]).platformLabel).toBeNull();
    expect(catalogSummary(undefined).active).toBe(0);
  });
});

describe("lastActivityDay · el último día con algo", () => {
  const buckets = [
    { bucket: "2026-08-16", succeeded: 0, failed: 2 },
    { bucket: "2026-08-18", succeeded: 6, failed: 0 },
    { bucket: "2026-09-06", succeeded: 0, failed: 0 },
  ];

  // ⚠️ El último bucket NO es el último día con actividad: la serie llega
  // hasta hoy rellenando ceros. Confundirlos diría "actividad hoy" en un
  // tenant parado desde agosto.
  it("salta los días en cero del final", () => {
    expect(lastActivityDay(buckets)).toBe("2026-08-18");
  });

  // ⚠️ LA FORMA DEL LLAMADOR REAL, QUE NO ES LA DEL EJE.
  //
  // El Overview construye `chartData` recortando la fecha a "MM-DD" para que
  // el eje quepa. Si la banda leyera ESE array, `new Date("08-18")` no es una
  // fecha y la resta de días sale NaN — y como además el campo se llama `day`
  // y no `bucket`, la búsqueda devolvería null y la página diría "no installs"
  // en un tenant con historial. Por eso recibe los buckets crudos, y esto lo
  // fija con la forma que de verdad llega.
  it("lee el bucket crudo del servidor, con la fecha completa", () => {
    expect(
      lastActivityDay([
        { bucket: "2026-08-18", succeeded: 6, failed: 0 },
        { bucket: "2026-09-06", succeeded: 0, failed: 0 },
      ])
    ).toBe("2026-08-18");
  });

  it("devuelve null cuando no hubo nada", () => {
    expect(lastActivityDay([{ bucket: "2026-09-01", succeeded: 0, failed: 0 }])).toBeNull();
    expect(lastActivityDay([])).toBeNull();
    expect(lastActivityDay(undefined)).toBeNull();
  });
});

describe("headlineFor · tres estados, tres respuestas", () => {
  it("lo que está en vuelo manda sobre la historia", () => {
    const h = headlineFor({ inFlightCount: 2, devicesInFlight: 7, buckets: [] });
    expect(h.kind).toBe("running");
    expect(h.headline).toMatch(/2 deployments in flight/i);
    expect(h.detail).toMatch(/7 devices still to report/i);
  });

  it("singulariza para uno", () => {
    const h = headlineFor({ inFlightCount: 1, devicesInFlight: 1, buckets: [] });
    expect(h.headline).toMatch(/1 deployment in flight/i);
    expect(h.detail).toMatch(/1 device still/i);
  });

  // El caso de T111: parado desde el 18 de agosto, mirado el 6 de septiembre.
  it("sin nada en vuelo, dice cuánto lleva parado", () => {
    const h = headlineFor({
      inFlightCount: 0,
      buckets: [{ bucket: "2026-08-18", succeeded: 6, failed: 0 }],
      today: "2026-09-06T00:00:00Z",
    });
    expect(h.kind).toBe("idle");
    expect(h.headline).toMatch(/no activity for 19 days/i);
    expect(h.detail).toMatch(/2026-08-18/);
  });

  // ⚠️ "Parado hace 0 días" es una frase absurda; hoy se dice hoy.
  it("hoy se dice hoy", () => {
    const h = headlineFor({
      inFlightCount: 0,
      buckets: [{ bucket: "2026-09-06", succeeded: 1, failed: 0 }],
      today: "2026-09-06T18:00:00Z",
    });
    expect(h.headline).toMatch(/last install today/i);
  });

  // Nunca haber desplegado NO es "llevas 0 días parado": es otro estado, y el
  // que necesita una frase distinta.
  it("distingue 'nunca' de 'parado'", () => {
    const h = headlineFor({ inFlightCount: 0, buckets: [] });
    expect(h.kind).toBe("never");
    expect(h.headline).toMatch(/no installs in this window/i);
  });
});

describe("OverviewStatusBand · lo que se pinta y lo que no", () => {
  function band(props = {}) {
    return render(
      <OverviewStatusBand
        loading={false}
        packages={T111_PACKAGES}
        inFlightCount={0}
        devicesInFlight={0}
        buckets={[{ bucket: "2026-08-18", succeeded: 6, failed: 0 }]}
        pendingIntakes={0}
        coveredSites={2}
        totalActiveSites={2}
        uncoveredSites={0}
        {...props}
      />
    );
  }

  it("enseña el catálogo desplegable y menciona los retirados", () => {
    band();
    expect(screen.getByText("0 · 2 retired")).toBeInTheDocument();
  });

  // ⚠️ Un cero no se pinta si no significa nada. Sin intakes esperando no hay
  // nada que revisar, y una tarjeta en cero es ruido — cuatro de las cinco de
  // la fila anterior estaban así.
  it("no gasta sitio en un cero sin noticia", () => {
    band();
    expect(screen.queryByText(/awaiting review/i)).toBeNull();
  });

  it("pero sí lo enseña cuando hay cola", () => {
    band({ pendingIntakes: 3 });
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("omite la cobertura cuando el tenant no tiene sitios", () => {
    band({ totalActiveSites: 0, coveredSites: 0 });
    expect(screen.queryByText(/sites with a dp/i)).toBeNull();
  });

  it("lleva al catálogo desde el número de paquetes", async () => {
    const onNavigateTab = vi.fn();
    band({ onNavigateTab });
    await userEvent.click(screen.getByRole("button", { name: /deployable packages/i }));
    expect(onNavigateTab).toHaveBeenCalledWith("catalog");
  });

  // Lo que navega tiene que poder accionarse sin ratón: las tarjetas que esta
  // franja sustituyó sí se podían.
  it("se acciona con el teclado", async () => {
    const onNavigateTab = vi.fn();
    band({ onNavigateTab });
    screen.getByRole("button", { name: /deployable packages/i }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onNavigateTab).toHaveBeenCalledWith("catalog");
  });

  it("y a la cola de revisión, que ya no es una pestaña", async () => {
    const onNavigateTab = vi.fn();
    band({ pendingIntakes: 2, onNavigateTab });
    await userEvent.click(screen.getByRole("button", { name: /awaiting review/i }));
    expect(onNavigateTab).toHaveBeenCalledWith("catalog", { reviewQueue: true });
  });
});
