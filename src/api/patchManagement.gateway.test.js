import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./http", () => ({
  httpGetJson: vi.fn(async (u) => ({ ok: true, url: u })),
  httpPostJson: vi.fn(async (u, b) => ({ ok: true, url: u, body: b })),
  httpPatchJson: vi.fn(async (u, b) => ({ ok: true, url: u, body: b })),
  httpDeleteJson: vi.fn(async (u) => ({ ok: true, url: u })),
}));

import * as api from "./patchManagement";

const BASE = "/api/v1/patch-management";

beforeEach(() => vi.clearAllMocks());

describe("gateway endpoint contract", () => {
  it("hits the documented paths", async () => {
    expect((await api.listGateways()).url).toBe(`${BASE}/gateways`);
    expect((await api.getGateway(3)).url).toBe(`${BASE}/gateways/3`);
    expect((await api.getGatewayPublicKey(3)).url).toBe(`${BASE}/gateways/3/public-key`);
    expect((await api.verifyGateway(3)).url).toBe(`${BASE}/gateways/3/verify`);
    expect((await api.deleteGateway(3)).url).toBe(`${BASE}/gateways/3`);
  });

  it("encodes ids so a hostile value cannot escape the path", async () => {
    expect((await api.getGateway("a/b?c")).url).toBe(`${BASE}/gateways/a%2Fb%3Fc`);
  });

  it("posts the SEALED envelope and nothing else", async () => {
    const envelope = { v: 1, alg: "RSA-OAEP-256+A256GCM", ct: "..." };
    const res = await api.provisionGatewayCredential(3, envelope);
    expect(res.url).toBe(`${BASE}/gateways/3/credential`);
    expect(res.body).toEqual({ envelope });
    // The credential API surface must offer no way to send a password.
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it("reverts by explicit snapshot record", async () => {
    const res = await api.revertSnapshot(42);
    expect(res.url).toBe(`${BASE}/snapshots/revert`);
    expect(res.body).toEqual({ snapshotResultId: 42 });
  });

  it("exposes no function that accepts a raw password", () => {
    // Guards against a future "convenience" helper quietly reintroducing the
    // plaintext path the whole design exists to remove.
    for (const [name, fn] of Object.entries(api)) {
      if (typeof fn !== "function") continue;
      expect(fn.toString()).not.toMatch(/\bpassword\b/);
    }
  });
});
