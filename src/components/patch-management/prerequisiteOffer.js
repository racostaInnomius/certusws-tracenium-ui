// src/components/patch-management/prerequisiteOffer.js
//
// «auditd no está instalado — ¿lo instalo y sigo?»
//
// 29-sep: aplicar reglas de auditoría a un servidor Linux sin auditd devolvía
// «Fix «auditd packages are installed» first, then this one» y el operador
// tenía que ir a buscar ese fix. El backend lo sabe instalar: responde con el
// requisito (PATCH_REMEDIATION_PREREQUISITE_MISSING) y, con
// `installPrerequisites: true`, manda la instalación delante de las reglas en
// el MISMO job del equipo. Aquí se decide qué ofrecer y con qué palabras.

export const PREREQUISITE_MISSING = "PATCH_REMEDIATION_PREREQUISITE_MISSING";

/**
 * De los checks omitidos de un lote, los que se quedaron fuera por un
 * requisito que se puede instalar, agrupados por requisito (auditd,
 * libpam-pwquality): cada uno tiene su aviso y su botón.
 */
export function prerequisiteOffers(skipped) {
  const byKey = new Map();
  for (const s of Array.isArray(skipped) ? skipped : []) {
    if (s?.error !== PREREQUISITE_MISSING || !s.prerequisite?.key) continue;
    const key = s.prerequisite.key;
    if (!byKey.has(key)) byKey.set(key, { prerequisite: s.prerequisite, checkIds: [], deviceIds: new Set() });
    const offer = byKey.get(key);
    offer.checkIds.push(s.checkId);
    for (const d of s.prerequisite.deviceIds ?? []) offer.deviceIds.add(d);
  }
  return [...byKey.values()].map((o) => ({ ...o, deviceIds: [...o.deviceIds] }));
}

/**
 * Qué pasaría sin el requisito, del backend (`consequence`). Un backend
 * anterior no lo manda y sólo conocía auditd.
 */
function consequenceOf(prerequisite) {
  return prerequisite?.consequence || "audit rules would not be loaded";
}

/** Lo que dice el aviso, antes del botón. */
export function describePrerequisiteOffer(offer, { hostname = null } = {}) {
  const n = offer.checkIds.length;
  const where = offer.deviceIds.length === 1
    ? (hostname ? `on ${hostname}` : "on this device")
    : `on ${offer.deviceIds.length} devices`;
  return (
    `${offer.prerequisite.key} is not installed ${where}, so ${n === 1 ? "1 fix was" : `${n} fixes were`} held back: ` +
    `without it ${consequenceOf(offer.prerequisite)}. Tracenium can install it first (${offer.prerequisite.title}) and then ` +
    `apply ${n === 1 ? "it" : "them"}, in the same job.`
  );
}

/** El mismo aviso para UN fix (drawer): `n` equipos sin el requisito. */
export function describeSingleFixPrerequisite(prerequisite) {
  const n = prerequisite?.deviceIds?.length ?? 0;
  return (
    `${prerequisite.key} is not installed on ${n === 1 ? "this device" : `these ${n} devices`}, so this fix would do nothing: ` +
    `without it ${consequenceOf(prerequisite)}. Tracenium can install it first (${prerequisite.title}) and then apply the fix, in the same job.`
  );
}

/**
 * Lo que cambia en el equipo al instalarlo (libpam-pwquality activa
 * pam_pwquality), o null. Va DENTRO del aviso, antes del botón: instalar es
 * lo que el operador acepta al pulsarlo.
 */
export function prerequisiteNotice(prerequisite) {
  return typeof prerequisite?.notice === "string" && prerequisite.notice.trim() ? prerequisite.notice.trim() : null;
}

/** El texto del botón: instalar sólo se promete al aplicar; en una simulación se simula también. */
export function prerequisiteOfferLabel(offer, mode) {
  const n = offer.checkIds.length;
  return mode === "dry_run"
    ? `Dry-run ${n} with ${offer.prerequisite.key} installed first`
    : `Install ${offer.prerequisite.key} and apply ${n}`;
}
