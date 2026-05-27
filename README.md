# Tracenium UI

Consola web de Tracenium para administrar, monitorear y operar una flota de dispositivos/agentes. La aplicacion esta orientada a equipos de IT, seguridad y operaciones que necesitan visibilidad de inventario, compliance, parches, jobs, auditoria, alertas, entrega de software y control remoto desde una sola interfaz.

## Estado Actual

- Stack principal: Vite, React 19, MUI 7, MUI X Data Grid, Recharts y xterm.
- Tipo de app: SPA desplegada como Azure Static Web App.
- Runtime API: usa `VITE_API_BASE` para apuntar al backend.
- Estado de build: `npm run build` pasa correctamente.
- Estado de lint: `npm run lint` falla actualmente con errores pendientes en algunas paginas legacy/operativas.
- Testing automatizado: no hay framework de pruebas configurado todavia.
- Lenguaje: la mayor parte del codigo esta en `.jsx`; la entrada de la app y auth context usan `.tsx`.

## Modulos Principales

- `src/layout`: shell principal, sidebar, topbar y navegacion por `?page=`.
- `src/auth`: carga de sesion inicial y gate de autenticacion.
- `src/api`: clientes por dominio y helper HTTP centralizado.
- `src/hooks`: cache client-side y helpers de fetch.
- `src/pages`: pantallas principales de producto.
- `src/components`: componentes de dominio y componentes comunes.
- `src/theme`: tokens de marca y tema MUI.
- `public`: assets estaticos y configuracion para Static Web Apps.

## Funcionalidad Cubierta

- Overview operacional con KPIs, actividad reciente, tendencias y alertas.
- Asset Management e inventario de hardware/software.
- Security Compliance y hallazgos por dispositivo.
- Patch Management y remediacion.
- Software Delivery para catalogo y despliegues.
- Remote Control con sesiones shell, archivos, screen share y auditoria de transferencias.
- Jobs, Policies, Audit, Alerts y PKI.
- Device Enrollment, tokens, releases de agente y administracion de tenants.
- Settings/configuraciones y retencion de base de datos.

## Arquitectura De Datos

La capa HTTP vive en `src/api/http.js` y centraliza:

- requests con `credentials: "include"`;
- timeouts;
- manejo de 401/UNAUTHENTICATED;
- errores temporales de backend/red;
- cache GET en memoria y `sessionStorage`;
- fallback a datos conocidos cuando una actualizacion temporal falla;
- invalidacion global tras mutaciones.

Para vistas que agregan varios endpoints, la app usa loaders por bundle y `useCachedFetch` para pintar desde cache y refrescar en segundo plano.

## Navegacion

La app usa una navegacion interna basada en query params:

```text
/?page=overview
/?page=assets
/?page=patch
/?page=remote-control
```

`src/layout/AppShell.jsx` decide que pagina renderizar y conserva compatibilidad con algunos deep links heredados.

## Variables De Entorno

Crear un `.env` local con:

```bash
VITE_API_BASE=http://localhost:3000
```

En CI/CD, `VITE_API_BASE` se inyecta desde GitHub Secrets.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Deploy

El flujo de deploy esta en `.github/workflows/azure-static-web-apps.yml`.

Pipeline actual:

1. Checkout.
2. Setup Node.js 20.
3. `npm ci`.
4. `npm run build`.
5. Upload de `dist` a Azure Static Web Apps.

## Calidad Y Deuda Conocida

Prioridades actuales:

- Corregir errores de lint para recuperar una base limpia.
- Decidir si el proyecto migrara gradualmente a TypeScript o si se mantendra mayormente en JS/JSX.
- Agregar pruebas automatizadas para `http.js`, `useCachedFetch`, navegacion y pantallas criticas.
- Revisar chunks grandes, especialmente Remote Control, MUI, Recharts y Data Grid.
- Reemplazar el README template anterior por documentacion viva del producto y mantenerla junto al plan de mejoras.

Ver plan detallado en `docs/IMPLEMENTATION_PLAN.md`.
