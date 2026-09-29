// src/utils/jobResult.js
//
// device_jobs.result_json is what the agent reports back when a job
// completes — the counterpart to payload_json (what was requested). The
// Jobs detail panel showed only the payload for its whole life; these
// helpers let it show the result too.
//
// The shape is not uniform across job types, and the "is there anything
// worth showing" test has to reject the several ways "nothing" arrives:
// null, {}, "", "null".
//
// Reading the result for a person lives in jobDescribe.js; `formatJobResult`,
// which printed it as a monospace blob, went away with that (29-sep).

/**
 * True when result_json carries something worth rendering. Guards the
 * whole Result block so a still-running or never-answered job — whose
 * result is null or an empty object — doesn't render an empty panel that
 * reads as "the job returned nothing" when really it hasn't returned yet.
 */
export function hasJobResult(result) {
  if (result == null) return false;
  if (typeof result === "string") {
    const t = result.trim();
    return t !== "" && t !== "null" && t !== "{}";
  }
  if (typeof result === "object") {
    return Object.keys(result).length > 0;
  }
  // number / boolean — unusual, but if the agent sent it, show it.
  return true;
}
