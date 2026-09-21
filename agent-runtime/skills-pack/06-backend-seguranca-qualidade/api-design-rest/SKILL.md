---
name: api-design-rest
description: Use ao projetar qualquer API (REST ou GraphQL) para um app ou SaaS, garantindo consistência, previsibilidade e boas práticas. Acione sempre que o usuário mencionar "API", "endpoint" ou "backend".
---

# Design de APIs REST/GraphQL

## Convenções REST
- Recursos como substantivos no plural (`/clientes`, `/pedidos`), verbos HTTP corretos (GET, POST, PUT/PATCH, DELETE) — nunca verbos na URL (`/getClientes`).
- Aninhamento raso: no máximo 1-2 níveis (`/pedidos/{id}/itens`), evitar URLs profundamente aninhadas.
- Versionamento explícito (`/v1/...`) para permitir evolução sem quebrar clientes existentes.
- Paginação sempre em listagens (`?page=`/`?cursor=` + `limit`), nunca retornar coleções ilimitadas.
- Filtros e ordenação via query params padronizados (`?status=ativo&sort=-created_at`).
- Códigos de status HTTP corretos e consistentes (200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500) — nunca sempre 200 com erro no corpo.
- Corpo de erro padronizado (ex: `{ "error": { "code": "...", "message": "..." } }`) igual em toda a API.
- Idempotência em operações críticas (ex: criação de pagamento) via chave de idempotência no header.

## Quando preferir GraphQL
- Quando o frontend precisa de flexibilidade para buscar exatamente os campos necessários (evitar over-fetching) ou quando há múltiplos clientes (web, mobile) com necessidades de dados muito diferentes.
- Cuidado com complexidade de queries (limitar profundidade/custo) para evitar abuso.

## Documentação e contratos
- Documentar com OpenAPI/Swagger (REST) ou schema (GraphQL) desde o início, não como tarefa posterior.
- Rate limiting e autenticação (ver `auth-autenticacao-segura`) em toda API pública.

## Checklist
- [ ] URLs seguem convenção de recursos, verbos HTTP corretos e são versionadas?
- [ ] Listagens têm paginação e a API retorna códigos de status corretos?
- [ ] Erros seguem um formato padronizado e consistente?
- [ ] A API está documentada (OpenAPI/schema)?
