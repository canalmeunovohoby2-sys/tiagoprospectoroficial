import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/loginGate";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const from = location.state?.from || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await login(email, password);
    if (!res.ok) {
      setError(res.error ?? "Não foi possível entrar.");
      setBusy(false);
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.18),transparent_70%)]" />
      <Card className="relative w-full max-w-md p-6 sm:p-8 border-border/60 bg-card/80 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 rounded-2xl bg-gradient-primary flex items-center justify-center mb-3 shadow-lg">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">TiagoProspector</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesse sua conta para continuar</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="email" type="email" autoComplete="email" autoFocus
                placeholder="voce@exemplo.com" className="pl-9"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="password" type={showPass ? "text" : "password"} autoComplete="current-password"
                placeholder="••••••••" className="pl-9 pr-16"
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPass((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
                {showPass ? "ocultar" : "mostrar"}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Entrar
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground text-center mt-5">
          Acesso restrito. Sessão protegida neste dispositivo.
        </p>
      </Card>
    </div>
  );
}
