// src/components/agent-releases/releaseDisplay.js
//
// Qué versión enseñar para una fila del catálogo de instaladores.
//
// Las filas se dan de alta con `version: "latest"` y se reutilizan en cada
// release; el backend resuelve a qué versión apunta hoy (`publishedVersion`,
// leída del binario publicado). «latest» a secas no le dice al operador qué
// va a instalar.

export function displayVersion(row) {
  const version = String(row?.version ?? "");
  if (version.toLowerCase() === "latest") return row?.publishedVersion || "latest";
  return version;
}
