// src/utils/jobResult.js
//
// device_jobs.result_json is what the agent reports back when a job
// completes — the counterpart to payload_json (what was requested). The
// Jobs detail panel showed only the payload for its whole life; these
// helpers let it show the result too.
//
// The shape is not uniform across job types. Some agents return a flat
// { source, message } ack ("software_dp_prefetch:success;cached=1"),
// others a structured object (patch results, dry-run findings). So the
// formatter has to handle both a human string and an arbitrary object,
// and the "is there anything worth showing" test has to reject the
// several ways "nothing" arrives: null, {}, "", "null".

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

/**
 * Render result_json for the monospace panel.
 *
 * A flat { source, message } ack is the common case and reads best as its
 * message line alone — the operator wants "success; cached=1", not the
 * JSON wrapper around it. Anything richer is pretty-printed. A string that
 * is itself JSON (some agents double-encode) is parsed first so it doesn't
 * show as an escaped blob.
 */
export function formatJobResult(result) {
  if (result == null) return "";

  if (typeof result === "string") {
    const t = result.trim();
    // Double-encoded JSON: parse then recurse so an object ack formats
    // the same whether it arrived encoded or not.
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return formatJobResult(JSON.parse(t));
      } catch {
        /* not actually JSON — fall through and show the string */
      }
    }
    return t;
  }

  if (typeof result === "object") {
    const keys = Object.keys(result);
    // The flat ack: a message line is the whole story. `source` is
    // plumbing ("agent_ack") that the operator does not need to read.
    if (typeof result.message === "string" && keys.every((k) => k === "message" || k === "source")) {
      return result.message;
    }
    return JSON.stringify(result, null, 2);
  }

  return String(result);
}
