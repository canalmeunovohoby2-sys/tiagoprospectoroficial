---
name: api-rate-limiting-quotas
description: Use ao proteger qualquer API pública ou multi-tenant contra abuso e ao implementar limites de uso por plano (rate limiting e quotas). Acione quando o usuário mencionar "limite de requisições", "rate limit", "throttling" ou "limite do plano".
---

# Rate Limiting e Quotas de API

## Por que é essencial
Sem limites, um único cliente (por bug no código dele ou má intenção) pode sobrecarregar toda a infraestrutura e prejudicar todos os outros clientes de um SaaS multi-tenant — rate limiting é proteção de infraestrutura, não só controle comercial.

## Estratégias de limitação
- **Por IP**: proteção básica contra abuso anônimo (ex: tentativas de login, endpoints públicos sem autenticação).
- **Por usuário/API key**: limite específico por conta autenticada, permitindo diferenciar limites por plano contratado.
- **Algoritmos comuns**: token bucket ou sliding window (mais suaves, permitem rajadas curtas controladas) em vez de janela fixa simples (que pode permitir picos nas bordas da janela).
- Implementação prática: Redis com contadores e TTL é a base mais comum para rate limiting distribuído entre múltiplas instâncias da API.

## Comunicação clara com o cliente da API
- Sempre retornar headers informativos (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) para que integrações consigam se autorregular.
- Retornar status HTTP 429 (Too Many Requests) com corpo de erro claro quando o limite for excedido, nunca um erro genérico 500.

## Quotas de plano (diferente de rate limit técnico)
- Limites de negócio por plano (ex: "1.000 chamadas de API por mês no plano Starter") devem ser verificados e contabilizados de forma centralizada (ver também `saas-arquitetura-multi-tenant`), com aviso ao cliente conforme se aproxima do limite (ex: 80%, 100%) e comportamento claro ao exceder (bloqueio, cobrança de excedente, ou downgrade de funcionalidade — decisão de produto, mas deve ser explícita, nunca falha silenciosa).

## Checklist
- [ ] A API retorna headers de rate limit e status 429 claro ao exceder o limite técnico?
- [ ] Quotas de plano são contabilizadas centralmente, com aviso ao cliente antes de atingir o limite?
- [ ] O rate limiting funciona corretamente mesmo com múltiplas instâncias da API rodando (contador distribuído, ex: Redis)?
