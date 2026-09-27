// src/pages/Jobs.stuck.test.jsx
//
// 🔴 EL CASO DE CAMPO (26-sep). Un uninstall de AnyDesk quemó sus cinco
// intentos, quedó muerto en `retrying` y la franja de Jobs decía
// «STUCK IN QUEUE 0 · SUCCESS RATE 99% · 154 of 155». El job no caía en
// ninguno de los cuatro números: `failed` y `timeout` piden ESE estado,
// `stuck` pedía `sent_at` nulo —«nunca enviado»— y el denominador de la tasa
// excluye lo que está en vuelo.
//
// ⚠️ LO QUE ESTO FIJA NO ES EL CONTADOR, SINO QUE EL CONTADOR Y LA TABLA
// CUENTEN LO MISMO. Eran dos predicados escritos por separado, y el comentario
// de `matchesStuck` ya avisaba del riesgo: que la celda contara filas que la
// tabla no supiera enseñar. Pulsar la celda y no ver nada es peor que el 0,
// porque parece que el problema se arregló solo.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve({ role: "ADMIN", permissions: ["jobs"] }),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 1, tenantMember: { role: "ADMIN", isActive: true, tenantId: 1 } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import Jobs from "./Jobs";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

// ⚠️ Relativo al reloj REAL, no a una fecha fija con timers simulados: lo que
// se mide es una ANTIGÜEDAD, y `deriveTriage` usa `Date.now()`. Clavar el reloj
// obligaba a simular timers para que `userEvent` pudiera hacer clic, y eso es
// mucha maquinaria para no medir nada más.
const haceHoras = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

// El job real: enviado, `retrying`, sin moverse desde hace 40 h.
const anydesk = () => ({
  job_id: "51489beb",
  device_id: "dev-lab02",
  job_type: "software_install",
  status: "retrying",
  attempts: 5,
  max_attempts: 5,
  created_at: haceHoras(44),
  sent_at: haceHoras(40),
  updated_at: haceHoras(40),
  last_error: "agent_retry:software_install:timed_out",
  // ⚠️ El plazo que calcula el servidor (`staleAfter`): enviado, sin
  // presupuesto y con su timeout ya cumplido. Es el camino REAL; el respaldo
  // de 24 h sólo corre contra un backend anterior al 27-sep.
  stale_after: haceHoras(39),
});

const vivos = () => Array.from({ length: 4 }, (_v, i) => ({
  job_id: `ok-${i}`,
  device_id: "dev-x",
  job_type: "agent_update",
  status: "completed",
  created_at: haceHoras(2),
  updated_at: haceHoras(2),
  stale_after: haceHoras(-24),
}));

function mount(items) {
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (/\/tenants\/[^/]+\/jobs$/.test(url.pathname)) {
        return HttpResponse.json({ ok: true, items, truncated: false });
      }
      return HttpResponse.json({ ok: true, items: [], jobs: [], devices: [], types: [], total: 0, buckets: [] });
    })
  );
  window.history.replaceState({}, "", "/?page=jobs");
  render(<ConfirmProvider><Jobs onNavigate={vi.fn()} /></ConfirmProvider>);
}

/** El número de una celda de la franja, leído por su etiqueta. */
async function cell(label) {
  const el = await screen.findByText(label);
  return el.closest("div")?.parentElement?.textContent ?? "";
}

describe("Jobs — un job muerto no se esconde en la franja", () => {
  it("🔴 un `retrying` enviado y parado 40 h cuenta como STUCK", async () => {
    mount([anydesk(), ...vivos()]);

    await waitFor(async () => expect(await cell("STUCK")).toMatch(/1/));
  });

  it("🔴 y entra en el denominador de la tasa: 4 de 5, no 4 de 4", async () => {
    // Era lo que producía el «154 of 155» con el job muerto fuera de la cuenta.
    mount([anydesk(), ...vivos()]);

    await waitFor(async () => expect(await cell("SUCCESS RATE")).toMatch(/4 of 5/));
  });

  it("🔴 pulsar STUCK enseña ESA fila, no una tabla vacía", async () => {
    // La mitad que importa: contar algo que la tabla no sabe enseñar manda al
    // operador a un callejón sin salida.
    const user = userEvent.setup();
    mount([anydesk(), ...vivos()]);

    const filas = () => screen.getByText(/^Showing/).parentElement.textContent;

    await waitFor(() => expect(filas()).toMatch(/Showing\s*5\s*rows\b/));
    await waitFor(async () => expect(await cell("STUCK")).toMatch(/1/));

    await user.click(screen.getByText("STUCK"));

    // La tabla enseña «Device · Type», no el id del job, así que lo que se
    // comprueba es el CONTRATO: de las cinco filas queda exactamente la que la
    // celda prometía. Cero filas sería el fallo que esto vigila.
    await waitFor(() => expect(filas()).toMatch(/Showing\s*1\s*row\b/));
  });

  it("⚠️ sin nada parado la celda es 0 y la tasa no se ensucia", async () => {
    mount(vivos());

    await waitFor(async () => expect(await cell("STUCK")).toMatch(/0/));
    await waitFor(async () => expect(await cell("SUCCESS RATE")).toMatch(/4 of 4/));
  });
});
