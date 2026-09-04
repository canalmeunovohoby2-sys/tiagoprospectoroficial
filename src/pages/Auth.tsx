import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Target, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Mode = "auth" | "forgot";

export default function Auth() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("auth");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  const clearMsgs = () => {
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMsgs();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      console.error("[Auth] signIn error:", error);
      setErrorMsg(error.message);
      toast.error(error.message);
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate("/");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMsgs();
    if (password.length < 6) {
      setErrorMsg("A senha precisa ter no mínimo 6 caracteres.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) {
      console.error("[Auth] signUp error:", error);
      const msg = /password/i.test(error.message)
        ? "Senha rejeitada (provavelmente está em listas de senhas vazadas). Use algo único, ex: MinhaSenh@LH2026"
        : error.message;
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    if (data.session) {
      toast.success("Conta criada! Entrando…");
      navigate("/");
    } else {
      setInfoMsg("Conta criada. Use email e senha na aba 'Entrar'.");
      toast.success("Conta criada!");
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMsgs();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      console.error("[Auth] reset error:", error);
      setErrorMsg(error.message);
      toast.error(error.message);
      return;
    }
    setInfoMsg(`Link de recuperação enviado para ${email}. Verifique sua caixa de entrada (e o spam).`);
    toast.success("Link enviado!");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-hidden relative">
      {/* Big neon pulse — sits behind everything and extends far beyond the card */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="absolute h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle,hsl(174_100%_55%/0.55),transparent_60%)] animate-neon-pulse" />
        <div className="absolute h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,hsl(174_100%_60%/0.7),transparent_65%)] blur-2xl animate-neon-pulse [animation-delay:0.6s]" />
        <div className="absolute h-[380px] w-[380px] rounded-full bg-[conic-gradient(from_0deg,hsl(174_100%_60%/0.6),transparent_40%,hsl(174_100%_70%/0.6),transparent_80%)] blur-2xl animate-neon-spin" />
      </div>

      <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="relative flex items-center justify-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant">
            <Target className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">LeadHunter</h1>
            <p className="text-xs text-muted-foreground -mt-1">Brasil · Prospecção inteligente</p>
          </div>
        </div>

        {/* Pulsing neon ring framing the card */}
        <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-2xl ring-2 ring-primary/70 animate-neon-ring" />

        <Card className="relative p-6 backdrop-blur-xl bg-card/85 border-primary/40 ring-1 ring-primary/30 [box-shadow:0_0_60px_-10px_hsl(174_100%_55%/0.6),0_0_120px_-30px_hsl(174_100%_55%/0.5),inset_0_0_0_1px_hsl(174_100%_60%/0.15)]">

          {mode === "forgot" ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => { setMode("auth"); clearMsgs(); }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>
              <div>
                <h2 className="text-lg font-semibold">Recuperar senha</h2>
                <p className="text-sm text-muted-foreground">Enviaremos um link para redefinir sua senha.</p>
              </div>
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <Label htmlFor="email-fg">Email</Label>
                  <Input id="email-fg" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
                </div>
                {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
                {infoMsg && <p className="text-sm text-primary">{infoMsg}</p>}
                <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar link de recuperação"}
                </Button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <Label htmlFor="email-in">Email</Label>
                <Input id="email-in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
              </div>
              <div>
                <Label htmlFor="pw-in">Senha</Label>
                <Input id="pw-in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
              {infoMsg && <p className="text-sm text-primary">{infoMsg}</p>}
              <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
              </Button>
              <button
                type="button"
                onClick={() => { setMode("forgot"); clearMsgs(); }}
                className="block w-full text-center text-sm text-muted-foreground hover:text-primary"
              >
                Esqueci minha senha
              </button>
            </form>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Encontre empresas que precisam de Landing Pages — todas as buscas usam apenas dados públicos.
        </p>
      </div>
    </div>
  );
}
