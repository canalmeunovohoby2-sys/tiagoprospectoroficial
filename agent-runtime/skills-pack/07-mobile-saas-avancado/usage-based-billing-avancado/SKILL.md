---
name: usage-based-billing-avancado
description: Use ao implementar cobrança baseada em uso/consumo (metered billing) em um SaaS, além do modelo simples de assinatura fixa por plano coberto em billing-assinaturas. Acione quando o usuário mencionar "cobrar por uso", "pay as you go", "cobrança por consumo" ou "créditos".
---

# Cobrança Baseada em Uso (Usage-Based Billing)

## Quando faz sentido além da assinatura fixa
- Produtos onde o custo de servir o cliente varia muito com o uso (ex: chamadas de API, processamento de IA, armazenamento, envio de mensagens/e-mails) — cobrar um valor fixo para todos distorce a economia do negócio (clientes pequenos subsidiando os grandes ou vice-versa).
- Modelos híbridos são os mais comuns na prática: uma base fixa (assinatura) que já inclui uma cota, mais cobrança de excedente por uso além da cota — mais previsível para o cliente que pay-as-you-go puro, e mais justo para o negócio que plano fixo puro.

## Arquitetura de medição (metering)
- Todo evento faturável (chamada de API, mensagem enviada, GB armazenado) deve ser registrado de forma confiável e idempotente (evitar contar duas vezes o mesmo evento por retry de rede, por exemplo — usar um identificador único de evento).
- Agregar o uso por período de faturamento (diário/mensal) de forma eficiente — para alto volume, considerar agregação incremental em vez de somar todos os eventos brutos a cada consulta.
- Sincronizar o uso agregado com o gateway de pagamento (Stripe Billing/Metered Billing é o mais maduro nesse modelo) para geração automática da fatura no fechamento do ciclo.

## Transparência com o cliente
- Painel em tempo real (ou próximo disso) mostrando o uso atual do período e a projeção de custo, para o cliente nunca ser surpreendido pela fatura — surpresa de cobrança é a maior causa de churn e reclamação em modelos de uso.
- Alertas configuráveis de limite de gasto (ex: "avisar quando atingir R$500 de uso no mês", ou até um limite rígido/hard cap opcional para evitar surpresas).

## Checklist
- [ ] Todo evento faturável é registrado de forma idempotente, evitando contagem duplicada?
- [ ] O cliente tem visibilidade em tempo real do uso e projeção de custo do período?
- [ ] Existem alertas/limites configuráveis para evitar faturas surpresa?
