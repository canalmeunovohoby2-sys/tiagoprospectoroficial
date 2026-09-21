---
name: crm-lead-capture
description: Use ao implementar formulários de contato/orçamento/agendamento que precisam alimentar um CRM ou planilha, e ao desenhar o fluxo pós-envio (o que acontece depois que o lead preenche o formulário). Acione quando o usuário mencionar "CRM", "captura de leads", "funil de vendas" ou "gestão de clientes".
---

# Captura de Leads e Integração com CRM

## Estrutura de um formulário de captura eficaz
- Pedir o mínimo de campos possível no primeiro contato (nome + WhatsApp/telefone já qualifica na maioria dos segmentos locais); campos adicionais (orçamento, tipo de serviço) podem vir em etapa 2 (formulário multi-step aumenta conclusão vs. formulário longo único).
- Validação inline e mensagens de erro claras (ver `accessibility-wcag`).
- Página/estado de confirmação claro pós-envio, com próximo passo explícito ("Em breve entraremos em contato pelo WhatsApp" + botão para já iniciar a conversa).

## Integrações comuns
- Webhooks para CRMs (RD Station, HubSpot, Pipedrive, Kommo) ou planilhas (Google Sheets via API) quando não houver CRM próprio.
- Se o próprio SaaS do usuário for o CRM: gravar lead diretamente no banco com status inicial (`novo`), origem (UTM/canal) e timestamp, disparando notificação interna (e-mail/Slack/WhatsApp) para o time comercial.
- Sempre capturar parâmetros UTM e página de origem junto com o lead, para permitir análise de qual canal/campanha gerou aquele contato.

## Segurança e qualidade do dado
- Validação server-side sempre (nunca confiar apenas em validação de frontend).
- Proteção anti-spam/bot (rate limiting, honeypot ou CAPTCHA invisível) sem prejudicar a UX de usuários reais.
- Consentimento explícito para uso dos dados (LGPD — ver `lgpd-privacidade`) no momento da captura.

## Checklist
- [ ] O formulário pede o mínimo necessário para qualificar o lead?
- [ ] Existe confirmação clara pós-envio com próximo passo?
- [ ] UTM/origem do lead são capturados e salvos junto ao registro?
- [ ] Há proteção anti-spam e validação server-side?
