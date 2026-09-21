import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Manage Tenants → Create New Tenant.
 *
 * Son dos llamadas —crear el tenant, fijar su plan— y lo que se prueba es lo
 * que pasa entre ellas: qué viaja en cada una, y que un fallo de la SEGUNDA no
 * esconda que la primera ya creó el tenant (reintentar crearía un duplicado).
 */

const createTenant = vi.fn();
vi.mock("../../api/tenants", () => ({ createTenant: (...a) => createTenant(...a) }));

const setTenantPlan = vi.fn();
vi.mock("../../api/billingAdmin", () => ({ setTenantPlan: (...a) => setTenantPlan(...a) }));

vi.mock("../../hooks/usePluginCatalog", () => ({
  usePluginCatalog: () => ({
    catalog: [
      { key: "amp", title: "Asset Management", required: true, tier_required: "starter" },
      { key: "scp", title: "Security Compliance", tier_required: "professional" },
      { key: "pmp", title: "Patch Management", tier_required: "business" },
    ],
    loading: false,
  }),
}));

import CreateTenantDialog from "./CreateTenantDialog";

const onCreated = vi.fn();

beforeEach(() => {
  createTenant.mockReset();
  setTenantPlan.mockReset();
  onCreated.mockReset();
  createTenant.mockResolvedValue({ id: 120, name: "Globex", externalIdpTenant: "ext-globex" });
  setTenantPlan.mockResolvedValue({ tier: "enterprise", reconciled: true });
});
afterEach(cleanup);

async function fillTenant(dialog) {
  await userEvent.type(within(dialog).getByLabelText(/Tenant name/), "Globex");
  await userEvent.type(within(dialog).getByLabelText(/External IdP tenant/), "ext-globex");
  await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
}

async function setLicenses(dialog, n) {
  const field = within(dialog).getByRole("spinbutton", { name: "Endpoint licenses" });
  await userEvent.clear(field);
  await userEvent.type(field, String(n));
}

describe("Create New Tenant", () => {
  it("no avanza al plan sin nombre y tenant de SafeCertus", async () => {
    render(<CreateTenantDialog open onClose={() => {}} onCreated={onCreated} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Next" }).disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText(/Tenant name/), "Globex");
    expect(within(dialog).getByRole("button", { name: "Next" }).disabled).toBe(true);
  });

  it("Enterprise: crea el tenant con las licencias como tope y luego fija el plan", async () => {
    render(<CreateTenantDialog open onClose={() => {}} onCreated={onCreated} />);
    const dialog = screen.getByRole("dialog");
    await fillTenant(dialog);

    await userEvent.click(within(dialog).getByRole("button", { name: "Enterprise" }));
    await userEvent.click(within(dialog).getByLabelText("Patch Management"));
    await setLicenses(dialog, 2500);
    await userEvent.click(within(dialog).getByRole("button", { name: "Create tenant" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createTenant).toHaveBeenCalledWith({ name: "Globex", externalIdpTenant: "ext-globex", maxDevices: 2500 });
    expect(setTenantPlan).toHaveBeenCalledWith(120, {
      tier: "enterprise",
      quantity: 2500,
      trialEndsAt: null,
      pluginKeys: ["pmp"],
      addons: [],
      mdm: { included: false },
      status: "active",
    });
    // El plan va DESPUÉS del alta: necesita el id que ésta devuelve.
    expect(createTenant.mock.invocationCallOrder[0]).toBeLessThan(setTenantPlan.mock.invocationCallOrder[0]);
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 120 }), { planError: null });
  });

  it("un paquete viaja con el mes de trial estándar", async () => {
    render(<CreateTenantDialog open onClose={() => {}} onCreated={onCreated} />);
    const dialog = screen.getByRole("dialog");
    await fillTenant(dialog);
    await setLicenses(dialog, 40);
    await userEvent.click(within(dialog).getByRole("button", { name: "Create tenant" }));

    await waitFor(() => expect(setTenantPlan).toHaveBeenCalled());
    const [, body] = setTenantPlan.mock.calls[0];
    expect(body).toMatchObject({ tier: "starter", quantity: 40, pluginKeys: null, mdm: { included: false } });
    expect(body.trialEndsAt).toMatch(/T23:59:59\.000Z$/);
  });

  it("sin licencias no se crea nada", async () => {
    render(<CreateTenantDialog open onClose={() => {}} onCreated={onCreated} />);
    const dialog = screen.getByRole("dialog");
    await fillTenant(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Create tenant" }));

    expect(await within(dialog).findByText(/Licenses must be a whole number/)).toBeTruthy();
    expect(createTenant).not.toHaveBeenCalled();
  });

  it("si el alta falla, lo dice y no intenta el plan", async () => {
    createTenant.mockRejectedValueOnce(
      Object.assign(new Error("Conflict"), { status: 409, body: { error: "TENANT_ALREADY_EXISTS" } })
    );
    render(<CreateTenantDialog open onClose={() => {}} onCreated={onCreated} />);
    const dialog = screen.getByRole("dialog");
    await fillTenant(dialog);
    await setLicenses(dialog, 10);
    await userEvent.click(within(dialog).getByRole("button", { name: "Create tenant" }));

    expect(await within(dialog).findByText(/already exists/)).toBeTruthy();
    expect(setTenantPlan).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("si falla el PLAN, el tenant se entrega igual: ya existe", async () => {
    setTenantPlan.mockRejectedValueOnce(
      Object.assign(new Error("Unavailable"), { status: 503, body: { error: "SCHEMA_NOT_MIGRATED" } })
    );
    render(<CreateTenantDialog open onClose={() => {}} onCreated={onCreated} />);
    const dialog = screen.getByRole("dialog");
    await fillTenant(dialog);
    await setLicenses(dialog, 10);
    await userEvent.click(within(dialog).getByRole("button", { name: "Create tenant" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const [tenant, { planError }] = onCreated.mock.calls[0];
    expect(tenant.id).toBe(120);
    expect(planError).toMatch(/20260916_enterprise_tier/);
  });
});
