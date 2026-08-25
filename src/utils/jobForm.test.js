import { describe, it, expect } from "vitest";
import { alternarSeleccionVisible, buildJobPayload, validateNumericField, resolveTypeFilter } from "./jobForm";

describe("buildJobPayload — the four creatable types", () => {
  it("agent_update carries a trimmed version", () => {
    expect(buildJobPayload("agent_update", null, "  1.1.70  ")).toEqual({ version: "1.1.70" });
  });

  it("facts_snapshot carries the fact scope", () => {
    expect(buildJobPayload("facts_snapshot", "compliance")).toEqual({ factType: "compliance" });
  });

  it("patch_scan is an empty payload", () => {
    expect(buildJobPayload("patch_scan")).toEqual({});
  });

  it("patch_install defaults the mode and omits KB list when empty", () => {
    expect(buildJobPayload("patch_install", null, null, "", "")).toEqual({ mode: "install" });
  });

  it("patch_install splits, trims and filters the KB list", () => {
    expect(
      buildJobPayload("patch_install", null, null, "download", " KB5034123 , ,KB5034439 ")
    ).toEqual({ mode: "download", kbArticleIds: ["KB5034123", "KB5034439"] });
  });
});

describe("buildJobPayload — cannot build a non-creatable type", () => {
  it("returns {} for the operator-snapshot and system types", () => {
    // The form only ever offers the creatable four, but this is the safety
    // net that keeps a future edit from quietly widening it: a
    // software_install needs a package snapshot the form has no way to
    // produce, so {} (which the backend rejects) is the only honest
    // answer, not a half-built payload that looks valid.
    for (const t of ["software_install", "patch_remediate", "software_dp_prefetch", "reset_baseline"]) {
      expect(buildJobPayload(t, "inventory", "1.0", "install", "KB1"), t).toEqual({});
    }
  });
});

describe("validateNumericField", () => {
  it("treats empty as valid — the field is optional", () => {
    // Both call sites (timeout, max attempts) leave the field optional and
    // let the backend apply its default.
    for (const empty of ["", "   ", null, undefined]) {
      expect(validateNumericField(empty, { min: 30, max: 86400 }), JSON.stringify(empty)).toBeNull();
    }
  });

  it("accepts an integer inside the range, inclusive of the bounds", () => {
    expect(validateNumericField("30", { min: 30, max: 86400 })).toBeNull();
    expect(validateNumericField("86400", { min: 30, max: 86400 })).toBeNull();
    expect(validateNumericField("300", { min: 30, max: 86400 })).toBeNull();
  });

  it("rejects out-of-range, non-integer and non-numeric values", () => {
    const opts = { min: 1, max: 10 };
    for (const bad of ["0", "11", "2.5", "abc", "-3"]) {
      expect(validateNumericField(bad, opts), bad).toBe("Value must be between 1 and 10");
    }
  });
});

describe("resolveTypeFilter — incoming ?type= deep-links", () => {
  const catalogue = [
    { jobType: "agent_update" },
    { jobType: "software_dp_prefetch" },
    { jobType: "patch_install" },
  ];

  it("keeps a value that names an advertised type", () => {
    // Including a non-creatable one — the history filters all 8, not just
    // the creatable four, so a link to software_dp_prefetch must survive.
    expect(resolveTypeFilter("agent_update", catalogue)).toBe("agent_update");
    expect(resolveTypeFilter("software_dp_prefetch", catalogue)).toBe("software_dp_prefetch");
  });

  it("drops an unknown type to 'all' rather than hiding every row", () => {
    // A typo, a renamed type, or a link built before the type existed.
    expect(resolveTypeFilter("softwyre_install", catalogue)).toBe("all");
    expect(resolveTypeFilter("nonexistent", catalogue)).toBe("all");
  });

  it("normalises empty, 'all' and casing", () => {
    expect(resolveTypeFilter("", catalogue)).toBe("all");
    expect(resolveTypeFilter("all", catalogue)).toBe("all");
    expect(resolveTypeFilter(null, catalogue)).toBe("all");
    expect(resolveTypeFilter("  AGENT_UPDATE  ", catalogue)).toBe("agent_update");
  });

  it("returns 'all' when the catalogue is not loaded yet", () => {
    // First render, before /job-types resolves — a real value must not be
    // rejected just because the list is momentarily absent.
    expect(resolveTypeFilter("agent_update", [])).toBe("all");
    expect(resolveTypeFilter("agent_update", undefined)).toBe("all");
  });
});

describe("alternarSeleccionVisible — selección masiva de equipos", () => {
  it("añade todos los visibles cuando no están todos elegidos", () => {
    expect(alternarSeleccionVisible([], ["a", "b"])).toEqual(["a", "b"]);
    expect(alternarSeleccionVisible(["a"], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("los quita cuando ya estaban todos", () => {
    expect(alternarSeleccionVisible(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("NO descarta lo seleccionado que quedó fuera del filtro", () => {
    // El caso que hace segura la función. El operador busca "srv-", marca
    // todos, luego busca "lap-": pulsar "Seleccionar todos" debe AÑADIR los
    // portátiles conservando los servidores. Una implementación ingenua
    // (onChange(visibles)) los perdería sin avisar.
    expect(alternarSeleccionVisible(["srv-1", "srv-2"], ["lap-1"]))
      .toEqual(["srv-1", "srv-2", "lap-1"]);
  });

  it("al quitar, sólo toca los visibles", () => {
    expect(alternarSeleccionVisible(["srv-1", "lap-1"], ["lap-1"])).toEqual(["srv-1"]);
  });

  it("no duplica los que ya estaban", () => {
    expect(alternarSeleccionVisible(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("sin visibles no cambia nada — un filtro sin resultados no vacía la selección", () => {
    expect(alternarSeleccionVisible(["a"], [])).toEqual(["a"]);
  });

  it("tolera entradas ausentes", () => {
    expect(alternarSeleccionVisible(undefined, ["a"])).toEqual(["a"]);
    expect(alternarSeleccionVisible(["a"], undefined)).toEqual(["a"]);
  });
});
