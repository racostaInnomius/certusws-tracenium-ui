// The invariant these pages must not break:
//
//   NEVER PATCH a policy slice from a form that was never loaded.
//
// Why it needs its own test file: the failure is invisible in every other
// way. A failed GET used to leave `policyRow = null`, which
// extractPolicyEnvelope turns into `version: null`, which buildPutHeaders
// turns into "no If-Match header" — so the PATCH goes through
// unconditionally and replaces the tenant's real policy with the form's
// defaults. The optimistic lock that exists to stop exactly this is
// disarmed by the very null that caused it: it guards against a
// concurrent WRITER, never against a failed READ.
//
// These tests pin the two halves of the chain at the level where they are
// cheap to assert, rather than mounting three 1000-line pages.

import { describe, it, expect } from "vitest";
import { extractPolicyEnvelope } from "../components/Policies/policyTransforms";

// Mirror of api/policies.js `buildPutHeaders` — not exported, and
// duplicating four lines beats exporting internals just to test them.
// If the real one changes, the assertions below stop describing reality;
// that is the trade, and it is why the expectations name the behaviour
// ("no If-Match") rather than the implementation.
function buildPutHeaders(opts) {
  const v = opts?.expectedVersion;
  if (v === undefined || v === null || v === "") return undefined;
  return { headers: { "If-Match": String(v) } };
}

describe("the chain that made a failed read destructive", () => {
  it("turns a failed load into a version-less save", () => {
    // Step by step, so a future reader sees why "just catch it" was not
    // enough and the guard had to live in the save path.
    const failedLoad = null;
    const env = extractPolicyEnvelope(failedLoad);
    expect(env.version).toBeNull();
    expect(buildPutHeaders({ expectedVersion: env.version })).toBeUndefined();
  });

  it("produces an empty policy document from the same null", () => {
    // Which is what the form is then built from — defaults, rendered as
    // though they were the tenant's real configuration.
    const env = extractPolicyEnvelope(null);
    expect(env.raw ?? {}).toEqual({});
  });

  it("still sends If-Match when the policy really was loaded", () => {
    const loaded = { policy: { policy_json: { plugins: {} }, policy_version: 1723900000000 } };
    const env = extractPolicyEnvelope(loaded);
    // Normalised to a string by extractPolicyEnvelope — If-Match is a
    // header value, so it never travels as a number anyway.
    expect(env.version).toBe("1723900000000");
    expect(buildPutHeaders({ expectedVersion: env.version })).toEqual({
      headers: { "If-Match": "1723900000000" },
    });
  });
});

describe("why the guard cannot be the version alone", () => {
  it("cannot distinguish a failed read from a tenant with no policy yet", () => {
    // Both are `null`, and only the second may legitimately save without
    // If-Match (first write, last-writer-wins). That ambiguity is the
    // whole reason the pages now track the load FAILURE separately
    // instead of inferring it from the absent version.
    const noPolicyYet = extractPolicyEnvelope({ policy: null });
    const failedRead = extractPolicyEnvelope(null);
    expect(noPolicyYet.version).toBeNull();
    expect(failedRead.version).toBeNull();
    expect(noPolicyYet.version).toEqual(failedRead.version);
  });
});
