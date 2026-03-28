import * as React from "react";
import { Box, CircularProgress, Typography, Paper } from "@mui/material";

export const API = {
  BASE: import.meta.env.VITE_API_BASE,
  BOOTSTRAP: "/api/bootstrap",
  LOGIN: "/auth/login"
};

export default function AuthGate({ children }) {
  const [status, setStatus] = React.useState("loading"); // loading | authed
  const redirectedRef = React.useRef(false); // evita doble redirect en dev (StrictMode)

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API.BASE}${API.BOOTSTRAP}`, {
          credentials: "include",
        });

        if (res.status === 401) {
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            window.location.href = `${API.BASE}${API.LOGIN}`;
          }
          return;
        }

        if (!res.ok) {
          console.error("Bootstrap error:", res.status, await res.text());
          return;
        }

        setStatus("authed");
      } catch (e) {
        console.error("Bootstrap fetch failed:", e);
      }
    })();
  }, []);

  if (status === "loading") {
    return (
      <Box
        sx={{
          minHeight: "100dvh",
          width: "100%",
          display: "grid",
          placeItems: "center",
          px: 2,
          background:
            "linear-gradient(90deg, #03071b 0%, #03152f 40%, #103847 100%)",
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 440,
            minHeight: 390,
            px: { xs: 3, sm: 5 },
            py: { xs: 5, sm: 6 },
            borderRadius: 4,
            border: "1px solid rgba(41, 197, 255, 0.35)",
            background:
              "linear-gradient(180deg, rgba(6,18,46,0.96) 0%, rgba(4,15,38,0.98) 100%)",
            boxShadow:
              "0 0 0 1px rgba(41, 197, 255, 0.08), 0 0 30px rgba(41, 197, 255, 0.18)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              width: 72,
              height: 72,
              mb: 3,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background:
                "radial-gradient(circle, rgba(41,197,255,0.16) 0%, rgba(41,197,255,0.04) 65%, transparent 100%)",
            }}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.75)",
                opacity: 0.9,
              }}
            />
          </Box>

          <Typography
            sx={{
              color: "white",
              fontWeight: 600,
              fontSize: { xs: 30, sm: 34 },
              lineHeight: 1.15,
              mb: 1.5,
            }}
          >
            Welcome to Tracenium
          </Typography>

          <Typography
            sx={{
              color: "rgba(255,255,255,0.78)",
              fontSize: 16,
              lineHeight: 1.5,
              maxWidth: 300,
              mb: 4,
            }}
          >
            Loading ...
          </Typography>

          <CircularProgress
            size={34}
            thickness={4.5}
            sx={{
              color: "#63e7ff",
            }}
          />
        </Paper>
      </Box>
    );
  }

  return children;
}