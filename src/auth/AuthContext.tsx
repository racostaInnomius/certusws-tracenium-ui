import * as React from "react";
import { httpGetJson, isAuthError } from "../api/http";

type AuthValue = {
  auth: any;
  loading: boolean;
};

const AuthContext = React.createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const data = await httpGetJson("/api/bootstrap", {
          cache: "no-store",
          timeoutMs: 12_000,
          notifyOnTemporaryError: false,
        });

        if (!alive) return;

        setAuth(data?.user ?? data ?? null);
      } catch (e) {
        console.error("Auth load failed", e);

        if (!alive) return;

        // http.js already emits the global auth-required event and redirects
        // on 401 / UNAUTHENTICATED. Keep local state clean but do not swallow
        // or reinterpret auth failures as temporary backend errors.
        if (isAuthError(e)) {
          setAuth(null);
          return;
        }

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
