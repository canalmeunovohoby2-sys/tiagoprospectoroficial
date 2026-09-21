---
name: webhooks-sistema-saida
description: Use ao implementar um sistema de webhooks de SAÍDA no seu SaaS, permitindo que clientes/integrações externas recebam eventos do seu sistema em tempo real (ex: "pedido criado", "pagamento aprovado"). Acione quando o usuário mencionar "webhook", "integração com outros sistemas" ou "notificar sistema externo".
---

# Sistema de Webhooks (Saída) para Integrações

## Por que oferecer
Permite que clientes do seu SaaS conectem seus próprios sistemas (CRM, planilhas, automações tipo Zapier/Make) a eventos do seu produto sem precisar de polling constante na sua API — é um diferencial forte de produto SaaS maduro/enterprise.

## Design do sistema
- Cada cliente/organização pode cadastrar uma ou mais URLs de destino e escolher a quais eventos quer se inscrever (ex: `order.created`, `payment.approved`, `user.invited`).
- Payload de evento com estrutura consistente e versionada: `{ event, timestamp, data, webhook_id }` — nunca mudar o formato de um evento existente de forma incompatível sem versionar (quebra integrações de clientes silenciosamente).
- Assinatura criptográfica do payload (HMAC com segredo único por cliente) enviada em um header (ex: `X-Signature`), permitindo que o receptor verifique que o webhook realmente veio do seu sistema e não foi forjado.

## Confiabilidade
- Retry automático com backoff exponencial quando a URL de destino do cliente não responder ou retornar erro (ex: 5 tentativas ao longo de algumas horas) — sistemas do cliente podem estar temporariamente fora do ar.
- Log de entrega de cada webhook (status, tentativas, resposta recebida) visível ao próprio cliente em um painel, para que ele consiga depurar problemas de integração sem abrir chamado de suporte.
- Timeout curto na chamada (ex: 5-10s) para não travar o worker de envio esperando um servidor de destino lento — usar fila/background (`background-jobs-filas`) para o envio, nunca disparar de forma síncrona no fluxo principal do evento.

## Segurança
- Nunca permitir que o cliente cadastre uma URL apontando para endereços internos da sua própria infraestrutura (proteção contra SSRF) — validar/restringir os destinos permitidos.

## Checklist
- [ ] Os payloads são assinados (HMAC) para o cliente verificar autenticidade?
- [ ] Existe retry automático e log de entrega visível ao cliente?
- [ ] O envio acontece de forma assíncrona (fila), sem travar o fluxo principal do evento?
