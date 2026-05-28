import * as React from "react";
import { httpGetJson, isAuthError } from "../api/http";

type AuthValue = {
  auth: any;
  loading: boolean;
};

const AuthContext = React.createContext<AuthValue | null>(null);

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeBootstrapAuth(data: any) {
  if (!isObject(data)) return data ?? null;

  const user =
    (isObject(data.user) && data.user) ||
    (isObject(data.auth) && data.auth) ||
    (isObject(data.principal) && data.principal) ||
    null;

  // Keep the full bootstrap payload available because different backend
  // versions expose IDP claims in different places. Flattening the user
  // object on top also keeps legacy consumers that read auth.email / auth.role
  // working without needing every component to know the full bootstrap shape.
  return {
    ...data,
    ...(user || {}),
    user: user || data.user || null,
    bootstrap: data,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const data = await httpGetJson("/api/bootstrap", {
          cache: "no-store",
          timeoutMs: 12000,
          notifyOnTemporaryError: false,
        });

        if (!alive) return;

        setAuth(normalizeBootstrapAuth(data));
      } catch (e: any) {
        // http.js already emits the global auth-required event and redirects
        // for 401 / UNAUTHENTICATED. Do not convert that into a local-only
        // silent auth state that would leave the user in the protected shell.
        if (!isAuthError(e)) {
          console.error("Auth load failed", e);
        }

        if (!alive) return;
        setAuth(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ auth, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error("useAuthContext must be used inside AuthProvider");
  }

  return context;
}
