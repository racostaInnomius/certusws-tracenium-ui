import AppShell from "./layout/AppShell";
import AuthGate from "./auth/AuthGate";
import { MspProvider } from "./msp/MspContext";

export default function App() {
  return (
    <AuthGate>
      {/* MSP navigation state (portfolio + active client) wraps the shell
          so the tenant switcher, breadcrumb, and portfolio view all read
          one source of truth. See src/msp/. */}
      <MspProvider>
        <AppShell />
      </MspProvider>
    </AuthGate>
  );
}