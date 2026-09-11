import { describe, it, expect, beforeEach, vi } from "vitest";

const mockSignIn = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/integrations/supabase/client", async () => {
  const actual = await vi.importActual<typeof import("@/integrations/supabase/client")>(
    "@/integrations/supabase/client"
  );
  return {
    ...actual,
    supabase: {
      ...actual.supabase,
      auth: {
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    },
  };
});

const EMAIL = "canalmeunovohoby3@gmail.com";
const PASSWORD = "senha1003@";

const { supabase } = await import("@/integrations/supabase/client");
const { login, logout } = await import("@/lib/loginGate");

describe("loginGate — Supabase Auth", () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.signInWithPassword).mockReset();
    vi.mocked(supabase.auth.signOut).mockReset();
    vi.mocked(supabase.auth.getSession).mockReset().mockResolvedValue({ data: { session: null } });
    vi.mocked(supabase.auth.getUser).mockReset().mockResolvedValue({ data: { user: null } });
  });

  it("entra com credenciais corretas quando o Supabase aceita", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: { user: { email: EMAIL } }, user: { email: EMAIL } },
      error: null,
    });
    const res = await login(EMAIL, PASSWORD);
    expect(res.ok).toBe(true);
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
  });

  it("normaliza e-mail (caixa/espaços) antes de enviar ao Supabase", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: { user: { email: EMAIL } }, user: { email: EMAIL } },
      error: null,
    });
    const res = await login(`  ${EMAIL.toUpperCase()}  `, PASSWORD);
    expect(res.ok).toBe(true);
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
  });

  it("rejeita senha errada", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid password" },
    });
    const res = await login(EMAIL, "errada");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/invalid password/i);
  });

  it("rejeita e-mail que não é o esperado", async () => {
    const res = await login("outro@x.com", PASSWORD);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/inválid/i);
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejeita campos vazios", async () => {
    const r1 = await login("", "");
    expect(r1.ok).toBe(false);
    const r2 = await login(EMAIL, "");
    expect(r2.ok).toBe(false);
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("logout encerra a sessão via Supabase", async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });
    await logout();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
