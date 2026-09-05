// Qué se puede decir del número "equipos sin ninguna directiva".
//
// ⚠️ Ese número solo no sirve para actuar, y durante un tiempo la pantalla lo
// presentó como si sí. Mezcla tres poblaciones con respuestas distintas:
//
//   · equipo en workgroup, sin directivas — correcto, no hay nada que hacer;
//   · equipo unido al dominio, sin directivas — averiado, hay que mirarlo;
//   · equipo que todavía no reporta si está en dominio — no se sabe.
//
// La tercera existe porque el campo `partOfDomain` se añadió al mapeo de
// evidencia del catálogo (migración 20260904) y cada equipo lo empieza a mandar
// en su siguiente ciclo de evaluación. Mientras haya pendientes, el conteo de
// averiados es un PISO y no un total — y decirlo es más útil que redondearlo
// hacia la calma.

/**
 * El desglose de los equipos sin ninguna directiva.
 *
 * Devuelve `null` cuando no hay nada que desglosar (sin datos, o ninguno sin
 * directivas): quien llama no tiene que pintar una leyenda vacía.
 */
export function describeWithoutGpos(summary) {
  if (!summary) return null;

  const total = Number(summary.withoutAnyGpos ?? 0);
  if (!Number.isFinite(total) || total <= 0) return null;

  const joined = Number(summary.domainJoinedWithoutGpos ?? 0) || 0;
  const workgroup = Number(summary.notDomainJoinedWithoutGpos ?? 0) || 0;
  // Las tres ramas parten el mismo conjunto, así que lo que no cae en las dos
  // conocidas es exactamente lo pendiente. No se pide aparte para que no pueda
  // desincronizarse del total.
  const pending = Math.max(0, total - joined - workgroup);

  const parts = [];
  if (joined > 0) parts.push(`${joined} domain-joined`);
  if (workgroup > 0) parts.push(`${workgroup} workgroup`);
  if (pending > 0) parts.push(`${pending} unknown`);

  return {
    joined,
    workgroup,
    pending,
    // Sólo los unidos al dominio pintan de alarma. Un workgroup sin directivas
    // es el estado correcto, y teñirlo de rojo enseña a ignorar el color.
    actionable: joined > 0,
    text: parts.join(" · "),
  };
}
