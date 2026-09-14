// src/components/patch-management/gateway/GatewayPanel.cdp.test.jsx
//
// El gateway de vCenter compartido con Crypto Discovery (2026-09-14): el
// mismo panel, en su variante «cdp», habla con la API que se le pasa
// (/infrastructure), enseña el interruptor de lectura de certificados,
// esconde la prueba de snapshot y pinta el veredicto por uso.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../../api/patchManagement", () => ({
  listGateways: vi.fn(async () => { throw new Error("must not be called in the cdp variant"); }),
  createGateway: vi.fn(),
  updateGateway: vi.fn(),
  deleteGateway: vi.fn(),
  verifyGateway: vi.fn(),
  getGatewayPublicKey: vi.fn(),
  provisionGatewayCredential: vi.fn(),
}));

import GatewayPanel from "./GatewayPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const REPORT = {
  ok: true,
  stages: [
    { stage: "reachability", ok: true, detail: "TCP+TLS handshake in 41 ms" },
    { stage: "tls_pin", ok: true, detail: "pinned" },
    { stage: "authentication", ok: true, detail: "authenticated as svc" },
    { stage: "privileges", ok: true, detail: "all privileges granted for certificates", privileges: [] },
    { stage: "scope", ok: true, detail: "19 VM(s) visible in scope" },
  ],
  failedStage: null, classify: null, retryable: false, remediation: null, verifiedAtUtc: "2026-09-14T09:00:00Z",
  uses: { snapshots: { wanted: false, ok: false, missing: ["VirtualMachine.State.CreateSnapshot"] }, certificates: { wanted: true, ok: true, missing: [] } },
};

const GW = { id: 7, deviceId: "eb40471c", name: "MSIG-vCenter-Gateway", vcenterUrl: "https://10.130.130.3", readCertificates: false, credentialState: "delivered", health: "verified", lastVerifiedAt: "2026-09-14T09:00:00Z", lastVerifyReport: REPORT };

function api(gateways = [GW]) {
  return {
    listGateways: vi.fn(async () => ({ gateways })),
    createGateway: vi.fn(),
    updateGateway: vi.fn(async (id, p) => ({ ...GW, ...p })),
    deleteGateway: vi.fn(),
    verifyGateway: vi.fn(),
    getGatewayPublicKey: vi.fn(),
    provisionGatewayCredential: vi.fn(),
  };
}

describe("GatewayPanel variant=cdp", () => {
  it("⭐ lists through the API it is given, never Patch Management's, and switches certificate reading on with a partial PATCH", async () => {
    const a = api();
    const onChanged = vi.fn();
    const notify = vi.fn();
    render(<GatewayPanel variant="cdp" api={a} canManage devices={[]} notify={notify} onChanged={onChanged} />);
    expect(await screen.findByText("MSIG-vCenter-Gateway")).toBeInTheDocument();
    expect(screen.getByText("vCenter gateway")).toBeInTheDocument();
    expect(a.listGateways).toHaveBeenCalled();

    const sw = screen.getByLabelText("Read certificates through MSIG-vCenter-Gateway");
    expect(sw).not.toBeChecked();
    fireEvent.click(sw);
    await waitFor(() => expect(a.updateGateway).toHaveBeenCalledWith(7, { readCertificates: true }));
    expect(notify).toHaveBeenCalledWith("success", expect.stringMatching(/switched on/));
    expect(onChanged).toHaveBeenCalled();
  });

  it("hides the snapshot test, keeps credential, test connection, edit and remove", async () => {
    render(<GatewayPanel variant="cdp" api={api()} canManage devices={[]} />);
    await screen.findByText("MSIG-vCenter-Gateway");
    expect(screen.queryByLabelText(/Test a snapshot/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Set vCenter credential for MSIG-vCenter-Gateway")).toBeInTheDocument();
    expect(screen.getByLabelText("Test connection for MSIG-vCenter-Gateway")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove MSIG-vCenter-Gateway")).toBeInTheDocument();
  });

  it("⭐ the verification detail shows each use: certificates granted, snapshots not in use", async () => {
    render(<GatewayPanel variant="cdp" api={api([{ ...GW, readCertificates: true }])} canManage devices={[]} />);
    await screen.findByText("MSIG-vCenter-Gateway");
    fireEvent.click(screen.getByLabelText("Show verification detail for MSIG-vCenter-Gateway"));
    const uses = await screen.findByLabelText("Gateway uses");
    expect(uses.textContent).toMatch(/Certificate readingPrivileges granted/);
    expect(uses.textContent).toMatch(/VM snapshotsPatch Management not in use/);
  });

  it("without management rights the switch is disabled and the register button is absent", async () => {
    render(<GatewayPanel variant="cdp" api={api()} canManage={false} devices={[]} />);
    await screen.findByText("MSIG-vCenter-Gateway");
    expect(screen.getByLabelText("Read certificates through MSIG-vCenter-Gateway")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /register gateway/i })).not.toBeInTheDocument();
  });

  it("empty state speaks about certificates, not patching", async () => {
    render(<GatewayPanel variant="cdp" api={api([])} canManage devices={[]} />);
    expect(await screen.findByText(/No vCenter gateway registered/)).toBeInTheDocument();
    expect(screen.queryByText(/pre-patch snapshot/)).not.toBeInTheDocument();
  });
});
