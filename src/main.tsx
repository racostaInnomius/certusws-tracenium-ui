import { StrictMode } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from "./auth/AuthContext";
// ConfirmProvider mounts a single Dialog at the root. Pages that
// need confirmation use `useConfirm()` instead of window.confirm,
// keeping the visual identity consistent across the portal.
import { ConfirmProvider } from "./components/common/ConfirmDialog";
import traceniumMuiTheme from "./theme/traceniumMuiTheme";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={traceniumMuiTheme}>
      <CssBaseline />
      <AuthProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
