import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import type { Employee } from './database.types.ts';

/**
 * Anmeldung und Identität.
 *
 * `employee` ist das Stammdatenprofil zum angemeldeten Konto. Erst damit ist
 * bekannt, wer die Person ist und ob sie Büro (`admin`), Maler (`worker`) oder
 * der Anzeige-Account des Fernsehers (`tv`) ist.
 */

interface AuthState {
  session: Session | null;
  employee: Employee | null;
  loading: boolean;
  /** true, solange das Profil zum angemeldeten Konto fehlt (Konto ohne Stammdaten). */
  profileMissing: boolean;
  /** Gesetzt, wenn das Profil wegen eines Fehlers nicht geladen werden konnte. */
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshEmployee: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadEmployee = async (userId: string) => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      // Wird der Fehler hier verschluckt, startet die App ohne bekannte
      // Identität und zeigt überall leere Listen, ohne dass irgendwo stünde,
      // warum. Deshalb wird er nach oben gereicht und angezeigt.
      console.error('Mitarbeiterprofil konnte nicht geladen werden:', error.message);
      setEmployee(null);
      setProfileMissing(false);
      setProfileError(error.message);
      return;
    }

    setEmployee(data as Employee | null);
    setProfileMissing(data === null);
    setProfileError(null);
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadEmployee(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!active) return;
      setSession(next);
      if (next?.user) {
        await loadEmployee(next.user.id);
      } else {
        setEmployee(null);
        setProfileMissing(false);
        setProfileError(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      // Supabase meldet falsche Zugangsdaten auf Englisch — für die Maler übersetzt.
      const message =
        error.message === 'Invalid login credentials'
          ? 'E-Mail-Adresse oder Passwort ist falsch.'
          : error.message;
      return { error: message };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshEmployee = async () => {
    if (session?.user) await loadEmployee(session.user.id);
  };

  return (
    <AuthContext.Provider
      value={{ session, employee, loading, profileMissing, profileError, signIn, signOut, refreshEmployee }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.');
  return ctx;
}

/** Kurzform: Ist der angemeldete Benutzer Büro? */
export function useIsAdmin(): boolean {
  return useAuth().employee?.role === 'admin';
}
