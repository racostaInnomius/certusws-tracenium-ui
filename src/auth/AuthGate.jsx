import * as React from "react";
import {
  Box,
  CircularProgress,
  Typography,
  Paper,
  Button,
  Backdrop,
  Fade,
} from "@mui/material";

export const API = {
  BASE: import.meta.env.VITE_API_BASE,
  BOOTSTRAP: "/api/bootstrap",
  LOGIN: "/auth/login",
};

export default function AuthGate({ children }) {
  const [status, setStatus] = React.useState("loading"); // loading | authed
  const [isInactive, setIsInactive] = React.useState(false);
  const redirectedRef = React.useRef(false); // evita doble redirect en dev (StrictMode)

  const handleLogout = async () => {
    try {
      const res = await fetch(`${API.BASE}/api/logout`, {
        method: "POST",
        credentials: "include",
      });

      let logoutUrl = "https://api.sso.safecertus.com/logout";

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.logoutUrl) {
          logoutUrl = data.logoutUrl;
        }
      }

      window.location.href = logoutUrl;
    } catch (e) {
      console.error("Logout failed", e);
      window.location.href = "https://api.sso.safecertus.com/logout";
    }
  };

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

        const data = await res.json();

        if (data?.tenantMember && data.tenantMember.isActive === false) {
          setIsInactive(true);
          return;
        }

        setStatus("authed");
      } catch (e) {
        console.error("Bootstrap fetch failed:", e);
      }
    })();
  }, []);

  if (isInactive) {
    return (
      <Box
        sx={{
          minHeight: "100dvh",
          width: "100%",
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(90deg, #03071b 0%, #03152f 40%, #103847 100%)",
        }}
      >
        <Backdrop
          open
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            backgroundColor: "rgba(2, 10, 25, 0.30)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        />

        <Box
          sx={{
            position: "relative",
            zIndex: 2,
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 2,
          }}
        >
          <Fade in timeout={{ enter: 260, exit: 180 }}>
            <Paper
              elevation={0}
              sx={{
                width: "100%",
                maxWidth: 440,
                px: { xs: 3, sm: 4 },
                py: { xs: 3.5, sm: 4 },
                borderRadius: 4,
                textAlign: "center",
                border: "1px solid rgba(41, 197, 255, 0.18)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
                boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  color: "#16324f",
                  mb: 1.5,
                }}
              >
                Usuario inactivo
              </Typography>

              <Typography
                sx={{
                  color: "#667085",
                  fontSize: 16,
                  lineHeight: 1.6,
                  mb: 3,
                }}
              >
                Tu usuario está inactivo, consulta a tu Administrador.
              </Typography>

              <Button
                variant="contained"
                fullWidth
                onClick={handleLogout}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  bgcolor: "#1ba6a6",
                  "&:hover": { bgcolor: "#158d8d" },
                }}
              >
                Aceptar
              </Button>
            </Paper>
          </Fade>
        </Box>
      </Box>
    );
  }

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