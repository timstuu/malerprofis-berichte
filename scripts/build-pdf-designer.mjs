// Baut den PDF-Designer: eine einzelne HTML-Seite, die als Artifact auf
// claude.ai veröffentlicht wird.
//
// Die Seite enthält die echten Zeichenfunktionen der App (gebündelt mit
// esbuild), den aktuellen Stand von src/lib/pdf/design.json und das Logo.
// Nach jeder Änderung an design.json oder am PDF-Code neu bauen und das
// Artifact neu veröffentlichen — siehe pdf-designer/README.md.
//
//   npm run pdf-designer

// esbuild kommt mit Vite und ist deshalb immer installiert.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

const pkg = JSON.parse(read('package.json'));

const bundle = await build({
  entryPoints: [path.join(root, 'src/lib/pdf/designer-entry.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'PdfKit',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  // Optionale Helfer von jsPDF für HTML-Export — die PDFs brauchen sie nicht.
  external: ['html2canvas', 'dompurify', 'canvg', 'core-js'],
  logLevel: 'warning',
});

const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const logo = fs.readFileSync(path.join(root, 'public/icons/logo.png')).toString('base64');
const design = JSON.stringify(JSON.parse(read('src/lib/pdf/design.json')));

const html = read('pdf-designer/template.html')
  .replace('/*__PDFKIT__*/', () => script)
  .replace('"__CODE_DESIGN__"', () => design)
  .replace('__LOGO__', () => `data:image/png;base64,${logo}`)
  .replaceAll('__APP_VERSION__', () => pkg.version);

const outDir = path.join(root, 'pdf-designer/dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'pdf-designer.html');
fs.writeFileSync(out, html);
console.log(`PDF-Designer gebaut: ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB, App ${pkg.version})`);
