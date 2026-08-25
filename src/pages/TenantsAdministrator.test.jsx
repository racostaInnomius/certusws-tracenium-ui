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

// ADR-0011 — TenantMemberDialog's role selector now fetches the
// tenant's role catalog. Mocked here so these pre-existing tests don't
// depend on network fallback behavior for an endpoint they don't care
// about; the dynamic-selector behavior itself has its own coverage in
// RolesAdministrator.test.jsx and member-role-selector.test.jsx.
vi.mock("../api/roles", () => ({
  listTenantRoles: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 7 },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

import {
  getTenantById,
  listTenantMembers,
  createTenantMember,
  cancelPendingInvite,
} from "../api/tenants";
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

// Tenant-mode ("Tenant Members" console) sidesteps the global tenants
// DataGrid + selection reconciliation entirely, so these tests exercise
// the member-invite flow in isolation.
function renderPage() {
  return render(<TenantsAdministrator mode="tenant" />);
}

describe("TenantsAdministrator — invite a new member", () => {
  it("shows an Add Member button that opens the dialog in create mode with no Subject field", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Add Member")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Add Member"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Invite Tenant Member")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Subject")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Email/i)).toBeInTheDocument();
  });

  it("disables Send Invite until an email is entered", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("Add Member"));

    const dialog = await screen.findByRole("dialog");
    const sendButton = within(dialog).getByText("Send Invite");
    expect(sendButton).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/Email/i), {
      target: { value: "new.person@acme.com" },
    });
    expect(sendButton).not.toBeDisabled();
  });

  it("submits {email, role} only (no subject/isActive) and shows an invite-sent message", async () => {
    createTenantMember.mockResolvedValue({
      message: "Invite sent to new.person@acme.com",
      email: "new.person@acme.com",
      tenantId: 7,
      role: "USER",
    });

    renderPage();
    fireEvent.click(await screen.findByText("Add Member"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Email/i), {
      target: { value: "new.person@acme.com" },
    });
    fireEvent.click(within(dialog).getByText("Send Invite"));

    await waitFor(() =>
      expect(createTenantMember).toHaveBeenCalledWith(7, {
        email: "new.person@acme.com",
        role: "USER",
      })
    );

    expect(
      await screen.findByText(/Invite sent to new\.person@acme\.com/i)
    ).toBeInTheDocument();
  });

  it("surfaces a clear message when the tenant no longer exists", async () => {
    const err = new Error("HTTP 404: {...}");
    err.code = "TENANT_NOT_FOUND";
    createTenantMember.mockRejectedValue(err);

    renderPage();
    fireEvent.click(await screen.findByText("Add Member"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Email/i), {
      target: { value: "new.person@acme.com" },
    });
    fireEvent.click(within(dialog).getByText("Send Invite"));

    expect(
      await screen.findByText(/tenant no longer exists/i)
    ).toBeInTheDocument();
  });
});

describe("TenantsAdministrator — pending invites in the members grid", () => {
  it("shows a Pending row with no Edit action, alongside real members", async () => {
    listTenantMembers.mockResolvedValue({
      items: [
        { id: 1, subject: "auth0|alice", email: "alice@acme.com", role: "OWNER", isActive: true, createdAt: "2026-08-01", updatedAt: "2026-08-01" },
      ],
      pending: [
        { id: 42, email: "bob@acme.com", role: "USER", invitedBySubject: "auth0|alice", createdAt: "2026-08-20" },
      ],
    });

    renderPage();

    expect(await screen.findByText("alice@acme.com")).toBeInTheDocument();
    expect(await screen.findByText("bob@acme.com")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();

    // The pending row's action cell has "Cancel Invite" but no "Edit".
    const pendingRow = screen.getByText("bob@acme.com").closest("[role='row']");
    expect(within(pendingRow).getByText("Cancel Invite")).toBeInTheDocument();
    expect(within(pendingRow).queryByText("Edit")).not.toBeInTheDocument();

    // The real member's row still gets both actions.
    const memberRow = screen.getByText("alice@acme.com").closest("[role='row']");
    expect(within(memberRow).getByText("Edit")).toBeInTheDocument();
    expect(within(memberRow).getByText("Delete")).toBeInTheDocument();
  });

  it("cancels a pending invite via cancelPendingInvite, not deleteTenantMember", async () => {
    listTenantMembers.mockResolvedValue({
      items: [],
      pending: [{ id: 42, email: "bob@acme.com", role: "USER", invitedBySubject: null, createdAt: "2026-08-20" }],
    });
    cancelPendingInvite.mockResolvedValue({ message: "Invite canceled successfully" });

    renderPage();

    fireEvent.click(await screen.findByText("Cancel Invite"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/withdraw the invite/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel Invite" }));

    await waitFor(() => expect(cancelPendingInvite).toHaveBeenCalledWith(7, 42));
    expect(await screen.findByText(/Invite canceled successfully/i)).toBeInTheDocument();
  });
});
