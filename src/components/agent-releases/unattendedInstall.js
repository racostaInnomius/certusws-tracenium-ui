// src/components/agent-releases/unattendedInstall.js
//
// El comando de instalación desatendida para un binario concreto del catálogo.
//
// POR QUÉ ESTO VIVE EN LA UI
//
// Cada plataforma recibe el token de enrolamiento de una forma DISTINTA, y dos
// de las tres no se adivinan:
//
//   Windows : propiedad del MSI en la línea de comandos.
//   macOS   : un fichero en /private/tmp ANTES de instalar.
//   Linux   : un fichero en /tmp ANTES de instalar.
//
// En macOS y Linux el postinstall del paquete recoge ese fichero temporal, lo
// mueve a su ubicación definitiva con el dueño y los permisos correctos, y borra
// el temporal. El comentario del postinstall de Linux dice literalmente que "el
// dashboard entrega al operador un token de un solo uso; lo deja en
// /tmp/tracenium-enrollment.token antes de instalar" — o sea que el empaquetado
// ya daba por supuesto que esta pantalla lo documentaba. No lo hacía.
//
// ⚠️ El orden importa y es la parte que la gente falla: en macOS, si el fichero
// temporal no está, el .pkg PIDE EL TOKEN DE FORMA INTERACTIVA y la instalación
// deja de ser desatendida — se queda esperando a alguien que no está mirando.

/** Marcador del token. Nunca se inyecta el token real: acaba en capturas y tickets. */
export const TOKEN_PLACEHOLDER = "<TOKEN>";

/** Ruta del fichero temporal que lee el postinstall, por plataforma. */
const TMP_TOKEN_PATH = {
  macos: "/private/tmp/tracenium-enrollment.token",
  linux: "/tmp/tracenium-enrollment.token",
};

/**
 * Nombre del artefacto tal y como lo publica el pipeline.
 *
 * Los CUATRO formatos siguen el mismo patrón, deb y rpm incluidos — no la
 * convención `tracenium-agent_1.1.47_amd64.deb` que uno esperaría de un paquete
 * Debian. Ver resolveFileName() en modules/binaries/binaries.service.ts.
 */
export function agentFileName({ version, arch, format }) {
  return `Tracenium-Agent-${version}-${arch}.${format}`;
}

/**
 * Comando de instalación desatendida para esta fila del catálogo.
 *
 * Devuelve null cuando la combinación no se reconoce, para que quien llame
 * simplemente no ofrezca el botón en vez de mostrar un comando inventado: uno
 * equivocado aquí es peor que ninguno, porque se copia y se ejecuta con
 * privilegios sin que nadie lo revise.
 */
export function unattendedInstallCommand(row, token = TOKEN_PLACEHOLDER) {
  if (!row) return null;
  const platform = String(row.platform || "").toLowerCase();
  const format = String(row.format || "").toLowerCase();
  const arch = String(row.arch || "").toLowerCase();
  const version = String(row.version || "").trim();
  if (!platform || !format || !arch || !version) return null;

  const file = agentFileName({ version, arch, format });

  if (platform === "windows" && format === "msi") {
    // /norestart es deliberado: sin él, un instalador que decida reiniciar se
    // lleva el equipo por delante y nadie ve el resultado. Con él, "hace falta
    // reiniciar" vuelve como código 3010 y la decisión es del operador.
    return [
      `msiexec /i "${file}" /qn /norestart ENROLLMENT_TOKEN=${token}`,
    ].join("\n");
  }

  if (platform === "macos" && format === "pkg") {
    return [
      `sudo sh -c 'printf %s "${token}" > ${TMP_TOKEN_PATH.macos}'`,
      `sudo installer -pkg "${file}" -target /`,
    ].join("\n");
  }

  if (platform === "linux" && (format === "deb" || format === "rpm")) {
    const install = format === "deb" ? `sudo dpkg -i "${file}"` : `sudo rpm -i "${file}"`;
    return [
      `sudo sh -c 'printf %s "${token}" > ${TMP_TOKEN_PATH.linux}'`,
      install,
    ].join("\n");
  }

  return null;
}

/** Nota corta que acompaña al comando, específica de la plataforma. */
export function unattendedInstallNote(row) {
  const platform = String(row?.platform || "").toLowerCase();
  if (platform === "macos" || platform === "linux") {
    return "El fichero de token debe existir ANTES de instalar: el postinstall lo recoge, lo mueve a su ubicación final con los permisos correctos y borra el temporal. Sin él, el instalador de macOS pide el token de forma interactiva y deja de ser desatendido.";
  }
  if (platform === "windows") {
    return "Ejecutar desde un símbolo del sistema elevado, en la carpeta donde esté el .msi. Los códigos 0, 3010 y 1641 son TODOS correctos: 3010 y 1641 sólo indican que hace falta reiniciar.";
  }
  return "";
}
