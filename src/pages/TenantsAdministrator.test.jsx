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
