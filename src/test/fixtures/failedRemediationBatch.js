// src/test/fixtures/failedRemediationBatch.js
//
// Un lote de remediaciones que FALLA por un solo fix, con la forma del job
// 69b4aa78 de producción (30-sep): 25 fixes Linux, 21 applied, 3
// already_compliant, 1 failed (#735, regla de auditd con una syscall que el
// kernel no tiene). El agente manda el ack entero en `last_error`, no en
// `result_json` — ése es el caso que esto fija.

const b64url = (obj) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const FAILED_REASON =
  "post_state_mismatch: syscall fchmodat2 does not exist for arch b64 on this machine (x86_64)";

export function failedRemediationBatchJob() {
  const items = [];
  for (let id = 714; id <= 738; id += 1) {
    if ([714, 732, 738].includes(id)) {
      items.push(`patch_remediate:already_compliant;remediationId=${id};checkId=linux.config.set_value;duration=1;reason=pre_state_compliant`);
    } else if (id === 735) {
      items.push(`patch_remediate:failed;remediationId=735;checkId=linux.config.set_value;exit=2;duration=1;reason=${FAILED_REASON}`);
    } else {
      items.push(`patch_remediate:applied;remediationId=${id};checkId=linux.config.set_value;exit=0;duration=1`);
    }
  }
  return {
    job_id: "69b4aa78-8b64-4684-88aa-1e9d975e50e0",
    job_type: "patch_remediate",
    status: "failed",
    attempts: 1,
    result_json: null,
    last_error: `patch_remediate_batch:done;items=${b64url(items)}`,
    payload_json: { items: items.map((_, i) => ({ checkSnapshot: { title: `Check ${714 + i}` } })) },
  };
}
