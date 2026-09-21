---
name: app-mobile-ui-nativo
description: Use ao desenhar telas de aplicativo mobile (nativo, PWA ou web app com cara de app) para garantir que a interface pareça um app profissional, não um site encolhido. Acione sempre que o usuário pedir "aplicativo", "app" ou mencionar iOS/Android.
---

# UI de Aplicativo Mobile Premium

## Diferenças fundamentais entre "site responsivo" e "app de verdade"
- Navegação por tab bar inferior (não menu hambúrguer) para as 3-5 seções principais — padrão que usuários de app esperam.
- Gestos nativos: swipe para voltar/deletar, pull-to-refresh, long-press para ações contextuais.
- Transições de tela como um app (slide lateral, não fade de site), com feedback tátil quando disponível (haptics em nativo).
- Estados vazios (empty states) ilustrados e com CTA claro, nunca uma tela em branco.
- Skeleton loading em vez de spinners genéricos ao carregar listas/dados.

## Componentes essenciais
- Tab bar inferior fixa com ícones + labels curtos, item ativo claramente destacado.
- Header/app bar com título da tela e ações contextuais (busca, filtro, adicionar) alinhadas à direita.
- Cards de conteúdo com toque generoso (mínimo 44px de altura em itens de lista tocáveis).
- Modais/bottom sheets para ações secundárias (mais nativo em mobile do que modais centralizados de desktop).
- Feedback imediato a toda ação (toast/snackbar de confirmação, estado de loading no próprio botão).

## Consistência com o sistema operacional
- Respeitar áreas seguras (notch, barra de gestos) com `safe-area-inset`.
- Seguir convenções visuais que o usuário já conhece (ex: botão de voltar no canto esperado, pull-to-refresh no topo de listas) — inovar demais na navegação básica prejudica a usabilidade percebida.

## Checklist
- [ ] A navegação principal usa tab bar inferior, não menu hambúrguer, quando há poucas seções centrais?
- [ ] Existem estados vazios, de erro e de loading desenhados para cada tela com dados dinâmicos?
- [ ] Áreas seguras (notch/gestos) são respeitadas?
