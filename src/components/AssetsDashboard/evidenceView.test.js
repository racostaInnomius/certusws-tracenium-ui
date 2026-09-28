// src/components/AssetsDashboard/evidenceView.test.js
//
// ADR-0032 F3 — lo que la pantalla afirma de una captura.

import { describe, it, expect } from "vitest";
import {
  artifactTally,
  canDelete,
  canDownload,
  captureHint,
  captureStatusMeta,
  deviceCapturedAt,
  downloadWarning,
  formatBytes,
  formatOffset,
  packageContains,
  triggerLabel,
} from "./evidenceView";

describe("estado de la captura", () => {
  it("⭐ «partial» no se presenta como fallo: es lo recogido más lo que faltó", () => {
    const meta = captureStatusMeta("partial");
    expect(meta.label).toBe("Partial");
    expect(meta.tone).toBe("caution");
    expect(meta.hint).toMatch(/which, and why/);
  });

  it("un estado desconocido no rompe la fila", () => {
    expect(captureStatusMeta("inventado")).toMatchObject({ label: "inventado", tone: "muted" });
  });

  it("el disparador se lee en palabras, incluido el automático", () => {
    expect(triggerLabel("unclean_shutdown")).toMatch(/unclean shutdown/);
    expect(triggerLabel(undefined)).toBe("Requested");
  });
});

describe("formatBytes", () => {
  it("escribe tamaños legibles", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(15 * 1024 * 1024)).toBe("15 MB");
    expect(formatBytes(null)).toBe("—");
  });
});

describe("formatOffset", () => {
  it("⭐ escribe el desfase como lo escribe una persona", () => {
    expect(formatOffset(-300)).toBe("UTC-5");
    expect(formatOffset(-360)).toBe("UTC-6");
    expect(formatOffset(330)).toBe("UTC+5:30");
    expect(formatOffset(0)).toBe("UTC");
    expect(formatOffset(null)).toBeNull();
  });
});

describe("deviceCapturedAt — la hora es la del EQUIPO", () => {
  const capture = { capturedAtUtc: "2026-09-23T12:52:00.000Z", deviceUtcOffsetMinutes: -300 };

  it("⭐ pinta la hora local del equipo, no la de quien mira", () => {
    // 12:52 UTC en un equipo a UTC-5 son las 07:52 suyas: la hora que aparece
    // en SU visor de eventos, que es con la que se compara.
    const out = deviceCapturedAt(capture, new Date("2026-09-23T12:52:00.000Z"));
    expect(out.text).toMatch(/07:52/);
    expect(out.offset).toBe("UTC-5");
  });

  it("🔴 y avisa cuando el equipo y el operador NO están en el mismo huso", () => {
    // El operador en UTC-6 (CDMX) y el servidor en UTC-5 (McAllen): una hora
    // de diferencia que ya estuvo a punto de fechar mal un incidente.
    const cdmx = { getTimezoneOffset: () => 360 };
    expect(deviceCapturedAt(capture, cdmx).differsFromOperator).toBe(true);
    const mcallen = { getTimezoneOffset: () => 300 };
    expect(deviceCapturedAt(capture, mcallen).differsFromOperator).toBe(false);
  });

  it("⚠️ sin desfase NO se inventa una hora local: se dice en UTC", () => {
    const out = deviceCapturedAt({ capturedAtUtc: "2026-09-23T12:52:00.000Z" });
    expect(out.text).toMatch(/UTC$/);
    expect(out.offset).toBeNull();
  });

  it("una captura que aún no ha contestado no tiene hora que pintar", () => {
    expect(deviceCapturedAt({ capturedAtUtc: null }).text).toBeNull();
  });
});

describe("artifactTally", () => {
  it("cuenta lo recogido, lo fallido y lo que no aplicaba, por separado", () => {
    const t = artifactTally([
      { status: "ok", bytes: 1000, collector: "sessions" },
      { status: "failed", bytes: 0, collector: "event_logs" },
      { status: "skipped", bytes: 0, collector: "pending_reboot" },
      { status: "ok", bytes: 500, collector: "processes" },
    ]);
    expect(t).toEqual({ ok: 2, failed: 1, skipped: 1, bytes: 1500 });
  });
});

describe("el aviso de descarga", () => {
  it("⭐ se construye con lo que el paquete TRAE, no con una alarma genérica", () => {
    const warn = downloadWarning([
      { status: "ok", collector: "sessions" },
      { status: "ok", collector: "event_logs" },
      { status: "failed", collector: "network" },
    ]);
    expect(warn).toMatch(/user names/);
    expect(warn).toMatch(/event logs/);
    // ⚠️ Separados por punto y coma: los elementos ya llevan «and» dentro.
    expect(warn).toMatch(/; /);
    // `network` falló: no se afirma que el paquete traiga direcciones.
    expect(warn).not.toMatch(/talking to/);
    expect(warn).toMatch(/recorded against your account/);
  });

  it("⚠️ un paquete sin nada sensible no lleva aviso: la alarma falsa enseña a ignorarlas", () => {
    expect(downloadWarning([{ status: "ok", collector: "storage" }])).toBeNull();
    expect(packageContains([{ status: "ok", collector: "storage" }])).toEqual([]);
  });
});

describe("qué se puede hacer con una captura", () => {
  it("sólo se descarga lo que de verdad llegó", () => {
    expect(canDownload({ status: "ok", bytes: 10 })).toBe(true);
    expect(canDownload({ status: "ok", bytes: 0 })).toBe(false);
    expect(canDownload({ status: "failed", bytes: 0 })).toBe(false);
  });

  it("🔴 una captura RETENIDA por incidencia no se borra", () => {
    expect(canDelete({ heldReason: null })).toBe(true);
    expect(canDelete({ heldReason: "ticket INC-1042" })).toBe(false);
  });
});

describe("el aviso al capturar", () => {
  it("⭐ dice que lo volátil se pierde al reiniciar, que es el momento de pulsarlo", () => {
    const hint = captureHint([
      { key: "sessions", volatile: true },
      { key: "event_logs", volatile: false },
    ]);
    expect(hint).toMatch(/before restarting/);
  });

  it("sin colectores volátiles no se promete lo que no hay", () => {
    expect(captureHint([{ key: "event_logs", volatile: false }])).not.toMatch(/before restarting/);
  });
});
