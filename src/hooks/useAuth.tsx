import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAnonymous: boolean;
  authError: string | null;
  ensureSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  isAnonymous: false,
  authError: null,
  ensureSession: async () => false,
  signOut: async () => {},
});

const ANON_ERROR_HINT =
  "A sessão de uso pessoal não pôde ser iniciada. Habilite os sign-ins anônimos no Supabase (Authentication > Providers > Anonymous) e recarregue a página.";

function describeAnonError(error: { message?: string } | null): string {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("anonymous") || message.includes("signup") || message.includes("sign up")) {
    return ANON_ERROR_HINT;
  }
  return error?.message || ANON_ERROR_HINT;
}

/**
 * Modo de uso pessoal:
 * - Se já existir sessão (e-mail/senha), ela é mantida.
 * - Se não houver sessão, o app entra automaticamente criando uma conta anônima
 *   no Supabase. Isso preserva todas as políticas RLS atuais (auth.uid() =
 *   user_id) sem exigir tela de login nem alterações no banco.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const anonAttempt = useRef<Promise<boolean> | null>(null);

  const applySession = useCallback((next: Session | null) => {
    setSession((current) => (current?.access_token === next?.access_token ? current : next));
    setLoading(false);
  }, []);

  const ensureSession = useCallback(async (): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setAuthError(null);
      return true;
    }

    if (!anonAttempt.current) {
      anonAttempt.current = (async () => {
        try {
          const { data: anon, error } = await supabase.auth.signInAnonymously();
          if (error) {
            console.warn("[Auth] sign-in anônimo indisponível", error.message);
            setAuthError(describeAnonError(error));
            return false;
          }
          const { data: refreshed } = await supabase.auth.getSession();
          if (refreshed.session) setSession(refreshed.session);
          setAuthError(null);
          return !!anon.session || !!refreshed.session;
        } catch (e) {
          const message = e instanceof Error ? e.message : "erro inesperado";
          console.warn("[Auth] sign-in anônimo falhou", message);
          setAuthError(describeAnonError({ message }));
          return false;
        } finally {
          anonAttempt.current = null;
        }
      })();
    }
    return anonAttempt.current;
  }, []);

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      if (s) setAuthError(null);
      applySession(s);
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const s = data.session;
      if (s) {
        applySession(s);
        return;
      }
      // Uso pessoal: sem sessão existente, entra automaticamente.
      const ok = await ensureSession();
      if (!active) return;
      if (!ok) setLoading(false);
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession, ensureSession]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAnonymous: session?.user?.is_anonymous ?? false,
      authError,
      ensureSession,
      signOut,
    }),
    [session, loading, authError, ensureSession, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
