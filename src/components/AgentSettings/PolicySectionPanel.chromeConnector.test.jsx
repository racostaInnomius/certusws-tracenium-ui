// src/components/AgentSettings/PolicySectionPanel.chromeConnector.test.jsx
//
// El conector de Chrome Enterprise vive en Agent Settings → Security
// Compliance, sólo en ámbito tenant (es del tenant entero, no del equipo que
// se edita). Crear el endpoint exige la capacidad security_compliance.

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("./AdPrinterCollectorPanel", () => ({ default: () => null }));
vi.mock("../common/AccessPolicyMatrix", () => ({ default: () => null }));
vi.mock("../../hooks/useEffectiveTenantId", () => ({ useEffectiveTenantId: () => "111" }));
const getMyCapabilities = vi.fn();
vi.mock("../../api/roles", () => ({ getMyCapabilities: (...a) => getMyCapabilities(...a) }));
vi.mock("../../api/inventoryDashboard", () => ({
  getChromeConnector: vi.fn(async () => ({ ok: true, connector: null })),
  putChromeConnector: vi.fn(),
  deleteChromeConnector: vi.fn(),
}));

import PolicySectionPanel from "./PolicySectionPanel";

const section = (id, label) => ({ id, label, description: "" });
const renderPanel = (over = {}) =>
  render(<PolicySectionPanel section={section("scp", "Security Compliance")} form={{ plugins: {} }} onChange={vi.fn()} scope="tenant" {...over} />);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PolicySectionPanel — Chrome Enterprise connector", () => {
  it("Security Compliance, tenant scope: the connector, manageable with security_compliance", async () => {
    getMyCapabilities.mockResolvedValue({ permissions: ["security_compliance"] });
    renderPanel();
    expect(await screen.findByText("Chrome Enterprise connector")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Create endpoint" })).toBeInTheDocument();
    expect(getMyCapabilities).toHaveBeenCalledWith("111");
  });

  it("without the capability it is read-only", async () => {
    getMyCapabilities.mockResolvedValue({ permissions: [] });
    renderPanel();
    expect(await screen.findByText("Chrome Enterprise connector")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create endpoint" })).not.toBeInTheDocument();
  });

  it("not in device scope, and not in other plugin sections", () => {
    getMyCapabilities.mockResolvedValue({ permissions: ["security_compliance"] });
    renderPanel({ scope: "device" });
    expect(screen.queryByText("Chrome Enterprise connector")).not.toBeInTheDocument();
    cleanup();
    renderPanel({ section: section("pmp", "Patch Management") });
    expect(screen.queryByText("Chrome Enterprise connector")).not.toBeInTheDocument();
  });
});
