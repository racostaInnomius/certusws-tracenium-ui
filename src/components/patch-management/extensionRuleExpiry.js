// src/components/patch-management/extensionRuleExpiry.js
//
// Una aprobación de extensión dura seis meses. Vencida quiere decir "hay que
// volver a decidir": la extensión vuelve a contar en Security Compliance y a
// la lista de revisión, aunque los equipos la sigan permitiendo.
//
// El servidor manda `expired` ya calculado (lo decide el NOW() de su base, no
// el reloj del navegador). Aquí sólo se lee, y un bloqueo nunca vence.

export function isExpiredApproval(rule) {
  return Boolean(rule && rule.action === "allow" && rule.expired);
}
