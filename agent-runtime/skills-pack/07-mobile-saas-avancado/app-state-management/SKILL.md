---
name: app-state-management
description: Use ao estruturar o gerenciamento de estado de qualquer aplicativo mobile ou SaaS complexo (muitas telas, dados compartilhados, cache de servidor). Acione quando o usuário mencionar "estado", "state management", "Redux", "Zustand", "Provider" ou quando o app começar a ficar difícil de manter por dados espalhados.
---

# Gerenciamento de Estado de Aplicativo

## Separar os tipos de estado (regra mais importante)
1. **Estado de servidor** (dados vindos de API: usuário, pedidos, produtos): gerenciar com biblioteca de cache/data-fetching dedicada (React Query/TanStack Query, SWR, Riverpod+AsyncNotifier no Flutter) — nunca guardar dado de servidor "cru" em um store genérico sem estratégia de cache/revalidação.
2. **Estado de UI local** (modal aberto, aba selecionada, formulário em edição): manter local ao componente/tela (useState, ou equivalente) sempre que possível — evitar "global-izar" estado que só uma tela usa.
3. **Estado global de app** (usuário autenticado, tema, preferências, carrinho): usar um store leve e previsível (Zustand, Redux Toolkit, Riverpod, Provider) — só para o que realmente precisa ser acessado em múltiplos pontos distantes da árvore de componentes.

## Boas práticas
- Evitar prop drilling profundo, mas também evitar jogar tudo em um estado global "gigante" só por comodidade — cada dado deve morar no nível mais baixo possível que ainda atenda quem precisa dele.
- Cache de dados de servidor deve ter estratégia clara de invalidação (ex: invalidar lista de pedidos após criar um novo pedido) — dado "stale" mostrado como atual é uma das causas mais comuns de bug percebido pelo usuário.
- Estado otimista (optimistic update): ao curtir, favoritar, marcar como concluído etc., atualizar a UI imediatamente e reverter silenciosamente se a chamada ao servidor falhar — sensação de app rápido e responsivo.
- Persistência seletiva: apenas o necessário (token, preferências) deve sobreviver ao fechar o app (via storage local); dados de servidor devem ser buscados de novo ou revalidados, não confiados como cache eterno.

## Checklist
- [ ] Estado de servidor, estado de UI local e estado global estão claramente separados?
- [ ] Existe estratégia de invalidação de cache após mutações (criar/editar/excluir)?
- [ ] Ações comuns (curtir, favoritar) usam atualização otimista para sensação de rapidez?
