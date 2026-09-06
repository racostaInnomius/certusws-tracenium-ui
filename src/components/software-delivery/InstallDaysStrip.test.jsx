// src/components/software-delivery/InstallDaysStrip.test.jsx
//
// Pocos eventos en muchos días: marcas, no una línea.
//
// El caso: tenant 111, 8 instalaciones en 30 días, todas apiñadas entre el 16 y
// el 18 de agosto. La línea dibujaba 27 días de cero y unía agosto con
// septiembre como si entre medias hubiera una magnitud que evolucionó.

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import InstallDaysStrip, { shouldUseStrip, stripEvents } from "./InstallDaysStrip";

afterEach(cleanup);

/** 30 días, con actividad sólo en tres — la forma real de T111. */
function t111Buckets() {
  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.UTC(2026, 7, 8 + i)).toISOString().slice(5, 10);
    days.push({ day: d, succeeded: 0, failed: 0 });
  }
  days[8] = { day: days[8].day, succeeded: 0, failed: 1 }; // 08-16
  days[9] = { day: days[9].day, succeeded: 0, failed: 1 }; // 08-17
  days[10] = { day: days[10].day, succeeded: 6, failed: 0 }; // 08-18
  return days;
}

describe("shouldUseStrip · el umbral cuenta DÍAS, no instalaciones", () => {
  it("con tres días de actividad en un mes, marcas", () => {
    expect(shouldUseStrip(t111Buckets())).toBe(true);
  });

  // ⚠️ Cien instalaciones en un solo día siguen siendo UN punto, y una línea de
  // un punto no dibuja nada. Contar instalaciones en vez de días metería ese
  // caso por el camino equivocado.
  it("cien instalaciones en un día siguen siendo un punto", () => {
    expect(shouldUseStrip([{ day: "09-01", succeeded: 100, failed: 0 }])).toBe(true);
  });

  it("con densidad suficiente deja pasar la línea", () => {
    const dense = Array.from({ length: 12 }, (_, i) => ({
      day: `09-${String(i + 1).padStart(2, "0")}`,
      succeeded: 3,
      failed: 0,
    }));
    expect(shouldUseStrip(dense)).toBe(false);
  });

  // Sin nada que enseñar no manda ninguna de las dos: el Overview ya tiene su
  // estado vacío, y una tira de cero marcas sería un marco alrededor de nada.
  it("sin datos no reclama la tira", () => {
    expect(shouldUseStrip([{ day: "09-01", succeeded: 0, failed: 0 }])).toBe(false);
    expect(shouldUseStrip([])).toBe(false);
    expect(shouldUseStrip(undefined)).toBe(false);
  });
});

describe("stripEvents · los huecos se conservan", () => {
  it("sólo produce marcas para los días con algo", () => {
    const { events } = stripEvents(t111Buckets());
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.day)).toEqual(["08-16", "08-17", "08-18"]);
  });

  // ⚠️ ESTA ES LA PROPIEDAD QUE JUSTIFICA EL COMPONENTE.
  //
  // La posición sale del índice del día en la ventana. Repartir las marcas a
  // intervalos iguales las ordenaría bien y mentiría igual que la línea: tres
  // días consecutivos a principios de mes se verían repartidos por todo el
  // ancho. Aquí caen juntos y al tercio izquierdo, que es donde ocurrieron.
  it("coloca cada día donde cae en la ventana, no repartido", () => {
    const { events } = stripEvents(t111Buckets());
    const pcts = events.map((e) => Math.round(e.pct));
    expect(pcts).toEqual([28, 31, 34]);
    // Y no ocupan el ancho entero, que es lo que haría un reparto uniforme.
    expect(Math.max(...pcts)).toBeLessThan(50);
  });

  it("suma los totales de toda la ventana", () => {
    const s = stripEvents(t111Buckets());
    expect(s.succeeded).toBe(6);
    expect(s.failed).toBe(2);
    expect(s.total).toBe(8);
    expect(s.peak).toBe(6);
  });

  it("aguanta la ventana vacía y la ausente", () => {
    expect(stripEvents([]).events).toEqual([]);
    expect(stripEvents(undefined).total).toBe(0);
  });

  // Un solo bucket no puede dividir por cero al calcular la posición.
  it("con un solo día no revienta la posición", () => {
    const { events } = stripEvents([{ day: "09-01", succeeded: 2, failed: 0 }]);
    expect(events[0].pct).toBe(0);
  });
});

describe("InstallDaysStrip · lo que lee el operador", () => {
  it("da los totales sin necesitar un panel aparte", () => {
    render(<InstallDaysStrip buckets={t111Buckets()} />);
    expect(screen.getByText("8 installs")).toBeInTheDocument();
    expect(screen.getByText("6 succeeded")).toBeInTheDocument();
    expect(screen.getByText("2 failed")).toBeInTheDocument();
  });

  // Sin fallos no se pinta un "0 failed": un cero que no es noticia es ruido.
  it("calla los fallos cuando no los hay", () => {
    render(<InstallDaysStrip buckets={[{ day: "09-01", succeeded: 4, failed: 0 }]} />);
    expect(screen.getByText("4 succeeded")).toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).toBeNull();
  });

  it("cada marca dice su día y su desenlace", () => {
    render(<InstallDaysStrip buckets={t111Buckets()} />);
    expect(screen.getByLabelText("08-18: 6 succeeded, 0 failed")).toBeInTheDocument();
    expect(screen.getByLabelText("08-16: 0 succeeded, 1 failed")).toBeInTheDocument();
  });

  it("rotula los extremos de la ventana", () => {
    render(<InstallDaysStrip buckets={t111Buckets()} />);
    expect(screen.getByText("08-08")).toBeInTheDocument();
    expect(screen.getByText("09-06")).toBeInTheDocument();
  });

  it("singulariza una sola instalación", () => {
    render(<InstallDaysStrip buckets={[{ day: "09-01", succeeded: 1, failed: 0 }]} />);
    expect(screen.getByText("1 install")).toBeInTheDocument();
  });
});
