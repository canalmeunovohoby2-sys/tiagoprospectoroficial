---
name: payment-gateways
description: Use ao implementar cobrança, checkout ou assinatura em qualquer site de e-commerce, SaaS ou app que venda produtos/serviços online. Acione quando o usuário mencionar "pagamento", "checkout", "PIX", "cartão", "assinatura" ou "cobrança".
---

# Integração com Gateways de Pagamento

## Escolha de gateway (contexto Brasil)
- **Stripe**: melhor para SaaS com cobrança recorrente internacional/cartão, ótima documentação e webhooks robustos.
- **Mercado Pago / Pagar.me / Asaas**: melhores para PIX nativo, boleto e cartão no mercado brasileiro, essenciais quando o público é majoritariamente nacional (ex: clínicas, instaladoras, e-commerce local).
- Ofereça **PIX como opção padrão em destaque** no Brasil — reduz fricção e taxa comparado a cartão em muitos segmentos.

## Boas práticas de implementação
- Nunca processar ou armazenar dados de cartão diretamente no seu backend — sempre usar tokenização/Elements/Checkout hospedado do próprio gateway (requisito de conformidade PCI-DSS).
- Implementar webhooks para confirmação assíncrona de pagamento (especialmente PIX e boleto) em vez de confiar só na resposta síncrona do frontend.
- Tratar todos os estados possíveis: pendente, aprovado, recusado, estornado, expirado — com telas/mensagens claras para cada um.
- Em assinaturas (ver `billing-assinaturas`): implementar tratamento de falha de cobrança recorrente (dunning) com tentativas automáticas e aviso ao cliente antes de suspender acesso.
- Sempre exibir preço total, sem custos escondidos, e política de reembolso/cancelamento clara antes da confirmação.
- Logs de auditoria de toda transação (sem armazenar dados sensíveis de cartão).

## Checklist
- [ ] Dados de cartão nunca tocam no seu próprio servidor (usa tokenização do gateway)?
- [ ] Webhooks tratam confirmação assíncrona (especialmente PIX/boleto)?
- [ ] Todos os estados de pagamento têm tela/mensagem correspondente?
- [ ] Política de reembolso e valor total estão claros antes do pagamento?
