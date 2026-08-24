# Jobs page — análisis de madurez (2026-08-24)

Análisis de `src/pages/Jobs.jsx` (2339 líneas) contra el orquestador real del
backend. La página no se abandonó — su último commit es de hoy — pero creció
por parches y su modelo del dominio se quedó **cuatro años-tipo** por detrás de
lo que el sistema ya ejecuta.

Toda afirmación aquí está verificada contra código o contra la base de
producción, no inferida.

---

## 1. La brecha central: el formulario conoce 4 de 8 tipos

El backend acepta **8 tipos de job** (`isSupportedJobType`, `job-types.ts`) y
los 8 tienen tráfico real en producción:

| job_type | jobs en prod | último | UI: catálogo | UI: formulario |
|---|---:|---|:---:|:---:|
| agent_update | 169 | hoy | sí | ✅ |
| software_dp_prefetch | 29 | hoy | **no** | ❌ |
| facts_snapshot | 16 | 21-ago | sí | ✅ |
| patch_scan | 15 | 18-ago | sí | ✅ |
| software_install | 12 | hoy | **no** | ❌ |
| patch_install | 12 | hoy | sí | ✅ |
| reset_baseline | 5 | 22-ago | **no** | ❌ |
| patch_remediate | 5 | 14-ago | **no** | ❌ |

Los cuatro que el formulario no puede crear suman **51 jobs reales**. La página
los **recibe y los pinta** en el historial (la tabla es agnóstica al tipo), pero
no puede originarlos ni describirlos.

**Matiz importante, no todos son iguales:**

- `software_install` y `patch_remediate` son **acciones de operador** que hoy
  solo se pueden lanzar desde otras páginas (Software Delivery, Patch Management)
  o no se pueden lanzar en absoluto desde la UI. Son los candidatos legítimos a
  exponer en el formulario de Jobs.
- `software_dp_prefetch` y `reset_baseline` son **jobs de sistema**: el primero
  lo emite el warmer de distribución, el segundo el control-plane cuando pierde
  el baseline. Un operador **no debería** poder dispararlos a mano. Exponerlos en
  el formulario sería un error; exponerlos en el **catálogo de etiquetas** (para
  que el historial los muestre con nombre legible) sí es correcto.

Esa distinción es la que la página no hace hoy: trata "qué se puede ver" y "qué
se puede crear" como la misma lista.

### 1a. `getJobTypes` del backend también está atrás

El endpoint `/job-types` (`orchestrator.service.ts:getJobTypes`) solo anuncia
**los mismos 4**. Su propio comentario admite que ya derivó mal una vez
("`patch` … never advertised here"). Así que la UI no puede arreglar la brecha
sola: el catálogo servido es la fuente y también está incompleto. Cualquier
trabajo aquí es **backend + UI coordinado**.

### 1b. Drift silencioso catálogo → formulario

`buildJobPayload` (línea 443) solo construye payload para 4 tipos; para
cualquier otro devuelve `{}`. Hoy no explota porque el catálogo también da 4.
Pero **si el backend añade un 5º al catálogo**, el `<select>` lo ofrecería
(línea 1814 mapea `jobTypeOptions` sin filtrar) y `buildJobPayload` devolvería
`{}` → el backend rechaza con `invalid_*_payload`. El acoplamiento es frágil por
construcción: dos listas que deben coincidir y nada las obliga a hacerlo.

---

## 2. 🔴 Hallazgo de seguridad: cero RBAC en el backend de jobs

**Ningún handler de `jobs.controller.ts` verifica rol.** No hay `requireRole`,
ni `requireTenantAdmin`, ni chequeo de `ADMIN`/`OWNER` en las rutas ni en los
controladores. Verificado por ausencia: `grep -iE "role|OWNER|ADMIN"` sobre el
controlador no devuelve nada.

La única defensa es **la UI**: `Jobs.jsx:529` calcula `canManageJobs` y esconde
el formulario a los `USER`. Pero eso es cosmético — cualquier miembro del tenant
con una sesión válida puede `POST /devices/:id/jobs` directo y lanzar un
`software_install`, un `patch_install` o un `agent_update` (payload validado
pero rol no).

Lo que **sí** está bien: el scoping por tenant es correcto y consistente.
`getJobHandler`, `retryJobHandler` y `cancelJobHandler` comparan
`job.tenant_id === req.tenantId` y devuelven `403 tenant_mismatch`. Un tenant no
puede tocar los jobs de otro. El agujero es de **rol dentro del tenant**, no
cross-tenant.

Es el hallazgo más serio del análisis y el más barato de cerrar: un
`requireRole("ADMIN","OWNER")` en las rutas mutadoras (`POST .../jobs`,
`/retry`, `/cancel`) lo resuelve. **Coincide con el patrón de otras superficies
del producto que sí lo tienen** (policies, compliance).

---

## 3. Bugs y defectos de funcionamiento

### 3a. El detalle nunca muestra el RESULTADO del job
`device_jobs` tiene columna `result_json` — lo que el agente devuelve al
completar (qué se instaló, qué parches aplicaron, salida del dry-run). El panel
de detalle (línea 2291) **solo muestra `payload_json`**. El operador ve qué
*pidió*, jamás qué *pasó*. Para `patch_remediate` en modo `dry_run` —cuyo único
propósito es devolver un resultado sin actuar— esto vacía la función entera.

### 3b. "Created By" incoherente entre tabla y detalle
La tabla resuelve el email (`created_by_email || created_by`, línea 1183) porque
`listTenantJobs` hace `LEFT JOIN TenantMember`. Pero el detalle de un job
individual muestra el **sub crudo** `auth0|abc123` (línea 2221) porque `getJob`
del backend hace `SELECT *` sin el JOIN. Clic en una fila → el nombre cambia de
email legible a subject técnico. Arreglo: replicar el JOIN en `getJob`.

### 3c. Tope de 200 jobs, sin paginación real
`listTenantJobs(tenantId, { limit: 200 })` (línea 687) y el historial se deriva
de ese array en memoria. **Tenant 1 ya tiene 140 jobs**; a este ritmo cruza 200
pronto, y entonces el 201º más antiguo desaparece del historial —incluyendo los
filtros y la búsqueda, que operan sobre el array truncado, no sobre el backend—.
No hay señal al usuario de que está viendo una ventana. El endpoint soporta
`limit`, pero no hay cursor ni offset.

### 3d. El filtro de tipo entrante no existe
La página lee `?status=`, `?search=` y `?highlightJobId=` de la URL
(`initialFilters`, línea 589) pero **no `?type=`**. Overview, Assets y otras
páginas enlazan a Jobs; ninguna puede pre-filtrar por tipo de job. Asimetría
barata de cerrar.

---

## 4. Ergonomía

**Lo que está bien** (y conviene conservar):
- Auto-refresh homologado con el resto del app (el commit de 17-ago arregló un
  bug real: la tabla se quedaba en "Pending" para siempre).
- Agrupación de dispatches multi-device en una fila de batch con drill-down.
- Flash + scroll a la fila recién despachada, compartido con el deep-link de
  JobTracker.
- Resolución de `(platform, arch)` para versiones de agente, con el cuidado
  explícito de **no** hacer un default silencioso a x64 en Windows (fue un bug
  real en Surface arm64).

**Fricciones:**
- **El formulario no filtra tipos por plataforma/capacidad del device.** Ofrece
  `patch_scan` a un Linux, `agent_update` a un device offline sin avisar del
  desfase. El backend gatea al ejecutar (`isLifecycleHiddenDevice`, validación de
  payload), pero el usuario solo se entera del rechazo tras despachar.
- **Un solo tipo por dispatch.** Un flujo común —"scan y luego install"— son dos
  viajes al formulario.
- **El panel de detalle es fijo, no drawer.** En pantallas `lg` roba una columna
  permanente aunque no haya job seleccionado (muestra el placeholder "Select a
  job").

---

## 5. Código muerto y deuda menor

- `validateNumericField` acepta un tercer parámetro `required` que **ningún
  llamador pasa** (líneas 1230, 1240 solo mandan `{min,max}`). Rama muerta.
- `DEFAULT_TENANT_FANOUT_ARCH = "x64"` (línea 128) — usado, pero encapsula la
  misma suposición que el código de al lado documenta como peligrosa para
  Windows. No es muerto, es un olor.
- El endpoint `/devices-connected` existe en el backend pero la página **no lo
  usa** — deriva `connectedDeviceIds` filtrando `knownDevices` en memoria
  (línea 573). Correcto para la cuenta, pero significa que "connected" refleja el
  último `knownDevices` cacheado (staleMs 60s), no el estado de sesión en vivo.

---

## 6. Cobertura de tests

`jobBatches.test.js` — 6 tests, solo la lógica de agrupación de batches. **Cero
tests sobre la página**: ni construcción de payload, ni gating de targets, ni
reconciliación de selección, ni los flujos de retry/cancel. `pageSmoke` solo
verifica que renderiza. Para una página de 2339 líneas que lanza acciones
destructivas sobre la flota, es poca red.

---

## 7. Veredicto de madurez

| Dimensión | Nota | Nota breve |
|---|:---:|---|
| Cobertura funcional | 2.5/5 | 4 de 8 tipos; sin resultado de job |
| Seguridad | 2/5 | 🔴 sin RBAC en backend; scoping de tenant sí correcto |
| Ergonomía | 3.5/5 | buen refresh/batch/flash; sin gating por plataforma |
| Corrección | 3/5 | tope de 200, created_by incoherente, sin ?type |
| Código muerto | 4/5 | poco; una rama y un par de olores |
| Tests | 2/5 | solo jobBatches; nada de la página |

**Madurez global ≈ 2.8/5.** No es una página podrida — su infraestructura
(refresh, batch, deep-link) es sólida y reciente. Está **desalineada del
dominio**: el orquestador creció a 8 tipos con resultados estructurados y RBAC
pendiente, y la página se quedó modelando el mundo de 4 tipos sin resultado.

---

## 8. Backlog propuesto, por relación valor/riesgo

**P0 — barato y de alto impacto**
1. **RBAC en el backend de jobs.** `requireRole("ADMIN","OWNER")` en las rutas
   mutadoras. Cierra el único hallazgo de seguridad; es el patrón que ya usan
   otras superficies.
2. **Mostrar `result_json`** en el panel de detalle. Un bloque más, junto al
   payload. Desbloquea el valor de `patch_remediate dry_run` y de cualquier job
   con salida.
3. **`getJob` con el JOIN de TenantMember** para que "Created By" sea coherente.

**P1 — la brecha que motivó el análisis**
4. Separar **catálogo de etiquetas** (los 8, para el historial) de **tipos
   creables** (subconjunto de operador: +`software_install`, +`patch_remediate`).
   Ambos servidos por el backend, no hardcodeados en la UI.
5. `buildJobPayload` guiado por el `payloadSchema` del catálogo, para que
   catálogo y formulario no puedan volver a divergir.

**P2 — ergonomía y escala**
6. Paginación real del historial (cursor sobre `created_at`), o al menos avisar
   del tope de 200.
7. `?type=` en los deep-links entrantes.
8. Gating del `<select>` de tipo por plataforma/estado del device seleccionado.

**P3 — deuda**
9. Tests de la página: payload, gating, retry/cancel.
10. Quitar la rama `required` muerta de `validateNumericField`.


---

## Estado de implementación (2026-08-24)

- **P0-1 RBAC** — hecho. `requireRole("ADMIN","OWNER")` en las 4 rutas mutadoras; lecturas abiertas. (`0dc0a30`)
- **P0-2 result_json en el detalle** — hecho. Bloque "Result" + `getJob` con JOIN para el email coherente. (`8d96c7b`, `7760c0a`)
- **P1 catálogo de 8 tipos + `creatable`** — hecho. El historial etiqueta y filtra los 8; el formulario ofrece solo los creables. (`f218a1d`, `bb20a71`)
- **P2 tope + aviso de truncado** — hecho. Ventana con techo de 500, flag `truncated`, banner en la UI. (`32f33b3`, `9c817cf`)
- **P2 `?type=` deep-link** — hecho. (`9c817cf`)
- **P2 gating del select por plataforma** — DIFERIDO. El backend ya rechaza al ejecutar; la lógica (matrices por tipo, targets multi-plataforma) es más superficie que el valor actual. Pendiente si se vuelve un problema real de campo.
- **P3 tests de la página, quitar rama muerta de `validateNumericField`** — pendiente.
