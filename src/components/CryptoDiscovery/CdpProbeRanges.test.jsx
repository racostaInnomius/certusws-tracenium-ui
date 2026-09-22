// src/components/CryptoDiscovery/CdpProbeRanges.test.jsx
//
// El editor de rangos a barrer. Lo que fija:
//   · ⭐ los topes del BACKEND se comprueban antes de guardar, y el mensaje
//     dice que la entrada se descarta ENTERA (no recortada);
//   · ⭐ sin el complemento, se dice que los rangos no se entregan y que aquí
//     NO hay muestra gratis, a diferencia de los objetivos de sonda;
//   · ⭐ un fallo de la API no se pinta como «no hay rangos»;
//   · el PATCH lleva el bloque `cdp` entero con If-Match, no sólo los rangos.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getTenantPolicy = vi.fn();
const patchTenantPolicyDomain = vi.fn();
vi.mock("../../api/policies", () => ({
  getTenantPolicy: (...a) => getTenantPolicy(...a),
  patchTenantPolicyDomain: (...a) => patchTenantPolicyDomain(...a)
}));
vi.mock("../../hooks/useEffectiveTenantId", () => ({ useEffectiveTenantId: () => "t-1" }));

import CdpProbeRanges from "./CdpProbeRanges";

const policy = (cdp) => ({ policy: { policy_version: 7, policy_json: { cdp } } });

beforeEach(() => {
  getTenantPolicy.mockResolvedValue(policy({ probeHosts: ["probe01"], probeTargets: ["lb:443"], probeRanges: [] }));
  patchTenantPolicyDomain.mockResolvedValue({ policyVersion: 8 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const type = async (user, name, text) => {
  const field = screen.getByLabelText(name);
  await user.clear(field);
  if (text) await user.type(field, text);
};

describe("caps", () => {
  it("states that an entry over the cap is dropped whole, not trimmed", async () => {
    render(<CdpProbeRanges />);
    const copy = (await screen.findByText(/dropping an entry whole/i)).closest("p");
    expect(copy.textContent).toMatch(/never trims one down/i);
    expect(copy.textContent).toMatch(/at most 16 entries/i);
    expect(copy.textContent).toMatch(/1,024 addresses/);
    expect(copy.textContent).toMatch(/\/22 or narrower/i);
    expect(copy.textContent).toMatch(/at most 8 ports/i);
  });

  it("refuses a /16 before it is ever sent to the server", async () => {
    const user = userEvent.setup({ delay: null });
    render(<CdpProbeRanges />);
    await screen.findByText(/No range is swept/i);
    await type(user, "Range", "10.0.0.0/16");
    expect(await screen.findByText(/is not an IPv4 CIDR of \/22 or narrower/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add range" })).toBeDisabled();
    expect(patchTenantPolicyDomain).not.toHaveBeenCalled();
  });

  it("refuses more than eight ports on one entry", async () => {
    const user = userEvent.setup({ delay: null });
    render(<CdpProbeRanges />);
    await screen.findByText(/No range is swept/i);
    await type(user, "Range", "10.0.4.0/24");
    await type(user, "Ports", "1,2,3,4,5,6,7,8,9");
    expect(await screen.findByText(/At most 8 ports per range/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add range" })).toBeDisabled();
  });

  it("a valid range is written as the whole cdp block with the loaded version", async () => {
    const user = userEvent.setup({ delay: null });
    render(<CdpProbeRanges />);
    await screen.findByText(/No range is swept/i);
    await type(user, "Range", "10.0.4.0/24");
    await type(user, "Ports", "443, 8443");
    await type(user, "SNI (optional)", "www.corp.example");
    await user.click(screen.getByRole("button", { name: "Add range" }));
    await waitFor(() => expect(patchTenantPolicyDomain).toHaveBeenCalled());
    const [tenant, domain, body, opts] = patchTenantPolicyDomain.mock.calls[0];
    expect(tenant).toBe("t-1");
    expect(domain).toBe("cdp");
    // El bloque entero: un PATCH con sólo `probeRanges` borraría las sondas.
    expect(body.cdp.probeHosts).toEqual(["probe01"]);
    expect(body.cdp.probeTargets).toEqual(["lb:443"]);
    expect(body.cdp.probeRanges).toEqual([{ range: "10.0.4.0/24", ports: [443, 8443], sni: "www.corp.example" }]);
    expect(opts).toEqual({ expectedVersion: "7" });
  });
});

describe("what is already stored", () => {
  it("shows each range with its size, its ports and its SNI", async () => {
    getTenantPolicy.mockResolvedValue(policy({ probeRanges: [{ range: "10.0.4.0/24", ports: [443], sni: "a.example" }] }));
    render(<CdpProbeRanges />);
    expect(await screen.findByText("10.0.4.0/24")).toBeTruthy();
    expect(screen.getByText("256 addresses")).toBeTruthy();
    expect(screen.getByText("tcp/443")).toBeTruthy();
    expect(screen.getByText("SNI a.example")).toBeTruthy();
    expect(screen.queryByText(/dropped by the agent/i)).toBeNull();
  });

  it("flags a stored entry the agent will drop instead of showing it as active", async () => {
    // Escrita por la API cruda o por un backend anterior al validador.
    getTenantPolicy.mockResolvedValue(policy({ probeRanges: [{ range: "10.0.0.0/8", ports: [443] }] }));
    render(<CdpProbeRanges />);
    expect(await screen.findByText(/dropped by the agent/i)).toBeTruthy();
  });
});

describe("honest states", () => {
  it("⭐ an API error is not rendered as «no ranges»", async () => {
    getTenantPolicy.mockRejectedValue(new Error("upstream said no"));
    render(<CdpProbeRanges />);
    expect(await screen.findByText(/could not be read: upstream said no/i)).toBeTruthy();
    expect(screen.queryByText(/No range is swept/i)).toBeNull();
  });

  it("⭐ without CDP Coverage it says ranges are not delivered at all, and that there is no free sample", async () => {
    render(<CdpProbeRanges locked />);
    const notice = (await screen.findByText(/not delivered to the devices at all/i)).closest("p");
    expect(notice.textContent).toMatch(/no free sample here/i);
    expect(notice.textContent).toMatch(/unlike the three included probe targets/i);
  });

  it("with the add-on the notice is gone", async () => {
    render(<CdpProbeRanges />);
    await screen.findByText(/No range is swept/i);
    expect(screen.queryByText(/not delivered to the devices at all/i)).toBeNull();
  });
});
