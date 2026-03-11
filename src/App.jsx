import AppShell from "./layout/AppShell";
import AuthGate from "./auth/AuthGate";

export default function App() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}