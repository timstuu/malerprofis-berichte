import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Automatic PWA service worker registration
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('Neue Version verfügbar. Bitte aktualisieren.');
    },
    onOfflineReady() {
      console.log('App ist bereit für den Offline-Betrieb.');
    },
  });
}

