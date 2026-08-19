import { createClient } from '@supabase/supabase-js';

/**
 * Zentraler Supabase-Client.
 *
 * Die Zugangsdaten kommen aus den Vite-Umgebungsvariablen und werden beim Build
 * eingesetzt. Fehlen sie, zeigt die App einen erklärenden Hinweisbildschirm
 * statt einer weißen Seite — sichtbar, aber nicht stillschweigend: Die
 * Vorgängerversion hat Verbindungsfehler verschluckt und lief dadurch
 * monatelang mit leeren Daten.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** false, wenn der Build ohne Supabase-Zugangsdaten erzeugt wurde. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url || 'https://nicht-konfiguriert.invalid',
  anonKey || 'nicht-konfiguriert',
  {
    auth: {
      // Session im localStorage halten und selbstständig erneuern, damit sich
      // niemand täglich neu anmelden muss — weder die Maler noch der Büro-TV.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
