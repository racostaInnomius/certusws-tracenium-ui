// src/components/AgentSettings/overrides.js
//
// Which policy-status rows are device overrides. From the status the
// dispatcher uses (desired_policy_source), not from the override table,
// which the status may lag by one heartbeat.

export function overrideRows(statusRows) {
  return (Array.isArray(statusRows) ? statusRows : []).filter((r) => String(r?.desired_policy_source || "") === "device");
}
