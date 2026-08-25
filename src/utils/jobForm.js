// src/utils/jobForm.js
//
// Pure form logic pulled out of Jobs.jsx so it can be unit-tested without
// mounting a 2300-line page. Same move already made for jobBatches and
// jobResult.
//
// buildJobPayload is the shape that goes to the API, and it is the one the
// analysis flagged as fragile: it only builds the 4 creatable types, and
// for anything else returns {} (which the backend then rejects). That is
// correct — the form only ever offers creatable types (see the catalogue
// split) — but the tests below pin it so a future edit can't quietly widen
// it into building an invalid payload for a non-creatable type.

/**
 * Build the payload for a job of `jobType` from the form fields.
 *
 * Returns {} for any type the form does not build. Callers guarantee
 * jobType is one of the creatable four; the {} fallthrough is a safety
 * net, not a supported path (the backend would reject it).
 */
export function buildJobPayload(jobType, factType, version, patchMode, kbArticleIds) {
  if (jobType === "agent_update") {
    return { version: String(version || "").trim() };
  }

  if (jobType === "facts_snapshot") {
    return { factType };
  }

  if (jobType === "patch_scan") {
    return {};
  }

  if (jobType === "patch_install") {
    const normalizedKbArticleIds = String(kbArticleIds || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const payload = {
      mode: String(patchMode || "install").trim() || "install",
    };

    if (normalizedKbArticleIds.length > 0) {
      payload.kbArticleIds = normalizedKbArticleIds;
    }

    return payload;
  }

  return {};
}

/**
 * Validate an optional integer field against [min, max].
 *
 * Empty is valid (the field is optional — the backend applies a default).
 * A non-empty value must be an integer within range. Returns an error
 * string or null.
 *
 * The `required` parameter was removed: no caller ever passed it, so its
 * branch was dead. Both call sites (timeout, max attempts) leave the field
 * optional.
 */
export function validateNumericField(value, { min, max }) {
  if (!String(value ?? "").trim()) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return `Value must be between ${min} and ${max}`;
  }

  return null;
}

/**
 * Resolve an incoming ?type= deep-link value against the job-type
 * catalogue. Returns the type when it names an advertised one, else "all".
 *
 * Split out because a bad ?type= (a typo, a renamed type, a link built
 * before a type existed) would otherwise hide every history row. The
 * catalogue is not available on first render, so the page applies the raw
 * value optimistically and calls this once the catalogue loads.
 *
 * @param raw    the ?type= value, already lower-cased ("" or "all" → all)
 * @param types  the catalogue array: [{ jobType, ... }]
 */
export function resolveTypeFilter(raw, types) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value || value === "all") return "all";
  const known = Array.isArray(types) && types.some((t) => t.jobType === value);
  return known ? value : "all";
}

/**
 * Alterna la selección de los equipos VISIBLES (los que pasan el filtro
 * actual), dejando intactos los que están seleccionados pero no visibles.
 *
 * Ese matiz es el que la hace segura: si el operador buscó "srv-", marcó
 * todos, y luego busca "lap-", "Seleccionar todos" debe AÑADIR los portátiles
 * sin descartar los servidores que ya eligió. Una implementación ingenua
 * (`onChange(visibleIds)`) los perdería sin avisar.
 *
 * @param seleccion  ids ya seleccionados
 * @param visibles   ids que pasan el filtro actual
 */
export function alternarSeleccionVisible(seleccion, visibles) {
  const actual = Array.isArray(seleccion) ? seleccion : [];
  const vis = Array.isArray(visibles) ? visibles : [];
  if (vis.length === 0) return actual;

  const todosElegidos = vis.every((id) => actual.includes(id));
  if (todosElegidos) return actual.filter((id) => !vis.includes(id));
  return [...new Set([...actual, ...vis])];
}
