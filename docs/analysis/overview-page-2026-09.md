# Overview — auditoría y refactor por plan (2026-09-12)

Auditoría de `src/pages/Overview.jsx` (379 líneas) y sus 13 componentes en
`src/components/Overview/` contra el contrato real del backend
(`certusws-tracenium`) y contra el modelo de tiers de ADR-0010.

Toda afirmación sobre un endpoint está verificada contra su handler, no inferida.

**Por qué ahora.** Es la página de aterrizaje tras el login y la que más tiempo
lleva sin rediseño. Desde su última pasada entraron tres plugins (SDP, RCP, CDP)
y el modelo de suscripción por tiers, y la página no se enteró de ninguno.

---

## 1. El modelo que la página tiene que respetar

`modules/policies/plugin-catalog.ts` + `modules/licensing/tiers.ts`. Los tiers
son **aditivos**:

| Tier | Plugins que añade | Acumulado |
|---|---|---|
| Starter | AMP (Asset Management), SDP (Software Delivery) | amp, sdp |
| Professional | SCP (Security Compliance), RCP (Remote Control) | + scp, rcp |
| Enterprise | PMP (Patch Management), CDP (Crypto Discovery) | + pmp, cdp |

MDM/MAM es **otra línea de producto**, no un escalón de esta escalera.

La UI no puede leer el nombre del tier salvo siendo OWNER (`/billing/summary`).
Lo que sí ve cualquier miembro es `GET /policies/plugins/catalog` → `entitled`,
la lista de plugins que el plan concede (el trial los abre todos). Es lo que
usa `usePluginCatalog().isEntitled`, y es la señal correcta: gatear por plugin
concedido es gatear por plan, sin que la UI tenga que saber cómo se llama.

⚠️ `entitled: null` = el backend no pudo resolverlo. **Distinto de "nada"**:
la convención del hook es fallar abierto, y aquí se respeta.

## 2. Lo que hay hoy

Seis filas. De qué plugin sale cada card y qué pasa en un tenant Starter:

| Fila | Card | Datos de | En Starter |
|---|---|---|---|
| 1 | KPI Devices | AMP | ✅ |
| 1 | KPI Online now | AMP | ✅ |
| 1 | KPI Compliance | **SCP** | "—" |
| 1 | KPI Critical findings | **SCP** | 🔴 **"0 · no open high-severity findings", en verde** |
| 1 | KPI Jobs in flight | núcleo | ✅ |
| 1 | KPI Unread alerts | núcleo | ✅ |
| 1.5 | License usage | núcleo | ✅ |
| 2 | Donut OS platform | AMP | ✅ |
| 2 | Donut Agent versions | AMP | ✅ |
| 2 | Donut "Patch coverage" | **SCP** (`patchSummary` de `/compliance/devices`) | vacío |
| 2 | Plugin coverage strip | políticas | ✅ |
| 3 | Attention required | mezcla | ver §3 |
| 3 | Audit events 7d | núcleo | ✅ |
| 3.5 | Compliance trend 30d | **SCP** | vacío |
| 3.5 | Health distribution | **SCP** | vacío |
| 4 | Jobs by status 7d | núcleo | ✅ |
| 4 | Latest alerts | núcleo | ✅ |
| 5 | Recent activity (hosts + jobs) | AMP + núcleo | ✅ |

### 2.1 Starter se muere

Cinco de las dieciocho piezas dependen de SCP y Starter no lo trae. Dos KPIs
de la fila de arriba enseñan "—", tres cards salen vacías — y la peor no está
vacía: **Critical findings dice 0 en verde** a un cliente que no tiene el
plugin que busca hallazgos. `/security/compliance/summary` no tiene gate de
derechos, contesta `openFindings: 0` y la card lo lee como "todo bien". Es una
afirmación de seguridad falsa en la primera pantalla del producto.

### 2.2 Plugins sin card

| Plugin | Tier | Presencia en Overview |
|---|---|---|
| SDP | Starter | ninguna |
| RCP | Professional | ninguna |
| PMP | Enterprise | ninguna — el donut "Patch coverage" es de SCP, no de PMP |
| CDP | Enterprise | ninguna |
| MDM/MAM | línea aparte | ninguna |

SDP es la mitad del plan Starter y no aparece. El donut rotulado "Patch
coverage" hace creer que PMP está representado: lee la antigüedad del último
parche del SO que reporta SCP, no el estado de campaña de PMP.

### 2.3 Cards que no aportan a un overview

- **Plugin coverage strip** — "cuántos equipos tienen el plugin X en la
  política". Es configuración, no estado; su sitio es Agent Settings, que ya
  lee el mismo endpoint (`getPluginCoverageSummary`).
- **Recent activity** — los 5 hosts con inventario más reciente (ordenar por
  `collectedAtUtc` no dice nada operativo) y un recorte del último día de la
  misma serie que ya pinta la gráfica de Jobs. Duplicado + ruido.
- **KPI Jobs in flight** — repite la serie de la gráfica de Jobs. Lo accionable
  es lo que FALLÓ, no lo que está en cola.
- **KPI Critical findings** — repite la fila de Attention (y en Starter miente).

### 2.4 Bugs encontrados

1. **"devices offline >24h" es siempre 0.** `AttentionPanel` lee
   `dashboard.offlineOver24h ?? offline24h`; `/dashboard/summary` no devuelve
   ninguno de los dos. La fila no ha aparecido nunca. Lo que sí devuelve es
   `inactiveAssets7d`.
2. **La ventana de certificados que caducan se ignora.** `getExpiringCertificates`
   manda `?withinDays=`; el controlador lee `?days=`. Hoy da igual (el
   defecto es 30), pero cualquier otro valor se perdería en silencio.
3. **"failed events last 24h" tiene `key: "failed_jobs"`** y cuenta errores del
   log de auditoría, no jobs. Rótulo, clave y ventana no dicen lo mismo.
4. **Los filtros de los enlaces a Assets no hacen nada.** `?filter=online`,
   `?filter=offline`, `?versionBucket=` — `pages/Assets.jsx` no lee la URL. El
   enlace abre la página sin filtrar. (Fuera de alcance aquí; ver §6.)
5. **El índice device→hostname del cliente sobra.** Se construía a partir de
   `/dashboard/hosts?pageSize=5` — o sea, sólo resolvía 5 equipos. El feed de
   alertas ya trae `hostname` desde el servidor (`withHostnames: true`).

## 3. Diseño: tres bloques, uno por plan

Cada bloque es **una unidad de gate**: se monta o no se monta, y si no se
monta **no pide nada**. Gatear un bloque = no renderizarlo; no hay cards que
se esconden una a una dentro de una rejilla que queda coja.

```
┌─ Bloque 1 · Fleet & operations ─────────────── todos los planes ─┐
│ KPIs: Devices · Online now · Deployments in progress (SDP) ·    │
│       Failed jobs 7d · Unread alerts                            │
│ License usage                                                   │
│ OS platform · Agent versions │ Software delivery (SDP)          │
│ Attention required │ Latest alerts │ Reports                    │
│ Jobs by status │ Audit events                                   │
└─────────────────────────────────────────────────────────────────┘
┌─ Bloque 2 · Security & access ─────────────── Professional+ ─────┐
│ KPIs: Compliance · Critical findings · Remote-ready · Sessions 7d│
│ Compliance trend │ Health distribution │ OS patch recency        │
└─────────────────────────────────────────────────────────────────┘
┌─ Bloque 3 · Patching & crypto ─────────────── Enterprise ────────┐
│ Patch management │ Crypto discovery                              │
└─────────────────────────────────────────────────────────────────┘
  (plan inferior) una sola línea: qué bloques no incluye tu plan
```

**Bloque 1 es el producto Starter entero** y tiene que sostenerse solo: AMP +
SDP + lo que existe en cualquier plan (alertas, jobs, informes, auditoría,
licencias). Un Starter ve una página completa, no una con huecos.

### 3.1 Reglas de visibilidad (`overviewPlan.js`)

- Bloque 1: **siempre**. Es el suelo, igual que `entitlementFloor()` en el
  backend nunca quita AMP.
- Bloques 2 y 3: visibles si el plan concede **alguno** de sus plugins; cada
  card dentro se gatea por SU plugin (una card de RCP no aparece por tener SCP).
- `entitled` desconocido **mientras carga**: sólo el bloque 1. Montar los otros
  a ciegas dispararía peticiones que un Starter recibe con 402.
- `entitled` desconocido **tras cargar** (el backend no pudo resolverlo):
  todos. Misma convención que `isEntitled` — esconder de más deja tirado a
  quien pagó; mostrar de más cuesta un estado vacío.
- El SDP del bloque 1 se gatea por plugin igualmente: un tenant sin fila de
  suscripción cae al suelo (sólo AMP) y `/software-delivery` le daría 402.

### 3.2 Lo que no incluye el plan

Una sola línea al final, no un bloque fantasma con candados: nombra los
bloques que faltan, el tier que los trae y sus plugins por su nombre de menú.
Nada de beneficios inventados (ver memoria "No inventar beneficios de plan").
"View plans" sólo para OWNER, que es el único rol que puede abrir Billing; el
resto lee "ask your tenant owner".

### 3.3 Datos

El bundle único (`fetchOverviewBundle`, 16 peticiones siempre) se parte en
tres cargadores, uno por bloque, cada uno con su entrada de caché y
`enabled` atado a la visibilidad del bloque. Starter pasa de 16 peticiones a
las que su plan puede contestar.

Salen del bundle: `hardwareRankings` (sin consumidor), `certsSummary` (sin
consumidor), `auditSummary` (sólo alimentaba la fila mal rotulada),
`recentHosts` (índice de 5 hosts, ver bug 5), `pluginCoverage` (card retirada).

Entran: `/software-delivery/analytics/timeseries?window=30d`,
`/software-delivery/deployments?status=running|queued`, `/reports/runs?limit=1`
(el `total` sale de `COUNT(*) OVER()`), `/remote-control/summary`,
`/patch-management/summary`, `/cdp/summary`. Todos baratos (un agregado).
Descartados por pesados para una portada: `/vulnerabilities/exposure`
(8,7k CVEs × apps de cada equipo en memoria) y `/cdp/pqc`.

⚠️ `/remote-control/summary` exige ADMIN/OWNER + capacidad `remote_control`.
Un USER con plan Professional recibe 403: las KPIs de RCP no se pintan, el
resto del bloque sí.

## 4. Qué se retira y adónde va

| Pieza | Destino |
|---|---|
| Plugin coverage strip | fuera (Agent Settings ya tiene el dato) |
| Recent activity | fuera |
| KPI Jobs in flight | sustituida por Failed jobs 7d |
| KPI Compliance / Critical findings | bloque 2 |
| Donut "Patch coverage" | bloque 2, rotulado **OS patch recency** (es SCP) |
| Compliance trend / Health distribution | bloque 2 |
| Fila "failed events" de Attention | fuera (la gráfica de auditoría ya separa errores) |
| Fila "offline >24h" (siempre 0) | "not seen in 7 days" con `inactiveAssets7d` |

## 5. Tabla de seguimiento

Estado por ítem: `pendiente` · `en curso` · `hecho (commit)` · `desplegado (fecha)`.

| Fase | Ítem | Repo | Estado | Evidencia |
|---|---|---|---|---|
| O1 | Resolver de plan: bloques visibles y bloqueados por `entitled` | UI | hecho (`16988f4`) | `overviewPlan.js`. Mientras carga, sólo el bloque 1 (montar los otros a ciegas manda a un Starter peticiones que dan 402); si el backend no resuelve, falla abierto. `overviewPlan.test.js`, 9 casos; hacer visible todo bloque tumba 5 tests entre plan y página. |
| O1 | Cargadores por bloque (sustituyen al bundle único) | UI | hecho (`16988f4`) | `fetchOverviewCore/Security/Operations`, cada uno con su caché y `enabled`. Un plugin no concedido no se pide: su slot queda ausente, no rechazado. Starter: 14 peticiones en vez de 16 — ninguna de SCP, y 3 son de SDP, que antes no se pedía. Quitar el gate de SDP o SCP en el cargador tumba su test. |
| O2 | Bloque 1: KPIs Starter + card de Software Delivery + card de Reports | UI | hecho (`16988f4`) | KPIs: Devices, Online now, Deployments in progress (SDP), Failed jobs 7d, Unread alerts. La rejilla crece con el número de cards (`lg: grow`) para que un tenant sin SDP no deje un hueco. Reports no pinta "0 schedules" a quien recibe 403. |
| O2 | Attention: `inactiveAssets7d`, `?days=`, instalaciones fallidas; fuera la fila de auditoría | UI | hecho (`16988f4`) | Volver a `offlineOver24h` o a `withinDays` tumba su test. |
| O3 | Bloque 2: KPIs de SCP/RCP + trend/health/patch recency | UI | hecho (`16988f4`) | ⚠️ Sin equipos reportando, Critical findings dice "—" y "no device has reported yet", no un 0; pintar el 0 tumba el test. Un 403 de RCP (USER) quita sus dos KPIs en vez de enseñar "—". El donut pasa a "OS patch recency". |
| O4 | Bloque 3: cards de Patch Management y Crypto Discovery | UI | hecho (`16988f4`) | Una petición fallida dice "Couldn't load", no ceros (test). PMP y CDP son opt-in: sin equipos reportando la card lo explica. Exposición a CVEs y PQC fuera por pesadas. |
| O5 | Línea de plan: qué bloques no incluye y quién puede cambiarlo | UI | hecho (`16988f4`) | Nombra bloque, tier y plugins; nada más. "View plans" sólo OWNER (test con ADMIN). |
| O6 | Retirar Plugin coverage strip, Recent activity e índice de hostnames | UI | hecho (`16988f4`) | 3 ficheros fuera. `LatestAlerts` usa el `hostname` del feed; volver al índice local tumba su test. Verificado en arnés con datos simulados para los 3 planes a 1440 px y en estrecho: sin desborde ni errores de consola. |

## 6. Fuera de alcance (anotado, no hecho)

- **MDM/MAM** no tiene endpoint de resumen de móviles; el único conteo es
  `usage.mdm` en `/billing/summary`, sólo OWNER. Hace falta un agregado propio
  antes de darle card.
- **Filtros de Assets por URL** (bug 4): los enlaces siguen abriendo la vista
  sin filtrar. Es trabajo de la página de Assets, no del Overview.
- **KEV / exposición a CVEs** en la portada del bloque 3: el endpoint es
  pesado; necesitaría un agregado cacheado antes de ir en la página de entrada.
