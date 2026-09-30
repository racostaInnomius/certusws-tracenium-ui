// src/components/software-delivery/CatalogCoveragePanel.test.jsx
//
// El bloque que contesta «¿cómo está el parque frente a lo que publiqué?».
//
// Lo que se fija aquí son las DECISIONES DE LECTURA, que son las que pueden
// mentir sin dar error: el denominador de la barra, que «sin instalar» no se
// cuele como si fuera una versión instalada, y que un panel que no carga lo
// diga en vez de desaparecer.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CatalogCoveragePanel, {
  catalogLagsFleet,
  catalogLine,
  coverageSegments,
  eligibleOf,
  labelWidthPx,
  segmentLabelColor,
  STATES,
  versionSummary,
} from "./CatalogCoveragePanel";
import { TEXT_MUTED } from "../../theme/brand";

afterEach(cleanup);

/** La forma real de Chrome en T111: 30 de 56, casi todos auto-actualizados. */
const chrome = {
  titleKey: "google-chrome",
  name: "Google Chrome",
  catalogVersion: "152.0.7977.83",
  catalogVersions: [{ platform: "windows", version: "152.0.7977.83" }],
  platforms: ["windows"],
  eligibleDevices: 56,
  installedDevices: 30,
  missingDevices: 26,
  current: 2,
  ahead: 25,
  behind: 3,
  unknown: 0,
  versions: [
    { version: "153.0.8010.48", devices: 11, state: "ahead" },
    { version: "153.0.8010.50", devices: 9, state: "ahead" },
    { version: "152.0.7977.83", devices: 2, state: "current" },
  ],
};

describe("coverageSegments", () => {
  it("⭐ el denominador son los equipos DONDE SE PUEDE DESPLEGAR, no lo instalado", () => {
    // Con el instalado como denominador, un título que tiene 30 de 56 pintaría
    // la barra llena y la fila diría lo contrario de lo que pasa.
    const segs = coverageSegments(chrome, 56);
    const total = segs.reduce((n, s) => n + s.pct, 0);
    expect(Math.round(total)).toBe(100);
    expect(Math.round(segs.find((s) => s.key === "missing").pct)).toBe(46);
  });

  it("⭐ un título sólo de Windows no se mide contra los Macs de la casa", () => {
    // La flota son 56, pero sólo 40 pueden tenerlo. Midiendo contra 56, la
    // barra dejaría un hueco de 16 equipos que NO están sin instalar: están
    // fuera de la pregunta, y ese hueco invita a un despliegue imposible.
    const soloWindows = { ...chrome, eligibleDevices: 40, installedDevices: 30, missingDevices: 10 };
    const segs = coverageSegments(soloWindows, 56);
    expect(Math.round(segs.find((s) => s.key === "missing").pct)).toBe(25);
    expect(Math.round(segs.reduce((n, s) => n + s.pct, 0))).toBe(100);
  });

  it("el hueco «sin instalar» va al final y sin color de estado", () => {
    const segs = coverageSegments(chrome, 56);
    expect(segs[segs.length - 1]).toMatchObject({ key: "missing", devices: 26, color: null });
  });

  it("los estados a cero no ocupan sitio", () => {
    const segs = coverageSegments(chrome, 56);
    expect(segs.map((s) => s.key)).toEqual(["current", "ahead", "behind", "missing"]);
    expect(segs.some((s) => s.devices === 0)).toBe(false);
  });

  it("sin equipos donde desplegar no hay barra que dibujar", () => {
    expect(coverageSegments({ ...chrome, eligibleDevices: 0 }, 56)).toEqual([]);
  });
});

describe("eligibleOf y catalogLine", () => {
  it("⚠️ una respuesta ANTERIOR al cambio se mide contra la flota, no contra cero", () => {
    // Durante un despliegue escalonado la UI puede recibir la forma vieja, que
    // no traía `eligibleDevices`. Un 0 pintaría la fila vacía: «nadie lo tiene».
    const { eligibleDevices, ...viejo } = chrome;
    expect(eligibleDevices).toBe(56);
    expect(eligibleOf(viejo, 56)).toBe(56);
  });

  it("dice la versión publicada y para qué plataformas", () => {
    expect(catalogLine(chrome)).toBe("catalog 152.0.7977.83 · Windows");
  });

  it("⚠️ con versiones distintas por plataforma NO elige una", () => {
    // Enseñar «catalog 154» cuando en macOS se publicó la 153 sería inventar la
    // mitad del dato.
    expect(
      catalogLine({
        catalogVersion: null,
        catalogVersions: [
          { platform: "windows", version: "154.0.8037.58" },
          { platform: "macos", version: "153.0.1" },
        ],
      })
    ).toBe("catalog 154.0.8037.58 (Windows) · 153.0.1 (macOS)");
  });

  it("sin nada publicado no inventa una versión", () => {
    expect(catalogLine({})).toBe("catalog —");
  });
});

describe("versionSummary y catalogLagsFleet", () => {
  it("cuenta la dispersión y nombra la versión más extendida", () => {
    expect(versionSummary(chrome)).toBe("3 versions in the fleet · most common 153.0.8010.48 (11)");
  });

  it("un título que nadie tiene no inventa un resumen", () => {
    expect(versionSummary({ versions: [] })).toBeNull();
  });

  it("⚠️ avisa cuando NADIE está en la versión publicada", () => {
    // Es el caso de Firefox en T111: el único equipo va por delante. La
    // noticia no es el equipo, es que el paquete del catálogo está viejo.
    expect(catalogLagsFleet({ installedDevices: 1, current: 0, behind: 0, ahead: 1 })).toBe(true);
    expect(catalogLagsFleet(chrome)).toBe(false);
    expect(catalogLagsFleet({ installedDevices: 0, current: 0, behind: 0, ahead: 0 })).toBe(false);
  });
});

describe("CatalogCoveragePanel", () => {
  const coverage = { totalDevices: 56, items: [chrome], truncated: false };

  it("⭐ enseña cobertura, hueco y deriva de versiones", async () => {
    render(<CatalogCoveragePanel coverage={coverage} />);

    expect(await screen.findByText("30/56")).toBeInTheDocument();
    expect(screen.getByText("26 without it")).toBeInTheDocument();
    expect(screen.getByText("56 devices reporting inventory")).toBeInTheDocument();
    // ⚠️ La deriva de versiones SALIÓ de la fila el 24-sep: costaba un renglón
    // por título (90 px cada uno, 451 px el bloque) para un detalle que se lee
    // cuando ya has abierto el título. Vive en el cajón.
    expect(screen.queryByText(/3 versions in the fleet/)).toBeNull();
  });

  it("⭐ un título con dos plataformas es UNA fila", async () => {
    // La queja de campo: Chrome y Edge salían duplicados porque hay un paquete
    // por plataforma, y las dos filas enseñaban los mismos números.
    render(
      <CatalogCoveragePanel
        coverage={{
          totalDevices: 56,
          items: [
            {
              ...chrome,
              platforms: ["windows", "macos"],
              catalogVersions: [
                { platform: "windows", version: "152.0.7977.83" },
                { platform: "macos", version: "152.0.7977.83" },
              ],
            },
          ],
        }}
      />
    );

    expect(await screen.findAllByText("Google Chrome")).toHaveLength(1);
    expect(screen.getByText("catalog 152.0.7977.83 · Windows · macOS")).toBeInTheDocument();
  });

  it("⚠️ un título en TODOS los equipos donde cabe es el 100 %, no una fracción de la flota", async () => {
    // El porcentaje sólo se pinta cuando no falta nadie. Midiéndolo contra la
    // flota entera, un título instalado en los 40 Windows de una casa de 56
    // diría «71%» justo cuando está completo.
    render(
      <CatalogCoveragePanel
        coverage={{
          totalDevices: 56,
          items: [{ ...chrome, eligibleDevices: 40, installedDevices: 40, missingDevices: 0 }],
        }}
      />
    );

    expect(await screen.findByText("40/40")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("⚠️ si la llamada falla lo DICE, no desaparece", async () => {
    // El panel de LAN ya se esfumó en producción y la página decía exactamente
    // lo mismo que si el tenant no usara el DP.
    render(<CatalogCoveragePanel failed coverage={null} />);
    expect(await screen.findByText(/Couldn’t load catalog coverage/)).toBeInTheDocument();
  });

  it("sin equipos reportando no finge una cobertura del 0%", async () => {
    render(<CatalogCoveragePanel coverage={{ totalDevices: 0, items: [chrome] }} />);
    expect(await screen.findByText(/No device has reported a software inventory/)).toBeInTheDocument();
    expect(screen.queryByText("30/56")).toBeNull();
  });

  it("con el catálogo vacío lo dice sin ruido", async () => {
    render(<CatalogCoveragePanel coverage={{ totalDevices: 56, items: [] }} />);
    expect(await screen.findByText(/No deployable packages/)).toBeInTheDocument();
  });

  it("un recuento truncado se declara", async () => {
    render(<CatalogCoveragePanel coverage={{ ...coverage, truncated: true }} />);
    expect(await screen.findByText(/these counts are a floor/)).toBeInTheDocument();
  });

  it("⭐ cada tramo lleva a SUS equipos", async () => {
    // La queja de campo: «Behind» tenía que llevar a un listado de esos
    // equipos. Antes la fila entera iba a la pestaña Catalog, que no contesta
    // nada — el operador ya sabe que publicó Chrome.
    const onOpenCell = vi.fn();
    render(<CatalogCoveragePanel coverage={coverage} onOpenCell={onOpenCell} />);

    await userEvent.click(await screen.findByText("3 behind"));
    expect(onOpenCell).toHaveBeenCalledWith(expect.objectContaining({ name: "Google Chrome" }), "behind");

    await userEvent.click(screen.getByText("26 not installed"));
    expect(onOpenCell).toHaveBeenLastCalledWith(expect.anything(), "missing");
  });

  it("⚠️ los contadores son pulsables porque un tramo del 1 % no lo es", async () => {
    // «2 por detrás» de 56 equipos mide dos píxeles en la barra: pulsable en
    // teoría, inalcanzable con el ratón. Y es justo el tramo que lleva a la
    // acción, así que el número tiene que ser un control de verdad.
    const onOpenCell = vi.fn();
    render(
      <CatalogCoveragePanel
        coverage={{
          totalDevices: 56,
          items: [{ ...chrome, current: 54, ahead: 0, behind: 2, missingDevices: 0, installedDevices: 56, eligibleDevices: 56 }],
        }}
        onOpenCell={onOpenCell}
      />
    );

    const contador = await screen.findByRole("button", { name: /Google Chrome, Behind: 2 devices/i });
    contador.focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpenCell).toHaveBeenCalledWith(expect.anything(), "behind");
  });

  it("sin manejador de celda los tramos no fingen ser botones", async () => {
    render(<CatalogCoveragePanel coverage={coverage} />);
    await screen.findByText("3 behind");
    expect(screen.queryByRole("button", { name: /Behind: 3 devices/i })).toBeNull();
  });

  it("la fila navega al catálogo, y es alcanzable con el teclado", async () => {
    const onNavigateTab = vi.fn();
    render(<CatalogCoveragePanel coverage={coverage} onNavigateTab={onNavigateTab} />);

    const row = await screen.findByRole("button", {
      name: /Google Chrome: installed on 30 of 56 devices/i,
    });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onNavigateTab).toHaveBeenCalledWith("catalog");
  });
});


// ── El número dentro de cada tramo (30-sep) ─────────────────────────
//
// 🔴 EL DEFECTO. El número de un tramo se ocultaba con `pct >= 12`: un umbral
// en PORCENTAJE para algo que depende de PÍXELES. A 1440 px la barra mide 829,
// así que un tramo necesitaba 99 px para enseñar un «2» que ocupa 6. El tramo
// amarillo de Edge —2 equipos por detrás, 30 px— salía vacío. Y son justo los
// tramos pequeños los que piden acción.
//
// Ahora decide el propio tramo con una container query de CSS: esconde el
// número sólo si no cabe. jsdom no evalúa container queries, así que aquí se
// fija que el número ESTÉ en el DOM (antes se quitaba) y el cálculo de lo que
// necesita; el ocultar/mostrar se comprobó en un navegador en el límite exacto
// (un «2» necesita 14 px: con 13 se oculta, con 14 se ve).

describe("labelWidthPx", () => {
  it("8 px por cifra y 3 de aire a cada lado", () => {
    // Medido con la fuente del tramo (bold 11 px): la cifra más ancha ocupa
    // 7,6 px; «29» = 14,7; «100» = 20,9.
    expect(labelWidthPx(2)).toBe(14);
    expect(labelWidthPx(29)).toBe(22);
    expect(labelWidthPx(100)).toBe(30);
  });

  it("🔴 un «2» cabe en mucho menos de lo que exigía el 12 % de una barra de 829 px", () => {
    expect(labelWidthPx(2)).toBeLessThan(829 * 0.12);
  });

  it("no revienta con basura", () => {
    expect(labelWidthPx(undefined)).toBe(14);
    expect(labelWidthPx(-3)).toBe(14);
  });
});

describe("el número dentro de la barra", () => {
  /** El caso de campo: Edge con 53 al día y 2 por detrás, sobre 56. */
  const edge = {
    titleKey: "microsoft-edge",
    name: "Microsoft Edge",
    catalogVersion: "153.0.4234.48",
    catalogVersions: [{ platform: "windows", version: "153.0.4234.48" }],
    platforms: ["windows"],
    eligibleDevices: 56,
    installedDevices: 55,
    missingDevices: 1,
    current: 53,
    ahead: 0,
    behind: 2,
    unknown: 0,
    versions: [],
  };

  /** Los tramos de la barra, en orden, con el número que llevan dentro. */
  function tramos() {
    return [...document.querySelectorAll(".seg-count")].map((n) => n.textContent);
  }

  it("🔴 el tramo pequeño de «Behind» LLEVA su número (antes se quitaba del DOM)", async () => {
    // 2 de 56 son el 3,6 %: con `pct >= 12` el tramo salía vacío.
    render(<CatalogCoveragePanel coverage={{ totalDevices: 56, items: [edge], truncated: false }} />);
    await screen.findByText("55/56");
    expect(tramos()).toEqual(["53", "2", "1"]);
  });

  it("⚠️ un tramo con 0 equipos no pinta un «0»", async () => {
    // `ahead` y `unknown` están a cero: ni ocupan sitio ni dicen nada.
    render(<CatalogCoveragePanel coverage={{ totalDevices: 56, items: [edge], truncated: false }} />);
    await screen.findByText("55/56");
    expect(tramos()).not.toContain("0");
  });

  it("⚠️ el número de «Not installed» va en gris de TEXTO, no en blanco", async () => {
    // No tiene relleno: es la trama gris clara de debajo. En blanco era
    // invisible, y con `BRAND.gray` —que es un RELLENO— daba 1,5:1.
    render(<CatalogCoveragePanel coverage={{ totalDevices: 56, items: [edge], truncated: false }} />);
    await screen.findByText("55/56");
    const hueco = [...document.querySelectorAll(".seg-count")].find((n) => n.textContent === "1");
    const color = getComputedStyle(hueco.parentElement).color;
    const esperado = (() => {
      const d = document.createElement("div");
      d.style.color = TEXT_MUTED;
      document.body.appendChild(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    })();
    expect(color).toBe(esperado);
  });
});


// ── Contraste del número sobre cada relleno (30-sep) ────────────────
//
// 🔴 EL DEFECTO. El número iba en blanco sobre el verde (2,5:1) y el verde
// azulado (3,1:1); el amarillo en su `warningText` (4,3); el gris en blanco
// (1,9). Ninguno llegaba al 4,5:1 que pide WCAG AA para texto de 11 px. Son
// rellenos de tono MEDIO: ni el blanco ni `BRAND.dark` (4,2 / 3,4) alcanzan.
//
// ⚠️ SE COMPRUEBA CONTRA LOS RELLENOS DE `STATES`, no contra una lista copiada
// aquí: si alguien cambia la paleta y el número deja de leerse, esto falla.

const hexChannels = (h) => {
  const x = String(h).replace("#", "");
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
};
const luminance = (hex) =>
  hexChannels(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("segmentLabelColor", () => {
  it("🔴 el número se lee (≥ 4,5:1) sobre TODOS los rellenos de la barra", () => {
    for (const s of STATES) {
      const ratio = contrast(segmentLabelColor(s.key), s.color);
      expect(ratio, `${s.key} (${s.color})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("⚠️ el verde y el verde azulado —los que pediste— en concreto", () => {
    const fill = (k) => STATES.find((s) => s.key === k).color;
    expect(contrast(segmentLabelColor("current"), fill("current"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(segmentLabelColor("ahead"), fill("ahead"))).toBeGreaterThanOrEqual(4.5);
  });

  it("⚠️ «Not installed» no tiene relleno: va en el gris de TEXTO", () => {
    // Sobre la trama gris clara (#E5E5E5 en su tono más oscuro).
    expect(segmentLabelColor("missing")).toBe(TEXT_MUTED);
    expect(contrast(TEXT_MUTED, "#E5E5E5")).toBeGreaterThanOrEqual(4.5);
  });

  it("el blanco de antes NO pasaba: el test habría cazado el defecto", () => {
    // Fija que la comprobación de arriba muerde de verdad.
    const verde = STATES.find((s) => s.key === "current").color;
    expect(contrast("#FFFFFF", verde)).toBeLessThan(4.5);
  });
});
