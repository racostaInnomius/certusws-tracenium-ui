// src/components/software-delivery/InstallActivityCalendar.test.jsx
//
// El calendario de actividad, que sustituyó a la gráfica de barras y a la tira
// de marcas (y al selector entre las dos).
//
// Lo que se fija aquí es lo que puede contar una historia falsa sin dar error:
// qué día cae en qué celda, que un día con fallos no se disfrace de buen día,
// y que la ventana entera se dibuje aunque no haya pasado nada.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import InstallActivityCalendar, { calendarWeeks, cellTone } from "./InstallActivityCalendar";
import { BRAND, ROLE } from "../../theme/brand";

afterEach(cleanup);

/** Ventana zero-filled, como la devuelve el backend. */
function windowOf(days, activity = {}) {
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.UTC(2026, 5, 22 + i)).toISOString().slice(0, 10);
    return { bucket: day, succeeded: activity[day]?.[0] ?? 0, failed: activity[day]?.[1] ?? 0 };
  });
}

describe("calendarWeeks", () => {
  it("⭐ parte la ventana en columnas de SIETE, sin perder ni repetir días", () => {
    const { weeks, days } = calendarWeeks(windowOf(90));
    expect(days).toBe(90);
    expect(weeks).toHaveLength(13); // 12 semanas completas + 6 días
    expect(weeks.slice(0, 12).every((w) => w.length === 7)).toBe(true);
    expect(weeks[12]).toHaveLength(6);
    expect(weeks.flat().map((d) => d.day)).toEqual(windowOf(90).map((b) => b.bucket));
  });

  it("suma totales y encuentra el día más cargado", () => {
    const { total, succeeded, failed, peak, activeDays } = calendarWeeks(
      windowOf(7, { "2026-06-22": [3, 0], "2026-06-25": [1, 2] })
    );
    expect({ total, succeeded, failed, peak, activeDays }).toEqual({
      total: 6,
      succeeded: 4,
      failed: 2,
      peak: 3,
      activeDays: 2,
    });
  });

  it("una ventana vacía sigue siendo una ventana", () => {
    const { weeks, days, total } = calendarWeeks(windowOf(30));
    expect(days).toBe(30);
    expect(weeks.flat()).toHaveLength(30);
    expect(total).toBe(0);
  });

  it("sin datos no revienta", () => {
    expect(calendarWeeks(null)).toMatchObject({ weeks: [], total: 0, days: 0 });
  });
});

describe("cellTone", () => {
  it("⚠️ un día con fallos es ROJO aunque tenga éxitos", () => {
    // Mezclar los dos colores en una celda de 13 px da un tono que no es ni
    // una cosa ni la otra, y la pregunta que trae aquí es «¿algo va mal?».
    expect(cellTone({ succeeded: 9, failed: 1 }, 10).color).toBe(ROLE.critical);
  });

  it("la intensidad es relativa al día más cargado de la ventana", () => {
    const peak = 10;
    expect(cellTone({ succeeded: 10 }, peak).level).toBe(3);
    expect(cellTone({ succeeded: 5 }, peak).level).toBe(2);
    expect(cellTone({ succeeded: 1 }, peak).level).toBe(1);
  });

  it("un día sin nada no se pinta de verde flojo", () => {
    const tone = cellTone({ succeeded: 0, failed: 0 }, 10);
    expect(tone.level).toBe(0);
    expect(tone.color).toBe(BRAND.surfaceMuted);
  });

  it("con la ventana a cero, un día suelto es el máximo", () => {
    expect(cellTone({ succeeded: 1 }, 0).level).toBe(3);
  });
});

describe("InstallActivityCalendar", () => {
  it("⭐ dibuja la ventana entera y resume lo ocurrido", () => {
    render(
      <InstallActivityCalendar
        buckets={windowOf(30, { "2026-06-24": [4, 0], "2026-07-10": [1, 1] })}
      />
    );

    const grid = screen.getByRole("img");
    expect(grid).toHaveAccessibleName("Install activity: 6 installs across 2 of 30 days");
    expect(screen.getByText("6")).toBeInTheDocument(); // total
    expect(screen.getByText("5")).toBeInTheDocument(); // succeeded
    expect(screen.getByText("1")).toBeInTheDocument(); // failed
  });

  it("⚠️ sin actividad NO desaparece: los días vacíos son la respuesta", () => {
    // El panel anterior enseñaba un cartel de "no installs" del alto de una
    // gráfica. El hueco de la ventana dice lo mismo y además dice cuánto lleva.
    render(<InstallActivityCalendar buckets={windowOf(30)} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Install activity: nothing installed in the last 30 days"
    );
    // Tres ceros legítimos (instalaciones, éxitos, fallos): se comprueba el
    // que importa, el de fallos, por su texto completo.
    expect(screen.getAllByText("0")).toHaveLength(3);
  });

  it("rotula los extremos de la ventana con la fecha COMPLETA", () => {
    // La gráfica que esto sustituye recortaba a "MM-DD" para el eje, y ese
    // texto ya no se puede leer como fecha.
    render(<InstallActivityCalendar buckets={windowOf(30)} />);
    expect(screen.getByText("2026-06-22")).toBeInTheDocument();
    expect(screen.getByText("2026-07-21")).toBeInTheDocument();
  });
});
