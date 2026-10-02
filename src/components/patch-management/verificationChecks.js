// src/components/patch-management/verificationChecks.js
//
// Post-patch checks (ADR-0038 F1): the form ↔ API shape and the one-line
// description of a check. Pure — the panel and its dialog only render.
//
// The rules mirror the backend's validateCheck (verification-checks.ts), which
// mirrors the agent's parseChecks. Checking here only spares a round trip; the
// backend is still the authority.

export const CHECK_KINDS = [
  { value: "service", label: "Service is running", hint: "The service name, not its display name (e.g. MSSQLSERVER, W3SVC, sshd)." },
  { value: "process", label: "Process is running", hint: "The executable name (e.g. python.exe, node, java)." },
  { value: "port", label: "Port is listening", hint: "A TCP port on this device." },
  { value: "tcp", label: "Host answers on a port", hint: "Something this device depends on — a database, a file share." },
  { value: "http", label: "Web address answers", hint: "A URL that should answer once the server is back." },
];

const NAME = /^[A-Za-z0-9._@:+-]{1,128}$/;
const HOST = /^[A-Za-z0-9.:[\]-]{1,253}$/;
const URL_RE = /^https?:\/\/\S{1,2000}$/;

/** The agent runs at most this many per device per patch. */
export const MAX_CHECKS_PER_DEVICE = 25;

export function emptyForm() {
  return { name: "", assetGroupId: "", kind: "service", target: "", host: "", port: "", url: "", expectStatus: "200", bodyContains: "", tlsVerify: true, enabled: true };
}

export function formFromCheck(c) {
  const p = c?.params || {};
  return {
    ...emptyForm(),
    name: c?.name ?? "",
    assetGroupId: c?.assetGroupId == null ? "" : String(c.assetGroupId),
    kind: c?.kind ?? "service",
    target: p.name ?? "",
    host: p.host ?? "",
    port: p.port != null ? String(p.port) : "",
    url: p.url ?? "",
    expectStatus: Array.isArray(p.expectStatus) ? p.expectStatus.join(", ") : "200",
    bodyContains: p.bodyContains ?? "",
    tlsVerify: p.tlsVerify !== false,
    enabled: c?.enabled !== false,
  };
}

function portOf(v) {
  const n = Number(String(v).trim());
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

/**
 * The API payload, or `{ error }` naming what to fix.
 * @returns {{ payload: object } | { error: string }}
 */
export function payloadFromForm(f) {
  const name = String(f.name || "").trim();
  if (!name) return { error: "Give the check a name." };
  if (name.length > 120) return { error: "The name is too long (120 characters at most)." };
  const assetGroupId = f.assetGroupId === "" || f.assetGroupId == null ? null : Number(f.assetGroupId);
  const base = { name, assetGroupId, kind: f.kind, enabled: f.enabled !== false };

  switch (f.kind) {
    case "service":
    case "process": {
      const target = String(f.target || "").trim();
      if (!NAME.test(target)) return { error: `Enter the ${f.kind} name — letters, digits and . _ @ : + - only.` };
      return { payload: { ...base, params: { name: target } } };
    }
    case "port": {
      const port = portOf(f.port);
      if (port == null) return { error: "The port must be a number from 1 to 65535." };
      return { payload: { ...base, params: { port } } };
    }
    case "tcp": {
      const host = String(f.host || "").trim();
      if (!HOST.test(host)) return { error: "Enter a host name or IP address." };
      const port = portOf(f.port);
      if (port == null) return { error: "The port must be a number from 1 to 65535." };
      return { payload: { ...base, params: { host, port } } };
    }
    case "http": {
      const url = String(f.url || "").trim();
      if (!URL_RE.test(url)) return { error: "The address must start with http:// or https://." };
      const codes = String(f.expectStatus || "")
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      if (codes.length === 0 || codes.length > 10 || !codes.every((n) => Number.isInteger(n) && n >= 100 && n <= 599)) {
        return { error: "Expected status: one to ten HTTP codes, e.g. 200 or 200, 302." };
      }
      const body = String(f.bodyContains || "");
      if (body.length > 200) return { error: "The expected text is too long (200 characters at most)." };
      return {
        payload: {
          ...base,
          params: { url, expectStatus: codes, ...(body ? { bodyContains: body } : {}), ...(f.tlsVerify === false ? { tlsVerify: false } : {}) },
        },
      };
    }
    default:
      return { error: "Pick what to check." };
  }
}

/** "Service MSSQLSERVER is running", "10.0.0.5 answers on 445"… */
export function describeCheck(kind, params = {}) {
  switch (kind) {
    case "service":
      return `Service ${params.name} is running`;
    case "process":
      return `Process ${params.name} is running`;
    case "port":
      return `Port ${params.port} is listening`;
    case "tcp":
      return `${params.host} answers on ${params.port}`;
    case "http": {
      const codes = Array.isArray(params.expectStatus) && params.expectStatus.length ? params.expectStatus.join("/") : "200";
      const extra = params.bodyContains ? ` and contains “${params.bodyContains}”` : "";
      return `${params.url} answers ${codes}${extra}`;
    }
    default:
      return kind;
  }
}

/**
 * How many enabled checks a device in each group would get: the tenant-wide
 * ones plus that group's. A device in two groups gets both, so this is a
 * floor — but it is the number that tells an admin a group is over the cap.
 */
export function checksPerGroup(checks = []) {
  const on = checks.filter((c) => c.enabled !== false);
  const everywhere = on.filter((c) => c.assetGroupId == null).length;
  const out = new Map();
  for (const c of on) {
    if (c.assetGroupId == null) continue;
    out.set(c.assetGroupId, (out.get(c.assetGroupId) ?? everywhere) + 1);
  }
  return { everywhere, byGroup: out };
}

// ── ADR-0038 F2 (D4): suggestions ───────────────────────────────────────────

/** "4 of 5 devices", with what opens it when known. */
export function suggestionWhy(sg) {
  const owner = [sg?.process, sg?.service].filter(Boolean).join(" · ");
  const share = `On ${sg?.devices ?? 0} of ${sg?.reported ?? 0} device${sg?.reported === 1 ? "" : "s"} that reported`;
  return owner ? `${share} (${owner})` : share;
}

/** Above the list: how much of the scope these suggestions stand on. */
export function suggestionScopeText(res) {
  if (!res) return "Suggestions could not be loaded.";
  const reported = res.devicesReported ?? 0;
  const scope = res.devicesInScope;
  if (reported === 0) {
    return "No device here has reported what it listens on yet. It is recorded right before each change, or now with “Ask the devices now”.";
  }
  const of = scope != null ? ` of ${scope}` : "";
  const when = res.oldestObservation ? `, oldest from ${String(res.oldestObservation).slice(0, 10)}` : "";
  const none = (res.items ?? []).length === 0 ? " Nothing to suggest: what they have in common is already checked, or is part of the operating system." : "";
  return `Based on ${reported}${of} device${(scope ?? reported) === 1 ? "" : "s"} that reported${when}.${none}`;
}
