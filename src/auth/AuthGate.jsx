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
import Logo from "../assets/T.png";

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
            "radial-gradient(circle at top, #1d4d54 0, #020617 55%, #000 100%)",
          backgroundSize: "200% 200%",
          animation: "bgShift 12s ease infinite",
          "@keyframes bgShift": {
            "0%": { backgroundPosition: "0% 50%" },
            "50%": { backgroundPosition: "100% 50%" },
            "100%": { backgroundPosition: "0% 50%" },
          },
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
                maxWidth: 420,
                px: { xs: 3, sm: 4 },
                py: { xs: 3.5, sm: 4 },
                borderRadius: "16px",
                textAlign: "center",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(116,249,253,0.28)",
                boxShadow: "0 0 25px rgba(116,249,253,0.18)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: { xs: 28, sm: 30 },
                  lineHeight: 1.2,
                  mb: 1.5,
                }}
              >
                Usuario inactivo
              </Typography>

              <Typography
                sx={{
                  color: "#cbd5e1",
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
                  fontWeight: 600,
                  borderRadius: "12px",
                  py: 1.5,
                  background: "rgb(70,157,159)",
                  "&:hover": {
                    background: "rgb(60,140,142)",
                  },
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
            "radial-gradient(circle at top, #1d4d54 0, #020617 55%, #000 100%)",
          backgroundSize: "200% 200%",
          animation: "bgShift 12s ease infinite",
          "@keyframes bgShift": {
            "0%": { backgroundPosition: "0% 50%" },
            "50%": { backgroundPosition: "100% 50%" },
            "100%": { backgroundPosition: "0% 50%" },
          },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 420,
            minHeight: 390,
            px: { xs: 4, sm: 4 },
            py: { xs: 4, sm: 4 },
            borderRadius: "16px",
            border: "1px solid rgba(116,249,253,0.4)",
            background: "rgba(255,255,255,0.05)",
            boxShadow: "0 0 25px rgba(116,249,253,0.18)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              width: 84,
              height: 84,
              mb: 2.5,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background:
                "radial-gradient(circle, rgba(116,249,253,0.18) 0%, rgba(116,249,253,0.06) 60%, transparent 100%)",
            }}
          >
            <Box
              component="img"
              src={Logo}
              alt="Tracenium"
              sx={{
                width: { xs: 52, sm: 56 },
                height: "auto",
                objectFit: "contain",
                filter: "drop-shadow(0 0 10px rgba(116,249,253,0.35))",
              }}
            />
          </Box>

          <Typography
            sx={{
              color: "#ffffff",
              fontWeight: 600,
              fontSize: { xs: 28, sm: 30 },
              lineHeight: 1.2,
              mb: 1.5,
            }}
          >
            Tracenium
          </Typography>

          <Typography
            sx={{
              color: "#cbd5e1",
              fontSize: 14,
              lineHeight: 1.6,
              maxWidth: 280,
              mb: 4,
            }}
          >
            Loading ...
          </Typography>

          <CircularProgress
            size={40}
            thickness={4}
            sx={{
              color: "rgb(116,249,253)",
            }}
          />
        </Paper>
      </Box>
    );
  }

  return children;
}