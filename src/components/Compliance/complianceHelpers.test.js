import { describe, it, expect } from "vitest";
import {
  REMEDIATION_TRANSITIONS,
  dateInputValue,
  expiryIsoFromDateInput,
  shortRelativeTime,
  shortDate,
  remediationVerification,
} from "./complianceHelpers";

describe("REMEDIATION_TRANSITIONS", () => {
  it("open moves directly only to in_progress or remediated: exceptions are requested (P1-7)", () => {
    expect(REMEDIATION_TRANSITIONS.open).toEqual(["in_progress", "remediated"]);
    expect(REMEDIATION_TRANSITIONS.in_progress).not.toContain("risk_accepted");
    expect(REMEDIATION_TRANSITIONS.in_progress).not.toContain("wont_fix");
  });
  it("an exception or a remediation can only reopen", () => {
    expect(REMEDIATION_TRANSITIONS.remediated).toEqual(["open"]);
    expect(REMEDIATION_TRANSITIONS.risk_accepted).toEqual(["open"]);
    expect(REMEDIATION_TRANSITIONS.wont_fix).toEqual(["open"]);
  });
});

describe("exception expiry date input", () => {
  it("dateInputValue is YYYY-MM-DD N days out", () => {
    expect(dateInputValue(1, new Date(2026, 8, 17, 10, 0))).toBe("2026-09-18");
    expect(dateInputValue(365, new Date(2026, 8, 17, 10, 0))).toBe("2027-09-17");
  });
  it("expiryIsoFromDateInput sends the START of the chosen local day, inside the 365-day window", () => {
    const now = new Date(2026, 8, 17, 0, 1);
    const iso = expiryIsoFromDateInput(dateInputValue(365, now));
    expect(new Date(iso).getTime()).toBeLessThanOrEqual(now.getTime() + 365 * 86_400_000);
    expect(new Date(iso)).toEqual(new Date(2027, 8, 17, 0, 0, 0));
    expect(expiryIsoFromDateInput("17/09/2027")).toBeNull();
    expect(expiryIsoFromDateInput("")).toBeNull();
  });
});

describe("shortRelativeTime", () => {
  it("returns null for invalid/empty", () => {
    expect(shortRelativeTime(null)).toBeNull();
    expect(shortRelativeTime("nope")).toBeNull();
  });
  it("buckets compactly without an 'ago' suffix", () => {
    const now = Date.now();
    expect(shortRelativeTime(new Date(now - 5 * 60_000).toISOString())).toBe("5m");
    expect(shortRelativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe("3h");
    expect(shortRelativeTime(new Date(now - 2 * 86_400_000).toISOString())).toBe("2d");
  });
});

describe("shortDate", () => {
  it("returns null for invalid/empty", () => {
    expect(shortDate(null)).toBeNull();
    expect(shortDate("bad")).toBeNull();
  });
  it("formats a month + day", () => {
    expect(shortDate("2026-09-30T00:00:00.000Z")).toMatch(/Sep/);
  });
});

// `remediated` es una afirmación pendiente del siguiente escaneo, no un
// resuelto: la tarjeta necesita distinguir las dos cosas.
describe("remediationVerification", () => {
  it("fail + remediated: pendiente del siguiente escaneo", () => {
    expect(remediationVerification({ status: "fail", remediationStatus: "remediated" })).toBe("awaiting");
  });

  it("fail + open con marca de reversión: el arreglo no aguantó", () => {
    expect(
      remediationVerification({ status: "fail", remediationStatus: "open", remediationRevertedAt: "2026-09-21T10:00:00Z" })
    ).toBe("did_not_hold");
  });

  it("cualquier otro caso se pinta como siempre", () => {
    expect(remediationVerification({ status: "fail", remediationStatus: "open" })).toBeNull();
    expect(remediationVerification({ status: "pass", remediationStatus: "remediated" })).toBeNull();
    expect(remediationVerification({ status: "fail", remediationStatus: "in_progress" })).toBeNull();
    expect(remediationVerification(null)).toBeNull();
  });
});
