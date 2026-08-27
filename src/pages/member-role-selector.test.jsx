// src/pages/member-role-selector.test.jsx
//
// ADR-0011 — TenantMemberDialog's role selector used to be a hardcoded
// 3-item MenuItem list (OWNER/ADMIN/USER). Pins the dynamic behavior:
// built-ins always sort first in canonical rank order (not the API's
// own IsSystem DESC, Name ASC — which alphabetizes to ADMIN, OWNER,
// USER), custom roles follow below a divider, and the dialog still
// works before the roles fetch resolves.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

vi.mock("../api/tenants", () => ({
  listTenants: vi.fn(),
  getTenantById: vi.fn(),
  getTenantSummary: vi.fn(),
  updateTenant: vi.fn(),
  deleteTenant: vi.fn(),
  listTenantMembers: vi.fn(),
  createTenantMember: vi.fn(),
  updateTenantMember: vi.fn(),
  deleteTenantMember: vi.fn(),
  cancelPendingInvite: vi.fn(),
}));

vi.mock("../api/roles", () => ({
  listTenantRoles: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 7 },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

import { getTenantById, listTenantMembers } from "../api/tenants";
import { listTenantRoles } from "../api/roles";
import TenantsAdministrator from "./TenantsAdministrator";

const TENANT = {
  id: 7,
  name: "Acme",
  externalIdpTenant: "ext-acme",
  tenantDb: "tenant_7",
  maxDevices: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
  getTenantById.mockResolvedValue(TENANT);
  listTenantMembers.mockResolvedValue({ items: [], total: 0 });
});

afterEach(cleanup);

function renderPage() {
  return render(<TenantsAdministrator mode="tenant" />);
}

async function openMemberDialog() {
  // "Add Member" is disabled until getTenantById's promise resolves and
  // `tenantDetails` state updates (displayedTenant). findByText only
  // waits for the TEXT to exist, not for that follow-up render — the
  // button can still be disabled the instant it appears, and clicking a
  // disabled button is a no-op, so waiting for the text alone is a race
  // that happened to usually win locally but not under CI's timing.
  const button = await screen.findByText("Add Member");
  await waitFor(() => expect(button.closest("button")).not.toBeDisabled());
  fireEvent.click(button);
  return screen.findByRole("dialog");
}

describe("TenantMemberDialog — dynamic role selector", () => {
  it("falls back to the 3 built-ins, in canonical order, before the roles fetch resolves", async () => {
    listTenantRoles.mockImplementation(() => new Promise(() => {})); // never resolves

    renderPage();
    const dialog = await openMemberDialog();
    fireEvent.mouseDown(within(dialog).getByLabelText("Role"));

    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["OWNER", "ADMIN", "USER"]);
  });

  it("sorts built-ins into canonical rank order, not the API's alphabetical IsSystem-first order", async () => {
    // Mirrors what the backend actually returns: ORDER BY IsSystem DESC,
    // Name ASC — alphabetizes to ADMIN, OWNER, USER.
    listTenantRoles.mockResolvedValue({
      items: [
        { id: 2, name: "ADMIN", isSystem: true, permissions: [] },
        { id: 1, name: "OWNER", isSystem: true, permissions: [] },
        { id: 3, name: "USER", isSystem: true, permissions: [] },
      ],
    });

    renderPage();
    const dialog = await openMemberDialog();
    await waitFor(() => expect(listTenantRoles).toHaveBeenCalledWith(7));
    fireEvent.mouseDown(within(dialog).getByLabelText("Role"));

    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["OWNER", "ADMIN", "USER"]);
  });

  it("lists custom roles below the built-ins, alphabetically", async () => {
    listTenantRoles.mockResolvedValue({
      items: [
        { id: 1, name: "OWNER", isSystem: true, permissions: [] },
        { id: 2, name: "ADMIN", isSystem: true, permissions: [] },
        { id: 3, name: "USER", isSystem: true, permissions: [] },
        { id: 10, name: "IT Support", isSystem: false, permissions: ["jobs"] },
        { id: 11, name: "Billing Viewer", isSystem: false, permissions: [] },
      ],
    });

    renderPage();
    const dialog = await openMemberDialog();
    await waitFor(() => expect(listTenantRoles).toHaveBeenCalledWith(7));
    fireEvent.mouseDown(within(dialog).getByLabelText("Role"));

    const listbox = await screen.findByRole("listbox");
    // The Divider between built-ins and custom roles renders as its own
    // (empty-text) "option" in MUI's Select — filter it out rather than
    // assert on that implementation detail.
    const options = within(listbox)
      .getAllByRole("option")
      .map((o) => o.textContent)
      .filter(Boolean);
    expect(options).toEqual(["OWNER", "ADMIN", "USER", "Billing Viewer", "IT Support"]);
  });
});
