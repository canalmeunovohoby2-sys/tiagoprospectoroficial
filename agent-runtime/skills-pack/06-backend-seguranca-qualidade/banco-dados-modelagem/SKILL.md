---
name: banco-dados-modelagem
description: Use ao projetar o esquema de banco de dados de qualquer app ou SaaS, antes de escrever migrations ou modelos. Acione quando o usuário mencionar "banco de dados", "modelagem", "tabelas" ou "schema".
---

# Modelagem de Banco de Dados

## Processo recomendado
1. Identificar as entidades principais do domínio (ex: Usuário, Organização, Pedido, Produto) e seus relacionamentos (1:1, 1:N, N:N) antes de qualquer código.
2. Normalizar até a 3ª forma normal como padrão (evita duplicação/inconsistência), desnormalizando pontualmente apenas por necessidade real de performance comprovada (não por antecipação).
3. Definir chaves primárias (preferir UUID a IDs sequenciais em tabelas expostas publicamente/multi-tenant, para evitar enumeração), chaves estrangeiras com `ON DELETE`/`ON UPDATE` explícitos.
4. Índices em toda coluna usada frequentemente em filtros/joins (incluindo `tenant_id` em sistemas multi-tenant, ver `saas-arquitetura-multi-tenant`), evitando excesso de índices que penalizem escrita.
5. Campos de auditoria padrão em toda tabela relevante: `created_at`, `updated_at`, e `deleted_at` quando usar soft delete.
6. Migrations versionadas e reversíveis (nunca alterar schema diretamente em produção sem migration rastreável).

## Escolha de tipo de banco
- Relacional (Postgres/MySQL): padrão para a maioria dos SaaS com dados estruturados e necessidade de integridade transacional.
- NoSQL (MongoDB, DynamoDB): quando o modelo de dados é altamente variável/documento, ou exige escala horizontal massiva — usar com critério, não por modismo.
- Cache (Redis): para sessões, filas leves, dados de alta leitura e baixa mutação (ex: contadores, rate limiting).

## Checklist
- [ ] O modelo evita duplicação desnecessária de dados (normalizado, salvo justificativa clara)?
- [ ] Índices cobrem as queries mais frequentes, especialmente filtros multi-tenant?
- [ ] Existem migrations versionadas para toda alteração de schema?
