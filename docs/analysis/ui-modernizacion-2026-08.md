# UI de Tracenium — análisis para modernización (2026-08-25)

Análisis de la interfaz del portal contra el diagnóstico del usuario: **"obsoleta
y poco amigable"**. Son dos problemas distintos con causas distintas, y conviene
no mezclarlos.

## Método, y sus límites

Medido sobre **producción** (`portal.tracenium.com`, sesión real, tenant con
datos), no sobre el código:

- Tokens de diseño realmente aplicados, muestreando `getComputedStyle` de todos
  los elementos visibles.
- Contraste calculado por luminancia relativa (WCAG 2.1) sobre cada nodo de
  texto.
- Objetivos táctiles, landmarks y estados de foco, medidos en el DOM vivo.
- Métricas de código sobre el repo.

**Límites honestos de esta pasada:**

1. **No hay capturas.** La herramienta de captura falló de forma consistente en
   este entorno, así que no hay juicio sobre composición ni jerarquía visual —
   sólo sobre lo que es medible. Un diseñador mirando pantallas encontrará cosas
   que esto no ve.
2. **El contraste tiene falsos positivos.** El cálculo resuelve el fondo subiendo
   por el DOM hasta el primer color opaco; un texto sobre **degradado** se mide
   contra blanco y sale peor de lo que es. Los ratios ~1.08 son casi seguro eso.
   Los de **1.86 sobre fondo sólido sí son reales**.
3. **Se auditaron dos pantallas en vivo** (portafolio MSP y Jobs), no las 29.
   Los hallazgos de shell (tipografía, foco, landmarks) aplican a todas; los de
   densidad son de Jobs.

---

## El hallazgo que ordena todo lo demás

**No es que falte un sistema de diseño. Es que existe y no se aplica.**

`src/theme/` contiene tema MUI, `brand.js`, `severity.js`, `chartPalette.js`,
`scoreBands.js` — con tests. Y aun así:

| medida | valor |
|---|---:|
| colores hex hardcodeados en el código | **201 ocurrencias** |
| ficheros que los contienen | **45** |
| colores distintos | **92** |
| páginas que usan el estilo compartido de tabla (`DATAGRID_SX`) | 10 |
| páginas que estilan la tabla a mano | **14** |

Más páginas se desvían del sistema que las que lo siguen. Cualquier rediseño que
no arregle *esto* primero se deshará solo: se pintará bonito y en tres meses
volverá a haber 92 colores.

---

## 1. "Obsoleta" — por qué se ve de 2016

Medido en una sola pantalla:

- **12 tamaños de texto distintos**: 16, 11, 18, 20, 12, 24, 13, 30, **11.5,
  10.5**px. Las fracciones delatan ajustes a mano. Una escala coherente tiene
  5-7 pasos.
- **8 radios de borde**: 0, 4, 6, 8, 10, 12, 16px y 50%. Un sistema tiene 2-3.
- **Tipografía Roboto**, el defecto de Material Design. Es probablemente el
  mayor responsable individual de la sensación de plantilla genérica: Roboto +
  componentes MUI sin personalizar = "esto es un admin template".
- **Sin modo oscuro.** `palette.mode: "light"` fijo y **cero** referencias a
  modo oscuro en toda la app. En una herramienta de operaciones que se mira
  durante turnos largos, hoy se da por supuesto.

Lo que **sí** está bien y conviene conservar: **una sola sombra** en toda la
página. La elevación es consistente, que es más de lo que suele verse.

## 2. "Poco amigable" — por qué cuesta usarla

- **Densidad**: 648 de 847 nodos por encima del pliegue en Jobs. Todo compite
  por la atención; nada la dirige.
- **Objetivos táctiles**: **27 de 54 controles miden menos de 32px**. La
  recomendación WCAG es 44px; Material, 48. La mitad de la interfaz es difícil
  de acertar con el ratón y impracticable con el dedo.
- **Foco de teclado suprimido**: **34 elementos con `outline: none`**. Sin
  sustituto visible, la navegación por teclado es a ciegas.
- **Contraste**: las etiquetas de los KPI del dashboard ("Open alerts", "Avg
  compliance", "Online · 38 up") salen a **1.86** cuando AA exige 4.5. Son los
  textos que más se leen de la pantalla.
- **Semántica ausente**: **0 `<main>`, 0 `<h1>`, 0 `<h2>`**. Para un lector de
  pantalla la página no tiene estructura; para el navegador, tampoco.
- **5 controles sin nombre accesible.**
- **Ruido de estado en la URL**: navegar acumula parámetros
  (`?page=assets&overviewAutoRefresh=60&rcAutoRefresh=60&assetsAutoRefresh=60`).
  Los enlaces que la gente comparte llevan basura pegada.

## 3. Estructura — por qué cuesta cambiarla

| | |
|---|---:|
| páginas | 29 |
| componentes totales | 120 |
| componentes compartidos (`components/common`) | **17 (14%)** |

Ocho ficheros superan las 1.400 líneas: `Jobs.jsx` (2402),
`AssetsDashboard.jsx` (1823), `AssetGroups.jsx` (1661), `AgentSettings.jsx`
(1621), `PatchManagement.jsx` (1559), `SoftwareInventory.jsx` (1436),
`ScreenShareViewer.jsx` (1431), `FileBrowserPanel.jsx` (1411).

Con 14% de reutilización, cada página reinventa sus tarjetas, sus tablas y sus
colores. **Esa es la razón mecánica de los 92 hex**: no hay dónde ponerlos.

---

## Propuesta, por orden de retorno

### F1 — Cimientos (sin cambio visible, habilita todo lo demás)

1. **Escala tipográfica y de radios en el tema.** 6 pasos de texto, 3 de radio,
   expuestos como tokens. Nada de 11.5px.
2. **Prohibir el hex suelto.** Regla de lint que falle ante `#rrggbb` fuera de
   `src/theme/`. Sin esto, F2 caduca solo.
3. **Migrar los 201 hex** a tokens. Mecánico y verificable.

*Retorno: ninguno visible hoy; es lo que hace que el rediseño no se deshaga.*

### F2 — Accesibilidad y ergonomía (alto impacto, bajo riesgo)

4. **Contraste a AA** en las etiquetas de KPI y texto secundario.
5. **Altura mínima de 40px** en controles; revisar los 27 pequeños.
6. **Restaurar el foco visible** — quitar los `outline:none` y dar un anillo de
   foco de marca.
7. **Landmarks y jerarquía**: `<main>`, un `<h1>` por página, `<h2>` por
   sección. Barato y arregla semántica y SEO interno a la vez.
8. **Nombrar los 5 controles anónimos.**

*Retorno: la interfaz deja de ser hostil. Es la mitad de "poco amigable".*

### F3 — Identidad visual (lo que se percibe como "moderno")

9. **Cambiar Roboto** por una tipografía con carácter (Inter, Geist o similar).
   Es el cambio con mayor relación impacto/esfuerzo de toda la lista.
10. **Modo oscuro.** Requiere F1 hecho: con 92 hex sueltos es inviable; con
    tokens es casi gratis.
11. **Bajar la densidad de Jobs y Overview**: jerarquía explícita, menos
    elementos compitiendo por encima del pliegue.

### F4 — Estructura (continuo)

12. **Extraer los god components** empezando por los que más se tocan. Ya hay
    precedente en este repo (`jobBatches`, `jobResult`, `jobForm` salieron de
    `Jobs.jsx` con tests).
13. **Subir la reutilización** del 14%: tarjeta, tabla, cabecera y estado vacío
    como componentes únicos.

---

## Lo que este análisis NO cubre

- **Juicio visual de composición**: sin capturas, no hay opinión sobre layout,
  jerarquía o espaciado percibido. Merece una pasada de diseño con pantallas
  delante.
- **Flujos de tarea**: no se midió cuántos clics cuesta una operación real
  (desplegar software, remediar un hallazgo). Ahí suele estar el resto de "poco
  amigable", y requiere observar a alguien usándolo.
- **Móvil / responsive**: la prueba se interrumpió al revocarse los permisos del
  navegador. Pendiente y relevante: es una herramienta de operaciones.
