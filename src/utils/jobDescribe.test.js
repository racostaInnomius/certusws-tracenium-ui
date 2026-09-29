// src/utils/jobDescribe.test.js
//
// Los mensajes de aquí son los de producción (29-sep), con los ids cambiados.
// Si el agente cambia su gramática, lo que tiene que romperse es esto — no el
// panel en silencio.

import { describe, expect, it } from "vitest";

import {
  decodeBlob,
  describeDesiredWrite,
  describeJobPayload,
  describeJobResult,
  formatDurationMs,
  parseAckMessage,
  rawJsonText,
  redactForDisplay,
  splitHead,
} from "./jobDescribe";

// base64url como lo escribe el agente (sin relleno).
const b64url = (obj) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const ack = (job_type, message, extra = {}) => ({
  job_type,
  status: "completed",
  result_json: { source: "agent_ack", message, ...extra },
});

const factValue = (d, label) => d.facts.find((f) => f.label === label)?.value;

describe("parseAckMessage / splitHead — las cuatro formas de cabeza", () => {
  it("separa la cabeza de los pares, con o sin espacio tras el `;`", () => {
    const p = parseAckMessage("patch_install success; installed=2; failed=0; rebootRequired=true");
    expect(p.head).toBe("patch_install success");
    expect(p.fields).toEqual([
      { key: "installed", value: "2" },
      { key: "failed", value: "0" },
      { key: "rebootRequired", value: "true" },
    ]);
  });

  it("⚠️ un trozo sin `=` no se pierde: va a notes", () => {
    expect(parseAckMessage("x:y;suelto;a=1").notes).toEqual(["suelto"]);
  });

  it("un valor con `=` dentro (relleno base64) conserva el resto", () => {
    expect(parseAckMessage("x:y;blob=abc==").fields[0]).toEqual({ key: "blob", value: "abc==" });
  });

  it.each([
    ["software_install:already_installed", "software_install", "already_installed", ""],
    ["patch_install success", "patch_install", "success", ""],
    ["patch_remediate_batch:done", "patch_remediate", "done", ""],
    ["update_skipped: latest_already_installed", "agent_update", "update_skipped", "latest_already_installed"],
    ["reset_baseline:cleared:amp:browserExtensions", "reset_baseline", "cleared", "amp:browserExtensions"],
    ["facts_enqueued:127", "facts_snapshot", "facts_enqueued", "127"],
    ["OK", "patch_scan", "OK", ""],
  ])("%s → %s", (head, type, verdict, rest) => {
    const s = splitHead(head, type);
    expect(s.verdict).toBe(verdict);
    expect(s.rest).toBe(rest);
  });

  it("el `_batch` se reconoce como lote", () => {
    expect(splitHead("patch_remediate_batch:done", "patch_remediate").batch).toBe(true);
    expect(splitHead("patch_remediate:applied", "patch_remediate").batch).toBe(false);
  });
});

describe("decodeBlob", () => {
  it("decodifica base64url sin relleno con JSON dentro", () => {
    expect(decodeBlob(b64url({ found: true, hits: [] }))).toEqual({ found: true, hits: [] });
  });

  it("respeta UTF-8 (rutas y nombres con acentos)", () => {
    expect(decodeBlob(b64url({ name: "Configuración" }))).toEqual({ name: "Configuración" });
  });

  it("🔴 algo que «decodifica» pero no es JSON NO es un blob", () => {
    // El caso real: vmUuid=564d6d3b-19a2-3a61-e58a-58858da17cac pasa el
    // alfabeto base64url y da bytes basura.
    expect(decodeBlob("564d6d3b-19a2-3a61-e58a-58858da17cac")).toBeNull();
    expect(decodeBlob("snapshot-14336")).toBeNull();
    expect(decodeBlob(b64url("solo un string"))).toBeNull();
  });
});

describe("🔴 el veredicto sale del mensaje, NO del status", () => {
  it("agent_update `update_started` NO se lee como actualizado", () => {
    // 1.676 de 1.900 jobs de update en 60 días acaban así con status
    // `completed`. El ack dice que ARRANCÓ el instalador; la versión la
    // confirma el HELLO al volver.
    const d = describeJobResult(ack("agent_update", "update_started;src=dp"));
    expect(d.tone).toBe("info");
    expect(d.headline).toMatch(/installer started/i);
    expect(d.headline).toMatch(/does not confirm/i);
    expect(d.headline).toMatch(/Distribution Point/);
  });

  it("software_install `already_installed` dice que NO se ejecutó nada", () => {
    const d = describeJobResult(
      ack(
        "software_install",
        `software_install:already_installed;deploymentId=56;reason=pre_detect_matched;detectBefore=${b64url({
          displayNameLike: "Google Chrome",
          found: true,
          installedVersion: "154.0.8037.58",
          minVersion: "154.0.8037.58",
          hits: [{ displayName: "Google Chrome", displayVersion: "154.0.8037.58" }],
        })}`
      )
    );
    expect(d.headline).toMatch(/installer was not run/i);
    expect(d.detection).toEqual([
      { label: "Detected before", value: "Google Chrome 154.0.8037.58" },
      { label: "Required version", value: "154.0.8037.58 or later" },
    ]);
    expect(factValue(d, "Reason")).toMatch(/detection rule already matched/i);
    // El blob se pinta; no se repite como fila ilegible.
    expect(d.facts.some((f) => f.key === "detectBefore")).toBe(false);
  });

  it("🔴 un DESINSTALADO no se lee como «Installed» (job a483ad46, AnyDesk, 29-sep)", () => {
    // El mismo job_type sirve para instalar y desinstalar; el agente contesta
    // `software_install:success` en los dos. Lo que distingue es payload.mode.
    // Mensaje literal de producción.
    const d = describeJobResult({
      job_type: "software_install",
      status: "completed",
      payload_json: { mode: "uninstall", deploymentId: 60, packageSnapshot: { name: "AnyDesk", version: "ad 9.7.15" } },
      result_json: {
        source: "agent_ack",
        message:
          "software_install:success;deploymentId=60;exit=0;duration=5488;detectBefore=eyJkaXNwbGF5TmFtZUxpa2UiOiJBbnlEZXNrIiwiZm91bmQiOnRydWUsImluc3RhbGxlZFZlcnNpb24iOiJhZCA5LjcuMTUiLCJtaW5WZXJzaW9uIjpudWxsLCJoaXRzIjpbeyJkaXNwbGF5TmFtZSI6IkFueURlc2siLCJkaXNwbGF5VmVyc2lvbiI6ImFkIDkuNy4xNSIsInB1Ymxpc2hlciI6IkFueURlc2sgU29mdHdhcmUgR21iSCIsInZpZXciOiJ4ODYifV19;detectAfter=eyJkaXNwbGF5TmFtZUxpa2UiOiJBbnlEZXNrIiwiZm91bmQiOmZhbHNlfQ",
      },
    });
    expect(d.headline).toBe("Uninstalled");
    expect(d.tone).toBe("success");
    expect(d.detection).toEqual([
      { label: "Detected before", value: "AnyDesk ad 9.7.15" },
      { label: "Detected after", value: "Not found" },
    ]);
  });

  it.each([
    ["uninstall", "already_installed;deploymentId=60;reason=pre_detect_absent", "Already absent — the uninstaller was not run"],
    ["uninstall", "failed;deploymentId=60;reason=post_detect_still_present", "Uninstall failed"],
    ["uninstall", "reboot_required;deploymentId=60", "Uninstalled — a reboot is required to finish"],
    ["reinstall", "success;deploymentId=60", "Reinstalled"],
    ["install", "success;deploymentId=60", "Installed"],
    ["install", "timed_out;deploymentId=60", "Install timed out"],
    [undefined, "success;deploymentId=60", "Installed"],
  ])("software_install en modo %s · %s → %s", (mode, rest, headline) => {
    const d = describeJobResult({
      job_type: "software_install",
      payload_json: mode ? { mode } : {},
      result_json: { message: `software_install:${rest}` },
    });
    expect(d.headline).toBe(headline);
  });

  it("las razones del desinstalado se leen, no salen en snake_case", () => {
    const d = describeJobResult({
      job_type: "software_install",
      payload_json: { mode: "uninstall" },
      result_json: { message: "software_install:failed;reason=post_detect_still_present" },
    });
    expect(factValue(d, "Reason")).toBe("The software was still detected after the uninstaller ran");
  });

  it("un status `completed` con veredicto desconocido de fallo se pinta en rojo", () => {
    const d = describeJobResult(ack("software_install", "software_install:install_failed;exit=1603"));
    expect(d.known).toBe(false);
    expect(d.tone).toBe("error");
    expect(d.headline).toBe("Install failed");
  });
});

describe("⚠️ el último ack no es el final", () => {
  it("un job fallido cuyo último ack era un progreso lo avisa", () => {
    // Producción: asp_assess `failed` con `asp_run_started` como resultado.
    const d = describeJobResult({ ...ack("asp_assess", "asp_run_started;run=r1"), status: "failed" });
    expect(d.headline).toBe("Assessment started");
    expect(d.endedAs).toBe("failed");
  });

  it("no se marca si el job terminó bien, ni si el propio ack ya es un fallo", () => {
    expect(describeJobResult(ack("asp_assess", "asp_run_started;run=r1")).endedAs).toBeUndefined();
    const failedAck = { ...ack("software_install", "software_install:install_failed"), status: "failed" };
    expect(describeJobResult(failedAck).endedAs).toBeUndefined();
  });
});

describe("⚠️ lo que no se reconoce se enseña, no se adivina", () => {
  it("veredicto fuera del diccionario: literal, tono neutro, código a la vista", () => {
    const d = describeJobResult(ack("software_install", "software_install:quarantined;foo=bar"));
    expect(d.known).toBe(false);
    expect(d.tone).toBe("neutral");
    expect(d.headline).toBe("Quarantined");
    expect(d.code).toBe("software_install:quarantined");
    expect(factValue(d, "Foo")).toBe("bar");
  });

  it("un tipo que no está en el diccionario funciona igual con la lectura genérica", () => {
    const d = describeJobResult(ack("brand_new_type", "brand_new_type:done;count=3"));
    expect(d.headline).toBe("Done");
    expect(factValue(d, "Count")).toBe("3");
  });

  it("un blob que no sabemos pintar va a detalles, decodificado", () => {
    const d = describeJobResult(ack("x", `x:ok;extra=${b64url({ a: 1 })}`));
    expect(d.details).toEqual([{ key: "extra", label: "Extra", value: { a: 1 } }]);
  });
});

describe("remediaciones — antes → después", () => {
  const before = {
    state: {
      writes: [
        {
          key: "HKLM\\SOFTWARE\\Policies\\Microsoft\\InputPersonalization",
          name: "AllowInputPersonalization",
          present: false,
          current: null,
          expected: "HKLM\\SOFTWARE\\Policies\\Microsoft\\InputPersonalization:AllowInputPersonalization=0",
          matches: false,
        },
      ],
    },
    isCompliant: false,
  };
  const after = {
    state: { writes: [{ ...before.state.writes[0], present: true, current: 0, matches: true }] },
    isCompliant: true,
  };

  it("applied: fila con el valor antes, después y esperado", () => {
    const d = describeJobResult(
      ack(
        "patch_remediate",
        `patch_remediate:applied;remediationId=645;checkId=windows.registry.set_value;exit=0;duration=2;stateBefore=${b64url(before)};stateAfter=${b64url(after)}`
      )
    );
    expect(d.tone).toBe("success");
    expect(d.headline).toBe("Fix applied");
    expect(d.changes.rows).toEqual([
      {
        setting: "AllowInputPersonalization",
        location: "HKLM\\SOFTWARE\\Policies\\Microsoft\\InputPersonalization",
        before: "Not set",
        after: "0",
        expected: "0",
        compliant: true,
      },
    ]);
    expect(d.changes.compliantBefore).toBe(false);
    expect(d.changes.compliantAfter).toBe(true);
    expect(factValue(d, "Duration")).toBe("2 ms");
    expect(factValue(d, "Remediation")).toBe("#645");
  });

  it("dry run: no hay «después», y el titular dice que no se cambió nada", () => {
    const d = describeJobResult(
      ack("patch_remediate", `patch_remediate:dryrun_would_apply;remediationId=382;stateBefore=${b64url(before)}`)
    );
    expect(d.headline).toMatch(/nothing was changed/i);
    expect(d.changes.rows[0].after).toBeNull();
  });

  it("un valor borrado se lee «Removed», no «(deleted)»", () => {
    const del = { state: { writes: [{ key: "HKLM\\X", name: "AuthSchemes", present: true, current: "ntlm", expected: "HKLM\\X:AuthSchemes (deleted)" }] } };
    const d = describeJobResult(ack("patch_remediate", `patch_remediate:dryrun_would_apply;stateBefore=${b64url(del)}`));
    expect(d.changes.rows[0].expected).toBe("Removed");
  });

  it("Linux (audit rule): la línea es el nombre del ajuste", () => {
    const lb = { state: { writes: [{ kind: "audit_rule", line: "-w /usr/bin/chacl -p x -k tracenium", present: false }] } };
    const la = { state: { writes: [{ kind: "audit_rule", line: "-w /usr/bin/chacl -p x -k tracenium", present: true }] } };
    const d = describeJobResult(ack("patch_remediate", `patch_remediate:applied;stateBefore=${b64url(lb)};stateAfter=${b64url(la)}`));
    expect(d.changes.rows[0]).toMatchObject({ setting: "-w /usr/bin/chacl -p x -k tracenium", before: "Not set", after: "Present" });
  });

  it("⭐ lote: cada fix leído por separado y un resumen con el peor tono", () => {
    const items = [
      "patch_remediate:applied;remediationId=671",
      "patch_remediate:applied;remediationId=672",
      "patch_remediate:applied_reboot_required;remediationId=673",
      "patch_remediate:already_compliant;remediationId=674",
    ];
    const d = describeJobResult(ack("patch_remediate", `patch_remediate_batch:done;items=${b64url(items)}`));
    expect(d.items).toHaveLength(4);
    expect(d.tone).toBe("warning");
    // `applied` y `applied_reboot_required` son grupos DISTINTOS: agrupando
    // por la frase recortada salían dos «fix applied» indistinguibles.
    expect(d.headline).toBe(
      "Batch finished — 4 fixes: 2 applied, 1 applied (reboot required), 1 already compliant"
    );
    // El blob de items no se repite como detalle.
    expect(d.details).toEqual([]);
  });
});

describe("el resto del diccionario, con los mensajes reales", () => {
  it.each([
    ["agent_update", "update_skipped: latest_already_installed", "neutral", /latest version is already installed/],
    ["agent_update", "update_confirmed;version=1.1.85;by=hello", "success", /1\.1\.85/],
    ["software_dp_prefetch", "software_dp_prefetch:success;deploymentId=0;cached=1;peerCas=2", "success", /already cached/],
    ["software_dp_prefetch", "software_dp_prefetch:success;deploymentId=0;cached=0;src=origin", "success", /Cloud \(origin\)/],
    ["live_query", "live_query_answered;query=q1;outcome=unsupported", "warning", /does not support/],
    ["live_query", "live_query_answered;query=q1;outcome=answered", "success", /Query answered/],
    ["patch_install", "patch_install success; installed=1; failed=0; rebootRequired=false", "success", /^1 update installed$/],
    ["patch_install", "patch_install success; installed=2; failed=0; rebootRequired=true; rebootScheduled=true; rebootInSec=60", "warning", /2 updates installed — reboot required/],
    ["patch_install", "patch_install no_updates; installed=0; failed=0; rebootRequired=false", "neutral", /No updates/],
    ["patch_scan", "patch_scan_enqueued:326", "success", /queued for upload/],
    ["patch_scan", "patch_scan_fresh:cooldown_42000ms", "neutral", /42 s old/],
    ["facts_snapshot", "facts_fresh:cooldown_900ms", "neutral", /900 ms old/],
    ["reset_baseline", "reset_baseline:cleared:amp:software,printers", "success", /AMP \(Software, Printers\)/],
    ["device_reboot", "device_reboot scheduled; rebootScheduled=true; rebootInSec=60", "info", /in 60 s/],
    ["vcenter_snapshot_remove", "vcenter_snapshot_remove:removed;removed=3;failed=1;ids=16,14,15", "warning", /3 snapshots removed, 1 failed/],
    ["ad_discovery", "ad_discovery_complete;run=r1;computers=157", "success", /157 computers/],
    ["asp_assess", "asp_run_complete;run=r1;indicators=47;chunks=5;src=collector", "success", /47 indicators/],
    ["patch_scan", "OK", "neutral", /no detail reported/],
  ])("%s · %s", (type, message, tone, headline) => {
    const d = describeJobResult(ack(type, message));
    expect(d.known).toBe(true);
    expect(d.tone).toBe(tone);
    expect(d.headline).toMatch(headline);
  });

  it("⚠️ el número de `enqueued` (id de outbox) no se enseña", () => {
    const d = describeJobResult(ack("facts_snapshot", "facts_enqueued:127"));
    expect(JSON.stringify(d)).not.toMatch(/Snapshot collected.*127/);
    expect(d.facts).toEqual([]);
  });

  it("deploymentId=0 del prefetch no sale como «Deployment #0»", () => {
    const d = describeJobResult(ack("software_dp_prefetch", "software_dp_prefetch:success;deploymentId=0;cached=1"));
    expect(factValue(d, "Deployment")).toBeUndefined();
  });

  it("vcenter_verify: el informe se lee como etapas", () => {
    const report = {
      ok: true,
      stages: [
        { stage: "reachability", ok: true, detail: "TCP+TLS handshake in 20 ms" },
        { stage: "tls_pin", ok: false, detail: "thumbprint mismatch" },
      ],
    };
    const d = describeJobResult(ack("vcenter_verify", `vcenter_verify:ok;report=${b64url(report)}`));
    expect(d.stages).toEqual([
      { label: "Reachability", ok: true, warn: false, detail: "TCP+TLS handshake in 20 ms" },
      { label: "Tls pin", ok: false, warn: false, detail: "thumbprint mismatch" },
    ]);
    expect(d.details).toEqual([]);
  });

  it("agent_update: las claves repetidas junto al mensaje no se duplican", () => {
    const d = describeJobResult({
      job_type: "agent_update",
      result_json: { message: "update_confirmed;version=1.1.85;by=hello", version: "1.1.85", confirmedBy: "hello" },
    });
    expect(d.facts.filter((f) => f.label === "Version")).toHaveLength(1);
    expect(d.facts.filter((f) => f.label === "Confirmed by")).toHaveLength(1);
  });

  it("`servedBy` junto a `src=` es el mismo dato: sale una vez", () => {
    const d = describeJobResult(ack("agent_update", "update_started;src=dp", { servedBy: "dp" }));
    expect(d.facts).toEqual([{ key: "src", label: "Downloaded from", value: "Distribution Point" }]);
    // …pero sin `src` en el mensaje, `servedBy` es el único que lo dice.
    const alone = describeJobResult(ack("software_install", "software_install:success;exit=0", { servedBy: "origin" }));
    expect(alone.facts.map((f) => f.label)).toContain("Served by");
  });
});

describe("resultados sin `message`", () => {
  it("cert_rotate", () => {
    const d = describeJobResult({
      job_type: "cert_rotate",
      result_json: { completedBy: "cert_activation", fingerprintSha256: "9704abc" },
    });
    expect(d.headline).toBe("Certificate rotated");
    expect(factValue(d, "Fingerprint (SHA-256)")).toBe("9704abc");
  });

  it("un PEM va a detalles, no a una fila", () => {
    const pem = "-----BEGIN CERTIFICATE REQUEST-----\nMIIC\n-----END CERTIFICATE REQUEST-----";
    const d = describeJobResult({ job_type: "cdp_csr_generate", result_json: { keyId: "k1", csrPem: pem } });
    expect(d.details).toEqual([{ key: "csrPem", label: "Csr pem", value: pem }]);
    expect(factValue(d, "Key ID")).toBe("k1");
  });

  it("un string suelto se lee como mensaje; un JSON doblemente codificado, como objeto", () => {
    expect(describeJobResult({ job_type: "patch_scan", result_json: "OK" }).known).toBe(true);
    expect(
      describeJobResult({ job_type: "live_query", result_json: JSON.stringify({ message: "live_query_answered;outcome=answered" }) }).headline
    ).toBe("Query answered");
  });

  it("sin resultado → null (un job en curso no pinta bloque vacío)", () => {
    for (const empty of [null, undefined, "", "null", "{}", {}]) {
      expect(describeJobResult({ job_type: "x", result_json: empty }), JSON.stringify(empty)).toBeNull();
    }
  });
});

describe("describeJobPayload — lo que se pidió", () => {
  it("software_install: paquete, plataforma y DE DÓNDE baja — nunca la URL", () => {
    const p = describeJobPayload({
      job_type: "software_install",
      payload_json: {
        mode: "install",
        deploymentId: 56,
        sources: [
          { url: "https://10.130.130.5:47821/sdp/blob/02f3", tier: "dp" },
          { url: "https://x.blob.core.windows.net/a.msi?sv=1&sig=SECRETO", tier: "origin" },
        ],
        packageSnapshot: { name: "Google Chrome", version: "154.0.8037.58", vendor: "Google LLC", platform: "windows", format: "msi", arch: "x64" },
      },
    });
    expect(p.facts).toEqual([
      { label: "Package", value: "Google Chrome 154.0.8037.58" },
      { label: "Vendor", value: "Google LLC" },
      { label: "Platform", value: "windows · msi · x64" },
      { label: "Action", value: "Install" },
      { label: "Deployment", value: "#56" },
      { label: "Download from", value: "Distribution Point, then Cloud (origin)" },
    ]);
    expect(JSON.stringify(p)).not.toMatch(/SECRETO|https?:/);
  });

  it("patch_remediate: título del check, modo y el cambio pedido en una línea", () => {
    const p = describeJobPayload({
      job_type: "patch_remediate",
      payload_json: {
        mode: "dry_run",
        checkId: "windows.registry.set_value",
        params: { writes: [{ hive: "HKLM", kind: "registry", value: null, keyPath: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "AuthSchemes", valueType: "delete" }] },
        checkSnapshot: { title: "Supported authentication schemes must be configured.", severity: "medium", platform: "windows", revertOf: { remediationId: 356 } },
      },
    });
    expect(p.facts).toEqual([
      { label: "Check", value: "Revert: Supported authentication schemes must be configured." },
      { label: "Severity", value: "Medium" },
      { label: "Platform", value: "Windows" },
      { label: "Action", value: "Dry run (no changes)" },
      { label: "Reverts", value: "Remediation #356" },
    ]);
    expect(p.list).toEqual({ label: "Changes", items: ["Remove HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\AuthSchemes"] });
  });

  it("patch_remediate en lote: la lista de checks", () => {
    const p = describeJobPayload({
      job_type: "patch_remediate",
      payload_json: { items: [{ checkSnapshot: { title: "A" } }, { checkId: "b.check" }] },
    });
    expect(p.facts).toEqual([{ label: "Fixes", value: "2" }]);
    expect(p.list.items).toEqual(["A", "b.check"]);
  });

  it("patch_install con kbArticleIds vacío lo dice, no inventa «todas»", () => {
    const p = describeJobPayload({ job_type: "patch_install", payload_json: { mode: "install", kbArticleIds: [] } });
    expect(p.list).toEqual({ label: "Updates", items: [], empty: "None listed" });
  });

  it("🔴 vcenter_credential_provision: la credencial no sale", () => {
    const p = describeJobPayload({ job_type: "vcenter_credential_provision", payload_json: { ref: "vc-1", envelope: "c2VjcmV0" } });
    expect(p.facts).toEqual([
      { label: "Reference", value: "vc-1" },
      { label: "Credential", value: "Encrypted — not shown" },
    ]);
  });

  it("tipo desconocido: claves simples, sin enlaces ni secretos", () => {
    const p = describeJobPayload({
      job_type: "brand_new",
      payload_json: { targetName: "x", url: "https://a/b?sig=1", token: "t", nested: { a: 1 } },
    });
    expect(p.facts).toEqual([
      { label: "Target name", value: "x" },
      { label: "Url", value: "(link)" },
    ]);
  });

  it("⚠️ un payload con forma inesperada no tumba el panel", () => {
    const p = describeJobPayload({ job_type: "software_install", payload_json: { packageSnapshot: null, mode: "install" } });
    expect(p.facts).toContainEqual({ label: "Action", value: "Install" });
  });

  it("sin payload: listas vacías", () => {
    expect(describeJobPayload({ job_type: "patch_scan", payload_json: {} })).toEqual({ facts: [], list: null });
    expect(describeJobPayload({ job_type: "patch_scan", payload_json: null })).toEqual({ facts: [], list: null });
  });
});

describe("describeDesiredWrite", () => {
  it("registro con valor", () => {
    expect(
      describeDesiredWrite({ hive: "HKLM", kind: "registry", value: 0, keyPath: "SOFTWARE\\X", valueName: "V", valueType: "dword" })
    ).toBe("HKLM\\SOFTWARE\\X\\V = 0 (dword)");
  });
  it("línea de Linux", () => {
    expect(describeDesiredWrite({ kind: "audit_rule", line: "-w /usr/bin/chacl -p x", present: true })).toBe(
      "Ensure audit rule: -w /usr/bin/chacl -p x"
    );
  });
});

describe("🔴 el crudo sale tapado", () => {
  it("la firma de una URL SAS no se enseña", () => {
    const out = redactForDisplay({
      sources: [{ url: "https://x.blob.core.windows.net/a.msi?sv=2026&se=2026-09-28&sig=nRAEcbQg%3D&rscd=attachment", tier: "origin" }],
    });
    expect(out.sources[0].url).toBe("https://x.blob.core.windows.net/a.msi?sv=2026&se=2026-09-28&sig=REDACTED&rscd=attachment");
  });

  it("claves de secreto a cualquier profundidad", () => {
    expect(redactForDisplay({ ref: "r", envelope: "abc", deep: [{ password: "p", ok: 1 }] })).toEqual({
      ref: "r",
      envelope: "[redacted]",
      deep: [{ password: "[redacted]", ok: 1 }],
    });
  });

  it("no toca el original", () => {
    const src = { envelope: "abc" };
    redactForDisplay(src);
    expect(src.envelope).toBe("abc");
  });

  it("rawJsonText: objeto, string JSON y string suelto", () => {
    expect(rawJsonText({ token: "t" })).toBe('{\n  "token": "[redacted]"\n}');
    expect(rawJsonText('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(rawJsonText("OK")).toBe("OK");
    expect(rawJsonText(null)).toBe("");
  });
});

describe("formatDurationMs", () => {
  it.each([
    [2, "2 ms"],
    [2500, "2.5 s"],
    [22864, "23 s"],
    [52915, "53 s"],
    [112268, "1 min 52 s"],
    [120000, "2 min"],
  ])("%s → %s", (ms, text) => expect(formatDurationMs(ms)).toBe(text));
});
