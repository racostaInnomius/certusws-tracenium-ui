import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const mockUseMsp = vi.fn();
vi.mock("./MspContext", () => ({
  useMsp: () => mockUseMsp(),
}));

vi.mock("./mspApi", () => ({
  fetchMspClients: vi.fn().mockResolvedValue({ items: [] }),
  fetchMyMemberships: vi.fn().mockResolvedValue({ memberships: [] }),
  fetchConsolidated: vi.fn().mockResolvedValue({}),
}));

import Portfolio from "./Portfolio";

afterEach(cleanup);

function baseMsp(overrides = {}) {
  return {
    portfolio: { level: "vendor", items: [] },
    loading: false,
    error: "",
    enterTenant: vi.fn(),
    reloadPortfolio: vi.fn(),
    ...overrides,
  };
}

describe("Portfolio — Manage Tenants entry point", () => {
  beforeEach(() => {
    mockUseMsp.mockReset();
  });

  it("shows a Manage Tenants button at the top-level vendor view and calls onManageTenants", async () => {
    mockUseMsp.mockReturnValue(baseMsp({ portfolio: { level: "vendor", items: [] } }));
    const onManageTenants = vi.fn();

    render(<Portfolio onManageTenants={onManageTenants} />);

    const button = await screen.findByText("Manage Tenants");
    fireEvent.click(button);
    expect(onManageTenants).toHaveBeenCalledOnce();
  });

  it("does not show Manage Tenants for an msp-level operator", async () => {
    mockUseMsp.mockReturnValue(
      baseMsp({ portfolio: { level: "msp", items: [] } })
    );

    render(<Portfolio onManageTenants={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Clients")).toBeInTheDocument());
    expect(screen.queryByText("Manage Tenants")).not.toBeInTheDocument();
  });

  it("does not show Manage Tenants once drilled into an MSP's clients", async () => {
    mockUseMsp.mockReturnValue(
      baseMsp({
        portfolio: {
          level: "vendor",
          items: [{ tenantId: 5, name: "Acme MSP", tenantType: "msp" }],
        },
      })
    );

    render(<Portfolio onManageTenants={vi.fn()} />);

    fireEvent.click(await screen.findByText("Acme MSP"));

    await waitFor(() => expect(screen.getByText("Back to partners")).toBeInTheDocument());
    expect(screen.queryByText("Manage Tenants")).not.toBeInTheDocument();
  });
});
