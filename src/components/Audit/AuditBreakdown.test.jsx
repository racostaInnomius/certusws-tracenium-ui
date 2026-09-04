import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * El resumen que sustituye a la serie temporal en la página de Audit.
 *
 * Lo que se prueba son las tres decisiones del rediseño, cada una de las
 * cuales se puede escribir al revés sin que nada falle:
 *
 *   · la franja de atención NO respeta el carril (si lo respetara, un
 *     enrolamiento denegado sólo se vería acertando el selector);
 *   · la lista de actividad SÍ lo respeta (es la que responde "quién cambió
 *     qué", y con errores de máquina dentro dejaba de responderlo);
 *   · un fallo de carga no se pinta como "no hay nada" — la lección que dejó
 *     la gráfica anterior seis días en blanco.
 */

import AuditBreakdown from "./AuditBreakdown";

afterEach(cleanup);

const data = {
  windowDays: 30,
  activity: [
    { eventType: "POLICY_TENANT_PUSHED", category: "Policy", count: 20, lastAt: "2026-09-03T10:00:00Z" },
    { eventType: "POLICY_TENANT_CONFIG_CHANGED", category: "Policy", count: 13, lastAt: "2026-09-03T09:00:00Z" },
    { eventType: "TRIAL_EXTENDED", category: "Billing & reports", count: 2, lastAt: "2026-08-26T09:00:00Z" },
  ],
  attention: [
    { eventType: "grpc_connect", outcome: "rejected", count: 31, lastAt: "2026-08-16T06:00:00Z" },
    { eventType: "AI_GATEWAY_CALL", outcome: "error", count: 14, lastAt: "2026-09-03T21:00:00Z" },
  ],
  totals: { activity: 35, attention: 45 },
};

const sano = { windowDays: 30, activity: data.activity, attention: [], totals: { activity: 35, attention: 0 } };

describe("la franja de atención", () => {
  it("va PRIMERA, antes de la actividad", async () => {
    // Es lo raro y lo único que puede exigir una acción hoy. Debajo del
    // ranking se lee después de treinta filas rutinarias.
    const { container } = render(<AuditBreakdown data={data} />);
    const texto = container.textContent;
    expect(texto.indexOf("Needs attention")).toBeLessThan(texto.indexOf("What happened"));
  });

  it("dice explícitamente que ignora el carril", async () => {
    // Sin la frase, quien esté en "Administrative" creerá que estos rechazos
    // son acciones de personas — justo la confusión que el rediseño arregla.
    render(<AuditBreakdown data={data} lane="admin" />);
    expect(screen.getByText(/shown whichever lane is selected/i)).toBeTruthy();
  });

  it("distingue rechazo de error: no se atienden igual", async () => {
    render(<AuditBreakdown data={data} />);
    expect(screen.getByText("Rejected")).toBeTruthy();
    expect(screen.getByText("Error")).toBeTruthy();
  });

  it("desaparece del todo cuando no hay nada que atender", async () => {
    // Una franja vacía permanente enseña a ignorar la zona donde luego
    // aparecerá algo importante.
    render(<AuditBreakdown data={sano} />);
    expect(screen.queryByText(/Needs attention/i)).toBeNull();
  });
});

describe("qué pasó", () => {
  it("respeta el orden que manda el backend, de más a menos", async () => {
    // El backend ya ordena; si el componente reordenara por su cuenta habría
    // dos criterios y ninguno sería el que se lee en la pantalla.
    const { container } = render(<AuditBreakdown data={data} />);
    const texto = container.textContent;
    expect(texto.indexOf("Tenant policy pushed")).toBeLessThan(texto.indexOf("Trial extended"));
  });

  it("traduce el tipo crudo a lenguaje humano y trae la categoría", async () => {
    // `POLICY_TENANT_PUSHED` no significa nada para quien audita.
    render(<AuditBreakdown data={data} />);
    expect(screen.getByText("Tenant policy pushed")).toBeTruthy();
    expect(screen.getByText("Billing & reports")).toBeTruthy();
  });

  it("dice el total con el nombre del carril, no un genérico", async () => {
    render(<AuditBreakdown data={data} lane="admin" />);
    expect(screen.getByText("35 actions")).toBeTruthy();

    cleanup();
    render(<AuditBreakdown data={data} lane="system" />);
    expect(screen.getByText("35 machine events")).toBeTruthy();
  });

  it("cuando el carril admin está vacío, dice DÓNDE está lo demás", async () => {
    // Un "no hay nada" a secas hace pensar que el producto no registra. La
    // frase manda al carril de sistema, que es donde está el volumen.
    render(
      <AuditBreakdown
        data={{ windowDays: 30, activity: [], attention: [], totals: { activity: 0, attention: 0 } }}
        lane="admin"
      />
    );
    expect(screen.getByText(/System lane/)).toBeTruthy();
  });

  it("no pinta cien filas: corta y dice cuántas faltan", async () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ({
      eventType: `EVENT_${i}`,
      category: "Other",
      count: 20 - i,
      lastAt: "2026-09-03T10:00:00Z",
    }));
    render(
      <AuditBreakdown
        data={{ windowDays: 30, activity: muchos, attention: [], totals: { activity: 210, attention: 0 } }}
        limit={8}
      />
    );
    expect(screen.getByText(/\+12 more event types/)).toBeTruthy();
  });
});

describe("es un índice de la tabla, no un adorno", () => {
  it("pulsar una fila de actividad filtra por ese tipo", async () => {
    const onSelect = vi.fn();
    render(<AuditBreakdown data={data} onSelectEventType={onSelect} />);

    await userEvent.click(screen.getAllByRole("button")[0]);
    expect(onSelect).toHaveBeenCalled();
  });

  it("pulsar un fallo filtra por tipo Y resultado", async () => {
    // Filtrar sólo por tipo traería los 60.000 `grpc_connect` sanos junto a
    // los 31 rechazos, que es justo lo que no se está buscando.
    const onSelect = vi.fn();
    render(<AuditBreakdown data={data} onSelectEventType={onSelect} />);

    const franja = screen.getByText(/Needs attention/i).closest("div").parentElement;
    await userEvent.click(within(franja).getAllByRole("button")[0]);

    expect(onSelect).toHaveBeenCalledWith("grpc_connect", "rejected");
  });
});

describe("los estados que no son datos", () => {
  it("un fallo de carga NO se pinta como 'no hay nada'", async () => {
    // La lección de la gráfica anterior: un 500 leído como "sin eventos"
    // sobrevivió seis días porque nadie mira dos veces una consola tranquila.
    render(<AuditBreakdown data={null} failed />);

    expect(screen.getByText(/Couldn't load/i)).toBeTruthy();
    expect(screen.getByText(/not the same as/i)).toBeTruthy();
    expect(screen.queryByText(/No events in this window/i)).toBeNull();
  });

  it("mientras carga no acusa ni fallo ni vacío", async () => {
    const { container } = render(<AuditBreakdown data={null} loading />);
    expect(container.querySelector(".MuiSkeleton-root")).toBeTruthy();
    expect(screen.queryByText(/Couldn't load/i)).toBeNull();
  });
});
