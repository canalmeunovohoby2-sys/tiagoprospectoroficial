import { useState } from "react";
import { Sun, Moon, Palette, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AIProviderStatus } from "@/components/app/AIProviderStatus";
import { AiProvidersSettings } from "@/components/app/AiProvidersSettings";
import { useTheme } from "@/hooks/useTheme";
import { readBrandColor, setBrandColor, DEFAULT_BRAND } from "@/lib/brandColor";

const PRESETS = [
  "#ED2C2C", // Vermelho (padrão)
  "#0EA5E9", // Azul
  "#7C3AED", // Roxo
  "#16A34A", // Verde
  "#EA580C", // Laranja
  "#0891B2", // Teal
  "#DB2777", // Rosa
  "#111827", // Grafite
];

export default function Settings() {
  const { theme, toggle } = useTheme();
  const [brand, setBrand] = useState<string>(() => (typeof window !== "undefined" ? readBrandColor() : DEFAULT_BRAND));

  function changeBrand(hex: string) {
    setBrand(hex);
    setBrandColor(hex);
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aparência, status e configuração dos provedores de IA. As chaves dos provedores ficam somente no servidor (Supabase).
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" /> Aparência
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 p-3 space-y-2">
            <p className="text-sm font-medium">Tema</p>
            <p className="text-xs text-muted-foreground">Alternar entre os modos escuro e claro.</p>
            <Button variant="outline" size="sm" onClick={toggle} className="w-full justify-center">
              {theme === "dark" ? <Sun className="h-4 w-4 mr-1" /> : <Moon className="h-4 w-4 mr-1" />}
              {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </Button>
          </div>

          <div className="rounded-xl border border-border/60 p-3 space-y-2">
            <p className="text-sm font-medium">Cor de marca</p>
            <p className="text-xs text-muted-foreground">A cor principal (no lugar do vermelho padrão) usada em botões, links e destaques.</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brand}
                onChange={(e) => changeBrand(e.target.value)}
                className="h-8 w-10 rounded-md border border-border bg-background cursor-pointer"
                aria-label="Escolher cor de marca"
              />
              <span className="text-xs font-mono text-muted-foreground">{brand.toUpperCase()}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Restaurar vermelho padrão" onClick={() => changeBrand(DEFAULT_BRAND)}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  onClick={() => changeBrand(hex)}
                  className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${brand.toUpperCase() === hex.toUpperCase() ? "ring-2 ring-offset-2 ring-offset-background ring-primary" : ""}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <section>
        <h2 className="mb-3 font-semibold">Provedores de IA</h2>
        <Card className="p-5">
          <AiProvidersSettings />
        </Card>
      </section>

      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Status e diagnóstico</h2>
        <AIProviderStatus />
      </Card>
    </div>
  );
}
