import { supabase } from "@/integrations/supabase/client";

export const LOGIN_EMAIL =
  (import.meta.env.VITE_PROSPECTOR_LOGIN_EMAIL as string | undefined)?.trim() ||
  "canalmeunovohoby3@gmail.com";

export async function login(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const entered = (email ?? "").trim().toLowerCase();
  const expected = LOGIN_EMAIL.trim().toLowerCase();

  if (!entered || !password)
    return { ok: false, error: "Informe e-mail e senha." };

  if (entered !== expected)
    return { ok: false, error: "E-mail ou senha inválidos." };

  const { error } = await supabase.auth.signInWithPassword({
    email: entered,
    password,
  });

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export async function isLoggedIn(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

export async function currentEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}
