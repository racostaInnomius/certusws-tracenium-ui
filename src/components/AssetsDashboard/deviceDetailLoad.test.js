import { describe, expect, it, vi } from "vitest";
import {
  describeDetailFailures,
  isNotFound,
  loadWithOneRetry,
  resolveDeviceName,
} from "./deviceDetailLoad";

const ID = "08eaddae-9611-4cc5-abe3-9ac35b76a5bb";

describe("resolveDeviceName — nunca el id como nombre", () => {
  it("⭐ prod 30-sep: detalle caído, llegada por ?device= — el nombre sale del inventario de hardware", () => {
    // Lo que la ficha tenía: el perfil de respaldo (sin nombre), `{agent_id}`
    // de la URL y la fila de hardware, que sí llegó.
    const profile = { agentId: ID, hostname: null };
    expect(resolveDeviceName({ profile, selectedHost: { agent_id: ID }, hardware: { agentId: ID, hostname: "MarisolCorona" } }))
      .toBe("MarisolCorona");
  });

  it("el detalle manda; después lo que trajo quien abrió la ficha; después la fila de la tabla", () => {
    const hostRow = { hostname: "from-row" };
    expect(resolveDeviceName({ profile: { hostname: "from-detail" }, selectedHost: { hostname: "from-link" }, hostRow })).toBe("from-detail");
    expect(resolveDeviceName({ profile: {}, selectedHost: { hostname: "from-link" }, hostRow })).toBe("from-link");
    expect(resolveDeviceName({ profile: {}, selectedHost: { agent_id: ID }, hostRow })).toBe("from-row");
  });

  it("un «nombre» que es el propio id no cuenta", () => {
    expect(resolveDeviceName({ profile: { agentId: ID, hostname: ID }, selectedHost: { agent_id: ID } })).toBeNull();
  });

  it("sin ninguna fuente, null (la cabecera decide qué decir)", () => {
    expect(resolveDeviceName({ selectedHost: { agent_id: ID } })).toBeNull();
    expect(resolveDeviceName()).toBeNull();
  });
});

describe("loadWithOneRetry", () => {
  const sleep = () => Promise.resolve();
  const temporary = (err) => err?.temporary === true;

  it("un fallo pasajero se reintenta una vez", async () => {
    const load = vi.fn().mockRejectedValueOnce({ temporary: true }).mockResolvedValueOnce("ok");
    await expect(loadWithOneRetry(load, { isTemporary: temporary, sleep })).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("sólo una: si el reintento también falla, se propaga", async () => {
    const load = vi.fn().mockRejectedValue({ temporary: true, n: 1 });
    await expect(loadWithOneRetry(load, { isTemporary: temporary, sleep })).rejects.toMatchObject({ temporary: true });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("un 404 no se reintenta: la respuesta no va a cambiar", async () => {
    const load = vi.fn().mockRejectedValue({ status: 404 });
    await expect(loadWithOneRetry(load, { isTemporary: temporary, sleep })).rejects.toMatchObject({ status: 404 });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("isNotFound / describeDetailFailures", () => {
  it("404 es «no está», cualquier otra cosa no", () => {
    expect(isNotFound({ status: 404 })).toBe(true);
    expect(isNotFound({ status: 500 })).toBe(false);
    expect(isNotFound(null)).toBe(false);
  });

  it("nombra lo que falta, en palabras del operador", () => {
    expect(describeDetailFailures([])).toBe("");
    expect(describeDetailFailures(["profile"])).toBe("Could not load device details.");
    expect(describeDetailFailures(["profile", "hardware", "printers"]))
      .toBe("Could not load device details, hardware inventory and printers.");
  });
});
