// src/components/CryptoDiscovery/CdpSourceChips.test.jsx
//
// 25-sep: una fuente congelada (ADR-0026, sin CDP Coverage) se pintaba con
// el mismo punto gris que una no conectada y el estado sólo vivía en el
// tooltip: en T111 vCenter, las sondas y la CA parecían «no conectados»
// mientras el sunburst enseñaba sus datos.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SourceChip } from "./CdpSourceChips";

afterEach(cleanup);

describe("SourceChip", () => {
  it("⭐ congelada lo dice en la ficha, no sólo en el tooltip", () => {
    render(<SourceChip source={{ key: "v", label: "vCenter · GW", state: "frozen", detail: "x" }} />);
    expect(screen.getByText("vCenter · GW · frozen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "vCenter · GW: frozen · needs CDP Coverage" })).toBeInTheDocument();
  });

  it("no conectada sigue sin sufijo", () => {
    render(<SourceChip source={{ key: "k", label: "Kubernetes", state: "unconfigured", detail: "x" }} />);
    expect(screen.getByText("Kubernetes")).toBeInTheDocument();
  });
});
