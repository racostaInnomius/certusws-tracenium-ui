import { describe, it, expect } from "vitest";
import { describeEvent, describeEventText } from "./auditSentence";

const deps = { getHostname: (id) => (id === "d-1" ? "MSIG-WSUS" : id) };

// Los 24 tipos que existen de verdad en producción, sacados de agrupar
// security_events el 2026-08-27. La lista está aquí para que el test de
// cobertura sea contra la realidad y no contra lo que yo recuerde.
const TIPOS_EN_PRODUCCION = [
  "AI_GATEWAY_CALL", "cert_revoked", "DEVICE_CERTIFICATES_REVOKED",
  "DEVICE_DECOMMISSION_COMPLETED", "DEVICE_DECOMMISSION_REQUESTED",
  "DEVICE_DECOMMISSION_STARTED", "grpc_connect", "grpc_disconnect",
  "policy_ack_ok", "POLICY_DEVICE_CREATED", "policy_hello_drift_detected",
  "POLICY_TENANT_CONFIG_CHANGED", "POLICY_TENANT_CREATED",
  "POLICY_TENANT_PLUGINS_CHANGED", "POLICY_TENANT_PUSHED",
  "POLICY_TENANT_SECURITY_CHANGED", "REPORT_EMAILED", "REPORT_RUN",
  "sdp_self_service_install", "SECURITY_DRIFT_REMEDIATED",
  "TENANT_MEMBER_ROLE_ASSIGNED", "TENANT_ROLE_CREATED",
  "TENANT_ROLE_PERMISSIONS_CHANGED", "TRIAL_EXTENDED",
];

describe("describeEvent — la caída, que es lo que más importa", () => {
  it("NINGUNO de los 24 tipos vivos produce una frase vacía", () => {
    // La regla del módulo. Un tipo sin plantilla tiene que decir algo.
    //
    // Cuando se escribió esto, 14 de estos 24 ni siquiera estaban en el
    // catálogo de la UI y caían al token crudo humanizado. Ya están todos
    // (ver auditEventTypes.test.js), así que hoy la caída aterriza en una
    // etiqueta decente — pero sigue siendo el camino de la mayoría de las
    // filas, porque sólo se escriben plantillas para lo que aporta algo
    // por encima de la etiqueta.
    for (const event_type of TIPOS_EN_PRODUCCION) {
      const text = describeEventText({ event_type, details: null }, deps);
      expect(text.trim(), event_type).not.toBe("");
      expect(text, event_type).not.toMatch(/undefined|null|\[object/);
    }
  });

  it("un tipo que nadie ha visto nunca sigue diciendo algo", () => {
    const text = describeEventText({ event_type: "QUANTUM_KEY_ROTATED" }, deps);
    expect(text.trim()).not.toBe("");
    expect(describeEvent({ event_type: "QUANTUM_KEY_ROTATED" }, deps).known).toBe(false);
  });

  it("marca known=false cuando cayó, para que la UI pueda atenuarlo", () => {
    expect(describeEvent({ event_type: "REPORT_RUN" }, deps).known).toBe(false);
    expect(describeEvent({ event_type: "TRIAL_EXTENDED", details: { months: 3 } }, deps).known).toBe(true);
  });

  it("un details con forma inesperada cae, no revienta la fila", () => {
    // `details` es JSONB libre. Si un escritor cambia la forma, la fila
    // tiene que degradarse a la etiqueta — no desaparecer ni lanzar.
    for (const details of [null, undefined, "una cadena", 42, [], { permissions: "no es un array" }]) {
      const r = describeEvent({ event_type: "TENANT_ROLE_PERMISSIONS_CHANGED", details }, deps);
      expect(r.segments.length).toBeGreaterThan(0);
      expect(describeEventText({ event_type: "TENANT_ROLE_PERMISSIONS_CHANGED", details }, deps).trim()).not.toBe("");
    }
  });

  it("una plantilla que lanza cae a la etiqueta, no tumba la tabla", () => {
    // El try/catch de describeEvent existe para las plantillas futuras: hoy
    // todas leen `details` con guardas y ninguna lanza, así que quitar el
    // catch no rompía ningún test — lo comprobé. Este lo ejercita de
    // verdad con un `details` que estalla al leerlo, que es lo que hará
    // una plantilla mal escrita el día que alguien añada la número 21.
    const explosivo = new Proxy({}, {
      get() { throw new Error("details corrupto"); },
    });
    const r = describeEvent({ event_type: "TENANT_ROLE_CREATED", details: explosivo }, deps);
    expect(r.known).toBe(false);
    expect(describeEventText({ event_type: "TENANT_ROLE_CREATED", details: explosivo }, deps).trim())
      .not.toBe("");
  });

  it("sin fila tampoco revienta", () => {
    expect(describeEventText(undefined, deps).trim()).not.toBe("");
    expect(describeEventText(null).trim()).not.toBe("");
  });
});

describe("describeEvent — las frases con plantilla", () => {
  it("nombra el rol en un cambio de permisos", () => {
    const text = describeEventText(
      { event_type: "TENANT_ROLE_PERMISSIONS_CHANGED", details: { name: "IT Support", permissions: ["audit_log", "pki"] } },
      deps
    );
    expect(text).toBe("changed the permissions of role IT Support — now 2 capabilities");
  });

  it("singulariza cuando corresponde", () => {
    expect(
      describeEventText({ event_type: "TENANT_ROLE_PERMISSIONS_CHANGED", details: { name: "R", permissions: ["a"] } }, deps)
    ).toMatch(/1 capability$/);
    expect(describeEventText({ event_type: "TRIAL_EXTENDED", details: { months: 1 } }, deps)).toBe(
      "extended the trial by 1 month"
    );
  });

  it("resuelve el hostname en vez de enseñar el UUID", () => {
    const text = describeEventText(
      { event_type: "DEVICE_DECOMMISSION_STARTED", device_id: "d-1" },
      deps
    );
    expect(text).toBe("started decommissioning MSIG-WSUS");
  });

  it("marca el objeto de la acción para poder resaltarlo", () => {
    const { segments } = describeEvent(
      { event_type: "TENANT_ROLE_CREATED", details: { name: "IT Support" } },
      deps
    );
    expect(segments.find((s) => s.strong)?.text).toBe("IT Support");
  });

  it("un grpc_connect RECHAZADO dice por qué; el ok cae a la etiqueta", () => {
    // El rechazo es la señal de seguridad de la tabla y comparte tipo con
    // 59.623 eventos de ruido; merece una frase propia.
    const rej = describeEvent(
      { event_type: "grpc_connect", outcome: "rejected", reason: "unknown fingerprint" },
      deps
    );
    expect(rej.known).toBe(true);
    expect(describeEventText({ event_type: "grpc_connect", outcome: "rejected", reason: "unknown fingerprint" }, deps))
      .toBe("was refused a connection — unknown fingerprint");

    const ok = describeEvent({ event_type: "grpc_connect", outcome: "ok" }, deps);
    expect(ok.known).toBe(false);
    expect(describeEventText({ event_type: "grpc_connect", outcome: "ok" }, deps).trim()).not.toBe("");
  });

  it("sin device_id no inventa un equipo", () => {
    const text = describeEventText({ event_type: "DEVICE_CERTIFICATES_REVOKED", device_id: null }, deps);
    expect(text).toMatch(/unknown device/);
  });

  it("la frase NO incluye quién — eso vive en la columna Who", () => {
    // Si el actor se colara aquí, la fila lo diría dos veces y las dos
    // columnas se contradirían en cuanto una resolviese y la otra no.
    const text = describeEventText(
      { event_type: "TRIAL_EXTENDED", details: { months: 3 }, actor_email: "javier.pacheco@certusitm.com", actor_subject: "35" },
      deps
    );
    expect(text).not.toMatch(/javier|35/);
  });
});
