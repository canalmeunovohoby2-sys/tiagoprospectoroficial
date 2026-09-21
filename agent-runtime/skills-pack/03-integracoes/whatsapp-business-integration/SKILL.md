---
name: whatsapp-business-integration
description: Use sempre que o negócio (a maioria dos segmentos locais no Brasil) precisar de contato direto via WhatsApp — botão flutuante, link de contato, ou automação de atendimento. Acione quando o usuário mencionar "WhatsApp", "zap", "chat" ou "atendimento rápido".
---

# Integração com WhatsApp Business

## Implementações por nível de complexidade
1. **Link direto (mais simples)**: `https://wa.me/55DDDNUMERO?text=MENSAGEM_PRE_PREENCHIDA_URL_ENCODED` em botão flutuante fixo (canto inferior direito) e em CTAs contextuais.
2. **Botão flutuante inteligente**: aparece após alguns segundos de navegação ou ao atingir X% de scroll, com mensagem pré-preenchida específica da página/seção em que o visitante está (ex: "Olá, vi a página de Implantes e gostaria de agendar uma avaliação").
3. **WhatsApp Business API (para SaaS/escala)**: integração via provedores oficiais (Meta Cloud API, Twilio, Z-API etc.) para automações, chatbot de primeiro atendimento, notificações transacionais (confirmação de agendamento, status de pedido). Exige aprovação de conta comercial e templates de mensagem aprovados pela Meta para mensagens fora da janela de 24h.

## Boas práticas de UX
- Botão flutuante com ícone reconhecível, mas sem cobrir conteúdo importante em mobile (respeitar área segura/rodapé).
- Mensagem pré-preenchida específica por página aumenta muito a taxa de resposta e contextualiza o atendente.
- Nunca usar como único canal de contato — sempre oferecer também telefone/e-mail/formulário para quem não usa WhatsApp.
- Em SaaS com automação: deixar claro para o usuário final quando está falando com bot vs. humano; sempre oferecer opção de transferir para atendente humano.

## Checklist
- [ ] O número está no formato internacional correto (55 + DDD + número)?
- [ ] A mensagem pré-preenchida é contextual à página?
- [ ] O botão flutuante não obstrui conteúdo ou outros CTAs em mobile?
