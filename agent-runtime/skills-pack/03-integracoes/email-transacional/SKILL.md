---
name: email-transacional
description: Use ao implementar qualquer envio automático de e-mail (confirmação de cadastro, recuperação de senha, confirmação de agendamento, recibo, notificação) em sites, apps ou SaaS. Acione quando o usuário mencionar "e-mail", "notificação por email" ou "confirmação".
---

# E-mail Transacional

## Provedores recomendados
Resend, SendGrid, Amazon SES, Postmark — nunca usar SMTP de provedor pessoal (Gmail comum) em produção: baixa entregabilidade e limites de envio.

## Boas práticas de entregabilidade
- Configurar SPF, DKIM e DMARC no domínio de envio — sem isso, e-mails caem em spam com alta frequência.
- Usar domínio/subdomínio próprio para envio (ex: `notificacoes@seudominio.com`), nunca domínio genérico do provedor.
- Segmentar remetentes: um endereço para transacional (confirmações, recibos) e outro para marketing, se houver — protege a reputação do domínio transacional.

## Templates
- Design consistente com a identidade visual do produto (usar os mesmos tokens de `design-system-premium` adaptados para e-mail: HTML com CSS inline, testado em clientes de e-mail).
- Estrutura clara: logo, mensagem principal em destaque, CTA único e óbvio, rodapé com informações legais/cancelamento de inscrição quando aplicável.
- E-mails essenciais a implementar: boas-vindas, confirmação de conta/verificação, recuperação de senha, confirmação de agendamento/pedido, recibo/nota, aviso de cobrança/falha de pagamento, notificação de atividade importante.

## Checklist
- [ ] SPF/DKIM/DMARC configurados no domínio de envio?
- [ ] Templates responsivos e com CSS inline (compatibilidade entre clientes de e-mail)?
- [ ] Todo e-mail transacional crítico (senha, pagamento, confirmação) está implementado?
