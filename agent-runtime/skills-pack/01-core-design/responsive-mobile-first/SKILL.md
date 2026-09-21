---
name: responsive-mobile-first
description: Use em TODO layout de site ou app, sem exceção — a maioria do tráfego é mobile. Acione sempre ao criar ou revisar qualquer tela, e especialmente quando o usuário mencionar "celular", "responsivo", "mobile" ou reportar que algo "quebra" em telas menores.
---

# Responsividade Mobile-First

## Abordagem
Desenhe e codifique primeiro para 375-390px de largura, depois expanda com media queries `min-width` para tablet (768px) e desktop (1024px, 1280px, 1440px+). Nunca o inverso.

## Regras práticas
- Tipografia fluida: use `clamp(min, preferred, max)` para títulos (ex: `clamp(1.75rem, 4vw + 1rem, 3.5rem)`) em vez de breakpoints fixos para cada tamanho de fonte.
- Toques (tap targets) com no mínimo 44x44px em mobile.
- Menu mobile: hambúrguer com painel full-screen ou drawer lateral, nunca menu desktop encolhido.
- Imagens: `srcset`/`picture` para servir tamanhos adequados; nunca carregar imagem de 4000px em um card de 300px.
- Formulários em mobile: um campo por linha, teclado apropriado (`type="tel"`, `type="email"`, `inputmode`), botão de envio fixo/sticky quando fizer sentido.
- Tabelas de dados em mobile: transformar em cards empilhados ou permitir scroll horizontal contido, nunca espremer colunas até ilegível.
- Testar sempre em pelo menos 3 breakpoints reais: 375px (mobile pequeno), 768px (tablet), 1440px (desktop).
- Evite `100vh` puro em mobile (barra de navegador dinâmica) — use `100dvh` como fallback moderno.

## Checklist
- [ ] O layout foi pensado a partir de 375px, não encolhido de um design desktop?
- [ ] Toques têm área mínima de 44px?
- [ ] Fontes usam escala fluida (clamp) nos títulos principais?
- [ ] Testado visualmente em mobile, tablet e desktop antes de considerar pronto?
