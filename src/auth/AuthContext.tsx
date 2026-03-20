import * as React from "react";

const API_BASE = import.meta.env.VITE_API_BASE;

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
        const res = await fetch(`${API_BASE}/api/bootstrap`, {
          method: "GET",
          credentials: "include",
        });

        if (res.status === 401) {
          const text = await res.text().catch(() => "");
          throw new Error(`UNAUTHENTICATED:${text}`);
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }

        const data = await res.json();

        if (!alive) return;

        setAuth(data?.user ?? data ?? null);
      } catch (e) {
        console.error("Auth load failed", e);
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