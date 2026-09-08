// El nombre de un grupo hecho a partir de una lista de la pantalla.
//
// ⚠️ Un grupo estático nace caducando, y el nombre es lo único que impide que
// eso se convierta en un error. Los 23 equipos con Chrome atrasado son los que
// estaban atrasados EN ESE INSTANTE: Chrome se auto-actualiza, así que para
// cuando alguien arme el deploy algunos ya no lo estarán y habrá otros que sí.
//
// Un nombre genérico —"Chrome desactualizado"— seguiría pareciendo verdad para
// siempre y se seguiría desplegando sobre él. Uno sellado con la fecha y el
// número dice lo que es: una foto, tomada tal día, de tantos equipos. Quien lo
// vea dentro de un mes sabrá que tiene que rehacerlo.

/** Fecha en ISO corto y local, que es como la lee quien mira la pantalla. */
function sello(now) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * `Chrome behind · 2026-09-08 14:32 · 23 devices`
 *
 * El prefijo lo pone quien llama y describe el criterio; esta función sólo se
 * encarga de que nadie pueda confundir la foto con una lista viva.
 */
export function sealedGroupName(prefix, count, now = new Date()) {
  const base = String(prefix ?? "").trim() || "Devices";
  const n = Number(count);
  const cuantos = Number.isFinite(n) && n >= 0 ? n : 0;
  const fecha = sello(now);

  return [
    base,
    fecha,
    `${cuantos} device${cuantos === 1 ? "" : "s"}`
  ].filter(Boolean).join(" · ");
}

/**
 * La descripción, que es donde vive la advertencia completa.
 *
 * El nombre se ve en un desplegable de Software Delivery; la descripción se ve
 * al abrir el grupo. Ahí cabe decir de dónde salió y que no se refresca.
 */
export function sealedGroupDescription(origin, now = new Date()) {
  const de = String(origin ?? "").trim();
  const fecha = sello(now);
  return [
    de ? `Snapshot of: ${de}.` : "Snapshot of a device list.",
    `Taken ${fecha}.`,
    "Membership is fixed — it does not refresh as devices change."
  ].join(" ");
}
