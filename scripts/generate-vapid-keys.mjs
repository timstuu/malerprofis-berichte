/**
 * Erzeugt ein VAPID-Schlüsselpaar für Web-Push.
 *
 *   node scripts/generate-vapid-keys.mjs
 *
 * Die Schlüssel entstehen auf diesem Rechner und werden nirgends gespeichert —
 * bitte direkt aus der Ausgabe übernehmen:
 *
 *   Öffentlicher Schlüssel -> VITE_VAPID_PUBLIC_KEY
 *                             (.env.local und GitHub-Repository-Secret)
 *   Privater Schlüssel     -> Supabase, als Secret der Edge Function:
 *                             supabase secrets set VAPID_PRIVATE_KEY=...
 *                             Niemals ins Repository legen.
 */

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

// Öffentlicher Schlüssel als unkomprimierter Punkt (65 Byte, beginnt mit 0x04).
const publicDer = publicKey.export({ type: 'spki', format: 'der' });
const publicRaw = publicDer.subarray(publicDer.length - 65);

// Privater Schlüssel: die 32 Byte des Skalars aus der PKCS#8-Struktur.
const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' });
const marker = Buffer.from([0x04, 0x20]); // OCTET STRING der Länge 32
const start = privateDer.indexOf(marker) + marker.length;
const privateRaw = privateDer.subarray(start, start + 32);

const base64url = (buffer) => buffer.toString('base64url');

console.log('\nVAPID-Schlüsselpaar\n');
console.log('Öffentlich (VITE_VAPID_PUBLIC_KEY):');
console.log(base64url(publicRaw));
console.log('\nPrivat (VAPID_PRIVATE_KEY, nur in Supabase hinterlegen):');
console.log(base64url(privateRaw));
console.log('\nDer private Schlüssel gehört nicht ins Repository.\n');
