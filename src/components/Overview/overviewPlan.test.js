import { describe, expect, it } from "vitest";
import { OVERVIEW_BLOCKS, resolveOverviewPlan } from "./overviewPlan";

const plan = (keys, loading = false) =>
  resolveOverviewPlan({ entitled: keys ? new Set(keys) : null, loading });

const STARTER = ["amp", "sdp"];
const PROFESSIONAL = [...STARTER, "scp", "rcp"];
const ENTERPRISE = [...PROFESSIONAL, "pmp", "cdp"];

describe("resolveOverviewPlan", () => {
  it("⭐ Starter monta SÓLO el bloque 1, y los otros dos quedan como no incluidos", () => {
    const p = plan(STARTER);

    expect(p.blocks.map((b) => b.id)).toEqual(["core"]);
    expect(p.locked.map((b) => b.id)).toEqual(["security", "operations"]);
  });

  it("Professional añade el bloque de seguridad y deja fuera el de Enterprise", () => {
    const p = plan(PROFESSIONAL);

    expect(p.blocks.map((b) => b.id)).toEqual(["core", "security"]);
    expect(p.locked.map((b) => b.id)).toEqual(["operations"]);
  });

  it("Enterprise lo monta todo y no hay nada que ofrecer", () => {
    const p = plan(ENTERPRISE);

    expect(p.blocks.map((b) => b.id)).toEqual(["core", "security", "operations"]);
    expect(p.locked).toEqual([]);
  });

  it("⚠️ mientras carga NO monta los bloques de pago (un Starter recibiría 402)", () => {
    const p = plan(null, true);

    expect(p.blocks.map((b) => b.id)).toEqual(["core"]);
    // Tampoco se anuncian como "no incluidos": aún no se sabe.
    expect(p.locked).toEqual([]);
  });

  it("mientras carga, SDP espera también dentro del bloque 1", () => {
    const core = plan(null, true).blocks[0];

    expect(core.has("amp")).toBe(true);
    expect(core.has("sdp")).toBe(false);
  });

  it("si el backend NO pudo resolver los derechos, falla abierto y monta todo", () => {
    const p = plan(null, false);

    expect(p.blocks.map((b) => b.id)).toEqual(["core", "security", "operations"]);
    expect(p.locked).toEqual([]);
  });

  it("el suelo: un tenant sin suscripción (sólo AMP) conserva el bloque 1 pero sin SDP", () => {
    const p = plan(["amp"]);

    expect(p.visible("core")).toBe(true);
    expect(p.blocks[0].has("sdp")).toBe(false);
  });

  it("un bloque aparece con UNO de sus plugins, y cada card sigue gateada por el suyo", () => {
    const p = plan([...STARTER, "scp"]);
    const security = p.blocks.find((b) => b.id === "security");

    expect(security).toBeTruthy();
    expect(security.has("scp")).toBe(true);
    expect(security.has("rcp")).toBe(false);
  });

  it("los plugins de los bloques cubren el catálogo entero, sin repetir", () => {
    // Si el backend añade un plugin y nadie lo asigna a un bloque, el
    // Overview vuelve a quedarse sin card de ese plugin sin que nada falle.
    const all = OVERVIEW_BLOCKS.flatMap((b) => b.plugins);
    expect([...all].sort()).toEqual(["amp", "cdp", "pmp", "rcp", "scp", "sdp"]);
  });
});
