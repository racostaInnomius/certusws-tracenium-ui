// src/components/CryptoDiscovery/CdpCertFacets.test.jsx
//
// Facetas de la lista: conteos bajo el filtro actual y un clic añade el
// valor al filtro. Y el pie dice qué NO se aplica, para que el número no
// se lea como el total de la tabla.

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
  it("pasa solo lo que /facets entiende, y las raíces según la lista", () => {
    expect(facetFilterOf({ search: "x", status: "expired", source: "java-store", keySizeBits: 2048, hasPrivateKey: true, includeRoots: false }))
      .toEqual({ source: "java-store", keySizeBits: 2048, hasPrivateKey: true, includeRoots: false });
    expect(facetFilterOf({ includeRoots: true }).includeRoots).toBe(true);
  });
});

describe("CdpCertFacets", () => {
  it("⭐ pinta conteos y un clic añade el valor al filtro", async () => {
    getCdpFacets.mockImplementation(async ({ by }) => {
      if (by[0] === "source") return { rows: [{ keys: { source: "java-store" }, certs: 838 }, { keys: { source: "store" }, certs: 2255 }] };
      if (by[0] === "key_algorithm") return { rows: [{ keys: { key_algorithm: "RSA", key_size_bits: 2048 }, certs: 1081 }] };
      return { rows: [] };
    });
    const onSelect = vi.fn();
    render(<CdpCertFacets filter={{ hasPrivateKey: true }} onSelect={onSelect} refreshNonce={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /Source Java keystore: 838/ }));
    expect(onSelect).toHaveBeenCalledWith({ source: "java-store" });
    fireEvent.click(screen.getByRole("button", { name: /Key RSA-2048: 1081/ }));
    expect(onSelect).toHaveBeenCalledWith({ keyAlgorithm: "RSA", keySizeBits: 2048 });
    // El filtro actual viajó a /facets.
    await waitFor(() => expect(getCdpFacets).toHaveBeenCalledWith(expect.objectContaining({ hasPrivateKey: true, includeRoots: false })));
  });

  it("dice qué no aplica a los conteos", async () => {
    getCdpFacets.mockResolvedValue({ rows: [] });
    render(<CdpCertFacets filter={{}} onSelect={() => {}} refreshNonce={0} />);
    expect(await screen.findByText(/search, status, flag and issuer are not applied here/i)).toBeInTheDocument();
  });

  it("una faceta que falla lo dice, no pinta vacío", async () => {
    getCdpFacets.mockRejectedValue(new Error("boom"));
    render(<CdpCertFacets filter={{}} onSelect={() => {}} refreshNonce={0} />);
    expect((await screen.findAllByText(/Couldn't load/i)).length).toBeGreaterThan(0);
  });
});
