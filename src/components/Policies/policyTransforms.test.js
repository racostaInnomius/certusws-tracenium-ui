import { describe, it, expect } from "vitest";
import {
  pickInterval,
  pickFeature,
  readSecurityFromPolicy,
  securityFormToPolicy,
  readManagedAppFromPolicy,
  managedAppFormToPolicy,
  readFormFromPolicy,
  formToPolicy,
  isEmptyPolicy,
  extractPolicyEnvelope,
  MAM_BOOL_FIELDS,
} from "./policyTransforms";

const catalog = [
  { key: "amp", required: true },
  { key: "scp", impliesModule: "compliance" },
  { key: "pmp", impliesModule: "patch" },
  { key: "rcp", impliesModule: "remoteControl" },
];

describe("pickInterval", () => {
  it("prefers the v2 agent.schedules path over the v1 top-level path", () => {
    expect(pickInterval({ agent: { schedules: { inventory: { intervalSeconds: 120 } } }, inventory: { intervalSeconds: 300 } }, "inventory")).toBe(120);
  });
  it("falls back to the v1 top-level path", () => {
    expect(pickInterval({ compliance: { intervalSeconds: 600 } }, "compliance")).toBe(600);
  });
  it("returns NaN when unset", () => {
    expect(Number.isNaN(pickInterval({}, "patch"))).toBe(true);
  });
});

describe("pickFeature", () => {
  it("v2 agent.features wins, coerces to boolean", () => {
    expect(pickFeature({ agent: { features: { selfUpdate: 1 } }, features: { selfUpdate: false } }, "selfUpdate")).toBe(true);
  });
  it("returns null when unset (distinct from false)", () => {
    expect(pickFeature({}, "remoteShell")).toBeNull();
    expect(pickFeature({ features: { remoteShell: false } }, "remoteShell")).toBe(false);
  });
});

describe("security read/write round-trip", () => {
  it("reads defaults for an absent security block (empty capabilities)", () => {
    const form = readSecurityFromPolicy({});
    expect(form.defaultMode).toBe("report-only");
    expect(form.capabilities).toEqual({});
  });
  it("populates per-capability entries when a security block is present", () => {
    const form = readSecurityFromPolicy({ security: {} });
    // Present-but-empty security → each known capability gets a null-mode entry.
    expect(form.capabilities.firewall).toEqual({ mode: null, values: {} });
  });
  it("reads a configured capability and writes it back, omitting empties", () => {
    const policy = { security: { defaultMode: "auto", firewall: { mode: "auto", required: true } } };
    const form = readSecurityFromPolicy(policy);
    expect(form.defaultMode).toBe("auto");
    expect(form.capabilities.firewall).toEqual({ mode: "auto", values: { required: true } });

    const out = securityFormToPolicy(form);
    expect(out.defaultMode).toBe("auto");
    expect(out.firewall).toEqual({ mode: "auto", required: true });
  });
  it("returns null when nothing is configured", () => {
    const form = readSecurityFromPolicy({});
    expect(securityFormToPolicy(form)).toBeNull();
  });
});

describe("MAM managed-app read/write", () => {
  it("reads tri-state booleans and unset scalars, reading the iOS alias", () => {
    const form = readManagedAppFromPolicy({ managedApp: { requireAppPIN: true, idleTimeoutSeconds: 300 } });
    expect(form.requireAppPIN).toBe(true);
    expect(form.requireUserAuth).toBeNull();
    expect(form.idleTimeoutSeconds).toBe(300);
    expect(form.minimumAppVersion).toBe("");
  });
  it("writes only explicit fields and enforces the idle bounds", () => {
    expect(managedAppFormToPolicy({ requireAppPIN: true, idleTimeoutSeconds: 5, minimumAppVersion: " 1.2 " }))
      .toEqual({ requireAppPIN: true, minimumAppVersion: "1.2" }); // idle 5 < MAM_IDLE_MIN → dropped
    expect(managedAppFormToPolicy({})).toBeNull();
  });
});

describe("readFormFromPolicy", () => {
  it("derives plugin toggles from the catalog + enabled list, honoring required", () => {
    const form = readFormFromPolicy({ plugins: { enabled: ["scp"] } }, catalog);
    expect(form.plugins).toEqual({ amp: true, scp: true, pmp: false, rcp: false });
  });
  it("surfaces intervals only when finite/positive", () => {
    const form = readFormFromPolicy({ agent: { schedules: { inventory: { intervalSeconds: 120 } } } }, catalog);
    expect(form.inventory.intervalSeconds).toBe(120);
    expect(form.compliance.intervalSeconds).toBeNull();
  });
});

describe("formToPolicy — absent toggles are not 'off'", () => {
  // 2026-09-03: Agent Settings built its form before the plugin catalog
  // had loaded (cold cache), so the form had no plugin toggles at all.
  // Flipping one unrelated switch and saving wrote `plugins: [amp]` and
  // `modules: {}` for a 54-device tenant. These pin the fix.
  const stored = {
    plugins: { enabled: ["amp", "scp", "pmp", "sdp", "cdp", "rcp"] },
    modules: { patch: true, compliance: true, remoteControl: true },
    features: { remoteShell: true, deviceInfoWidget: true },
  };

  it("with no catalog, the stored plugin list and modules survive a save", () => {
    const form = readFormFromPolicy(stored, []);
    form.features.deviceInfoWidget = false; // the one edit the operator made
    const policy = formToPolicy(form, []);
    expect(policy.plugins.enabled).toEqual(["amp", "scp", "pmp", "sdp", "cdp", "rcp"]);
    expect(policy.modules).toEqual({ patch: true, compliance: true, remoteControl: true });
    expect(policy.features.deviceInfoWidget).toBe(false);
    // remoteShell is gated on modules.remoteControl — which must still be there.
    expect(policy.features.remoteShell).toBe(true);
  });

  it("a catalog that arrives after the form was built does not turn unknown toggles off", () => {
    const form = readFormFromPolicy(stored, []); // toggles: {}
    const policy = formToPolicy(form, catalog);  // amp/scp/pmp/rcp known; sdp/cdp not
    expect(policy.plugins.enabled).toEqual(expect.arrayContaining(["amp", "scp", "pmp", "rcp", "sdp", "cdp"]));
    expect(policy.plugins.enabled).toHaveLength(6);
    expect(policy.modules).toEqual({ compliance: true, patch: true, remoteControl: true });
  });

  it("an explicit toggle off still removes the plugin and its module", () => {
    const form = readFormFromPolicy(stored, catalog);
    form.plugins.scp = false;
    const policy = formToPolicy(form, catalog);
    expect(policy.plugins.enabled).not.toContain("scp");
    expect(policy.modules.compliance).toBeUndefined();
    // Plugins the catalog doesn't know are still carried over.
    expect(policy.plugins.enabled).toEqual(expect.arrayContaining(["sdp", "cdp"]));
  });

  it("legacy forms without the raw list behave as before", () => {
    const policy = formToPolicy({ plugins: { amp: true, scp: true }, features: {} }, catalog);
    expect(policy.plugins.enabled).toEqual(["amp", "scp"]);
    expect(policy.modules).toEqual({ compliance: true });
  });
});

describe("formToPolicy", () => {
  it("derives modules from plugins and gates intervals by module", () => {
    const form = readFormFromPolicy({ plugins: { enabled: ["scp"] } }, catalog);
    form.inventory.intervalSeconds = 120;
    form.compliance.intervalSeconds = 600;
    form.patch.intervalSeconds = 600; // pmp not enabled → module.patch false → dropped
    const policy = formToPolicy(form, catalog);
    expect(policy.modules).toEqual({ compliance: true });
    expect(policy.inventory).toEqual({ intervalSeconds: 120 });
    expect(policy.compliance).toEqual({ intervalSeconds: 600 });
    expect(policy.patch).toBeUndefined();
  });
  it("drops out-of-range intervals", () => {
    const form = readFormFromPolicy({ plugins: { enabled: [] } }, catalog);
    form.inventory.intervalSeconds = 5; // < INVENTORY_INTERVAL_MIN (60)
    const policy = formToPolicy(form, catalog);
    expect(policy.inventory).toBeUndefined();
  });
  it("only emits RCP feature flags when the remoteControl module is on", () => {
    const withRcp = readFormFromPolicy({ plugins: { enabled: ["rcp"] } }, catalog);
    withRcp.features.remoteShell = true;
    expect(formToPolicy(withRcp, catalog).features).toEqual({ remoteShell: true });

    const noRcp = readFormFromPolicy({ plugins: { enabled: [] } }, catalog);
    noRcp.features.remoteShell = true; // rcp off → dropped
    expect(formToPolicy(noRcp, catalog).features).toBeUndefined();
  });
  it("round-trips deviceInfoWidget without any plugin gate", () => {
    // Read: surfaces the flag from the policy (v1 path).
    const form = readFormFromPolicy(
      { plugins: { enabled: [] }, features: { deviceInfoWidget: true } },
      catalog
    );
    expect(form.features.deviceInfoWidget).toBe(true);
    // Write: emitted even with no plugins enabled — the widget lives in
    // the tray app, not in a plugin.
    expect(formToPolicy(form, catalog).features).toEqual({ deviceInfoWidget: true });

    // Unset stays omitted (null ⇒ operator never touched it).
    const untouched = readFormFromPolicy({ plugins: { enabled: [] } }, catalog);
    expect(untouched.features.deviceInfoWidget).toBeNull();
    expect(formToPolicy(untouched, catalog).features).toBeUndefined();
  });
  it("emits AI and SDP blocks only for positive integer values", () => {
    const form = readFormFromPolicy({}, catalog);
    form.ai.enabled = true;
    form.ai.maxCallsPerDay = 100;
    form.sdp.bandwidthLimitKbps = 0; // dropped
    const policy = formToPolicy(form, catalog);
    expect(policy.ai).toEqual({ enabled: true, maxCallsPerDay: 100 });
    expect(policy.sdp).toBeUndefined();
  });
});

describe("isEmptyPolicy", () => {
  it("is true for null / non-object / empty object", () => {
    expect(isEmptyPolicy(null)).toBe(true);
    expect(isEmptyPolicy("x")).toBe(true);
    expect(isEmptyPolicy({})).toBe(true);
    expect(isEmptyPolicy({ modules: {} })).toBe(false);
  });
});

describe("extractPolicyEnvelope", () => {
  it("unwraps the { ok, policy } DB-row shape (snake_case)", () => {
    const env = extractPolicyEnvelope({
      ok: true,
      policy: { policy_json: { modules: {} }, policy_version: 7, policy_hash: "abc", updated_at: "2026-05-01" },
    });
    expect(env).toEqual({ raw: { modules: {} }, version: "7", hash: "abc", updatedAt: "2026-05-01" });
  });
  it("handles plain policy content already unwrapped", () => {
    const env = extractPolicyEnvelope({ modules: { compliance: true }, version: 3 });
    expect(env.raw).toEqual({ modules: { compliance: true }, version: 3 });
    expect(env.version).toBe("3");
  });
  it("returns a null envelope for junk", () => {
    expect(extractPolicyEnvelope(null)).toEqual({ raw: null, version: null, hash: null, updatedAt: null });
  });
});

// ── rcp.file confinement round-trip ──────────────────────────────────
//
// The form edits paths as newline-separated text; the policy carries
// arrays. What matters is that an untouched form never invents a key —
// an empty `roots: []` would read to the agent as "no roots at all",
// which is very different from "no opinion, use your defaults".
describe("policyTransforms — rcp.file confinement", () => {
  // `modules` in formToPolicy is derived from the plugin catalog, not from
  // form.modules — so enabling RCP means enabling the rcp PLUGIN.
  const withRcpOn = (policy = {}) =>
    readFormFromPolicy({ ...policy, plugins: { enabled: ["rcp"] } }, catalog);

  it("reads roots and denyPaths out of the policy as text", () => {
    const form = readFormFromPolicy({
      rcp: { file: { roots: ["/home", "/srv"], denyPaths: ["/srv/secrets"] } },
    });
    expect(form.rcpFile.roots).toBe("/home\n/srv");
    expect(form.rcpFile.denyPaths).toBe("/srv/secrets");
  });

  it("yields empty strings when the policy has no rcp block", () => {
    const form = readFormFromPolicy({});
    expect(form.rcpFile).toEqual({ roots: "", denyPaths: "", denyExtensions: "" });
  });

  it("writes the arrays back, trimming blanks and trailing separators", () => {
    const form = withRcpOn();
    form.rcpFile = { roots: "  /home  \n\n/srv/share/\n", denyPaths: "" };
    const policy = formToPolicy(form, catalog);
    expect(policy.rcp.file.roots).toEqual(["/home", "/srv/share"]);
    // denyPaths was empty → key omitted entirely, not an empty array.
    expect(policy.rcp.file.denyPaths).toBeUndefined();
  });

  // El agente ya leia denyExtensions y el backend ya lo validaba, pero no
  // habia forma de escribirlo: el campo no existia ni en la UI ni en el
  // transform, asi que la politica nunca lo llevaba.
  it("normaliza el punto delantero y las mayusculas de denyExtensions", () => {
    const form = withRcpOn();
    form.rcpFile = { roots: "", denyPaths: "", denyExtensions: "pem\n.PFX\n  key  " };
    const policy = formToPolicy(form, catalog);
    expect(policy.rcp.file.denyExtensions).toEqual([".pem", ".pfx", ".key"]);
  });

  it("omite denyExtensions cuando no hay nada escrito", () => {
    const form = withRcpOn();
    form.rcpFile = { roots: "/home", denyPaths: "", denyExtensions: "  \n \n" };
    const policy = formToPolicy(form, catalog);
    expect(policy.rcp.file.denyExtensions).toBeUndefined();
  });

  it("lee denyExtensions de la politica como texto", () => {
    const form = readFormFromPolicy({ rcp: { file: { denyExtensions: [".pem", ".pfx"] } } });
    expect(form.rcpFile.denyExtensions).toBe(".pem\n.pfx");
  });

  it("omits the rcp key entirely when both fields are blank", () => {
    const form = withRcpOn();
    form.rcpFile = { roots: "", denyPaths: "" };
    expect(formToPolicy(form, catalog).rcp).toBeUndefined();
  });

  it("omits the rcp key when the remote control plugin is off", () => {
    const form = readFormFromPolicy({ plugins: { enabled: [] } }, catalog);
    form.rcpFile = { roots: "/home" };
    expect(formToPolicy(form, catalog).rcp).toBeUndefined();
  });

  it("survives a full read → write round trip", () => {
    const original = { rcp: { file: { roots: ["/home"], denyPaths: ["/home/x"] } } };
    const policy = formToPolicy(withRcpOn(original), catalog);
    expect(policy.rcp.file).toEqual({ roots: ["/home"], denyPaths: ["/home/x"] });
  });
});

// ── CDP (Crypto Discovery) ─────────────────────────────────────────
//
// Same omit-empty discipline as rcp.file: an untouched form must never
// invent a `cdp` key, because absent means "agent defaults" (6h cadence,
// JVM cacerts only) while an empty array would be a different claim.
describe("policyTransforms — cdp (Crypto Discovery)", () => {
  const cdpCatalog = [...catalog, { key: "cdp" }];
  const withCdpOn = (policy = {}) =>
    readFormFromPolicy({ ...policy, plugins: { enabled: ["cdp"] } }, cdpCatalog);

  it("reads the keystore list out of the policy as newline-separated text", () => {
    const form = readFormFromPolicy({
      cdp: { intervalSeconds: 21600, javaKeystorePaths: ["/opt/a.jks", "C:\\App\\b.p12"] },
    });
    expect(form.cdp.javaKeystorePaths).toBe("/opt/a.jks\nC:\\App\\b.p12");
    expect(form.cdp.intervalSeconds).toBe(21600);
  });

  it("yields blanks when the policy has no cdp block", () => {
    expect(readFormFromPolicy({}).cdp).toEqual({
      intervalSeconds: "",
      javaKeystorePaths: "",
      // The probe is opt-in, so "no block" has to read as off — not as
      // undefined, which a checkbox would render as an uncontrolled input.
      scanTlsListeners: false,
      tlsListenerPorts: "",
      certFilePaths: "",
    });
  });

  it("omits the cdp key entirely when nothing is configured", () => {
    const form = withCdpOn();
    expect(formToPolicy(form, cdpCatalog).cdp).toBeUndefined();
  });

  it("omits the cdp key when the plugin is disabled, even if the form has values", () => {
    const form = readFormFromPolicy({ plugins: { enabled: ["amp"] } }, cdpCatalog);
    form.cdp = { intervalSeconds: 3600, javaKeystorePaths: "/opt/a.jks" };
    expect(formToPolicy(form, cdpCatalog).cdp).toBeUndefined();
  });

  it("trims, drops blank lines and strips trailing separators", () => {
    const form = withCdpOn();
    form.cdp = { intervalSeconds: "", javaKeystorePaths: "  /opt/a.jks  \n\n/srv/ks/\n" };
    expect(formToPolicy(form, cdpCatalog).cdp).toEqual({
      javaKeystorePaths: ["/opt/a.jks", "/srv/ks"],
    });
  });

  it("drops an out-of-range interval rather than sending it to the agent", () => {
    const form = withCdpOn();
    form.cdp = { intervalSeconds: 60, javaKeystorePaths: "/opt/a.jks" };
    const policy = formToPolicy(form, cdpCatalog);
    expect(policy.cdp.intervalSeconds).toBeUndefined();
    expect(policy.cdp.javaKeystorePaths).toEqual(["/opt/a.jks"]);
  });

  it("round-trips a fully configured block", () => {
    const original = { cdp: { intervalSeconds: 7200, javaKeystorePaths: ["/opt/a.jks"] } };
    const policy = formToPolicy(withCdpOn(original), cdpCatalog);
    expect(policy.cdp).toEqual({ intervalSeconds: 7200, javaKeystorePaths: ["/opt/a.jks"] });
  });
});

describe("location tracking field metadata", () => {
  const field = MAM_BOOL_FIELDS.find((f) => f.key === "locationTracking");

  it("is offered as a MAM switch", () => {
    expect(field).toBeTruthy();
    expect(field.label).toBe("Location tracking");
  });

  it("warns that turning it off erases what was already collected", () => {
    // The backend purges stored coordinates on the OFF write. An operator who
    // only reads "stop tracking" would not expect the history to disappear.
    expect(field.hint).toMatch(/erases/i);
  });

  it("says the end user is asked and may refuse", () => {
    // Enabling the policy is not consent; the person still gets an OS prompt
    // and an in-app notice, and declining is a supported outcome.
    expect(field.hint).toMatch(/refuse/i);
  });
});

describe("desktop location tracking feature", () => {
  it("round-trips through the form", () => {
    const form = readFormFromPolicy(
      { plugins: { enabled: [] }, features: { locationTracking: true } },
      catalog
    );
    expect(form.features.locationTracking).toBe(true);
    expect(formToPolicy(form, catalog).features.locationTracking).toBe(true);
  });

  it("stays unset when the operator never touched it", () => {
    // Unset must be distinguishable from an explicit false, so an untouched
    // policy does not start writing a switch the tenant never chose.
    const form = readFormFromPolicy({ plugins: { enabled: [] } }, catalog);
    expect(form.features.locationTracking).toBeNull();
    // omit-empty: with nothing set, the whole features block is dropped rather
    // than emitted with an explicit undefined.
    expect(formToPolicy(form, catalog).features?.locationTracking).toBeUndefined();
  });

  it("is emitted as an explicit false when switched off", () => {
    // The backend purge keys on this: an explicit false is what erases the
    // coordinates already stored.
    const form = readFormFromPolicy({ plugins: { enabled: [] } }, catalog);
    form.features.locationTracking = false;
    expect(formToPolicy(form, catalog).features.locationTracking).toBe(false);
  });

  it("is independent of the mobile MAM switch", () => {
    const form = readFormFromPolicy(
      { plugins: { enabled: [] }, features: { locationTracking: true }, mam: {} },
      catalog
    );
    expect(form.features.locationTracking).toBe(true);
    expect(form.managedApp?.locationTracking ?? null).toBeNull();
  });
});

// ── CDP TLS listener probe ────────────────────────────────────────
// The round-trip that was missing entirely: `cdp.scanTlsListeners` had
// no reader and no writer here, so an operator could not switch on the
// only collector that feeds TLS chain validation and
// certificate-to-process attribution.
describe("cdp.scanTlsListeners", () => {
  const cdpCatalog = [...catalog, { key: "cdp" }];
  const withCdp = (cdp) => ({ plugins: { enabled: ["amp", "cdp"] }, cdp });

  it("round-trips on, with its port list", () => {
    const form = readFormFromPolicy(
      withCdp({ scanTlsListeners: true, tlsListenerPorts: [443, 8443] }),
      cdpCatalog
    );
    expect(form.cdp.scanTlsListeners).toBe(true);
    expect(form.cdp.tlsListenerPorts).toBe("443, 8443");

    const out = formToPolicy(form, cdpCatalog);
    expect(out.cdp.scanTlsListeners).toBe(true);
    expect(out.cdp.tlsListenerPorts).toEqual([443, 8443]);
  });

  it("reads anything that is not a stored true as off", () => {
    // Mirrors the agent's `=== true`.
    expect(readFormFromPolicy(withCdp({ scanTlsListeners: "true" }), cdpCatalog).cdp.scanTlsListeners).toBe(false);
    expect(readFormFromPolicy(withCdp({}), cdpCatalog).cdp.scanTlsListeners).toBe(false);
  });

  it("omits the key when off, rather than writing a no-op false", () => {
    const form = readFormFromPolicy(withCdp({ intervalSeconds: 21600 }), cdpCatalog);
    const out = formToPolicy(form, cdpCatalog);
    expect(out.cdp.intervalSeconds).toBe(21600);
    expect(out.cdp.scanTlsListeners).toBeUndefined();
  });

  it("drops the port list when the probe is off — it would do nothing", () => {
    const form = readFormFromPolicy(withCdp({}), cdpCatalog);
    form.cdp.tlsListenerPorts = "443, 8443";
    expect(formToPolicy(form, cdpCatalog).cdp?.tlsListenerPorts).toBeUndefined();
  });

  it("parses ports pasted with commas, spaces or newlines, and drops junk", () => {
    const form = readFormFromPolicy(withCdp({ scanTlsListeners: true }), cdpCatalog);
    form.cdp.tlsListenerPorts = "443, 8443\n9443 443 https 70000";
    // 443 deduped, "https" and 70000 dropped — same rules the agent applies.
    expect(formToPolicy(form, cdpCatalog).cdp.tlsListenerPorts).toEqual([443, 8443, 9443]);
  });

  it("is dropped entirely when the cdp plugin is not enabled", () => {
    const form = readFormFromPolicy(withCdp({ scanTlsListeners: true }), cdpCatalog);
    form.plugins.cdp = false;
    expect(formToPolicy(form, cdpCatalog).cdp).toBeUndefined();
  });
});

describe("cdp.certFilePaths", () => {
  const cdpCatalog = [...catalog, { key: "cdp" }];
  const withCdp = (cdp) => ({ plugins: { enabled: ["amp", "cdp"] }, cdp });

  it("round-trips las rutas como texto multilínea", () => {
    const form = readFormFromPolicy(withCdp({ certFilePaths: ["/etc/ssl/certs", "/opt/app/ssl"] }), cdpCatalog);
    expect(form.cdp.certFilePaths).toBe("/etc/ssl/certs\n/opt/app/ssl");
    expect(formToPolicy(form, cdpCatalog).cdp.certFilePaths).toEqual(["/etc/ssl/certs", "/opt/app/ssl"]);
  });

  it("omite la clave cuando no hay rutas — apagado es el estado por defecto", () => {
    const form = readFormFromPolicy(withCdp({}), cdpCatalog);
    expect(formToPolicy(form, cdpCatalog).cdp?.certFilePaths).toBeUndefined();
  });
});
