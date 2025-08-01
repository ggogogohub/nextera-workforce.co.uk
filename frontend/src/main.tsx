import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

// -----------------------------------------------------------------------------
// Dev-only: silence Chrome/Edge extension noise "A listener indicated an async
// response … message channel closed".  This originates from injected
// extensions, not our code; suppress to keep console clean while preserving
// real error visibility.  Listener is stripped by Vite tree-shaking in prod.
// -----------------------------------------------------------------------------
if (import.meta.env.DEV) {
  const noiseMatcher = (txt: string) =>
    txt.includes('message channel closed') || txt.includes('chrome.runtime');

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = typeof reason === 'string' ? reason : reason?.message || '';
    if (noiseMatcher(msg)) {
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (noiseMatcher(msg)) {
      event.preventDefault();
    }
  });

  // Extra: some extensions print directly via console.error inside promises –
  // patch console.error so those lines are filtered too.  Keep everything else.
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (args.some((arg) => typeof arg === 'string' && noiseMatcher(arg))) {
      return;
    }
    originalConsoleError(...args);
  };
}
