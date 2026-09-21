---
name: dark-light-mode
description: Use quando o usuário pedir modo escuro/claro em um app, dashboard ou SaaS, ou quando o produto for do tipo usado por longos períodos (dashboards, editores, ferramentas internas). Não é obrigatório para todo site institucional, mas é esperado em produtos SaaS/app modernos.
---

# Modo Claro/Escuro

## Quando aplicar
- SaaS, dashboards, apps internos e ferramentas de produtividade: praticamente obrigatório hoje em dia.
- Sites institucionais/landing pages de vendas: opcional, geralmente não prioritário (foco deve ser conversão em um tema consistente).

## Como implementar bem
- Baseie-se nos mesmos tokens de `design-system-premium`, criando um segundo conjunto de valores para o tema escuro (não apenas invertendo preto/branco).
- Nunca use preto puro (#000) em fundo escuro — prefira tons de cinza-azulado escuro (#0F1115, #14161C) para reduzir fadiga visual e permitir profundidade (cards um tom mais claro que o fundo).
- Ajuste também a cor de marca no modo escuro: cores muito saturadas "vibram" desconfortavelmente sobre fundo escuro — geralmente é preciso reduzir levemente a saturação/aumentar o brilho.
- Detecte preferência do sistema (`prefers-color-scheme`) como padrão inicial, mas sempre ofereça um toggle manual persistido (localStorage/preferência do usuário).
- Garanta que contraste mínimo (WCAG) seja mantido em AMBOS os temas — teste os dois, não apenas o claro.
- Ícones, gráficos e imagens com fundo transparente devem ter uma variante ou tratamento para não "brigar" com o fundo escuro.

## Checklist
- [ ] O tema escuro foi desenhado com tokens próprios, não apenas invertido automaticamente?
- [ ] O toggle é persistido e respeita a preferência inicial do sistema?
- [ ] Contraste testado nos dois temas?
