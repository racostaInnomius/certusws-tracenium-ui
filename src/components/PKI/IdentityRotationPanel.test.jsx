// src/components/PKI/IdentityRotationPanel.test.jsx
//
// El panel NO decide nada: pinta lo que devuelve `rotation-status`. Lo que se
// fija aquí es que lo pinte sin esconder lo importante:
//   · «certificado nuevo nunca activado» arriba y en rojo (MSIG-VEEAM-PC);
//   · cada motivo con su etiqueta y su «por qué», también el de Windows;
//   · la tabla ordenada por lo que quema primero;
//   · «Open» lleva al equipo, que es donde está el formulario de rotación.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import IdentityRotationPanel, { keyExchangeMeta, readinessMeta } from "./IdentityRotationPanel";

afterEach(() => cleanup());

const RULES = { minAgent: "1.1.70", minAgentWindows: "1.1.74", offlineHours: 24, pendingAlarmMinutes: 15, keyExchangeMaxAgeDays: 7 };

const fila = (over) => ({
  deviceId: "d",
  hostname: "HOST",
  platform: "macos",
  deviceClass: "endpoint",
  agentVersion: "1.1.73",
  lastSeenAt: "2026-09-15T11:00:00Z",
  state: "legacy_issuer",
  issuer: "Tracenium Issuing CA",
  notAfter: "2027-04-01T00:00:00Z",
  pendingIssuedAt: null,
  lastRotation: null,
  readiness: "ready",
  keyExchange: null,
  ...over
});

const ESTADO_T1 = {
  generatedAt: "2026-09-15T12:00:00Z",
  rules: RULES,
  summary: {
    total: 4,
    byState: { hybrid: 1, g2_classic: 0, legacy_issuer: 3, no_active_cert: 0 },
    byReadiness: { done: 1, ready: 1, windows_needs_agent_fix: 1, offline: 1 },
    byKeyExchange: { post_quantum: 1, classical: 2, unknown: 0, not_observed: 1 }
  },
  devices: [
    fila({
      deviceId: "done",
      hostname: "W11-JPR-LAB02",
      platform: "windows",
      state: "hybrid",
      readiness: "done",
      keyExchange: { group: "X25519", postQuantum: false, observedAt: "2026-09-15T11:00:00Z" }
    }),
    fila({
      deviceId: "win",
      hostname: "ETE-3X5P8F4",
      platform: "windows",
      readiness: "windows_needs_agent_fix",
      keyExchange: { group: "X25519", postQuantum: false, observedAt: "2026-09-15T11:00:00Z" }
    }),
    fila({ deviceId: "off", hostname: "MarisolCorona", platform: "windows", readiness: "offline" }),
    fila({
      deviceId: "mac",
      hostname: "MacBook-Air-de-Diego",
      readiness: "ready",
      keyExchange: { group: "X25519MLKEM768", postQuantum: true, observedAt: "2026-09-15T11:00:00Z" }
    })
  ]
};

const montar = (estado, props = {}) => {
  const loadStatus = vi.fn(async () => estado);
  render(<IdentityRotationPanel loadStatus={loadStatus} {...props} />);
  return loadStatus;
};

describe("IdentityRotationPanel", () => {
  it("⭐ resume cuántas identidades son ya híbridas y cuántos equipos están listos", async () => {
    montar(ESTADO_T1);
    expect(await screen.findByText("1 / 4")).toBeInTheDocument();
    expect(screen.getByText("Ready to rotate").closest("div").parentElement).toHaveTextContent("1");
  });

  it("⭐ un Windows sin el arreglo dice QUÉ esperar, no sólo «no»", async () => {
    montar(ESTADO_T1);
    expect(await screen.findByText("Wait for agent 1.1.74")).toBeInTheDocument();
    expect(readinessMeta("windows_needs_agent_fix", RULES).hint).toMatch(/loses its list of trusted CAs/i);
  });

  it("⭐ la tabla empieza por lo accionable: listo antes que esperas, offline y hechos", async () => {
    montar(ESTADO_T1);
    await screen.findByText("MacBook-Air-de-Diego");
    const filas = screen.getAllByRole("row").slice(1).map((r) => r.textContent);
    const pos = (h) => filas.findIndex((t) => t.includes(h));
    expect(pos("MacBook-Air-de-Diego")).toBeLessThan(pos("ETE-3X5P8F4"));
    expect(pos("ETE-3X5P8F4")).toBeLessThan(pos("MarisolCorona"));
    expect(pos("MarisolCorona")).toBeLessThan(pos("W11-JPR-LAB02"));
  });

  it("«Open» lleva al equipo: el formulario de rotación vive en el inspector", async () => {
    const onOpenDevice = vi.fn();
    montar(ESTADO_T1, { onOpenDevice });
    fireEvent.click(await screen.findByRole("button", { name: "Open MacBook-Air-de-Diego" }));
    expect(onOpenDevice).toHaveBeenCalledWith("mac");
  });

  describe("🔴 certificado nuevo nunca activado", () => {
    const CON_ALARMA = {
      ...ESTADO_T1,
      summary: { ...ESTADO_T1.summary, byReadiness: { ...ESTADO_T1.summary.byReadiness, pending_unactivated: 1 } },
      devices: [
        ...ESTADO_T1.devices,
        fila({
          deviceId: "veeam",
          hostname: "MSIG-VEEAM-PC",
          platform: "windows",
          readiness: "pending_unactivated",
          pendingIssuedAt: "2026-09-13T18:01:02Z",
          lastRotation: { status: "retrying", createdAt: "2026-09-13T18:01:00Z", lastError: "job_timeout" }
        })
      ]
    };

    it("⭐ sale ARRIBA, en una alerta, con el equipo y un botón para abrirlo", async () => {
      const onOpenDevice = vi.fn();
      montar(CON_ALARMA, { onOpenDevice });
      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent(/received a new certificate and has not reconnected/i);
      fireEvent.click(within(alerta).getByRole("button", { name: /MSIG-VEEAM-PC/ }));
      expect(onOpenDevice).toHaveBeenCalledWith("veeam");
    });

    it("y en la tabla va la primera, por encima de los listos", async () => {
      montar(CON_ALARMA);
      await screen.findByRole("alert");
      // La alerta llega con los datos; las filas del DataGrid, un tick después.
      await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(1));
      const primera = screen.getAllByRole("row")[1];
      expect(primera).toHaveTextContent("MSIG-VEEAM-PC");
      expect(primera).toHaveTextContent("New certificate never activated");
    });

    it("sin alarmas no hay alerta: el rojo sólo cuando hay algo que mirar", async () => {
      montar(ESTADO_T1);
      await screen.findByText("MacBook-Air-de-Diego");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("intercambio de claves (ML-KEM)", () => {
    it("⭐ la tarjeta cuenta post-cuánticos sobre OBSERVADOS, no sobre el total", async () => {
      montar(ESTADO_T1);
      // 1 post-cuántico de 3 observados; el equipo sin observar no entra en el denominador.
      expect(await screen.findByText("1 / 3")).toBeInTheDocument();
      expect(screen.getByText("Post-quantum key exchange")).toBeInTheDocument();
    });

    it("⭐ la fila dice el grupo que vio el servidor", async () => {
      montar(ESTADO_T1);
      await screen.findByText("MacBook-Air-de-Diego");
      const fila = (h) => screen.getAllByRole("row").find((r) => r.textContent.includes(h));
      expect(fila("MacBook-Air-de-Diego")).toHaveTextContent("X25519MLKEM768");
      expect(fila("ETE-3X5P8F4")).toHaveTextContent("X25519");
      expect(fila("MarisolCorona")).toHaveTextContent("Not observed");
    });

    it("clásico en ámbar con el porqué; sin observación no se pinta como clásico", () => {
      expect(keyExchangeMeta({ group: "X25519", postQuantum: false }, RULES)).toMatchObject({ tone: "warning" });
      expect(keyExchangeMeta({ group: "X25519", postQuantum: false }, RULES).hint).toMatch(/not protected/i);
      expect(keyExchangeMeta({ group: "X25519MLKEM768", postQuantum: true }, RULES)).toMatchObject({ tone: "ok" });
      expect(keyExchangeMeta(null, RULES)).toMatchObject({ label: "Not observed", tone: "neutral" });
      expect(keyExchangeMeta(null, RULES).hint).toMatch(/7 days/);
      expect(keyExchangeMeta({ group: "unknown", postQuantum: false }, RULES)).toMatchObject({ label: "Unknown", tone: "neutral" });
    });
  });

  it("todo motivo que devuelve el backend tiene etiqueta propia, no el código crudo", () => {
    // Los códigos de `Readiness` en rotation-status.service.ts. Si el backend
    // añade uno, este test es el recordatorio de pintarlo.
    const codigos = [
      "pending_unactivated", "rotation_in_flight", "done", "no_active_cert", "offline",
      "agent_too_old", "windows_needs_agent_fix", "needs_approval", "ready"
    ];
    for (const c of codigos) {
      const m = readinessMeta(c, RULES);
      expect(m.label, c).not.toBe(c);
      expect(m.hint, c).toBeTruthy();
    }
  });

  it("si el backend falla, lo dice y deja reintentar", async () => {
    const loadStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("ROTATION_STATUS_FAILED"))
      .mockResolvedValueOnce(ESTADO_T1);
    render(<IdentityRotationPanel loadStatus={loadStatus} />);
    expect(await screen.findByText(/could not load the rotation status/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(loadStatus).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("1 / 4")).toBeInTheDocument();
  });
});
