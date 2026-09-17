import type { PdfLogo } from './design.ts';

/**
 * Lädt das Firmenlogo für die PDFs der App. Fehlt es, kommt das PDF ohne aus.
 *
 * Getrennt von den Zeichenfunktionen, weil nur die App den Pfad über
 * `import.meta.env` kennt — der Designer reicht sein Logo selbst herein.
 */
export async function loadPdfLogo(): Promise<PdfLogo> {
  try {
    const img = new Image();
    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    img.src = `${window.location.origin}${base}icons/logo.png?v=${__APP_VERSION__}`;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    return img;
  } catch (e) {
    console.error('Logo konnte für das PDF nicht geladen werden:', e);
    return null;
  }
}
