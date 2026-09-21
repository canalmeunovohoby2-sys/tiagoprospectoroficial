---
name: analytics-tracking
description: Use ao implementar rastreamento de comportamento e conversão em qualquer site/app — Google Analytics, Google Tag Manager, Meta Pixel, eventos de conversão. Acione sempre que o negócio depender de tráfego pago (ads) ou quando o usuário quiser "medir resultados"/"saber de onde vêm os clientes".
---

# Analytics e Rastreamento de Conversão

## Stack recomendada
- **Google Tag Manager (GTM)** como camada central de gerenciamento de tags — evita hardcode de múltiplos scripts.
- **Google Analytics 4 (GA4)** para comportamento e funil.
- **Meta Pixel** quando houver tráfego pago via Instagram/Facebook (comum em odontologia, estética, energia solar residencial).
- **Google Ads Conversion Tracking** quando houver campanhas no Google Ads.

## Eventos de conversão essenciais a configurar (por tipo de negócio)
- Sites de serviço local: clique no botão WhatsApp, envio de formulário de contato, clique em "ligar", clique em "como chegar".
- E-commerce: visualização de produto, adicionar ao carrinho, iniciar checkout, compra concluída (com valor).
- SaaS: cadastro iniciado, cadastro concluído, início de trial, upgrade de plano.

## Boas práticas
- Carregar scripts de analytics de forma assíncrona e, quando possível, após interação inicial do usuário — nunca no caminho crítico de renderização (ver `performance-web-vitals`).
- Implementar Consent Mode / banner de cookies compatível com LGPD (ver `lgpd-privacidade`) antes de disparar tags que usam dados pessoais.
- Nomear eventos de forma consistente e documentar (ex: `lead_whatsapp_click`, `form_submit_orcamento`) para facilitar análise futura.
- Validar sempre com o modo de preview do GTM/GA4 antes de considerar a implementação concluída — tag mal configurada é invisível até ser tarde demais.

## Checklist
- [ ] Os principais eventos de conversão do negócio estão mapeados e implementados?
- [ ] Existe banner/consentimento de cookies antes de tags que tratam dados pessoais?
- [ ] Os scripts carregam sem prejudicar a performance?
