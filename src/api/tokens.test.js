// src/api/tokens.test.js
//
// Contract tests for /api/v1/security/enroll/tokens.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import { createToken, getTokenQuota, listTokens, revokeToken } from "./tokens";

const BASE = "/api/v1/security/enroll/tokens";

describe("enrollment tokens", () => {
  it("listTokens and getTokenQuota are plain reads", async () => {
    const list = respond("get", BASE, { ok: true, items: [] });
    const quota = respond("get", `${BASE}/quota`, { ok: true, used: 1, max: 10 });

    await listTokens();
    await expect(getTokenQuota()).resolves.toEqual({ ok: true, used: 1, max: 10 });

    expect(list[0].pathname).toBe(BASE);
    expect(quota[0].pathname).toBe(`${BASE}/quota`);
  });

  it("createToken POSTs the payload untouched", async () => {
    const calls = respond("post", BASE, { ok: true, token: "tk_..." });
    const payload = { label: "lab enrollments", maxUses: 5, expiresInDays: 7 };

    await createToken(payload);

    expect(calls[0].body).toEqual(payload);
  });

  it("revokeToken DELETEs the encoded token id", async () => {
    const calls = respond("delete", `${BASE}/:id`, { ok: true });

    await revokeToken("tok 1");

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].pathname).toBe(`${BASE}/tok%201`);
  });
});
