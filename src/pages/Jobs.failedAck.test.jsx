// src/pages/Jobs.failedAck.test.jsx
//
// 🔴 EL CASO DE CAMPO (30-sep). Un lote de 25 remediaciones con UN fix fallido
// (69b4aa78) llegó con su ack entero en `last_error` —23 KB de base64— y la
// página lo enseñaba así en tres sitios: la celda de estado (y su tooltip), el
// bloque «Last Error» del detalle, y «Failures → By cause», que lo listaba
// como «patch_remediate_batch:done» — un éxito, a la vista.
//
// Lo que esto fija es el CABLEADO de la página: que los tres sitios usen la
// lectura (utils/jobDescribe + jobInsights) y no el texto crudo. La lectura en
// sí la prueban sus propios tests.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";
import { failedRemediationBatchJob } from "../test/fixtures/failedRemediationBatch";

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

const haceHoras = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

const lote = () => ({
  ...failedRemediationBatchJob(),
  device_id: "dev-srvoc",
  created_at: haceHoras(2),
  updated_at: haceHoras(2),
  completed_at: haceHoras(2),
});

const otro = () => ({
  job_id: "ok-1",
  device_id: "dev-x",
  job_type: "agent_update",
  status: "completed",
  created_at: haceHoras(1),
  updated_at: haceHoras(1),
});

function mount() {
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (/\/tenants\/[^/]+\/jobs$/.test(url.pathname)) {
        return HttpResponse.json({ ok: true, items: [lote(), otro()], truncated: false });
      }
      if (/\/orchestrator\/jobs\/69b4aa78/.test(url.pathname)) {
        return HttpResponse.json({ ok: true, job: lote() });
      }
      return HttpResponse.json({ ok: true, items: [], jobs: [], devices: [], types: [], total: 0, buckets: [] });
    })
  );
  window.history.replaceState({}, "", "/?page=jobs");
  render(<ConfirmProvider><Jobs onNavigate={vi.fn()} /></ConfirmProvider>);
}

const filas = () => screen.getByText(/^Showing/).parentElement.textContent;
// La página abre el primer job en el detalle, así que el titular sale DOS
// veces: se busca el de la rejilla.
const celda = async () => within(await screen.findByRole("grid")).findByText(/^Batch finished — 25 fixes: 1 failed/);

describe("Jobs — un job fallido cuyo error es el ack del agente", () => {
  it("🔴 la celda de estado dice qué falló, sin base64 ni en el texto ni en el tooltip", async () => {
    mount();
    const line = await celda();
    expect(line.textContent).toMatch(/syscall fchmodat2 does not exist/);
    expect(line.getAttribute("title")).not.toMatch(/items=|WyJ/);
    expect(document.body.textContent).not.toMatch(/items=WyJ/);
  });

  it("🔴 «Failures → By cause» nombra la causa real, y pulsarla ENCUENTRA el job", async () => {
    const user = userEvent.setup();
    mount();
    const cause = await screen.findByRole("button", { name: /^post_state_mismatch: syscall fchmodat/ });
    expect(screen.queryByRole("button", { name: /patch_remediate_batch:done/ })).not.toBeInTheDocument();

    await waitFor(() => expect(filas()).toMatch(/Showing\s*2\s*rows\b/));
    await user.click(cause);
    // La causa está NORMALIZADA (fchmodatN, xN_N) y el lote en base64: sin
    // casar contra las causas, esta búsqueda daba 0 filas.
    await waitFor(() => expect(filas()).toMatch(/Showing\s*1\s*row\b/));
  });

  it("🔴 el detalle lo lee en «What happened» y NO vuelca el crudo en «Last Error»", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await celda());

    expect(await screen.findByText("What happened")).toBeInTheDocument();
    const panel = screen.getByText("What happened").closest("div").parentElement;
    expect(within(panel).getAllByText(/Batch finished — 25 fixes/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Last Error")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raw error" })).toHaveAttribute("aria-expanded", "false");
  });
});
