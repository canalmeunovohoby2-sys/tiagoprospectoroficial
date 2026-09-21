---
name: design-system-premium
description: Use SEMPRE antes de escrever qualquer CSS/UI, em qualquer site, app ou SaaS. Define como criar um sistema de design (tokens de cor, tipografia, espaçamento, sombra, raio de borda) com aparência premium/sob medida em vez de usar defaults genéricos de frameworks. Acione também quando o usuário disser "quero algo bonito", "premium", "profissional", "que pareça caro" ou pedir para melhorar a aparência de algo já existente.
---

# Design System Premium

## Regra de ouro
Nunca comece a codar UI sem antes definir um pequeno "design token file" (variáveis CSS ou objeto de tema). Isso é o que separa um site "feito por IA" de um site "feito por estúdio".

## 1. Cor
- Escolha 1 cor de marca (primária), 1 cor de destaque/CTA (que contraste com a primária), 2-3 neutros (fundo, texto, bordas) e 1 cor de sucesso/erro se houver formulários.
- Nunca use azul #007BFF, roxo #6C5CE7 ou verde #28A745 "de framework" sem intenção — são reconhecidos como padrão genérico. Prefira tons levemente dessaturados ou com nome de marca (ex: um verde-petróleo, um terracota, um azul-marinho profundo).
- Gere uma escala de 5 a 9 tons da cor primária (50 a 900) para hover states, fundos suaves, bordas.
- Defina como variáveis: `--color-primary`, `--color-primary-dark`, `--color-accent`, `--color-bg`, `--color-bg-alt`, `--color-text`, `--color-text-muted`, `--color-border`.

## 2. Tipografia
- No máximo 2 famílias: uma de destaque (títulos, com personalidade — serifada premium, ou sans geométrica marcante) e uma neutra de alta legibilidade para corpo (Inter, Manrope, General Sans, ou similar via Google Fonts).
- Escala tipográfica modular (ex: 14/16/18/20/24/32/40/56px) — nunca tamanhos aleatórios.
- `line-height` generoso no corpo (1.5–1.7) e mais apertado em títulos grandes (1.05–1.2).
- Peso: use 600–800 em títulos, 400–500 em corpo. Evite tudo em negrito ou tudo fino.

## 3. Espaçamento e grid
- Escala de espaçamento em base 4 ou 8 (4,8,12,16,24,32,48,64,96,128).
- Respiro generoso entre seções (mín. 80–120px em desktop, 48–64px em mobile).
- Grid de 12 colunas ou container com `max-width` (1200–1320px) e padding lateral consistente.

## 4. Elevação e forma
- Sombras suaves e sutis (`box-shadow` com baixa opacidade, blur alto) — nunca sombras duras padrão de framework.
- Raio de borda consistente em todo o site (ex: sempre 12px em cards, 8px em botões, ou sempre "pill" — escolha um estilo e mantenha).
- Transições em todos os elementos interativos (150–250ms, `ease-out`).

## 5. Consistência
- Componentize: botão primário, botão secundário, card, badge, input — cada um com estado hover/focus/disabled definido uma vez e reutilizado.
- Nunca misture estilos de ícone (outline com filled), nem mais de 2 raios de borda distintos no mesmo layout.

## Checklist antes de aprovar o visual
- [ ] Existe um arquivo/objeto único de tokens (não cores "soltas" espalhadas pelo código)?
- [ ] A paleta tem no máximo 4-5 cores + neutros?
- [ ] Todas as fontes vêm de no máximo 2 famílias?
- [ ] O espaçamento entre seções é generoso e consistente?
- [ ] Existe estado de hover/focus em todo elemento clicável?
