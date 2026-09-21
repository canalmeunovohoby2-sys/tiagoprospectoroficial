---
name: in-app-purchases-monetizacao
description: Use ao implementar compras dentro do aplicativo (assinaturas, itens, remoção de anúncios) em apps iOS/Android. Acione quando o usuário mencionar "compra no app", "assinatura no app", "in-app purchase" ou "monetizar o aplicativo".
---

# Compras no Aplicativo (In-App Purchases) e Monetização Mobile

## Regra fundamental das lojas
- Qualquer conteúdo/funcionalidade digital consumida DENTRO do app (assinatura de acesso ao conteúdo do próprio app, moedas virtuais, remoção de anúncios) deve obrigatoriamente usar o sistema de compra da própria loja (Apple In-App Purchase / Google Play Billing) — usar um gateway de pagamento externo para isso viola as diretrizes das lojas e pode derrubar o app.
- Exceção comum: apps que vendem bens/serviços físicos ou consumidos fora do app (ex: SaaS B2B onde a assinatura dá acesso via web também, e-commerce de produtos físicos, serviços como Uber/iFood) geralmente podem processar pagamento fora do sistema da loja — mas as regras mudam com frequência e variam por categoria/região, então **sempre verificar as diretrizes atuais da App Store e Play Store antes de decidir**, em vez de assumir uma regra antiga.

## Implementação técnica
- Usar biblioteca/SDK oficial (StoreKit no iOS, Play Billing Library no Android, ou uma camada unificada como RevenueCat para simplificar drasticamente a gestão de assinaturas cross-platform, webhooks de renovação/cancelamento e reconciliação de recibos).
- Validar toda compra no backend (nunca confiar apenas na confirmação do lado do dispositivo) — verificar o recibo/token junto ao servidor da Apple/Google antes de liberar o conteúdo.
- Tratar corretamente: renovação automática, cancelamento, reembolso (chargeback), período de graça após falha de cobrança, restauração de compra em novo dispositivo ("Restaurar Compras" é obrigatório na Apple).

## Modelos de monetização a considerar
- Freemium com paywall em funcionalidade específica (mais comum e eficaz para SaaS/produtividade).
- Assinatura única do app (mensal/anual, com desconto no anual).
- Trial gratuito seguido de cobrança automática — deixar claro na UI quando a cobrança vai ocorrer, para evitar reembolsos por surpresa.
- Compra única de recurso (menos comum hoje, mas ainda válida para apps utilitários simples).

## Checklist
- [ ] Compras de conteúdo digital consumido no app usam o sistema oficial da loja, evitando violação de diretriz?
- [ ] Toda compra é validada no backend antes de liberar acesso, não só confiada ao dispositivo?
- [ ] "Restaurar Compras" está implementado (obrigatório para aprovação na Apple)?
