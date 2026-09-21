---
name: dashboard-admin-premium
description: Use ao construir qualquer painel administrativo, dashboard de métricas ou área logada de SaaS. Acione quando o usuário mencionar "dashboard", "painel", "área administrativa" ou "área do cliente".
---

# Dashboard Administrativo Premium

## Estrutura padrão
- Sidebar de navegação lateral (colapsável) com ícones + labels, agrupando itens por contexto (ex: "Visão geral", "Clientes", "Financeiro", "Configurações").
- Header superior com busca global, notificações, avatar/menu de conta.
- Área de conteúdo com breadcrumb quando houver navegação profunda.

## Visualização de dados
- Cards de KPI no topo (número grande + variação percentual + período de comparação) para métricas-chave — nunca mais de 4-6 cards por tela para não sobrecarregar.
- Gráficos (linha para tendência temporal, barra para comparação categórica, pizza/donut com moderação e nunca para mais de 5-6 categorias) — sempre com legenda clara e tooltip ao hover.
- Tabelas de dados: paginação ou scroll virtual para listas grandes, ordenação por coluna, filtros e busca, ações em linha (editar/excluir) discretas (ícones, não botões grandes poluindo a tabela).
- Estados vazios bem desenhados ("Nenhum dado ainda" com ilustração e CTA para a primeira ação).

## UX de produtividade
- Ações em massa (seleção múltipla + ação em lote) quando fizer sentido para o volume de dados.
- Atalhos de teclado para power users em ferramentas usadas intensamente.
- Feedback claro de toda ação assíncrona (salvando..., salvo, erro) sem travar a interface.
- Densidade de informação ajustável quando o público for avançado (modo compacto vs. confortável).

## Checklist
- [ ] KPIs principais estão visíveis sem precisar rolar a página?
- [ ] Tabelas grandes têm paginação/busca/filtro, não uma lista infinita sem controle?
- [ ] Todo estado (vazio, carregando, erro) foi desenhado, não deixado como tela em branco?
