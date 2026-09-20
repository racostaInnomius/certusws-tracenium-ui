// src/components/software-delivery/LanSavingsPanel.test.jsx
//
// El panel de ahorro de ancho de banda.
//
// SUSTITUYE a los tests de los dos porcentajes por población. Aquel panel era
// honesto y no contestaba la pregunta del cliente: un 84% no dice si se
// ahorraron 2 GB o 200. Lo que se fija ahora es que el titular sean bytes
// REALES, que la hipótesis se declare, y que lo no valorado no desaparezca.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import LanSavingsPanel, { savingsSummary } from "./LanSavingsPanel";

afterEach(cleanup);

const GB = 1024 ** 3;

/** La forma real de T111 a 30 días: 152 GB por LAN, 32 GB por internet. */
const savings = {
  windowDays: 30,
  lan: { downloads: 949, bytes: Math.round(152.3 * GB) },
  wan: { downloads: 198, bytes: Math.round(32.2 * GB) },
  unpricedDownloads: 1,
  activeDistributionPoints: 2,
};

describe("savingsSummary", () => {
  it("⭐ el reparto se calcula sobre BYTES, no sobre descargas", () => {
    // Un .msi de 165 MB y un parche de 2 MB no son la misma descarga, y el
    // panel habla de ancho de banda.
    const s = savingsSummary({
      lan: { downloads: 1, bytes: 100 * GB },
      wan: { downloads: 9, bytes: 10 * GB },
      activeDistributionPoints: 1,
    });
    expect(s.lanShare).toBe(91);
    expect(s.downloads).toBe(10);
  });

  it("sin descargas no inventa un porcentaje", () => {
    expect(savingsSummary(undefined)).toMatchObject({ downloads: 0, lanShare: 0, savedBytes: 0 });
  });

  it("sabe si el tenant tiene DP, que es lo que cambia el titular", () => {
    expect(savingsSummary({ ...savings, activeDistributionPoints: 0 }).hasDp).toBe(false);
    expect(savingsSummary(savings).hasDp).toBe(true);
  });
});

describe("LanSavingsPanel", () => {
  it("⭐ el titular son los GB ahorrados, con su denominador al lado", async () => {
    render(<LanSavingsPanel savings={savings} />);

    expect(await screen.findByText(/≈ 152/)).toBeInTheDocument();
    expect(screen.getByText("not downloaded over the WAN")).toBeInTheDocument();
    expect(screen.getByText("949 of 1147 downloads")).toBeInTheDocument();
    expect(screen.getByText(/83% of the bytes came from the LAN/)).toBeInTheDocument();
  });

  it("⚠️ declara la hipótesis en vez de vender el número como una factura", () => {
    render(<LanSavingsPanel savings={savings} />);
    expect(screen.getByText(/one trip over the WAN that didn’t happen/)).toBeInTheDocument();
  });

  it("⚠️ lo que no se pudo valorar se dice, no se suma como cero", () => {
    render(<LanSavingsPanel savings={savings} />);
    expect(screen.getByText("1 not counted")).toBeInTheDocument();
  });

  it("⭐ sin DP enseña lo que SÍ cruzó la WAN — la oportunidad, no un cero", async () => {
    render(
      <LanSavingsPanel
        savings={{ ...savings, lan: { downloads: 0, bytes: 0 }, activeDistributionPoints: 0 }}
      />
    );

    expect(await screen.findByText("Bandwidth that crossed the WAN")).toBeInTheDocument();
    expect(screen.getByText(/most of this would stay on the LAN/)).toBeInTheDocument();
    expect(screen.queryByText(/≈ 0 B/)).toBeNull();
  });

  it("sin descargas lo dice sin fingir un 0%", async () => {
    render(<LanSavingsPanel savings={{ windowDays: 30, lan: { downloads: 0, bytes: 0 }, wan: { downloads: 0, bytes: 0 } }} />);
    expect(await screen.findByText(/nothing to compare yet/)).toBeInTheDocument();
  });

  it("⚠️ si la llamada falla lo DICE, no desaparece", async () => {
    render(<LanSavingsPanel failed />);
    expect(await screen.findByText(/Couldn’t load download sources/)).toBeInTheDocument();
  });
});
