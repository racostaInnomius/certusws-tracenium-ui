import * as React from "react";
import {
  Box,
  CircularProgress,
  Typography,
  Paper,
  Button,
  Backdrop,
  Fade,
  LinearProgress,
} from "@mui/material";

export const API = {
  BASE: import.meta.env.VITE_API_BASE,
  BOOTSTRAP: "/api/bootstrap",
  HEALTH: "/api/v1/health",
  LOGIN: "/auth/login",
};
import Logo from "../assets/T.png";
import { useAuthContext } from "./AuthContext";
import { clearApiCache, setApiCacheSessionScope, getActiveTenantId } from "../api/http";
import { clearCachedFetch, setCachedFetchSessionScope } from "../hooks/useCachedFetch";
import { BRAND, NEUTRAL, TEXT } from "../theme/brand";

const BOOTSTRAP_TIMEOUT_MS = 12_000;
const BOOTSTRAP_RETRY_DELAY_MS = 3_000;
const BOOTSTRAP_MAX_ATTEMPTS = 8;
const HEALTH_TIMEOUT_MS = 4_000;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    }
  });
}

function isUnauthenticatedError(status, text = "") {
  return status === 401 || String(text || "").includes("UNAUTHENTICATED");
}

function parseBootstrapBody(text = "") {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getBootstrapErrorCode(body, text = "") {
  return String(
    body?.error ||
      body?.code ||
      body?.reason ||
      body?.status ||
      text ||
      ""
  ).toUpperCase();
}

function isNoServiceAccessError(status, text = "") {
  const body = parseBootstrapBody(text);
  const code = getBootstrapErrorCode(body, text);

  return (
    status === 403 &&
    (code.includes("NO_SERVICE_ACCESS") ||
      code.includes("SERVICE_ACCESS") ||
      code.includes("SERVICE_NOT_ALLOWED"))
  );
}

function normalizeNoServiceAccessInfo(status, text = "") {
  const body = parseBootstrapBody(text) || {};
  const detail = body.detail || body.details || body.context || body;
  const services = Array.isArray(detail?.servicesSummary)
    ? detail.servicesSummary
    : Array.isArray(body?.servicesSummary)
      ? body.servicesSummary
      : [];

  return {
    status,
    code: getBootstrapErrorCode(body, text) || "NO_SERVICE_ACCESS",
    message:
      body?.message ||
      "Your account is authenticated, but it is not enabled for Tracenium in this environment.",
    expectedServiceKey: detail?.expectedServiceKey || body?.expectedServiceKey || "",
    externalIdpTenant: detail?.externalIdpTenant || body?.externalIdpTenant || "",
    servicesSummary: services,
  };
}

function isRetriableBootstrapError(errorOrStatus) {
  if (errorOrStatus?.name === "AbortError") return true;
  if (errorOrStatus instanceof TypeError) return true;

  const status = Number(errorOrStatus?.status || errorOrStatus || 0);

  // Tenant provisioning can occasionally surface as gateway/service timeout
  // before the backend finishes creating the tenant DB. Treat transient 5xx
  // responses as retryable during bootstrap, but do not retry auth failures.
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function getBootstrapErrorMessage(error, lastConnectivityState = "unknown") {
  if (lastConnectivityState === "offline") {
    return "We could not connect to the backend after several attempts. Please try again.";
  }

  if (lastConnectivityState === "online") {
    return "Workspace setup is taking longer than expected. Please try again in a moment.";
  }

  if (error?.name === "AbortError") {
    return "Backend bootstrap request timed out.";
  }

  if (error instanceof TypeError) {
    return "Unable to reach backend bootstrap endpoint.";
  }

  if (error?.status) {
    return `Bootstrap failed (${error.status}).`;
  }

  return "Unable to complete /api/bootstrap.";
}

function getErrorTitle(connectivityState = "unknown") {
  if (connectivityState === "online") {
    return "Workspace setup is taking longer than expected";
  }

  return "Backend unavailable";
}

async function checkBackendHealth(signal) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  const abortFromParent = () => controller.abort();
  signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const res = await fetch(`${API.BASE}${API.HEALTH}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });

    // Any HTTP response from the versioned health endpoint means the backend
    // process is reachable. We only need this probe to distinguish backend-down
    // from bootstrap taking longer, not to validate the user session.
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

function AuthShell({
  title,
  description,
  children,
  maxWidth = 420,
  minHeight = 390,
}) {
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
          maxWidth,
          minHeight,
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
          }}
        >
          <Box
            component="img"
            src={Logo}
            alt="Tracenium"
            sx={{
              width: { xs: 92, sm: 96 },
              height: "auto",
              objectFit: "contain",
              filter: "drop-shadow(0 0 10px rgba(116,249,253,0.35))",
            }}
          />
        </Box>

        <Typography
          sx={{
            color: BRAND.surface,
            fontWeight: 600,
            fontSize: { xs: 28, sm: 30 },
            lineHeight: 1.2,
            mb: 1.5,
          }}
        >
          {title}
        </Typography>

        <Typography
          sx={{
            color: NEUTRAL[200],
            fontSize: TEXT.base,
            lineHeight: 1.6,
            maxWidth: 320,
            mb: 3,
          }}
        >
          {description}
        </Typography>

        {children}
      </Paper>
    </Box>
  );
}

function RetryProgress({ attempt }) {
  const progress = Math.min(
    100,
    Math.round((attempt / BOOTSTRAP_MAX_ATTEMPTS) * 100)
  );

  return (
    <Box sx={{ width: "100%", maxWidth: 320, mb: 2 }}>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 7,
          borderRadius: 999,
          bgcolor: "rgba(255,255,255,0.10)",
          "& .MuiLinearProgress-bar": {
            bgcolor: "rgb(116,249,253)",
            borderRadius: 999,
          },
        }}
      />
    </Box>
  );
}

function RetryMeta({ attempt }) {
  return (
    <Typography
      sx={{
        color: NEUTRAL[500],
        fontSize: TEXT.sm,
        lineHeight: 1.6,
        mb: 2.5,
      }}
    >
      {/*
      Attempt {attempt} of {BOOTSTRAP_MAX_ATTEMPTS}. Retrying automatically every{" "}
      {BOOTSTRAP_RETRY_DELAY_MS / 1000} seconds.
      */}
    </Typography>
  );
}

function RetryButton({ disabled, onClick }) {
  return (
    <Button
      variant="outlined"
      disabled={disabled}
      onClick={onClick}
      sx={{
        textTransform: "none",
        fontWeight: 700,
        borderRadius: "12px",
        py: 1.15,
        px: 3,
        color: "rgb(116,249,253)",
        borderColor: "rgba(116,249,253,0.55)",
        "&:hover": {
          borderColor: "rgb(116,249,253)",
          background: "rgba(116,249,253,0.08)",
        },
      }}
    >
      {disabled ? "Retrying..." : "Retry now"}
    </Button>
  );
}

export default function AuthGate({ children }) {
  const [status, setStatus] = React.useState("loading"); // loading | connecting | preparing | authed | noServiceAccess | error
  const [isInactive, setIsInactive] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [accessDeniedInfo, setAccessDeniedInfo] = React.useState(null);
  const [errorConnectivityState, setErrorConnectivityState] = React.useState("unknown");
  const [attempt, setAttempt] = React.useState(1);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [isRetryingNow, setIsRetryingNow] = React.useState(false);
  const redirectedRef = React.useRef(false); // evita doble redirect en dev (StrictMode)
  const { refreshAuth } = useAuthContext();

  const handleLogout = async () => {
    clearApiCache();
    clearCachedFetch();
    setApiCacheSessionScope("signed-out");
    setCachedFetchSessionScope("signed-out");

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
    let cancelled = false;
    const loopController = new AbortController();
    let lastConnectivityState = "unknown";

    async function runBootstrapAttempt(currentAttempt) {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        BOOTSTRAP_TIMEOUT_MS
      );

      const abortFromLoop = () => controller.abort();
      loopController.signal.addEventListener("abort", abortFromLoop, {
        once: true,
      });

      try {
        // Must carry the SAME X-Tenant-Id the http layer sends. This is a raw
        // fetch (it needs the status code before the http helpers throw), so
        // the header has to be added by hand. Without it, a vendor
        // (admin_master) — who has no home tenant — bootstraps as "no tenant"
        // here while AuthProvider's httpGetJson bootstrap resolves the active
        // one. The two disagree, the session scope flips, and the scope-change
        // handler clears the active tenant: the user stays in the tenant shell
        // while every request goes out tenant-less and 403s.
        const activeTenant = getActiveTenantId();
        const res = await fetch(`${API.BASE}${API.BOOTSTRAP}`, {
          credentials: "include",
          signal: controller.signal,
          ...(activeTenant ? { headers: { "X-Tenant-Id": activeTenant } } : {}),
        });

        if (cancelled) return { done: true };

        const text = await res.text().catch(() => "");

        if (isNoServiceAccessError(res.status, text)) {
          setAccessDeniedInfo(normalizeNoServiceAccessInfo(res.status, text));
          setStatus("noServiceAccess");
          return { done: true };
        }

        if (isUnauthenticatedError(res.status, text)) {
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            window.location.href = `${API.BASE}${API.LOGIN}`;
          }
          return { done: true };
        }

        if (!res.ok) {
          const err = new Error(`Bootstrap failed (${res.status})`);
          err.status = res.status;
          err.bodyText = text;
          throw err;
        }

        const data = parseBootstrapBody(text);

        if (cancelled) return { done: true };

        // AuthGate is the first place that knows bootstrap has succeeded after
        // tenant provisioning. Push that exact fresh payload into AuthContext so
        // Sidebar / role-gated pages do not keep the earlier partial bootstrap
        // snapshot. Without this, a newly-created OWNER can see the non-admin
        // menu until a full logout/login refreshes the context.
        await refreshAuth(data);

        if (data?.tenantMember && data.tenantMember.isActive === false) {
          setIsInactive(true);
          return { done: true };
        }

        setStatus("authed");
        return { done: true };
      } catch (e) {
        if (cancelled) return { done: true };

        const retriable = isRetriableBootstrapError(e);
        console.warn("Bootstrap attempt failed:", {
          attempt: currentAttempt,
          maxAttempts: BOOTSTRAP_MAX_ATTEMPTS,
          retriable,
          error: e,
        });

        return {
          done: false,
          retriable,
          error: e,
        };
      } finally {
        window.clearTimeout(timeout);
        loopController.signal.removeEventListener("abort", abortFromLoop);
      }
    }

    async function runBootstrapLoop() {
      setErrorMessage("");
      setAccessDeniedInfo(null);
      setErrorConnectivityState("unknown");
      setIsRetryingNow(false);
      setStatus("loading");
      setAttempt(1);

      for (
        let currentAttempt = 1;
        currentAttempt <= BOOTSTRAP_MAX_ATTEMPTS;
        currentAttempt += 1
      ) {
        if (cancelled) return;

        setAttempt(currentAttempt);

        const result = await runBootstrapAttempt(currentAttempt);

        if (cancelled || result.done) return;

        if (!result.retriable) {
          setErrorConnectivityState(lastConnectivityState);
          setErrorMessage(getBootstrapErrorMessage(result.error, lastConnectivityState));
          setStatus("error");
          return;
        }

        const backendReachable = await checkBackendHealth(loopController.signal);
        if (cancelled) return;

        lastConnectivityState = backendReachable ? "online" : "offline";

        if (currentAttempt >= BOOTSTRAP_MAX_ATTEMPTS) {
          setErrorConnectivityState(lastConnectivityState);
          setErrorMessage(getBootstrapErrorMessage(result.error, lastConnectivityState));
          setStatus("error");
          return;
        }

        // Important distinction:
        // - Backend unreachable: do not say "Preparing your workspace".
        // - Backend reachable but bootstrap still failing: likely tenant provisioning,
        //   DB warm-up, gateway timeout, or another retryable bootstrap condition.
        setStatus(backendReachable ? "preparing" : "connecting");

        try {
          await sleep(BOOTSTRAP_RETRY_DELAY_MS, loopController.signal);
        } catch {
          return;
        }
      }
    }

    runBootstrapLoop();

    return () => {
      cancelled = true;
      loopController.abort();
    };
  }, [retryNonce, refreshAuth]);

  const retryNow = () => {
    setIsRetryingNow(true);
    setRetryNonce((value) => value + 1);
  };

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
                  color: BRAND.surface,
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
                  color: NEUTRAL[200],
                  fontSize: TEXT.lg,
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

  if (status === "noServiceAccess") {
    const assignedServices = Array.isArray(accessDeniedInfo?.servicesSummary)
      ? accessDeniedInfo.servicesSummary
      : [];

    const assignedServicesText = assignedServices
      .map((service) => {
        const key = service?.serviceKey || service?.key || service?.name || "Unknown service";
        const role = service?.role ? ` · ${service.role}` : "";
        const enabled = service?.enabled === false ? " · disabled" : "";
        return `${key}${role}${enabled}`;
      })
      .join(", ");

    return (
      <AuthShell
        title="Access not enabled"
        description="Your sign-in was successful, but your account is not currently enabled for Tracenium in this environment. Please contact your administrator to assign Tracenium access and try again."
        maxWidth={500}
        minHeight={470}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: 380,
            mb: 2.5,
            px: 2,
            py: 1.5,
            borderRadius: "14px",
            border: "1px solid rgba(248, 181, 52, 0.45)",
            background: "rgba(248, 181, 52, 0.10)",
            textAlign: "left",
          }}
        >
          <Typography
            sx={{
              color: BRAND.alert.warningOnDark,
              fontWeight: 700,
              fontSize: TEXT.md,
              mb: 0.75,
            }}
          >
            NO_SERVICE_ACCESS
          </Typography>

          <Typography sx={{ color: NEUTRAL[100], fontSize: TEXT.md, lineHeight: 1.6 }}>
            {accessDeniedInfo?.message ||
              "The user is authenticated, but does not have access to this Tracenium service."}
          </Typography>

          {accessDeniedInfo?.expectedServiceKey ? (
            <Typography sx={{ color: NEUTRAL[500], fontSize: TEXT.sm, lineHeight: 1.6, mt: 1 }}>
              Expected service: {accessDeniedInfo.expectedServiceKey}
            </Typography>
          ) : null}

          {assignedServicesText ? (
            <Typography sx={{ color: NEUTRAL[500], fontSize: TEXT.sm, lineHeight: 1.6, mt: 0.5 }}>
              Assigned service: {assignedServicesText}
            </Typography>
          ) : null}
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1.25,
            width: "100%",
            maxWidth: 380,
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <Button
            variant="contained"
            fullWidth
            onClick={handleLogout}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderRadius: "12px",
              py: 1.25,
              background: "rgb(70,157,159)",
              "&:hover": {
                background: "rgb(60,140,142)",
              },
            }}
          >
            Sign out
          </Button>

          <Button
            variant="outlined"
            fullWidth
            onClick={retryNow}
            disabled={isRetryingNow}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderRadius: "12px",
              py: 1.25,
              color: "rgb(116,249,253)",
              borderColor: "rgba(116,249,253,0.55)",
              "&:hover": {
                borderColor: "rgb(116,249,253)",
                background: "rgba(116,249,253,0.08)",
              },
            }}
          >
            Try again
          </Button>
        </Box>
      </AuthShell>
    );
  }

  if (status === "loading") {
    return (
      <AuthShell title="Tracenium" description="Loading ...">
        <CircularProgress
          size={40}
          thickness={4}
          sx={{
            color: "rgb(116,249,253)",
          }}
        />
      </AuthShell>
    );
  }

  if (status === "connecting") {
    return (
      <AuthShell
        title="Connecting to backend"
        description="We are trying to reach the Tracenium backend. This may take a few moments."
        minHeight={430}
      >
        <RetryProgress attempt={attempt} />
        <RetryMeta attempt={attempt} />
        <RetryButton disabled={isRetryingNow} onClick={retryNow} />
      </AuthShell>
    );
  }

  if (status === "preparing") {
    return (
      <AuthShell
        title="Preparing your workspace"
        description="We are setting up your tenant database and initial configuration. This usually happens only once and may take a few moments."
        minHeight={430}
      >
        <RetryProgress attempt={attempt} />
        <RetryMeta attempt={attempt} />
        <RetryButton disabled={isRetryingNow} onClick={retryNow} />
      </AuthShell>
    );
  }

  if (status === "error") {
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
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 520,
            px: { xs: 3, sm: 4 },
            py: { xs: 3.5, sm: 4 },
            borderRadius: "16px",
            border: "1px solid rgba(116,249,253,0.28)",
            background: "rgba(255,255,255,0.08)",
            boxShadow: "0 0 25px rgba(116,249,253,0.18)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            textAlign: "center",
          }}
        >
          <Typography
            variant="h6"
            sx={{ color: BRAND.surface, fontWeight: 600, mb: 1.5 }}
          >
            {getErrorTitle(errorConnectivityState)}
          </Typography>

          <Typography
            sx={{ color: NEUTRAL[200], fontSize: TEXT.base, lineHeight: 1.6, mb: 3 }}
          >
            {errorMessage ||
              "We could not connect to the backend after several attempts. Please try again."}
          </Typography>

          <Typography
            sx={{ color: NEUTRAL[500], fontSize: TEXT.md, lineHeight: 1.6, mb: 3 }}
          >
            Checked {`${API.BASE}${API.BOOTSTRAP}`} and {`${API.BASE}${API.HEALTH}`}.
          </Typography>

        </Paper>
      </Box>
    );
  }

  return children;
}
