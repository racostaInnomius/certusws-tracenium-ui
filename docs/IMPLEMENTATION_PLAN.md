# Plan De Implementacion De Mejoras

Este plan parte del estado actual de la repo: `npm run build` pasa, `npm run lint` falla con 7 errores y hay deuda tecnica concentrada en lint, documentacion, mezcla JS/TS, ausencia de tests y optimizacion de bundles.

## Etapa 1 - Recuperar Calidad Base

Objetivo: dejar `npm run lint` en verde sin cambiar comportamiento de producto.

Archivos a tocar:

- `src/pages/AssetGroups.jsx`
- `src/pages/AssetsDashboard.jsx`
- `src/pages/Configurations.jsx`
- `src/pages/Policies.jsx`
- `src/pages/SoftwareInventory.jsx`
- `src/auth/AuthGate.jsx`
- `src/layout/Sidebar.jsx`
- `src/components/RemoteControl/FileBrowserPanel.jsx`
- `src/components/RemoteControl/ScreenShareViewer.jsx`

Trabajo:

- Restaurar o definir `parseCommaSeparatedValues` en `AssetGroups.jsx`.
- Quitar imports no usados en `AssetsDashboard.jsx`, `Policies.jsx` y `SoftwareInventory.jsx`.
- Mover calculos con `Date.now()` fuera del render impuro en `Configurations.jsx`.
- Limpiar variables no usadas y disables obsoletos.
- Revisar warnings de hooks que puedan ser bugs reales antes de silenciarlos.

Validacion:

```bash
npm run lint
npm run build
```

## Etapa 2 - Alinear TypeScript Y Lint

Objetivo: decidir y aplicar una estrategia clara para JS/TS.

Opcion recomendada: migracion gradual a TypeScript, empezando por archivos de borde y contratos.

Archivos a tocar:

- `eslint.config.js`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.app.json`
- `src/main.tsx`
- `src/App.tsx`
- `src/auth/AuthContext.tsx`
- `src/api/http.js`

Trabajo:

- Agregar lint para `.ts` y `.tsx`.
- Agregar script `typecheck` si se mantiene TS.
- Tipar primero `AuthContext`, eventos globales de auth/error y respuestas de bootstrap.
- Documentar la regla de migracion: nuevos clientes API y hooks compartidos deberian ser TS.

Validacion:

```bash
npm run lint
npm run build
npm run typecheck
```

## Etapa 3 - Tests Minimos De Regresion

Objetivo: cubrir los puntos donde una regresion rompe la consola completa.

Archivos a tocar:

- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `src/api/http.js`
- `src/hooks/useCachedFetch.js`
- `src/layout/AppShell.jsx`
- `src/auth/AuthContext.tsx`
- `src/components/common/ConfirmDialog.jsx`
- `src/test/setup.js` o `src/test/setup.ts`

Archivos nuevos probables:

- `src/api/http.test.js`
- `src/hooks/useCachedFetch.test.jsx`
- `src/layout/AppShell.test.jsx`
- `src/auth/AuthContext.test.tsx`

Trabajo:

- Instalar Vitest y React Testing Library.
- Testear `httpGetJson`: cache, 401, 503, timeout y fallback con cache.
- Testear `useCachedFetch`: carga inicial, cache hit, refresh y error temporal.
- Smoke test del shell: render de sidebar/topbar y cambio de `?page=`.

Validacion:

```bash
npm run test
npm run lint
npm run build
```

## Etapa 4 - Mejorar Bundles Y Carga Diferida

Objetivo: reducir costo inicial y aislar dependencias pesadas por feature.

Archivos a tocar:

- `vite.config.ts`
- `src/pages/RemoteControl.jsx`
- `src/components/RemoteControl/ShellTerminal.jsx`
- `src/components/RemoteControl/ScreenShareViewer.jsx`
- `src/components/RemoteControl/FileBrowserPanel.jsx`
- `src/pages/Assets.jsx`
- `src/pages/AssetsDashboard.jsx`
- `src/pages/Overview.jsx`

Trabajo:

- Revisar `manualChunks` actuales.
- Cargar `xterm` solo cuando se abre una sesion shell.
- Cargar screen share/file browser solo cuando se abre el drawer correspondiente.
- Evaluar si charts secundarios del Overview pueden dividirse por lazy imports.
- Agregar analisis de bundle como script opcional.

Validacion:

```bash
npm run build
```

Comparar tamanos de `dist/assets` antes y despues.

## Etapa 5 - Routing Mas Robusto

Objetivo: formalizar deep links, permisos y navegacion sin depender de listeners manuales.

Archivos a tocar:

- `src/layout/AppShell.jsx`
- `src/layout/Sidebar.jsx`
- `src/pages/Overview.jsx`
- `src/utils/browserState.js`
- `src/main.tsx`
- `package.json`
- `package-lock.json`

Trabajo:

- Evaluar incorporacion de `react-router`.
- Mapear cada `page` actual a una ruta estable.
- Mantener compatibilidad con `?page=` durante una ventana de migracion.
- Centralizar metadata de rutas: label, icon, permiso, componente y aliases.

Validacion:

```bash
npm run lint
npm run build
npm run test
```

## Etapa 6 - Documentacion Viva

Objetivo: que un nuevo desarrollador pueda levantar, entender y cambiar el proyecto sin leer toda la repo.

Archivos a tocar:

- `README.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/API_CONTRACTS.md`
- `docs/ARCHITECTURE.md`
- `.env.example`

Trabajo:

- Crear `.env.example`.
- Documentar dominios API y endpoints por modulo.
- Documentar convenciones de UI: MUI, `BRAND`, `ROLE`, `PageHeader`, `SectionPaper`, `RefreshControl`.
- Documentar flujo auth/bootstrap/logout.
- Documentar deploy Azure y secrets requeridos.

Validacion:

```bash
npm run lint
npm run build
```

## Etapa 7 - Hardening De UX Operativa

Objetivo: mejorar consistencia de errores, estados vacios y acciones criticas.

Archivos a tocar:

- `src/api/http.js`
- `src/hooks/useCachedFetch.js`
- `src/components/common/BrandSnackbar.jsx`
- `src/components/common/ConfirmDialog.jsx`
- `src/components/common/RefreshControl.jsx`
- `src/pages/RemoteControl.jsx`
- `src/pages/PatchManagement.jsx`
- `src/pages/SoftwareDelivery.jsx`
- `src/pages/SecurityCompliance.jsx`
- `src/pages/Alerts.jsx`

Trabajo:

- Unificar mensajes de error por tipo: auth, temporal, validacion, permiso y backend desconocido.
- Hacer que acciones destructivas usen siempre `ConfirmDialog`.
- Revisar estados vacios por pagina.
- Asegurar que refresh manual y auto-refresh muestren estados consistentes.

Validacion:

```bash
npm run lint
npm run build
npm run test
```

## Orden Recomendado

1. Etapa 1, porque lint roto impide confianza.
2. Etapa 6 parcial, para dejar `.env.example` y arquitectura basica.
3. Etapa 3, para cubrir HTTP/cache/shell antes de refactors.
4. Etapa 2, si se decide apostar por TypeScript.
5. Etapa 4 y 5, ya con pruebas de soporte.
6. Etapa 7 como mejora continua de producto.
