import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Box,
  Paper,
  Typography,
  Chip,
  Divider,
} from "@mui/material";
import { httpGetJson } from "../api/http";

function TokensSummaryCard({ summary, loading, onClick }) {
  const tokensCount = summary?.tokensCount ?? 0;
  const activeTokensCount = summary?.activeTokensCount ?? 0;
  const expiredTokensCount = summary?.expiredTokensCount ?? 0;

  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 0,
        borderRadius: 3,
        overflow: "hidden",
        cursor: "pointer",
        border: "1px solid rgba(0,0,0,0.10)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 14px 28px rgba(0,0,0,0.16)",
        },
        "&:active": {
          transform: "scale(0.995)",
        },
      }}
    >
      {/* header */}
      <Box
        sx={{
          px: 2,
          py: 1.25,
          background: "linear-gradient(90deg, #1976d2 0%, #1ba6a6 100%)",
        }}
      >
        <Typography
          sx={{
            color: "white",
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          Tokens
        </Typography>
      </Box>

      {/* body */}
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 0.5 }}>
          Total registered
        </Typography>

        <Typography
          sx={{
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 1,
            color: "#16324f",
            mb: 2,
          }}
        >
          {loading ? "…" : tokensCount}
        </Typography>

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <Chip
            label={`Active: ${loading ? "…" : activeTokensCount}`}
            sx={{
              bgcolor: "rgba(27, 166, 166, 0.12)",
              color: "#0f6b72",
              fontWeight: 700,
            }}
          />

          <Chip
            label={`Expired: ${loading ? "…" : expiredTokensCount}`}
            sx={{
              bgcolor: "rgba(211, 47, 47, 0.10)",
              color: "#b3261e",
              fontWeight: 700,
            }}
          />
        </Box>
      </Box>
    </Paper>
  );
}

export default function Configurations({ onNavigate }) {
  const [tokensSummary, setTokensSummary] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await httpGetJson("/api/v1/configurations/summary");

        if (!alive) return;

        setTokensSummary(res?.tokens_summary ?? null);
      } catch (e) {
        console.error("Configurations summary fetch failed:", e);
        if (!alive) return;
        setError("Failed to load configurations summary");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleTokensClick = () => {
    onNavigate?.("tokens");
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <Typography variant="h4" color="#1ba6a6" sx={{ mb: 2, fontWeight: 700 }}>
        Configurations
      </Typography>

      {error && (
        <Typography sx={{ color: "error.main", mb: 2 }}>
          {error}
        </Typography>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <TokensSummaryCard
            summary={tokensSummary}
            loading={loading}
            onClick={handleTokensClick}
          />
        </Grid>
      </Grid>
    </Box>
  );
}