---
name: testes-qa-automatizados
description: Use ao finalizar qualquer funcionalidade de app/SaaS/backend antes de considerá-la pronta, para garantir cobertura de testes automatizados. Acione quando o usuário mencionar "testes", "qualidade", "QA" ou antes de qualquer deploy de funcionalidade crítica (pagamento, autenticação).
---

# Testes Automatizados e QA

## Pirâmide de testes
1. **Testes unitários** (maioria): funções puras, regras de negócio isoladas, rápidas de rodar — cobrir principalmente lógica crítica (cálculos, validações, regras de permissão).
2. **Testes de integração**: fluxo entre camadas (API + banco de dados), usando banco de teste real ou em memória.
3. **Testes end-to-end (E2E)** (minoria, mas essencial): fluxos críticos completos simulando o usuário real (ex: cadastro → login → ação principal → checkout) usando ferramentas como Playwright/Cypress.

## Prioridades de cobertura (onde testar é inegociável)
- Autenticação e autorização (nunca deployar mudança nessa área sem teste automatizado cobrindo o cenário antigo e o novo).
- Fluxo de pagamento/cobrança (qualquer bug aqui tem custo direto e imediato).
- Regras de negócio centrais do produto (o que diferencia o produto de um CRUD genérico).
- Multi-tenancy: sempre testar que dados de um tenant nunca vazam para outro.

## Práticas
- Rodar testes automaticamente em CI a cada push/PR, bloqueando merge se falharem.
- Dados de teste isolados (não testar contra banco de produção nunca).
- Testes devem ser determinísticos (sem dependência de horário real, rede externa não mockada, ou ordem de execução).

## Checklist
- [ ] Funcionalidades críticas (auth, pagamento, permissões multi-tenant) têm teste automatizado?
- [ ] Os testes rodam em CI e bloqueiam merge/deploy quando falham?
- [ ] Existe pelo menos um teste E2E cobrindo o fluxo principal do produto?
