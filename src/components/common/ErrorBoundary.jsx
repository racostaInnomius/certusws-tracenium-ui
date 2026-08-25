import React from "react";
import { Box, Typography, Button, Stack } from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import { ICON, ROLE, TEXT } from "../../theme/brand";

/**
 * App/route-level error boundary.
 *
 * Before this existed a single render throw — typically a `.map`/destructure
 * over an unexpected API shape — would unmount the entire SPA (white screen).
 * This catches the throw, keeps the shell/navigation intact, and offers a
 * scoped recovery ("Try again" re-renders the subtree; "Reload page" is the
 * hard fallback).
 *
 * Reset-on-navigation: give the boundary a `key` that changes per route
 * (e.g. the selected page), so navigating to a healthy page remounts a fresh
 * boundary instead of showing the previous page's error.
 *
 * Props:
 *   - label?: string — human name of the surface, shown in the fallback copy.
 *   - onReset?: () => void — extra reset hook (e.g. bump a reload token).
 *   - children
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleTryAgain = this.handleTryAgain.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Boundary is the ONE place a full error dump is appropriate.
    console.error("[ErrorBoundary] render error", this.props.label || "", error, info?.componentStack);
  }

  handleTryAgain() {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === "function") {
      this.props.onReset();
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const label = this.props.label ? ` on ${this.props.label}` : "";

    return (
      <Box
        role="alert"
        sx={{
          m: { xs: 2, sm: 4 },
          p: { xs: 3, sm: 4 },
          maxWidth: 560,
          mx: "auto",
          textAlign: "center",
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          bgcolor: "background.paper",
        }}
      >
        <ReportProblemOutlinedIcon sx={{ fontSize: ICON["2xl"], color: ROLE.critical, mb: 1 }} />
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, mb: 0.5 }}>
          Something went wrong{label}
        </Typography>
        <Typography sx={{ fontSize: TEXT.md, color: "text.secondary", mb: 2.5 }}>
          This view hit an unexpected error and stopped rendering. The rest of the
          dashboard is still available — try again, switch pages, or reload.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} justifyContent="center">
          <Button
            variant="contained"
            startIcon={<RefreshRoundedIcon />}
            onClick={this.handleTryAgain}
          >
            Try again
          </Button>
          <Button variant="outlined" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </Stack>
      </Box>
    );
  }
}
