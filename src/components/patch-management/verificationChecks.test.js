// src/components/patch-management/verificationChecks.test.js
import { describe, expect, it } from "vitest";
import { checksPerGroup, describeCheck, emptyForm, formFromCheck, payloadFromForm, suggestionScopeText, suggestionWhy } from "./verificationChecks";

const form = (over) => ({ ...emptyForm(), name: "ERP", ...over });

describe("payloadFromForm — the shape the backend validates", () => {
  it("one per kind, with only that kind's params", () => {
    expect(payloadFromForm(form({ kind: "service", target: " MSSQLSERVER ", port: "99" })).payload).toEqual({
      name: "ERP", assetGroupId: null, kind: "service", enabled: true, params: { name: "MSSQLSERVER" },
    });
    expect(payloadFromForm(form({ kind: "port", port: "1433", assetGroupId: "7" })).payload).toMatchObject({ assetGroupId: 7, params: { port: 1433 } });
    expect(payloadFromForm(form({ kind: "tcp", host: "10.0.0.5", port: "445" })).payload.params).toEqual({ host: "10.0.0.5", port: 445 });
    expect(payloadFromForm(form({ kind: "http", url: "https://localhost/health", expectStatus: "200, 302", tlsVerify: false })).payload.params).toEqual({
      url: "https://localhost/health", expectStatus: [200, 302], tlsVerify: false,
    });
  });

  it.each([
    [{ name: " " }, /name/],
    [{ kind: "service", target: "SQL Server (MSSQLSERVER)" }, /service name/],
    [{ kind: "port", port: "70000" }, /1 to 65535/],
    [{ kind: "tcp", host: "", port: "22" }, /host/],
    [{ kind: "http", url: "ftp://x" }, /http/],
    [{ kind: "http", url: "https://x", expectStatus: "ok" }, /HTTP codes/],
  ])("rejects %j", (over, msg) => {
    expect(payloadFromForm(form(over)).error).toMatch(msg);
  });

  it("round-trips a saved check through the form", () => {
    const saved = { name: "Site", assetGroupId: 3, kind: "http", enabled: false, params: { url: "https://a/b", expectStatus: [200], bodyContains: "ok" } };
    expect(payloadFromForm(formFromCheck(saved)).payload).toEqual(saved);
  });
});

describe("describeCheck", () => {
  it("reads as a sentence", () => {
    expect(describeCheck("tcp", { host: "sql01", port: 1433 })).toBe("sql01 answers on 1433");
    expect(describeCheck("http", { url: "https://a", bodyContains: "OK" })).toBe("https://a answers 200 and contains “OK”");
  });
});

describe("checksPerGroup", () => {
  it("a group carries the tenant-wide checks too; disabled ones don't count", () => {
    const c = (id, g, enabled = true) => ({ id, assetGroupId: g, enabled });
    const r = checksPerGroup([c(1, null), c(2, null), c(3, 5), c(4, 5, false), c(5, 6)]);
    expect(r.everywhere).toBe(2);
    expect(r.byGroup.get(5)).toBe(3);
    expect(r.byGroup.get(6)).toBe(3);
  });
});

describe("suggestions copy", () => {
  it("says how much of the scope the suggestions stand on", () => {
    expect(suggestionScopeText({ devicesReported: 3, devicesInScope: 5, oldestObservation: "2026-10-01T00:00:00Z", items: [{}] })).toBe("Based on 3 of 5 devices that reported, oldest from 2026-10-01.");
    expect(suggestionScopeText({ devicesReported: 2, devicesInScope: null, items: [] })).toMatch(/Nothing to suggest/);
    expect(suggestionScopeText({ devicesReported: 0, items: [] })).toMatch(/No device here has reported/);
    expect(suggestionWhy({ devices: 1, reported: 1 })).toBe("On 1 of 1 device that reported");
  });
});
