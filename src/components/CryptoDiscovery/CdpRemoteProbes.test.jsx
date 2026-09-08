// src/components/CryptoDiscovery/CdpRemoteProbes.test.jsx
//
// «Remote TLS probes» en Crypto Discovery → Settings (2026-09-07).
//
// Lo que se fija:
//  - «Add» escribe la policy del tenant por el dominio `cdp` ENTERO (replace-
//    slice: si mandara solo probeTargets, el servidor borraría adcs/scan…)
//    y con la versión cargada como If-Match.
//  - Un 409 se dice y se recarga; no se reintenta a ciegas ni se calla.
//  - Sin equipos que sondeen, se avisa: los objetivos no se sondean solos.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getTenantPolicy = vi.fn();
const patchTenantPolicyDomain = vi.fn();
vi.mock("../../api/policies", () => ({
  getTenantPolicy: (...a) => getTenantPolicy(...a),
  patchTenantPolicyDomain: (...a) => patchTenantPolicyDomain(...a)
}));
const listCdpProbeCandidates = vi.fn();
vi.mock("../../api/cdp", () => ({ listCdpProbeCandidates: (...a) => listCdpProbeCandidates(...a) }));
vi.mock("../../hooks/useEffectiveTenantId", () => ({ useEffectiveTenantId: () => "111" }));

import CdpRemoteProbes from "./CdpRemoteProbes";

const CDP = { scanTlsListeners: true, probeHosts: ["msig-radius-ca"], probeTargets: ["10.0.0.9:636"], adcs: { hosts: ["msig-radius-ca"] } };

beforeEach(() => {
  getTenantPolicy.mockResolvedValue({ ok: true, policy_version: 7, policy_json: { cdp: CDP } });
  patchTenantPolicyDomain.mockResolvedValue({ ok: true, policyVersion: 8 });
  listCdpProbeCandidates.mockResolvedValue({
    ok: true,
    candidates: [
      { target: "10.0.0.5:443", devices: 12, connections: 40, processes: ["chrome"], probed: false },
      { target: "10.0.0.9:636", devices: 3, connections: 3, processes: ["lsass"], probed: true }
    ]
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CdpRemoteProbes", () => {
  it("⭐ «Add» manda el bloque cdp completo con el objetivo añadido y la versión cargada", async () => {
    render(<CdpRemoteProbes />);
    const add = await screen.findByRole("button", { name: /Add 10\.0\.0\.5:443/i });
    fireEvent.click(add);
    await waitFor(() => expect(patchTenantPolicyDomain).toHaveBeenCalledTimes(1));
    const [tenantId, domain, slice, opts] = patchTenantPolicyDomain.mock.calls[0];
    expect(tenantId).toBe("111");
    expect(domain).toBe("cdp");
    expect(slice).toEqual({ cdp: { ...CDP, probeTargets: ["10.0.0.9:636", "10.0.0.5:443"] } });
    expect(opts).toEqual({ expectedVersion: 7 });
    expect(await screen.findByText(/10\.0\.0\.5:443 added/i)).toBeInTheDocument();
  });

  it("lo ya listado no ofrece «Add»: dice si se sondea", async () => {
    render(<CdpRemoteProbes />);
    await screen.findByRole("button", { name: /Add 10\.0\.0\.5:443/i });
    expect(screen.queryByRole("button", { name: /Add 10\.0\.0\.9:636/i })).not.toBeInTheDocument();
    expect(screen.getByText("probed")).toBeInTheDocument();
  });

  it("un 409 se dice y se recarga la policy; no se pisa", async () => {
    const stale = new Error("STALE_POLICY");
    stale.status = 409;
    patchTenantPolicyDomain.mockRejectedValueOnce(stale);
    render(<CdpRemoteProbes />);
    fireEvent.click(await screen.findByRole("button", { name: /Add 10\.0\.0\.5:443/i }));
    expect(await screen.findByText(/modified by someone else/i)).toBeInTheDocument();
    await waitFor(() => expect(getTenantPolicy).toHaveBeenCalledTimes(2));
  });

  it("sin equipos que sondeen, avisa de que los objetivos no se sondean", async () => {
    getTenantPolicy.mockResolvedValue({ ok: true, policy_version: 1, policy_json: { cdp: { probeTargets: ["10.0.0.9:636"] } } });
    render(<CdpRemoteProbes />);
    expect(await screen.findByText(/No device is named to run the probes, so the targets below are not probed/i)).toBeInTheDocument();
  });
});
