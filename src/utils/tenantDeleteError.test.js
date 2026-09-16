import { describe, expect, it } from "vitest";
import { tenantDeleteErrorMessage } from "./tenantDeleteError";

describe("tenantDeleteErrorMessage", () => {
  it("names the vendor root refusal instead of a generic failure", () => {
    const err = new Error('HTTP 409: {"error":"TENANT_IS_VENDOR_ROOT"}');
    expect(tenantDeleteErrorMessage(err)).toMatch(/vendor root/);
  });

  it("tells inactive members / pending invites apart from active members", () => {
    expect(tenantDeleteErrorMessage(new Error('HTTP 409: {"error":"TENANT_HAS_MEMBERS"}'))).toMatch(/inactive members or pending invites/);
    expect(tenantDeleteErrorMessage(new Error('HTTP 409: {"error":"TENANT_HAS_ACTIVE_MEMBERS"}'))).toMatch(/active members/);
  });

  it("reads the code from err.code too (5xx errors carry it there)", () => {
    const err = Object.assign(new Error("boom"), { code: "PERMISSION_DENIED" });
    expect(tenantDeleteErrorMessage(err)).toMatch(/permission/);
  });

  it("falls back to the generic message", () => {
    expect(tenantDeleteErrorMessage(Object.assign(new Error("x"), { code: "TENANT_DELETE_FAILED" }))).toBe("Failed to delete tenant");
    expect(tenantDeleteErrorMessage(undefined)).toBe("Failed to delete tenant");
  });
});
