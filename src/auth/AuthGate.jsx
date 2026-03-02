import * as React from "react";
import { Box, CircularProgress, Typography } from "@mui/material";

export default function AuthGate({ children }) {
  const [status, setStatus] = React.useState("loading"); // loading | authed
  const redirectedRef = React.useRef(false); // evita doble redirect en dev (StrictMode)

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:3000/api/bootstrap", { credentials: "include" });

        if (res.status === 401) {
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            window.location.href = "http://localhost:3000/auth/login";
          }
          return;
        }

        if (!res.ok) {
          // Para errores raros (500, etc.)
          console.error("Bootstrap error:", res.status, await res.text());
          // Decide: o rediriges o muestras error
          return;
        }

        // const data = await res.json(); // si lo quieres guardar luego (tenant/subject)
        setStatus("authed");
      } catch (e) {
        console.error("Bootstrap fetch failed:", e);
      }
    })();
  }, []);

  if (status === "loading") {
    return (
      <Box sx={{ height: "100vh", display: "grid", placeItems: "center" }}>
        <Box sx={{ textAlign: "center" }}>
          <CircularProgress />
          <Typography sx={{ mt: 2, color: "#667085" }}>
            Verificando sesión…
          </Typography>
        </Box>
      </Box>
    );
  }

  return children;
}