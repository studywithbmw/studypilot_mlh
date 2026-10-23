import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './lib/i18n';
import { applyTheme, watchSystemTheme } from './store/useSettingsStore';

// Initialize persisted theme immediately to prevent flash
const savedTheme = (typeof window !== 'undefined' ? localStorage.getItem('studypilot_settings_storage') : null);
try {
  const parsed = savedTheme ? JSON.parse(savedTheme) : null;
  applyTheme(parsed?.state?.theme || 'dark');
} catch {
  applyTheme('dark');
}

watchSystemTheme();

// Dev only: drop any service worker left over from earlier runs so it can't reload the page.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  if ('caches' in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
}

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
