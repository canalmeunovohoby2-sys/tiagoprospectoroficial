---
name: microinteractions-animations
description: Use ao implementar qualquer elemento interativo (botões, cards, menus, formulários, scroll) em sites e apps, para adicionar microinterações e animações sutis que transmitem qualidade premium. Acione quando o usuário disser "quero algo mais vivo/dinâmico/moderno" ou quando a interface parecer "estática" ou "sem vida".
---

# Microinterações e Animações

## Princípio
Animação premium é **sutil e funcional**, nunca chamativa por si só. Ela deve responder à ação do usuário e guiar a atenção, não distrair.

## Onde aplicar (essencial)
- **Hover em botões/cards**: leve elevação (translateY -2px a -4px) + sombra crescente + mudança de cor sutil, 150-200ms ease-out.
- **Scroll reveal**: elementos entram com fade + translateY(20-30px) conforme entram na viewport (Intersection Observer ou biblioteca como Framer Motion/GSAP/AOS). Nunca todos ao mesmo tempo — stagger de 60-100ms entre itens de uma lista.
- **Navegação/menu**: transições suaves ao abrir/fechar (mobile menu, dropdowns), nunca "pop" abrupto.
- **Estados de formulário**: validação inline com transição de cor/borda, shake sutil em erro, check verde em sucesso.
- **Loading/skeleton**: nunca spinner genérico isolado — prefira skeleton screens que já sugerem o layout final.
- **Contadores animados**: números (ex: "+500 clientes") contando de 0 até o valor ao entrar na viewport.
- **Parallax leve**: em heroes, mover imagem de fundo mais devagar que o scroll (fator 0.3-0.5) para dar profundidade — usar com moderação.

## Regras de performance e bom gosto
- Nunca anime `width`/`height`/`top`/`left` — anime `transform` e `opacity` (compositor da GPU).
- Durações: micro (100-200ms) para feedback imediato; transições de seção (300-500ms); nunca acima de 600ms em interações comuns.
- Respeite `prefers-reduced-motion`: desative/reduza animações para quem configurou isso no sistema.
- Easing: use curvas customizadas (`cubic-bezier`) em vez de `linear` — dá sensação mais orgânica.

## Checklist
- [ ] Todo elemento clicável tem feedback visual ao hover/tap?
- [ ] O scroll reveal está implementado com stagger, não tudo de uma vez?
- [ ] `prefers-reduced-motion` é respeitado?
- [ ] Nenhuma animação passa de ~600ms nem trava o scroll?
