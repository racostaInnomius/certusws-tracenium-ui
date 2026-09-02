// src/components/patch-management/gateway/verifyReport.js
//
// Turns the gateway's verification report into something an operator can act on.
//
// The whole point of the ladder (ADR-0001 C-bis) is that "it didn't work" is
// useless: a typo'd password and a service account missing snapshot privileges
// look identical from outside and have completely different remedies. So every
// failure class maps to a concrete next step, and the privilege rung is shown
// privilege-by-privilege.
//
// PURE — no React, no network, so the mapping is testable on its own.

/** Ordered rungs, so a partial report still renders in the right sequence. */
export const STAGES = ["reachability", "tls_pin", "authentication", "privileges", "scope"];

export const STAGE_LABEL = {
  reachability: "Network reachability",
  tls_pin: "Certificate pin",
  authentication: "Authentication",
  privileges: "Privileges",
  scope: "Inventory scope",
};

/**
 * What the operator should DO. Keyed by the classification the gateway sent, so
 * the copy stays in one place instead of being scattered through JSX.
 */
export const REMEDIATION = {
  network:
    "The gateway host cannot reach vCenter. Check its network route, DNS and any firewall between them.",
  tls_pin_mismatch:
    "vCenter is presenting a different certificate than the one registered. Confirm the change was legitimate, then update the thumbprint on this gateway.",
  bad_credentials:
    "vCenter rejected the username or password. Re-enter the credential. It is deliberately not retried — vSphere locks accounts after repeated failures.",
  password_expired:
    "The service account password has expired. Renew it in vSphere, then send the credential again.",
  account_locked:
    "The service account is locked in vSphere. Unlock it and wait out the lockout window before retrying.",
  insufficient_privileges:
    "The service account is missing snapshot privileges. Grant a role containing them on the target folder or datacenter, with propagation enabled.",
  empty_scope:
    "The account cannot see any VM in the configured scope. Check the folder selection and that permissions propagate to child objects.",
  no_credential: "No credential has been sent to this gateway yet.",
  stale_envelope:
    "The credential was sealed against a certificate this gateway has since replaced. Send it again.",
  // ADR-0013. Ni la credencial ni la contraseña tienen la culpa: en Windows la
  // clave de enrolamiento se crea solo-firma, así que no puede abrir un sobre.
  // Volver a escribir la contraseña no arregla nada, y decir «credencial
  // inválida» mandaría a alguien a hacer justamente eso.
  key_cannot_decrypt:
    "The agent on this gateway cannot open a sealed credential: its enrollment key is signing-only. Update the agent on the gateway host — re-entering the password will not help.",
  not_a_gateway:
    "This device has not received its gateway configuration yet. It should arrive on the next policy sync.",
  unknown: "Unexpected vCenter error — see the stage detail and the gateway log.",
};

export function remediationFor(classify) {
  return REMEDIATION[classify] || REMEDIATION.unknown;
}

/**
 * Normalise a report into rows for display.
 *
 * Stages the gateway never reached are marked `pending`, NOT failed: showing a
 * red cross on "Privileges" because the ladder stopped at authentication would
 * send the operator chasing the wrong problem.
 */
export function toStageRows(report) {
  const byStage = new Map((report?.stages ?? []).map((s) => [s.stage, s]));
  const failedIndex = STAGES.findIndex((s) => byStage.get(s) && !byStage.get(s).ok);

  return STAGES.map((stage, i) => {
    const s = byStage.get(stage);
    if (!s) {
      return {
        stage,
        label: STAGE_LABEL[stage],
        status: failedIndex >= 0 && i > failedIndex ? "skipped" : "pending",
        detail: "",
        privileges: null,
      };
    }
    return {
      stage,
      label: STAGE_LABEL[stage],
      status: s.ok ? (s.warn ? "warn" : "ok") : "failed",
      detail: s.detail || s.error || "",
      privileges: s.privileges ?? null,
    };
  });
}

/** Health chip colour/label, including the time-based staleness the backend flags. */
export function healthPresentation(gateway, now = Date.now(), staleHours = 24) {
  const health = gateway?.health ?? "unknown";
  const last = gateway?.lastVerifiedAt ? Date.parse(gateway.lastVerifiedAt) : NaN;
  const ageHours = Number.isFinite(last) ? (now - last) / 3_600_000 : Infinity;

  if (health === "verified" && ageHours > staleHours) {
    // A credential that worked yesterday can be locked or expired today. Do not
    // show a green tick for a check that is too old to trust.
    return { label: "Stale", color: "warning", hint: `Last verified ${Math.floor(ageHours)}h ago` };
  }
  switch (health) {
    case "verified":
      return { label: "Verified", color: "success", hint: gateway?.lastVerifiedAt ?? "" };
    case "failed":
      return {
        label: "Failed",
        color: "error",
        hint: remediationFor(gateway?.lastVerifyClassify),
      };
    case "stale":
      return { label: "Stale", color: "warning", hint: "Verification is too old to trust" };
    default:
      return { label: "Not verified", color: "default", hint: "Run Test connection" };
  }
}

/** Credential lifecycle, in words an admin can act on. */
export function credentialPresentation(state) {
  switch (state) {
    case "delivered":
      return { label: "Stored on gateway", color: "success" };
    case "sealed_pending":
      return { label: "Sent, awaiting gateway", color: "info" };
    case "stale_envelope":
      return { label: "Re-enter required", color: "warning" };
    case "failed":
      return { label: "Failed", color: "error" };
    default:
      return { label: "Not configured", color: "default" };
  }
}
