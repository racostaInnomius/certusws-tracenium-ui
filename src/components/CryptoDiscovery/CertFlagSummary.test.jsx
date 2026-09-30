// src/components/CryptoDiscovery/CertFlagSummary.test.jsx
//
// 30-sep: una píldora por bandera, con el identificador crudo, partía la
// fila en dos o tres y las píldoras se montaban. Una línea: la más grave con
// nombre para personas, «+N», y todas en el tooltip.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CertFlagSummary, { sortFlags } from "./CertFlagSummary";

afterEach(cleanup);

describe("sortFlags", () => {
  it("de más a menos grave, sin duplicados, lo desconocido al final", () => {
    expect(sortFlags(["long_validity", "zzz_new", "weak_sig", "weak_key", "weak_sig"])).toEqual(["weak_key", "weak_sig", "long_validity", "zzz_new"]);
    expect(sortFlags(null)).toEqual([]);
  });
});

describe("CertFlagSummary", () => {
  it("⭐ una línea: la más grave con nombre legible y «+N»; nada de identificadores crudos", async () => {
    render(<CertFlagSummary flags={["long_validity", "weak_sig", "weak_key"]} labels={{ weak_key: "Weak key (<2048 RSA / <256 EC)" }} />);
    expect(screen.getByText("Weak key")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.queryByText("weak_sig")).toBeNull();
    expect(screen.getByLabelText("Flags: Weak key, Weak signature, Long validity")).toBeInTheDocument();
    // El tooltip las dice todas, con la etiqueta larga cuando la hay.
    fireEvent.mouseOver(screen.getByText("Weak key"));
    expect(await screen.findByText("Weak key (<2048 RSA / <256 EC)")).toBeInTheDocument();
    expect(screen.getByText("Long validity")).toBeInTheDocument();
  });

  it("una sola bandera no lleva «+N»; sin banderas no pinta nada", () => {
    const { container, rerender } = render(<CertFlagSummary flags={["store_chain_incomplete"]} />);
    expect(screen.getByText("Issuer missing")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).toBeNull();
    rerender(<CertFlagSummary flags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
