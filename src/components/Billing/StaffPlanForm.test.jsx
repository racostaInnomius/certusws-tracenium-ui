// src/components/Billing/StaffPlanForm.test.jsx
//
// ADR-0026 (F4) — el complemento «CDP Coverage» en el formulario de staff.
// Lo que se fija: aparece en CUALQUIER plan (no sólo en Enterprise), y en un
// tenant que paga por Stripe —donde plan, licencias y MDM están bloqueados
// porque los manda Stripe— el complemento NO se bloquea: es justo lo que el
// staff puede cambiar, y el cambio va a la suscripción de Stripe.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import StaffPlanForm from "./StaffPlanForm";
import { newPlan } from "./staffPlanModel";

const ADDONS = [{ key: "cdp_coverage", title: "CDP Coverage", description: "Crypto Discovery beyond the devices you license." }];
const plan = (over = {}) => ({ ...newPlan(new Date("2026-09-21T12:00:00Z")), tier: "business", quantity: 50, ...over });

afterEach(cleanup);

describe("StaffPlanForm · complementos", () => {
  it("⭐ un paquete (no Enterprise) también puede llevar el complemento", () => {
    const onChange = vi.fn();
    render(<StaffPlanForm plan={plan()} onChange={onChange} addons={ADDONS} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "CDP Coverage" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ addons: ["cdp_coverage"] }));
    expect(screen.getByText(/Billed outside Stripe until this tenant pays through a Stripe subscription/)).toBeInTheDocument();
  });

  it("⭐ en un tenant de Stripe todo está bloqueado MENOS el complemento, y dice que va a su suscripción", () => {
    render(<StaffPlanForm plan={plan()} onChange={vi.fn()} addons={ADDONS} stripeManaged />);
    expect(screen.getByLabelText("Endpoint licenses")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "CDP Coverage" })).not.toBeDisabled();
    expect(screen.getByText(/Added to or removed from the tenant's Stripe subscription, prorated/)).toBeInTheDocument();
  });

  it("quitarlo lo quita", () => {
    const onChange = vi.fn();
    render(<StaffPlanForm plan={plan({ addons: ["cdp_coverage"] })} onChange={onChange} addons={ADDONS} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "CDP Coverage" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ addons: [] }));
  });

  it("sin complementos en el catálogo (backend anterior) no se pinta la sección", () => {
    render(<StaffPlanForm plan={plan()} onChange={vi.fn()} addons={[]} />);
    expect(screen.queryByText("Add-ons")).toBeNull();
  });
});
