---
name: billing-assinaturas
description: Use ao implementar planos, cobrança recorrente e gestão de assinaturas em qualquer SaaS. Acione quando o usuário mencionar "planos", "assinatura", "upgrade/downgrade" ou "trial".
---

# Cobrança Recorrente e Assinaturas (SaaS)

## Estrutura de planos
- Definir claramente: limites por plano (usuários, recursos, uso), periodicidade (mensal/anual com desconto no anual), e o que acontece ao exceder limites (bloqueio suave com aviso, upsell, ou cobrança de excedente).
- Página de preços clara, com comparação de planos lado a lado, destacando o plano recomendado, e FAQ de cobrança (cancelamento, reembolso, mudança de plano).

## Ciclo de vida da assinatura a implementar
1. Trial (se houver): duração clara, aviso automático próximo ao fim, conversão facilitada sem re-digitar todos os dados.
2. Assinatura ativa: upgrade/downgrade com cálculo de crédito proporcional (proration).
3. Falha de cobrança (dunning): tentativas automáticas de nova cobrança, e-mails de aviso antes de suspender acesso, período de graça antes do bloqueio total.
4. Cancelamento: fluxo simples (nunca escondido atrás de suporte manual só para dificultar — isso gera reputação negativa), com pesquisa opcional de motivo e oferta de retenção (desconto/pausa) quando fizer sentido.
5. Reativação de conta cancelada.

## Técnico
- Sincronizar sempre o estado de assinatura via webhooks do gateway (ver `payment-gateways`), nunca apenas no momento do checkout — cancelamentos, falhas e renovações acontecem de forma assíncrona.
- Manter histórico de faturas/recibos acessível ao cliente na própria conta.

## Checklist
- [ ] Existe fluxo claro de trial → conversão → cobrança recorrente → cancelamento?
- [ ] Falhas de cobrança têm tentativas automáticas e aviso antes de suspender acesso?
- [ ] O cancelamento é simples e não exige contato manual obrigatório?
