---
name: escalabilidade-multi-regiao-cache
description: Use ao planejar a escalabilidade de um SaaS que está crescendo (mais usuários, mais dados, usuários em regiões geográficas diferentes) — estratégias de cache, CDN e distribuição geográfica. Acione quando o usuário mencionar "escalar", "muitos usuários", "lento para clientes de outra região" ou "alta disponibilidade".
---

# Escalabilidade e Distribuição Multi-Região

## Camadas de cache (do mais rápido ao mais lento)
1. **CDN** para assets estáticos (imagens, CSS, JS) e, quando possível, respostas de API públicas cacheáveis — reduz latência para usuários distantes do servidor principal e tira carga da origem.
2. **Cache de aplicação** (Redis/Memcached) para dados consultados com frequência e que mudam pouco (configurações, dados de referência, resultados de queries pesadas) — sempre com estratégia clara de invalidação (nunca cache "eterno" sem plano de atualização).
3. **Cache de banco de dados** (query cache, materialized views) para relatórios/agregações pesadas que não precisam ser 100% em tempo real.

## Escalabilidade horizontal
- Aplicação stateless (sem depender de estado em memória de uma instância específica) para permitir rodar múltiplas instâncias atrás de um load balancer, escalando horizontalmente conforme demanda.
- Sessões/dados compartilhados entre instâncias devem viver em um armazenamento externo comum (Redis, banco), nunca em memória local de uma instância.
- Banco de dados: réplicas de leitura (read replicas) para distribuir consultas de leitura, mantendo escrita centralizada no banco primário — arquitetura simples e eficaz antes de considerar sharding, que é bem mais complexo.

## Multi-região (quando o público realmente exige)
- Justificar a complexidade adicional apenas quando houver necessidade real (usuários em continentes muito distantes sentindo latência, ou exigência regulatória de residência de dados em um país específico) — multi-região adiciona complexidade operacional significativa e não deve ser adotada "por precaução" sem necessidade concreta.
- Estratégias: CDN + edge functions para lógica leve próxima do usuário; réplicas de leitura de banco por região; e, em casos mais avançados, particionamento de dados por região para atender requisitos de residência de dados (comum em contratos enterprise europeus, por exemplo).

## Checklist
- [ ] Assets estáticos e respostas cacheáveis passam por CDN, não pela origem a cada requisição?
- [ ] A aplicação é stateless, permitindo múltiplas instâncias atrás de um load balancer?
- [ ] Multi-região só foi adotada mediante necessidade real comprovada, não por precaução prematura?
