import GlobalStyles from "@mui/material/GlobalStyles";
import AppShell from "./layout/AppShell";
import AuthGate from "./auth/AuthGate";
import { MspProvider } from "./msp/MspContext";
import { FOCUS_RING } from "./theme/brand";

export default function App() {
  return (
    <AuthGate>
      {/* Anillo de foco de teclado, global.
          La app tenía 14 `outline: none` repartidos por tablas y pestañas, y
          varios suprimían también `:focus-visible` — navegar con Tab era
          literalmente a ciegas.

          `:focus-visible` es lo que lo hace viable: sólo dispara cuando el
          navegador estima que se navega por teclado, así que el anillo NO
          aparece al hacer clic, que es lo que llevó a suprimirlo.

          Va en <GlobalStyles> y no en el tema MUI porque ESTE PROYECTO NO
          MONTA ThemeProvider — traceniumMuiTheme.js no lo importa nadie. Un
          styleOverride de MuiCssBaseline aquí sería estilo muerto. */}
      <GlobalStyles
        styles={{
          "*:focus-visible": {
            outline: "none",
            boxShadow: FOCUS_RING,
            borderRadius: 4,
          },
          // ⚠️ Los inputs de MUI YA dibujan su propio foco: el <fieldset>
          // recortado que rodea al campo engorda a 2px y toma el color
          // primario. El anillo de arriba se pintaba ENCIMA, y el resultado
          // era un doble borde en el selector de equipos.
          //
          // El foco sigue siendo visible en ellos — lo dibuja MUI, que además
          // lo hace mejor porque su borde sigue la muesca de la etiqueta. Sólo
          // se retira el anillo redundante.
          [[
            ".MuiInputBase-input",
            ".MuiOutlinedInput-input",
            ".MuiSelect-select",
            ".MuiAutocomplete-input",
          ].map((sel) => `${sel}:focus-visible`).join(", ")]: {
            boxShadow: "none",
          },
        }}
      />
      {/* MSP navigation state (portfolio + active client) wraps the shell
          so the tenant switcher, breadcrumb, and portfolio view all read
          one source of truth. See src/msp/. */}
      <MspProvider>
        <AppShell />
      </MspProvider>
    </AuthGate>
  );
}