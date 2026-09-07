# Reports page — auditoría y plan de rediseño (2026-09-07)

Auditoría de `src/pages/Reports.jsx` (629 líneas) y sus seis componentes contra
el contrato real del backend (`modules/reports/*` en `certusws-tracenium`) y
contra la base de producción.

Toda afirmación está verificada contra código o contra la base, no inferida.

**Contexto de por qué ahora.** Entre el 06 y el 07-sep se enlazaron **once
páginas** a Reports con un botón "Report" (Overview, Asset Management, Software
Delivery, Security Compliance, Remote Control, Patch Management, Crypto
Discovery, MDM/MAM, Alerts, Jobs, Audit) y se retiraron cuatro puertas de export
que esquivaban el ledger. Reports pasó de ser una pantalla que casi nadie abría
a ser el destino de todo lo que se genera.

**Punto de partida medido (2026-09-07, control DB de producción):**

| tabla | filas |
|---|---:|
| `report_runs` | 0 |
| `report_schedules` | 0 |
| `grc_targets` | 0 |
| `grc_deliveries` | 0 |

La página nunca se ha usado. Nada de lo que sigue es una regresión: es deuda
que no se había cobrado porque no había tráfico.

---

## 1. Lo que hay hoy

Cuatro `Paper` apilados en un scroll único, sin pestañas y sin cabecera
canónica:

```
Reports                                    ← <Typography variant="h5">, no PageHeader
┌─ Catalog ─────────────────────────────┐  ← DataGrid, 4 columnas
│ Group │ Report │ Description │ Run now │    la última celda: hasta 5 botones
└───────────────────────────────────────┘
┌─ Schedules ───────────────────────────┐  ← DataGrid, 8 columnas
└───────────────────────────────────────┘
┌─ GRC connector ───────────────────────┐  ← panel propio: claves + destinos + entregas
└───────────────────────────────────────┘
┌─ Recent runs ─────────────────────────┐  ← DataGrid, 7 columnas, limit=20 fijo
└───────────────────────────────────────┘
```

Diálogos: `ReportParamsDialog`, `EmailReportDialog`, `ScheduleReportDialog`,
`FleetHealthPreview`.

---

## 2. Hallazgos

### A · Funcional — trabajo que la API permite y la pantalla no

**A1 · Una programación no se puede editar.** `PATCH /reports/schedules/:id`
acepta `format`, `params`, `periodMonths`, `recipientMemberIds`,
`recipientExternal` y `targetIds`. La UI sólo usa el interruptor `enabled`
(`Reports.jsx:242`). Cambiar un destinatario obliga a **borrar y recrear**, y
con eso se rompe el vínculo con su historial: los runs anteriores apuntan por
`report_runs.schedule_id` a una programación que ya no existe.

**A2 · La re-entrega manual a GRC no tiene botón.** `deliverRunToGrcTarget`
está en `src/api/reports.js` con **cero consumidores**. Es exactamente lo que la
fase R0.2 vino a habilitar —se migró la forma de `params` para que un run manual
se pudiera re-entregar— y no hay dónde pulsar. La API del backend
(`POST /reports/grc/targets/:id/deliver`) está viva y probada.

**A3 · El historial está capado a 20 filas, sin filtros ni paginación.** La UI
pide `getReportRuns({ limit: 20 })`; el backend admite hasta 500 pero **no
acepta ningún filtro**: `listRuns(tenantId, limit)` es un `SELECT * … ORDER BY
started_at DESC LIMIT $2`. Con seis tipos y una programación mensual, 20 filas
no cubren un trimestre. No se puede buscar por tipo, estado, actor ni periodo.

**A4 · Programar sólo se puede desde una fila del catálogo.** La sección
*Schedules* no tiene "New schedule". Quien entra a gestionar programaciones ha
de adivinar que se crean en otra tabla, más arriba.

**A5 · Vista previa para 1 de 6 tipos.** `PREVIEW_BY_KEY` sólo cubre
`global.fleet-health`. El evidence pack —el informe caro, el que se firma y se
entrega a un auditor— se genera a ciegas.

### B · La página tira datos que el backend ya le manda

`listRunsHandler` envía por cada run: `params`, `recipients`, `sent`,
`scheduleId`, `bytes`, `filename`. **La tabla no muestra ninguno.**

No se puede responder, con la pantalla delante:

- *¿a quién se le mandó este informe?* (`recipients`, `sent`)
- *¿con qué alcance se generó?* (`params` — framework, periodo, grupo)
- *¿de qué programación salió?* (`scheduleId`)

Son las tres preguntas que justifican tener un ledger. El dato ya viaja por el
cable y se descarta en el render.

Lo mismo con las entregas GRC: viven en el panel del conector (últimas 10) y
**no se cruzan con el run que las originó**, aunque `grc_deliveries.run_id`
existe.

### C · UX y consistencia con el resto del portal

| | Hallazgo |
|---|---|
| C1 | Única página del MENÚ sin `PageHeader`: sin icono, sin subtítulo y **sin slot de acciones**. (Las otras siete sin cabecera son pestañas internas de Assets o pantallas especiales.) |
| C2 | Y por eso, **sin control de refresco** — la única página de datos vivos que no lo tiene. |
| C3 | Cuatro `Paper` en un scroll. El resto del portal (Assets, SCP, SDP, CDP, RCP, PMP) usa pestañas. |
| C4 | La celda de acciones del catálogo mete hasta **cinco botones en 340 px** (uno por formato + Preview + Email + Schedule). |
| C5 | El grupo del tipo se pinta como **columna de texto** en vez de agrupar, teniendo `group` del servidor (Global/SCP/PMP/CDP/Audit). |
| C6 | El panel GRC mezcla **configuración** (claves, destinos) con **operación** (entregas) en la página principal. |
| C7 | A un miembro sin permisos de GRC le sale un **error rojo** en mitad de la página: el 403 de `listApiKeys` se pinta como fallo, no como "esto no es para ti". |
| C8 | Estados vacíos sin salida: un catálogo vacío (tenant sin plugins) no explica por qué; un historial vacío no dice que se llena solo. |

### Severidad

| | Hallazgos | Efecto |
|---|---|---|
| **P1** | A1, A2, A3 | Trabajo que la API permite y la pantalla no |
| **P2** | B, A4, A5 | La página no contesta lo que ya sabe |
| **P3** | C1–C8 | Se presenta peor que cualquier otra, y es a donde llega todo |

---

## 3. Propuesta de UI

### 3.1 Forma general

Cabecera canónica + cuatro pestañas, homologadas con Asset Management:

```
┌────────────────────────────────────────────────────────────────────┐
│ 📊 Reports                                    [Auto refresh ▾] [↻] │
│    Generate, schedule and trace every report this tenant produces. │
├────────────────────────────────────────────────────────────────────┤
│ ▸ Catalog │ Schedules │ History │ Settings                         │
└────────────────────────────────────────────────────────────────────┘
```

Cuatro razones para estas cuatro y no otras:

- **Catalog** contesta *"¿qué puedo sacar?"* — es la puerta de los once botones.
- **Schedules** contesta *"¿qué sale solo?"*.
- **History** contesta *"¿qué salió, quién se lo llevó y es el fichero que
  firmé?"*. Es el ledger, y hoy es lo peor servido.
- **Settings** contesta *"¿por dónde sale hacia fuera?"* — claves de API y
  destinos GRC son configuración, no operación diaria.

La pestaña llega en la URL (`?reportsTab=`), como el resto del portal, para que
los once botones puedan apuntar a la que toque.

### 3.2 Catalog — tarjetas, no tabla

```
Global ─────────────────────────────────────────────────────────────
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Fleet Health Report          │ │ Audit Events                 │
│ Resumen ejecutivo: equipos,  │ │ Rastro de eventos de         │
│ cumplimiento, parches, …     │ │ seguridad y operación.       │
│                              │ │                              │
│ [JSON] [CSV] [PDF]           │ │ [CSV]                        │
│ Último: hace 2 h · ok        │ │ Nunca generado               │
│ 👁 Preview  ✉ Email  🗓 Schedule│ │ ✉ Email  🗓 Schedule          │
└──────────────────────────────┘ └──────────────────────────────┘

SCP ────────────────────────────────────────────────────────────────
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Evidence Pack        [params]│ │ Compliance Evidence          │
│ …                            │ │ …                            │
```

- Agrupadas por `group`, que ya viene del servidor.
- **Último run y su estado en la propia tarjeta** — el dato está en
  `report_runs` y hoy exige bajar a otra tabla para verlo.
- Los formatos como chips que generan; Preview / Email / Schedule como acciones
  secundarias. Cinco botones en una fila de tabla caben mal; en una tarjeta,
  respiran.
- Un chip `params` avisa de que ese tipo va a preguntar antes de generar, en vez
  de sorprender con un diálogo.
- **Vacío honesto**: "Este tenant no tiene ningún plugin que produzca informes"
  y no una tabla en blanco.

### 3.3 Preview — para los cinco tipos que pueden

El preview pide el JSON **por el motor** (`?preview=1`, que ya no ensucia el
ledger). Matriz real de lo que hay hoy:

| tipo | formatos | preview posible |
|---|---|:---:|
| `global.fleet-health` | json, csv, pdf | ✅ (ya existe) |
| `scp.compliance-evidence` | csv, json, pdf | ✅ |
| `scp.evidence-pack` | pdf, json | ✅ |
| `pmp.cve-exposure` | json, csv, pdf | ✅ |
| `cdp.cbom` | json | ✅ |
| `audit.events` | **csv** | ❌ — le falta `json` |

Añadir `json` a `audit.events` en el registro cierra dos cosas de una: habilita
su preview **y** repone por el motor el export JSON que se quitó de la página de
Audit el 07-sep.

El preview vive detrás de un registro por clave (`PREVIEW_BY_KEY`), no de una
casilla del catálogo: una vista previa no es genérica, hay que saber qué
significan los campos de ESE informe. Un tipo sin entrada no ofrece el botón.

### 3.4 Schedules — crear, editar y entender

```
Schedules                                        [+ New schedule]
┌────────────────────────────────────────────────────────────────┐
│ Evidence Pack · PDF                              ● Enabled  ⋮  │
│ CIS Win11 · últimos 3 meses · grupo "Servidores"               │
│ → 4 destinatarios · 1 destino GRC (Drata hook)                 │
│ Próxima: 1 oct 06:00 UTC · Última: 1 sep · ok                  │
└────────────────────────────────────────────────────────────────┘
```

- Fichas, no filas: una programación tiene alcance, destinatarios, destinos y
  dos fechas — siete columnas apretadas no lo cuentan.
- **`[+ New schedule]` aquí**, además de en la tarjeta del catálogo.
- **Editar de verdad**: el mismo diálogo en modo edición, mandando el `PATCH`
  que el backend ya acepta. Sin esto, cambiar un correo destruye el historial.
- Los **destinos GRC por nombre**, no por cuenta: "1 destino" no dice si es el
  bueno.
- El menú `⋮`: *Run now*, *Edit*, *Duplicate*, *Delete* (con confirmación, que
  ya existe).
- **Vacío con salida**: el botón de crear, no un párrafo.

### 3.5 History — el ledger, por fin legible

```
History        [Tipo ▾] [Estado ▾] [Origen ▾] [Actor…] [Desde][Hasta]  ⟳
┌────────────────────────────────────────────────────────────────────┐
│ 1 sep 06:00 │ Evidence Pack │ PDF │ schedule #3 │ 2,1 MB           │
│   ok · a 4 destinatarios (4 enviados) · CIS Win11 · jul–sep        │
│   sha256 9f2a…c1  [⬇ Descargar]  [↗ Re-entregar a GRC ▾]           │
├────────────────────────────────────────────────────────────────────┤
│ 1 sep 06:00 │ ⚠ falló  webhook returned 500 · reintentado 2 veces   │
└────────────────────────────────────────────────────────────────────┘
```

Lo que aparece y hoy no: **alcance** (`params`), **destinatarios y cuántos se
enviaron**, **de qué programación salió** (con enlace a su ficha), **tamaño**,
**entregas GRC del run** y **re-entrega manual** (A2).

- **Filtros y paginación en el servidor.** El cliente no puede filtrar lo que no
  se ha traído, y traerse 500 filas para filtrar en memoria es la trampa que
  parece funcionar hasta el primer tenant con volumen.
- El hash y el error, **texto visible** — ya se arregló en R0.4 y se conserva.

### 3.6 Settings — configuración, separada de la operación

Lo que hoy es el panel GRC, movido aquí y partido en tres bloques: **API keys**
(pull), **Push targets** (webhook / Vanta) y **Recent deliveries** (que ya se
añadió el 06-sep).

Para un miembro sin permiso, la pestaña dice *"La configuración del conector GRC
la gestionan los administradores del tenant"* — no un error rojo (C7).

### 3.7 Detalles transversales

- **Responsive**: tarjetas en grid que colapsa a una columna; los filtros del
  historial en una fila propia bajo la cabecera, como en Security Compliance.
- **Permisos**: cada pestaña decide qué enseña con el rol EFECTIVO del servidor
  (`getMyCapabilities`), nunca con `auth.role` — en sesión MSP no es el mismo.
- **Refresco**: `RefreshControl` en la cabecera, con nonce a las cuatro
  pestañas. Es la lección de esta semana: un refresco que sólo alcanza a la
  pestaña que su autor tenía delante miente sin que se note.

---

## 4. Plan por fases

Cada fase es desplegable por sí sola y deja la página mejor que antes. Cada
punto lleva un test que falla si se revierte.

### U1 · La cabecera y el esqueleto · ~medio día

1. `PageHeader` canónico con icono, subtítulo y slot de acciones.
2. `RefreshControl` + `refreshNonce` a las cuatro secciones.
3. Cuatro pestañas con la pestaña en la URL (`?reportsTab=`), homologadas con
   Asset Management. El contenido se mueve **tal cual**: sin rediseño todavía.

Sale ya: la página deja de ser la peor presentada del portal y gana refresco.

### U2 · El historial · ~2 días · **toca backend**

4. `GET /reports/runs` acepta filtros (`key`, `status`, `trigger`, `actor`,
   `from`, `to`) y pagina en servidor devolviendo `total`.
   ⚠️ **SQL armado con plantillas → itest obligatorio** contra Postgres real: es
   exactamente el patrón que ya dejó dos gráficas en blanco seis días con los
   unitarios en verde. El total sale de la MISMA consulta (`COUNT(*) OVER()`),
   no de una segunda.
5. La tabla enseña lo que el DTO ya manda: alcance, destinatarios/enviados,
   programación de origen, tamaño.
6. Entregas GRC por run, cruzando `grc_deliveries.run_id`.
7. Re-entrega manual desde el historial (A2): consumidor de
   `deliverRunToGrcTarget`.

Índices: `report_runs_tenant_idx (tenant_id, started_at DESC)` ya existe y
cubre el orden. Si el filtro por tipo se vuelve lento **con datos reales**, se
añade entonces — con 0 filas hoy, un índice especulativo es adivinar.

### U3 · Programaciones y catálogo · ~2 días

8. Editar una programación (A1): `ScheduleReportDialog` en modo edición contra
   el `PATCH` que ya existe.
9. "New schedule" desde la pestaña (A4).
10. Fichas de programación con alcance, destinatarios y destinos **por nombre**.
11. Catálogo por tarjetas agrupadas, con último run y su estado.

### U4 · Vista previa y ajustes · ~1 día

12. Preview para los cuatro tipos que hoy pueden y no tienen
    (`scp.compliance-evidence`, `scp.evidence-pack`, `pmp.cve-exposure`,
    `cdp.cbom`).
13. `json` en `audit.events` (backend, una línea en el registro) → su preview y
    el JSON que se retiró de la página de Audit.
14. GRC a la pestaña de Settings, con el mensaje de permiso en vez del error
    rojo (C7).

---

## 5. Decisiones que son tuyas

1. **¿Cuatro pestañas o tres?** *Settings* podría fundirse con *Schedules* si
   prefieres menos superficie. La separación que propongo es "lo que sale" vs
   "por dónde sale".
2. **¿El preview del evidence pack enseña el PDF o el JSON?** El JSON es lo que
   hay; renderizar el PDF en el navegador es otra pieza (y otro peso de bundle).
3. **`audit.events` en JSON**: lo repone o no. Hoy es la única forma de volver a
   tener el export JSON que se quitó de Audit.
4. **Presets de parámetros guardables** (ítem 22 de R3): fuera de este plan;
   pide una tabla nueva y una decisión de a quién pertenece el preset.

---

## 6. Seguimiento

Estado por ítem: `pendiente` · `en curso` · `hecho (commit)` · `desplegado (fecha)`.

| Fase | Ítem | Repo | Estado | Evidencia |
|---|---|---|---|---|
| U1 | PageHeader + subtítulo + acciones | UI | pendiente | |
| U1 | RefreshControl + nonce a las 4 secciones | UI | pendiente | |
| U1 | Cuatro pestañas con estado en la URL | UI | pendiente | |
| U2 | `/runs` con filtros + paginación en servidor (**itest**) | backend | pendiente | |
| U2 | Historial: alcance, destinatarios, origen, tamaño | UI | pendiente | |
| U2 | Entregas GRC por run | UI | pendiente | |
| U2 | Re-entrega manual desde el historial | UI | pendiente | |
| U3 | Editar programación (PATCH) | UI | pendiente | |
| U3 | "New schedule" desde la pestaña | UI | pendiente | |
| U3 | Fichas de programación con destinos por nombre | UI | pendiente | |
| U3 | Catálogo por tarjetas con último run | UI | pendiente | |
| U4 | Preview para los 4 tipos que faltan | UI | pendiente | |
| U4 | `json` en `audit.events` | backend | pendiente | |
| U4 | GRC a Settings + mensaje de permiso | UI | pendiente | |
