import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

vi.mock("../api/http", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    httpGetJson: vi.fn().mockResolvedValue({
      tenants_summary: { tenantsCount: 6 },
      tenant_members_summary: { membersCount: 3, activeMembersCount: 2, inactiveMembersCount: 1 },
    }),
  };
});
vi.mock("../api/retention", () => ({
  getRetentionStats: vi.fn().mockResolvedValue(null),
}));
vi.mock("../api/locationSites", () => ({
  listLocationSites: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("../msp/mspApi", () => ({
  fetchMyPartner: vi.fn().mockResolvedValue({ status: null }),
}));

import Configurations from "./Configurations";

afterEach(cleanup);

describe("Configurations (Settings) — Tenants card relocation", () => {
  it("no longer renders the cross-tenant Tenants card, even though the backend still returns tenants_summary", async () => {
    render(<Configurations onNavigate={vi.fn()} />);

    // Tenant members card (unrelated, still admin-scoped but per-tenant) —
    // proves the page rendered past loading before asserting an absence.
    await waitFor(() => expect(screen.getByText("Tenant members")).toBeInTheDocument());

    expect(screen.queryByText("Tenant records · click to manage")).not.toBeInTheDocument();
    // "Tenants" (exact) as a card title — "Tenant members" must not false-match.
    expect(screen.queryByText("TENANTS")).not.toBeInTheDocument();
  });
});
