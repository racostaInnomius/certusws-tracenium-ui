// src/components/CryptoDiscovery/CdpCertFacets.test.jsx
//
// Facetas de la lista: conteos bajo el filtro actual y un clic añade el
// valor al filtro. Repaso UI 2026-09-06: los conteos son los de la tabla
// —viaja el filtro ENTERO con `lens=list` y se enseña certificados
// distintos o equipos según la vista— y ya no hace falta un pie que
// explique qué no aplica.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const getCdpFacets = vi.fn();
vi.mock("../../api/cdp", () => ({ getCdpFacets: (...a) => getCdpFacets(...a) }));

import CdpCertFacets, { facetFilterOf } from "./CdpCertFacets";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("facetFilterOf", () => {
  it("⭐ manda el filtro entero de la lista con lens=list: búsqueda, estado, bandera y emisor incluidos", () => {
    expect(facetFilterOf({ search: "x", status: "expired", flag: "weak_sig", issuer: "corp", source: "java-store", keySizeBits: 2048, hasPrivateKey: true, includeRoots: false }))
      .toEqual({ lens: "list", search: "x", status: "expired", flag: "weak_sig", issuer: "corp", source: "java-store", keySizeBits: 2048, hasPrivateKey: true });
    expect(facetFilterOf({ includeRoots: true }).includeRoots).toBe(true);
    expect(facetFilterOf({ hasFlags: true }).hasFlags).toBe(true);
  });
});

describe("CdpCertFacets", () => {
  const rows = {
    source: [{ keys: { source: "java-store" }, certs: 838, uniqueCerts: 120, devices: 2 }, { keys: { source: "store" }, certs: 2255, uniqueCerts: 400, devices: 53 }],
    key: [{ keys: { key_algorithm: "RSA", key_size_bits: 2048 }, certs: 1081, uniqueCerts: 300, devices: 53 }]
  };
  const mock = () =>
    getCdpFacets.mockImplementation(async ({ by }) => {
      if (by[0] === "source") return { rows: rows.source };
      if (by[0] === "key_algorithm") return { rows: rows.key };
      return { rows: [] };
    });

  it("⭐ por certificado enseña certificados distintos (lo que cuenta la tabla) y un clic añade el valor", async () => {
    mock();
    const onSelect = vi.fn();
    render(<CdpCertFacets filter={{ hasPrivateKey: true, search: "veeam" }} onSelect={onSelect} refreshNonce={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /Source Java keystore: 120/ }));
    expect(onSelect).toHaveBeenCalledWith({ source: "java-store" });
    fireEvent.click(screen.getByRole("button", { name: /Key RSA-2048: 300/ }));
    expect(onSelect).toHaveBeenCalledWith({ keyAlgorithm: "RSA", keySizeBits: 2048 });
    // Ocurrencias (838) NO se enseñan: no son lo que la tabla cuenta.
    expect(screen.queryByRole("button", { name: /: 838/ })).not.toBeInTheDocument();
    // El filtro entero viajó a /facets con la lente de la lista.
    await waitFor(() => expect(getCdpFacets).toHaveBeenCalledWith(expect.objectContaining({ lens: "list", hasPrivateKey: true, search: "veeam" })));
  });

  it("por equipo enseña equipos, ordenados de mayor a menor", async () => {
    mock();
    render(<CdpCertFacets filter={{}} onSelect={() => {}} refreshNonce={0} view="devices" />);
    const buttons = await screen.findAllByRole("button", { name: /^Source / });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Source OS store: 53", "Source Java keystore: 2"]);
    expect(screen.getByText(/Devices under the current filters/i)).toBeInTheDocument();
  });

  it("una faceta que falla lo dice, no pinta vacío", async () => {
    getCdpFacets.mockRejectedValue(new Error("boom"));
    render(<CdpCertFacets filter={{}} onSelect={() => {}} refreshNonce={0} />);
    expect((await screen.findAllByText(/Couldn't load/i)).length).toBeGreaterThan(0);
  });
});
