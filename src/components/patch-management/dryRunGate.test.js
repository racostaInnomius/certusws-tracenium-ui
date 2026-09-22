// src/components/patch-management/dryRunGate.test.js
import { describe, it, expect } from "vitest";
import { devicesToApplyAfterDryRun, dryRunFinished, dryRunLeftOut } from "./dryRunGate";

const r = (deviceId, outcome) => ({ deviceId, outcome });

describe("simular antes de aplicar", () => {
  it("no ha terminado mientras quede alguno pendiente o corriendo", () => {
    expect(dryRunFinished([])).toBe(false);
    expect(dryRunFinished([r("a", "dryrun_would_apply"), r("b", "pending")])).toBe(false);
    expect(dryRunFinished([r("a", "dryrun_would_apply"), r("b", "running")])).toBe(false);
    expect(dryRunFinished([r("a", "dryrun_would_apply"), r("b", "timed_out")])).toBe(true);
  });

  it("⭐ se aplica SÓLO donde la simulación dijo que cambiaría", () => {
    const res = [
      r("a", "dryrun_would_apply"),
      r("b", "dryrun_already_compliant"),
      r("c", "failed"),
      r("d", "timed_out"),
      r("e", "dryrun_would_apply"),
    ];
    expect(devicesToApplyAfterDryRun(res)).toEqual(["a", "e"]);
    expect(dryRunLeftOut(res)).toEqual({ compliant: 1, failed: 2 });
  });

  it("sin resultados no hay a quién aplicar", () => {
    expect(devicesToApplyAfterDryRun(null)).toEqual([]);
    expect(devicesToApplyAfterDryRun([])).toEqual([]);
  });
});
