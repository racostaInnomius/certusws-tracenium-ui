// src/components/software-delivery/OverviewTab.test.jsx
//
// The overview derives almost everything client-side from lists the page
// already fetches, so these tests lock down the DERIVATIONS (the part that
// can silently go wrong) rather than the layout.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { server, respond } from "../../test/msw/server";
import OverviewTab, { countCatalogUpdates } from "./OverviewTab";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function seed({ packages = [], deployments = [], intakes = [], sites = [], dps = [], tiers = null, coverage } = {}) {
  respond("get", /\/api\/v1\/software-delivery\/analytics\/catalog-coverage.*/, {
    ok: true,
    totalDevices: coverage?.totalDevices ?? 0,
    items: coverage?.items ?? [],
    truncated: false,
  });
  respond("get", /\/api\/v1\/software-delivery\/analytics\/timeseries.*/, {
    ok: true,
    windowDays: 30,
    buckets: [{ bucket: "2026-07-18", succeeded: 4, failed: 1, total: 5 }],
  });
  // El Overview ya no pide los dos repartos por tier: pide el AHORRO.
  respond("get", /\/api\/v1\/software-delivery\/analytics\/lan-savings.*/, {
    ok: true,
    windowDays: 30,
    lan: tiers?.lan ?? { downloads: 0, bytes: 0 },
    wan: tiers?.wan ?? { downloads: 0, bytes: 0 },
    unpricedDownloads: 0,
    activeDistributionPoints: tiers?.dps ?? 0,
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
    // 2 of the 4 are still in flight (running + queued). Ahora lo dice el
    // titular de la franja, no una tarjeta: es LA respuesta a "¿tengo algo en
    // marcha?", y con 8 en vuelo el resto de la franja sobra.
    expect(await screen.findByText(/2 deployments in flight/i)).toBeInTheDocument();
    expect(screen.getByText(/8 devices still to report/i)).toBeInTheDocument();
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

    // El dato sigue, en la franja y como frase. La tarjeta de «Success rate»
    // se fue con las otras cuatro; lo que no se fue es la noticia.
    expect(await screen.findByText("All 10 succeeded")).toBeInTheDocument();
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
      const card = await cardValue("Sites with a DP");
      expect(card.getByText("1/2")).toBeInTheDocument();
    });
  });

  // El panel dejó de hablar en porcentajes: el titular son los BYTES que no
  // cruzaron la WAN, porque un 90% no dice si son 2 GB o 200.
  it("enseña el ahorro de ancho de banda cuando hay descargas servidas por LAN", async () => {
    const GB = 1024 ** 3;
    seed({
      tiers: {
        lan: { downloads: 90, bytes: 90 * GB },
        wan: { downloads: 10, bytes: 10 * GB },
        dps: 1,
      },
    });
    render(<OverviewTab />);
    await waitFor(() => expect(screen.getByText(/≈ 90/)).toBeInTheDocument());
    expect(screen.getByText("90 of 100 downloads")).toBeInTheDocument();
  });

  it("renders without crashing when every endpoint fails", async () => {
    respond("get", /\/api\/v1\/software-delivery.*/, { ok: false }, { status: 500 });
    render(<OverviewTab />);
    // Cards still mount, showing the em-dash placeholder instead of throwing.
    await waitFor(() =>
      expect(screen.getByText("Deployable packages")).toBeInTheDocument()
    );
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

    await userEvent.click(await screen.findByRole("button", { name: /awaiting review/i }));

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

    await userEvent.click(await screen.findByRole("button", { name: /awaiting review/i }));

    expect(onNavigateTab.mock.calls[0][0]).not.toBe("intake");
  });
});

describe("countCatalogUpdates · se cuentan TÍTULOS, no entradas", () => {
  const linked = (over) => ({
    titleKey: "google-chrome", supersededBy: null,
    linkedVersionOfTitle: "152.0.7977.83", linkedPackageId: null, ...over,
  });

  // ⚠️ Chrome con una versión nueva para Windows y otra para macOS es UNA
  // novedad que atender, no dos: el operador decide una vez por producto.
  // Contar entradas inflaría el aviso justo en los títulos multiplataforma,
  // que son los que más se usan.
  it("un título con dos plataformas cuenta una vez", () => {
    expect(countCatalogUpdates([
      linked({ platform: "windows" }),
      linked({ platform: "macos" }),
    ])).toBe(1);
  });

  it("títulos distintos suman", () => {
    expect(countCatalogUpdates([
      linked({ titleKey: "google-chrome" }),
      linked({ titleKey: "microsoft-edge" }),
    ])).toBe(2);
  });

  // Sin nada enlazado de ese título no hay novedad: es un producto que no usas.
  it("no cuenta lo que el tenant nunca enlazó", () => {
    expect(countCatalogUpdates([linked({ linkedVersionOfTitle: null })])).toBe(0);
  });

  // Ni lo que ya tiene.
  it("no cuenta la versión que ya tiene enlazada", () => {
    expect(countCatalogUpdates([linked({ linkedPackageId: 77 })])).toBe(0);
  });

  // Una versión superada no es novedad aunque el tenant no la tenga.
  it("no cuenta versiones superadas", () => {
    expect(countCatalogUpdates([linked({ supersededBy: 9 })])).toBe(0);
  });

  it("aguanta lo vacío y lo ausente", () => {
    expect(countCatalogUpdates([])).toBe(0);
    expect(countCatalogUpdates(undefined)).toBe(0);
  });
});

describe("cobertura del catálogo", () => {
  // El bloque que cambió el encuadre de la página: de «qué hizo la
  // herramienta» a «cómo está el parque». Aquí sólo se comprueba el CABLEADO
  // —que la llamada se hace y su respuesta llega al panel—; la lectura de la
  // barra vive en CatalogCoveragePanel.test.jsx.
  it("⭐ pide la cobertura y la pinta con la flota como denominador", async () => {
    seed({
      coverage: {
        totalDevices: 56,
        items: [
          {
            packageId: 9,
            name: "Google Chrome",
            catalogVersion: "152.0.7977.83",
            installedDevices: 30,
            missingDevices: 26,
            current: 2,
            ahead: 25,
            behind: 3,
            unknown: 0,
            versions: [{ version: "153.0.8010.48", devices: 11, state: "ahead" }],
          },
        ],
      },
    });

    render(<OverviewTab />);

    expect(await screen.findByText("Catalog coverage")).toBeInTheDocument();
    expect(await screen.findByText("30/56")).toBeInTheDocument();
    expect(screen.getByText("26 without it")).toBeInTheDocument();
  });

  it("⚠️ si la cobertura falla, el resto del Overview sigue en pie", async () => {
    // `allSettled`: una llamada caída no puede llevarse la página por delante,
    // y el panel dice que no pudo cargar en vez de esfumarse.
    seed({});
    // El status va en el TERCER argumento de `respond`, no dentro del cuerpo.
    respond(
      "get",
      /\/api\/v1\/software-delivery\/analytics\/catalog-coverage.*/,
      { error: "INTERNAL_ERROR" },
      { status: 500 }
    );

    render(<OverviewTab />);

    expect(await screen.findByText(/Couldn’t load catalog coverage/)).toBeInTheDocument();
    expect(screen.getByText("Catalog coverage")).toBeInTheDocument();
  });
});

describe("despliegues en vuelo", () => {
  // El cableado: que el Overview pase SUS despliegues al panel y que abrir una
  // fila lleve a ESE despliegue, no a la lista. La lectura del reparto vive en
  // InFlightDeploymentsPanel.test.jsx.
  it("⭐ enseña el retenido con su motivo, y la fila abre ese despliegue", async () => {
    const onNavigateTab = vi.fn();
    seed({
      deployments: [
        {
          id: 44,
          status: "scheduled",
          mode: "install",
          scheduledAt: "2026-09-19T03:00:00Z",
          packageSnapshot: { name: "Microsoft Edge", version: "152.0.4191.66" },
          counts: counts({ pending: 3 }),
        },
      ],
    });

    render(<OverviewTab onNavigateTab={onNavigateTab} />);

    expect(await screen.findByText("In flight now")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for the maintenance window/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Deployment 44/i }));
    expect(onNavigateTab).toHaveBeenCalledWith("deployments", { deploymentId: 44 });
  });

  it("sin nada en vuelo el bloque no ocupa sitio", async () => {
    seed({ deployments: [{ id: 9, status: "completed", counts: counts({ success: 2 }) }] });

    render(<OverviewTab />);

    await screen.findByText("Catalog coverage");
    expect(screen.queryByText("In flight now")).toBeNull();
  });
});
