// src/auth/ssoError.js
//
// Pantalla terminal cuando el IdP deniega el acceso ANTES de que exista sesión.
//
// ⚠️ POR QUÉ NO BASTA CON LA PANTALLA «Access not enabled»
//
// Esa se llega desde un bootstrap 403: el usuario ya tiene token. Cuando
// SafeCertus deniega en el propio authorize —«Not now» en la pantalla de «añade
// Tracenium a tu cuenta», o entitlement en enforce— nunca hay token: el backend
// vuelve a la UI con `?auth_error=<código>` y aquí no puede correr el bootstrap,
// porque su 401 dispara `/auth/login` y eso reabre el bucle que este cambio
// corta.
//
// El código viaja por la URL, así que es una lista blanca: un valor desconocido
// cae en el mensaje genérico y nunca se pinta texto que venga del navegador.

export const SSO_ERROR_PARAM = "auth_error";

export const SSO_ERRORS = {
  service_join_declined: {
    title: "Tracenium was not added to your account",
    description:
      "You chose not to add Tracenium to your SafeCertus account, so the sign-in did not complete. You can try again and accept, or close this page.",
    retry: true,
  },
  no_service_access: {
    title: "Access not enabled",
    description:
      "Your SafeCertus account does not have access to Tracenium. Ask an administrator to assign it, then sign in again.",
    // Reintentar no arregla nada hasta que un administrador lo asigne: el botón
    // sólo devolvería al usuario a la misma negativa.
    retry: false,
  },
  sso_error: {
    title: "Sign-in could not be completed",
    description:
      "The identity provider did not complete the sign-in. Try again; if it keeps happening, contact your administrator.",
    retry: true,
  },
};

const FALLBACK = "sso_error";

/** Código de la query string, o null si no viene ninguno. */
export function readSsoError(search) {
  const params = new URLSearchParams(String(search || ""));
  const raw = params.get(SSO_ERROR_PARAM);
  if (!raw) return null;
  return Object.prototype.hasOwnProperty.call(SSO_ERRORS, raw) ? raw : FALLBACK;
}

/**
 * Lee el código y BORRA el parámetro de la barra de direcciones: si se quedara,
 * recargar o compartir la URL reproduciría el error para siempre.
 */
export function consumeSsoError(loc = typeof window !== "undefined" ? window.location : null, hist = typeof window !== "undefined" ? window.history : null) {
  if (!loc) return null;
  const code = readSsoError(loc.search);
  if (!code) return null;

  try {
    const url = new URL(loc.href);
    url.searchParams.delete(SSO_ERROR_PARAM);
    hist?.replaceState?.({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Sin history utilizable el mensaje se enseña igual; sólo queda el
    // parámetro en la URL.
  }

  return code;
}

export function ssoErrorCopy(code) {
  return SSO_ERRORS[code] || SSO_ERRORS[FALLBACK];
}
