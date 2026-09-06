// src/components/software-delivery/InstallFailuresPanel.test.jsx
//
// Fase 4: el Overview pasa de informar a orientar.
//
// El caso que lo motiva es tenant 111: `SUCCESS RATE 11%` — 8 de 9 fallidas —
// mostrado como una tarjeta más entre cuatro en cero. El número más alarmante
// de la pantalla no decía cuáles fallaron, ni por qué, ni llevaba a ningún
// sitio.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InstallFailuresPanel, { failureBreakdown } from "./InstallFailuresPanel";

const dep = (id, counts, extra = {}) => ({ id, counts, ...extra });

afterEach(cleanup);

describe("failureBreakdown · agrupa por causa", () => {
  // La causa es lo accionable: seis firmas inválidas y dos timeouts son dos
  // problemas distintos con dos arreglos distintos. El agregado "8 fallidas"
  // los mezcla y no orienta.
  it("separa causas y suma los equipos de cada una", () => {
    const rows = failureBreakdown([
      dep(1, { signature_invalid: 4, timed_out: 1 }),
      dep(2, { signature_invalid: 2 }),
      dep(3, { success: 5 }),
    ]);

    expect(rows.map((r) => [r.key, r.count])).toEqual([
      ["signature_invalid", 6],
      ["timed_out", 1],
    ]);
  });

  // La más frecuente primero: es por donde se empieza.
  it("ordena por número de equipos, no por el orden del catálogo de causas", () => {
    const rows = failureBreakdown([dep(1, { failed: 1, timed_out: 9 })]);
    expect(rows[0].key).toBe("timed_out");
  });

  it("dice en qué despliegues ocurrió cada causa", () => {
    const rows = failureBreakdown([
      dep(1, { signature_invalid: 1 }),
      dep(2, { signature_invalid: 3 }),
      dep(3, { timed_out: 1 }),
    ]);
    const firmas = rows.find((r) => r.key === "signature_invalid");
    expect(firmas.deployments.map((d) => d.id)).toEqual([1, 2]);
  });

  it("ignora las causas sin equipos y los datos ausentes", () => {
    expect(failureBreakdown([dep(1, { signature_invalid: 0, success: 3 })])).toEqual([]);
    expect(failureBreakdown([])).toEqual([]);
    expect(failureBreakdown(undefined)).toEqual([]);
    expect(failureBreakdown([{ id: 1 }])).toEqual([]);
  });
});

describe("InstallFailuresPanel · encabeza sólo cuando hay algo que atender", () => {
  it("no se pinta sin fallos", () => {
    const { container } = render(
      <InstallFailuresPanel deployments={[dep(1, { success: 5 })]} failed={0} settled={5} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // ⚠️ El titular es el HECHO, no el porcentaje: "8 de 9" se entiende sin hacer
  // la cuenta y dice cuántos equipos son. Un 11% suelto no.
  it("titula con numerador y denominador", () => {
    render(
      <InstallFailuresPanel
        deployments={[dep(1, { signature_invalid: 8, success: 1 })]}
        failed={8}
        settled={9}
      />
    );
    expect(screen.getByText(/8 of 9 installs failed/i)).toBeInTheDocument();
  });

  // Las etiquetas son las MISMAS que usa el panel de resultados. Si dos sitios
  // de la página llaman distinto a lo mismo, el operador traduce mentalmente.
  it("nombra las causas como el resto de la página", () => {
    render(
      <InstallFailuresPanel
        deployments={[dep(1, { signature_invalid: 6, timed_out: 2 })]}
        failed={8}
        settled={9}
      />
    );
    expect(screen.getByText("Signature invalid")).toBeInTheDocument();
    expect(screen.getByText("Timed out")).toBeInTheDocument();
  });
});

describe("InstallFailuresPanel · lleva a donde está el detalle", () => {
  // ⚠️ Con UN despliegue detrás se puede abrir ESE. La página ya sabe hacerlo
  // por id (la misma fontanería del deploy recién lanzado), así que la causa
  // aterriza en los resultados por equipo, que es la pregunta que sigue.
  it("con un solo despliegue, lo entrega para abrirlo", async () => {
    const onOpen = vi.fn();
    render(
      <InstallFailuresPanel
        deployments={[dep(42, { signature_invalid: 3 }, { packageName: "WinZip" })]}
        failed={3}
        settled={4}
        onOpen={onOpen}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /3 signature invalid/i }));

    const [causa, single] = onOpen.mock.calls[0];
    expect(causa.key).toBe("signature_invalid");
    expect(single?.id).toBe(42);
  });

  // ⚠️ Con VARIOS no se entrega ninguno: abrir uno arbitrario contestaría una
  // pregunta que el operador no hizo. Se le lleva a la lista.
  it("con varios despliegues no elige uno por su cuenta", async () => {
    const onOpen = vi.fn();
    render(
      <InstallFailuresPanel
        deployments={[dep(1, { timed_out: 1 }), dep(2, { timed_out: 4 })]}
        failed={5}
        settled={9}
        onOpen={onOpen}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /5 timed out/i }));

    expect(onOpen.mock.calls[0][1]).toBeNull();
  });

  it("dice cuántos despliegues hay detrás de la causa", () => {
    render(
      <InstallFailuresPanel
        deployments={[dep(1, { timed_out: 1 }), dep(2, { timed_out: 4 })]}
        failed={5}
        settled={9}
      />
    );
    expect(screen.getByText(/across 2 deployments/i)).toBeInTheDocument();
  });

  it("se puede accionar con el teclado", async () => {
    const onOpen = vi.fn();
    render(
      <InstallFailuresPanel
        deployments={[dep(7, { failed: 2 })]}
        failed={2}
        settled={5}
        onOpen={onOpen}
      />
    );

    screen.getByRole("button", { name: /2 failed/i }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalled();
  });
});
