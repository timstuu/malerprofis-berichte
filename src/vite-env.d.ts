/// <reference types="vite/client" />

/**
 * Version und Baudatum werden beim Bauen aus package.json bzw. der Uhr
 * eingesetzt (siehe `define` in vite.config.ts). Sie stehen deshalb nirgends
 * im Quelltext — wer die Version ändern will, ändert package.json.
 */
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
