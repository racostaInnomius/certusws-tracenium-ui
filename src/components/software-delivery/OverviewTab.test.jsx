// src/components/software-delivery/OverviewTab.test.jsx
//
// The overview derives almost everything client-side from lists the page
// already fetches, so these tests lock down the DERIVATIONS (the part that
// can silently go wrong) rather than the layout.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { server, respond } from "../../test/msw/server";
import OverviewTab from "./OverviewTab";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function seed({ packages = [], deployments = [], intakes = [], sites = [], dps = [], tiers = null } = {}) {
  respond("get", /\/api\/v1\/software-delivery\/analytics\/timeseries.*/, {
    ok: true,
    windowDays: 30,
    buckets: [{ bucket: "2026-07-18", succeeded: 4, failed: 1, total: 5 }],
  });
  respond("get", /\/api\/v1\/software-delivery\/analytics\/tier-stats.*/, {
    ok: true,
    stats: tiers ?? { dp: 0, cdn: 0, origin: 0, unknown: 0, total: 0 },
  });
  respond("get", /\/api\/v1\/software-delivery\/distribution\/sites.*/, { ok: true, items: sites });
  respond("get", /\/api\/v1\/software-delivery\/distribution\/dps.*/, { ok: true, items: dps });
  respond("get", /\/api\/v1\/software-delivery\/intake.*/, { ok: true, items: intakes });
  respond("get", /\/api\/v1\/software-delivery\/deployments.*/, { ok: true, items: deployments });
  // Catalog is the bare base path — registered last so the more specific
  // matchers above win.
  respond("get", /\/api\/v1\/software-delivery(\?.*)?$/, { ok: true, items: packages });
}

/**
 * Read a KPI card's value by its title. Scoped with `within` because the same
 * bare number legitimately appears elsewhere (an outcome bar, another card) —
 * a global getByText would be ambiguous and flaky.
 */
async function cardValue(title) {
  const label = await screen.findByText(title);
  const card = label.closest(".MuiPaper-root");
  expect(card).toBeTruthy();
  return within(card);
}

const counts = (over = {}) => ({
  pending: 0, running: 0, success: 0, already_installed: 0, failed: 0,
  rejected: 0, signature_invalid: 0, timed_out: 0, cancelled: 0, reboot_required: 0,
  ...over,
});

describe("OverviewTab", () => {
  it("counts only ACTIVE deployments as in-flight", async () => {
    seed({
      deployments: [
        { id: 1, status: "running", counts: counts({ running: 5 }) },
        { id: 2, status: "queued", counts: counts({ pending: 3 }) },
        { id: 3, status: "completed", counts: counts({ success: 10 }) },
        { id: 4, status: "failed", counts: counts({ failed: 2 }) },
      ],
    });
    render(<OverviewTab />);
    // 2 of the 4 are still in flight (running + queued).
    await waitFor(async () => {
      const card = await cardValue("Active deployments");
      expect(card.getByText("2")).toBeInTheDocument();
    });
  });

  it("treats already-installed and reboot-required as successful in the rate", async () => {
    seed({
      deployments: [
        {
          id: 1,
          status: "completed",
          // 9 good landings (5 + 3 + 1) vs 1 failure → 90%
          counts: counts({ success: 5, already_installed: 3, reboot_required: 1, failed: 1 }),
        },
      ],
    });
    render(<OverviewTab />);

    // ⚠️ CAMBIÓ LA PRESENTACIÓN, NO LA DERIVACIÓN (fase 4).
    //
    // Con fallos, el bloque de cabecera dice "1 of 10 installs failed" — la
    // misma cuenta, con numerador Y denominador, y encima lleva a la causa. La
    // tarjeta de "11% suelto" era la versión decorativa del mismo dato, y
    // mantener las dos duplica en la franja superior justo lo que la fase 4
    // limpia. El porcentaje sigue estando cuando NO hay fallos (test de abajo).
    expect(await screen.findByText(/1 of 10 installs failed/i)).toBeInTheDocument();
    expect(screen.queryByText("Success rate")).toBeNull();
  });

  it("muestra el porcentaje cuando no hay nada que atender", async () => {
    seed({
      deployments: [
        { id: 1, status: "completed", counts: counts({ success: 9, already_installed: 1 }) },
      ],
    });
    render(<OverviewTab />);

    const card = await cardValue("Success rate");
    expect(card.getByText("100%")).toBeInTheDocument();
    // Sin fallos no hay bloque que encabezar.
    expect(screen.queryByText(/installs failed/i)).toBeNull();
  });

  it("reports site coverage counting only ACTIVE distribution points", async () => {
    seed({
      sites: [
        { id: 1, name: "HQ", isActive: true },
        { id: 2, name: "Branch", isActive: true },
        { id: 3, name: "Old", isActive: false }, // inactive sites are out of scope
      ],
      dps: [
        { id: 10, siteId: 1, status: "active" },
        { id: 11, siteId: 2, status: "disabled" }, // disabled does NOT cover
      ],
    });
    render(<OverviewTab />);
    // 1 of 2 active sites covered.
    await waitFor(async () => {
      const card = await cardValue("Site coverage");
      expect(card.getByText("1/2")).toBeInTheDocument();
    });
  });

  it("surfaces the LAN share when tier stats are present", async () => {
    seed({ tiers: { dp: 90, cdn: 8, origin: 2, unknown: 0, total: 100 } });
    render(<OverviewTab />);
    await waitFor(() =>
      expect(screen.getByText(/90% served from the LAN/i)).toBeInTheDocument()
    );
  });

  it("renders without crashing when every endpoint fails", async () => {
    respond("get", /\/api\/v1\/software-delivery.*/, { ok: false }, { status: 500 });
    render(<OverviewTab />);
    // Cards still mount, showing the em-dash placeholder instead of throwing.
    await waitFor(() => expect(screen.getByText("Packages")).toBeInTheDocument());
  });
});

describe("OverviewTab · la tarjeta de intakes tras retirar la pestaña", () => {
  // ⚠️ EL ENLACE MUERTO QUE LA FASE 3 PODÍA DEJAR.
  //
  // Esta tarjeta navegaba a `onNavigateTab("intake")`. Al retirar esa pestaña,
  // `TAB_INDEX["intake"]` pasa a ser undefined y el `?? 0` de la página deja al
  // operador en el Overview: el clic parece no hacer nada. No hay error, no hay
  // aviso — exactamente la clase de fallo silencioso que se cuela en un
  // refactor que quita superficie.
  //
  // Ahora lleva al CATÁLOGO y pide abrir la cola, que es donde la revisión vive.
  it("lleva al catálogo y pide abrir la cola de revisión", async () => {
    const onNavigateTab = vi.fn();
    seed({ intakes: [{ id: 1, status: "pending_review" }] });
    render(<OverviewTab onNavigateTab={onNavigateTab} />);

    const label = await screen.findByText("Intakes to review");
    await userEvent.click(label.closest(".MuiPaper-root"));

    expect(onNavigateTab).toHaveBeenCalledTimes(1);
    const [destino, opciones] = onNavigateTab.mock.calls[0];
    expect(destino).toBe("catalog");
    // Sin esta intención el operador aterriza en el catálogo sin la cola
    // abierta, y la tarjeta habría prometido más de lo que entrega.
    expect(opciones?.reviewQueue).toBe(true);
  });

  // ⚠️ Afirma que NO queda ninguna referencia a la pestaña retirada. Si alguien
  // reintroduce "intake" como destino, esto cae aquí y no en producción.
  it("ya no navega a la pestaña retirada", async () => {
    const onNavigateTab = vi.fn();
    seed({ intakes: [{ id: 1, status: "pending_review" }] });
    render(<OverviewTab onNavigateTab={onNavigateTab} />);

    const label = await screen.findByText("Intakes to review");
    await userEvent.click(label.closest(".MuiPaper-root"));

    expect(onNavigateTab.mock.calls[0][0]).not.toBe("intake");
  });
});
