// src/theme/brand.js
// =============================================================================
// TRACENIUM DESIGN SYSTEM — single source of truth
// =============================================================================
//
// This module exports every token the UI is allowed to reference for color,
// layout, and DataGrid styling.

export const BRAND = {
  // Primary palette
  dark: "#3B404D",
  teal: "#5A9F9F",
  cyan: "#8FFDFF",
  gray: "#BEBEBE",

  // Derivatives
  tealText: "#3E7878",
  tealHover: "#4E8C8C",

  // Bright chrome accent for shell/branding only.
  // Use it for topbar/sidebar separator lines and small brand punctuation marks.
  // Do not use it as the general card/chart/button color.
  accentBright: "#80fff6",
  accentBrightHover: "#18E58F",
  accentBrightSoft: "rgba(24,229,143,0.18)",
  accentBrightLine: "rgba(128,255,246,0.78)",

  tealSoft: "rgba(90,159,159,0.12)",
  tealSoftStrong: "rgba(90,159,159,0.22)",
  cyanSoft: "rgba(143,253,255,0.22)",
  cyanSoftStrong: "rgba(143,253,255,0.40)",
  darkSoft: "rgba(59,64,77,0.08)",
  border: "rgba(190,190,190,0.30)",
  borderStrong: "rgba(190,190,190,0.50)",
  surface: "#FFFFFF",
  surfaceMuted: "rgba(190,190,190,0.08)",
  rowHover: "rgba(143,253,255,0.10)",
  shadow: "0 8px 20px rgba(59,64,77,0.10)",

  alert: {
    error: "#E37D78",
    errorSoft: "rgba(227,125,120,0.22)",
    errorText: "#B23A33",
    // Pressed/hover shade for solid destructive buttons (Delete, Decommission).
    // Deliberately much darker than `error`: the resting fill is a soft red, so
    // a subtle hover would read as no feedback at all on a destructive action.
    errorHover: "#991b1b",
    // "High" severity — orange, sits between critical-red and medium-amber so
    // the ordered severity scale (see theme/severity.js) reads at a glance.
    high: "#8b5418",
    highSoft: "rgba(199,121,43,0.16)",
    warning: "#F4D37D",
    warningSoft: "rgba(244,211,125,0.30)",
    // Darker amber for text on warningSoft (contrast).
    warningText: "#7a5c00",
    // Ámbar MÁS CLARO que `warning`, para texto sobre superficie oscura. En la
    // pantalla de login el `warning` normal (#F4D37D) se apaga contra el fondo
    // oscuro; este sube la luminancia lo justo para mantener la legibilidad
    // sin cambiar el matiz.
    warningOnDark: "#FDE68A",
    // Rojo saturado del indicador de estado del terminal remoto. Deliberadamente
    // distinto de `error` (#E37D78, un rojo suave pensado para rellenos sobre
    // fondo claro): sobre el cromo oscuro del terminal ese tono se lava.
    errorStrong: "#D9534F",
    // Hover del botón destructivo cuyo estado de reposo es ROLE.critical — un
    // paso más oscuro del MISMO rojo suave. No confundir con `errorHover`
    // (#991b1b), que es para botones destructivos de relleno sólido.
    errorHoverSoft: "#C66460",
    success: "#52B788",
    successSoft: "rgba(82,183,136,0.16)",
    info: "#5A9F9F",
    infoSoft: "rgba(90,159,159,0.12)",
  },

  // Darker, text-legible counterpart to `cyan` (#8FFDFF is an accent
  // color, far too light for small chip/label text on a light surface).
  cyanText: "#0E7C80",
};

/**
 * Escala neutra — grises de cromo, superficie y texto secundario.
 *
 * Se derivó de los ~40 grises que ya vivían hardcodeados por la app (pantalla
 * de login, terminal remoto, fondos del shell, pistas de progreso), no se
 * inventó: cada paso es un valor que ya se estaba usando. Lo que sí hizo el
 * ejercicio fue COLAPSAR los que eran indistinguibles entre sí — había tres
 * grises medios a distancia RGB ≤9 y tres claros a ≤6, que ningún ojo separa
 * pero que multiplicaban la paleta.
 *
 * Numeración tipo rampa (0 = negro, 50 = casi blanco) para que "más alto =
 * más claro" se lea sin consultar. Es también la escala sobre la que se
 * apoyará el modo oscuro: con los grises sueltos por el código era inviable.
 *
 * ⚠️ Los pasos 500/100/50 colapsan varios originales. El desplazamiento
 * máximo es de 11 en distancia RGB, por debajo del umbral perceptible para
 * texto y bordes — pero NO es cero. Si algún punto concreto necesita su tono
 * exacto, añade un paso en vez de reintroducir el hex.
 */
export const NEUTRAL = {
  0: "#000000",    // negro puro — fondo del visor de pantalla remota
  900: "#161C25",  // superficie más oscura (chrome del terminal)
  800: "#1F2933",  // fondo del terminal
  700: "#2D3742",  // bordes sobre superficie oscura
  500: "#98A2B3",  // texto secundario sobre oscuro   (colapsa #94a3b8, #9aa5b1)
  400: "#B9BEC8",  // texto desactivado / iconos inactivos
  300: "#C7CBD1",  // relleno "pendiente" en gráficas
  200: "#CBD5E1",  // texto terciario sobre oscuro
  100: "#E5E7EB",  // texto claro sobre oscuro        (colapsa #e2e8f0, #e7e9ee)
  50: "#F5F6F8",   // fondo de página / pista de progreso (colapsa #f8fafc, #eff0f1)
};

/**
 * Escala tipográfica — px, no rem, porque toda la app dimensiona en px vía `sx`.
 *
 * Derivada de los 807 usos reales de `fontSize` sobre texto, que tenían 26
 * valores distintos. Nueve de ellos eran FRACCIONES (9.5, 10.2, 10.5, 10.6,
 * 11.5, 12.5, 13.5, 14.5, 15.5), ~130 usos de puro ajuste a mano acumulado.
 *
 * La consolidación es deliberadamente conservadora: la gran mayoría de los
 * usos no se mueve, y el desplazamiento máximo en texto es 2px. Ordenar y
 * rediseñar son cosas distintas, y mezclarlas haría imposible saber cuál de
 * las dos rompió qué.
 *
 * ⚠️ `xs` es el suelo y absorbe todo lo que había por debajo (10px y menos).
 * 11px sigue siendo pequeño para leer cómodo — subir el suelo a 12 es una
 * mejora real de legibilidad, pero mueve el layout de toda la app (etiquetas
 * más anchas, chips que crecen, tablas que reflowean). Esa decisión va con
 * pantallas delante; y cuando llegue, es UN valor el que cambia.
 */
export const TEXT = {
  xs: 11,    // etiquetas, chips, texto auxiliar denso
  sm: 12,    // texto secundario — el tamaño más usado de la app
  md: 13,    // cuerpo de tabla y descripciones
  base: 14,  // cuerpo por defecto
  lg: 16,    // subtítulos
  xl: 18,    // títulos de tarjeta y sección
  "2xl": 24, // títulos de página
  "3xl": 28, // cifras de KPI
  "4xl": 36, // cifras destacadas
  "5xl": 48, // display
};

/**
 * Tamaños de icono. Escala APARTE de TEXT a propósito: en MUI, `fontSize`
 * sobre un <Icon> controla su TAMAÑO, no la tipografía. Los 118 usos que
 * dimensionan iconos se contaban entre los "tamaños de letra", y forzarlos a
 * la escala de texto habría atado dos cosas que no tienen por qué moverse
 * juntas.
 *
 * Tiene más pasos arriba y abajo que TEXT por una razón medida: con una escala
 * de cinco pasos (suelo 14, techo 36), los iconos de 48px encogían a 36 — un
 * 25% de reducción, perfectamente visible. Los extremos de un icono son su
 * tamaño, no un matiz tipográfico, así que la escala los respeta.
 */
export const ICON = {
  xs: 12,    // iconos embebidos en texto denso
  sm: 14,    // iconos en línea con texto
  md: 16,    // iconos de acción en barras
  lg: 18,    // iconos de encabezado
  xl: 24,    // iconos destacados
  "2xl": 36, // ilustración de estado vacío
  "3xl": 48, // ilustración a pantalla completa
};

/**
 * Anillo de foco de teclado.
 *
 * La app tenía 14 `outline: none` repartidos por las tablas y las pestañas, y
 * varios suprimían también `:focus-visible` — con lo que navegar con Tab era
 * literalmente a ciegas: el foco se movía sin nada que lo indicara.
 *
 * La distinción que lo resuelve: `:focus` dispara también al hacer clic con el
 * ratón (de ahí que a alguien le molestara y lo quitara), pero
 * `:focus-visible` SOLO cuando el navegador estima que el usuario navega por
 * teclado. Se puede quitar el anillo del ratón y conservarlo donde importa.
 *
 * Se usa `box-shadow` en vez de `outline` porque respeta el border-radius de
 * los componentes MUI; un outline dibuja un rectángulo que se sale de las
 * esquinas redondeadas.
 */
/**
 * Secondary text on a light surface.
 *
 * MUI's default (`text.secondary`, rgba(0,0,0,0.6)) is a transparency, so its
 * real contrast depends on whatever sits behind it — it degrades silently over
 * a tinted row or a soft-colored chip. This is a solid value that holds its
 * ratio wherever it lands.
 */
export const TEXT_MUTED = "#4A5160";

export const FOCUS_RING = `0 0 0 2px ${BRAND.surface}, 0 0 0 4px ${BRAND.teal}`;

export const ROLE = {
  positive: BRAND.alert.success,
  positiveSoft: BRAND.alert.successSoft,
  caution: BRAND.alert.warning,
  cautionSoft: BRAND.alert.warningSoft,
  critical: BRAND.alert.error,
  criticalSoft: BRAND.alert.errorSoft,
  neutral: BRAND.teal,
  neutralSoft: BRAND.tealSoft,
  accent: BRAND.cyan,
  accentSoft: BRAND.cyanSoft,
};

export const LAYOUT = {
  page: {
    pb: 4,
  },
  header: {
    // `variant` es el ESTILO; `component` es la ETIQUETA. Estaban acoplados,
    // así que el título de cada página salía como <h4> y la app entera no
    // tenía un solo <h1>: un lector de pantalla no encontraba el encabezado
    // principal, y la jerarquía arrancaba en el cuarto nivel sin que
    // existieran los tres anteriores. Separarlos deja el aspecto intacto.
    variant: "h4",
    component: "h1",
    sx: {
      color: BRAND.dark,
      fontWeight: 800,
      letterSpacing: -0.5,
      lineHeight: 1.2,
    },
  },
  subtitle: {
    variant: "body2",
    sx: {
      color: "text.secondary",
      mt: 0.25,
    },
  },
  card: {
    elevation: 0,
    sx: {
      p: 2,
      borderRadius: 2,
      border: `1px solid ${BRAND.border}`,
      height: "100%",
    },
  },
  panel: {
    elevation: 0,
    sx: {
      p: { xs: 1.5, sm: 2 },
      borderRadius: 3,
      border: `1px solid ${BRAND.border}`,
      boxShadow: BRAND.shadow,
    },
  },
  grid: {
    container: true,
    spacing: 2,
    alignItems: "stretch",
  },
};

export const DATAGRID_SX = {
  border: "none",
  "& .MuiDataGrid-columnHeaders": {
    backgroundColor: BRAND.darkSoft,
    color: BRAND.dark,
    fontWeight: 700,
    borderBottom: `1px solid ${BRAND.border}`,
  },
  "& .MuiDataGrid-columnHeaderTitle": {
    fontWeight: 700,
  },
  "& .MuiDataGrid-row": {
    cursor: "pointer",
    transition: "background-color 0.12s ease",
  },
  "& .MuiDataGrid-row:hover": {
    backgroundColor: BRAND.rowHover,
  },
  "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": {
    backgroundColor: BRAND.cyanSoft,
  },
  "& .MuiDataGrid-cell": {
    borderBottom: `1px solid ${BRAND.border}`,
  },
  "& .MuiDataGrid-footerContainer": {
    borderTop: `1px solid ${BRAND.border}`,
  },
};