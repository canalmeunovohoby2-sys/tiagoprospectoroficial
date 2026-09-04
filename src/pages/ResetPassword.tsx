import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Target, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Quando o usuário chega pelo link do email, o Supabase dispara PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Caso a sessão já tenha sido restaurada antes do listener montar.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (password.length < 6) return setErrorMsg("Mínimo 6 caracteres.");
    if (password !== confirm) return setErrorMsg("As senhas não coincidem.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      console.error("[ResetPassword] error:", error);
      const msg = /password/i.test(error.message)
        ? "Senha rejeitada (provavelmente está em listas de senhas vazadas). Use algo único."
        : error.message;
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    toast.success("Senha atualizada! Entrando…");
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-gradient-glow p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant">
            <Target className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">LeadHunter</h1>
            <p className="text-xs text-muted-foreground -mt-1">Redefinir senha</p>
          </div>
        </div>

        <Card className="p-6 shadow-elegant border-border/50 backdrop-blur">
          {!ready ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Validando link de recuperação…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="pw">Nova senha</Label>
                <Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <Label htmlFor="pw2">Confirmar senha</Label>
                <Input id="pw2" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
              <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
