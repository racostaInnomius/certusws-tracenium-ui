// src/utils/deviceLink.js
//
// Enlace a la ficha de UN equipo en Asset Management.
//
// `?page=assets&device=<agentId>` es el parámetro con el que AssetsDashboard
// abre la ficha (ver su efecto sobre `device`). Lo usan Patch Management, el
// Overview y la ficha de una alerta: un solo sitio que sabe construirlo, en
// vez de una copia por página.

import { searchForPage } from "./browserState";

function basePath() {
  // `//?page=` (doble barra tras algunos redirects de login) es una URL
  // protocol-relative para pushState, que la rechaza como cross-origin y el
  // clic parece muerto. Ver navigateWithQuery en Overview.
  return window.location.pathname.replace(/^\/+/, "/") || "/";
}

/** El href de la ficha — para un `<a>` real: Cmd/Ctrl-clic abre otra pestaña. */
export function deviceAssetsHref(agentId) {
  return `${basePath()}${searchForPage("assets", { device: agentId })}`;
}

/**
 * Abre la ficha del equipo en esta pestaña. Apila en el historial: Atrás
 * vuelve a la página de origen. AppShell cambia de página al oír el popstate.
 */
export function openDeviceInAssets(agentId) {
  window.history.pushState({}, "", deviceAssetsHref(agentId));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * onClick de un `<a href={deviceAssetsHref(id)}>`: el clic normal navega
 * dentro del portal; con modificador o botón central se deja al navegador,
 * que abre otra pestaña (y la alerta sigue abierta en ésta).
 */
export function handleDeviceLinkClick(event, agentId) {
  if (event.defaultPrevented) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openDeviceInAssets(agentId);
}
