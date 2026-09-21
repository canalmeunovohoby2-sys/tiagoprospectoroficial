---
name: saas-arquitetura-multi-tenant
description: Use SEMPRE ao arquitetar um novo SaaS ou revisar a estrutura de dados/organização de um SaaS existente que atenda múltiplos clientes/empresas (multi-tenant). Acione quando o usuário mencionar "SaaS", "múltiplos clientes", "contas de empresas" ou "planos de assinatura".
---

# Arquitetura SaaS Multi-Tenant

## Modelos de isolamento (escolher conforme escala/orçamento)
1. **Banco compartilhado com `tenant_id`** (mais comum para começar): todas as tabelas relevantes têm coluna `tenant_id`/`organization_id`, e TODA query filtra por esse campo. Mais barato e simples de operar em escala inicial/média.
2. **Schema por tenant**: um schema de banco por cliente — mais isolamento, mais complexidade operacional (migrations em massa).
3. **Banco por tenant**: máximo isolamento, indicado para clientes enterprise com exigência regulatória forte — maior custo operacional.

## Regras críticas quando usar `tenant_id` compartilhado
- Nunca confiar em filtro de `tenant_id` apenas no código da aplicação — usar também Row Level Security (RLS) no banco (ex: Postgres RLS) como camada extra de proteção contra bugs que vazem dados entre clientes.
- Todo índice de banco que envolva busca frequente deve incluir `tenant_id` como parte da chave composta.
- Nunca expor IDs sequenciais previsíveis sem verificação de posse (usar UUID e sempre validar que o registro pertence ao tenant da sessão autenticada).

## Estrutura de contas
- Hierarquia: Organização (tenant) → Usuários (com papéis/roles) → Recursos do produto.
- Sistema de convites para adicionar membros à organização, com papéis (admin, membro, visualizador) e permissões por papel (RBAC).
- Configurações por tenant: plano contratado, limites de uso, personalização (logo, cor, domínio customizado se aplicável).

## Escalabilidade e limites de plano
- Definir desde o início como limites de plano são verificados (nº de usuários, nº de registros, uso de storage/API) e onde essa checagem acontece (idealmente centralizada, não espalhada pelo código).

## Checklist
- [ ] Toda tabela sensível tem `tenant_id` e toda query filtra por ele?
- [ ] Existe camada extra de proteção (RLS ou equivalente) além do filtro na aplicação?
- [ ] Roles/permissões (RBAC) estão definidos por organização, não globalmente?
