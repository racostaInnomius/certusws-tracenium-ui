import AppShell from "./layout/AppShell";
import Assets from "./pages/Assets";
import AuthGate from "./auth/AuthGate";

export default function App() {
  return (
    <AuthGate>
      <AppShell>
        <Assets />
      </AppShell>
    </AuthGate>
  );
}