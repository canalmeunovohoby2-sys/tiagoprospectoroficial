---
name: notificacoes-realtime
description: Use ao implementar notificações em tempo real, atualizações ao vivo (chat, status de pedido, dashboards colaborativos) ou push notifications em app/SaaS. Acione quando o usuário mencionar "tempo real", "notificações", "chat" ou "atualização automática".
---

# Notificações e Realtime

## Tecnologias por caso de uso
- **WebSockets** (ou serviços como Pusher, Ably, Supabase Realtime): para chat, colaboração ao vivo, dashboards que atualizam sem refresh.
- **Server-Sent Events (SSE)**: para atualizações unidirecionais simples (status de processamento, feed de eventos) — mais simples que WebSocket quando não precisa de comunicação bidirecional.
- **Push notifications** (Web Push, Firebase Cloud Messaging, APNs): para alertar o usuário mesmo fora do app/aba (ex: "seu pedido saiu para entrega").
- **Polling**: aceitável apenas para casos de baixa frequência/baixa criticidade, evitar como solução principal por custo de servidor.

## Boas práticas
- Sempre ter fallback gracioso quando a conexão realtime cai (reconexão automática com backoff exponencial, indicador visual de "reconectando").
- Centro de notificações in-app (sino no header) com histórico, marcação de lido/não lido, e link direto para o contexto relevante.
- Preferências de notificação configuráveis pelo usuário (quais eventos, por qual canal: in-app, e-mail, push, WhatsApp).
- Nunca notificar em excesso — agrupar notificações similares e permitir silenciar categorias.

## Checklist
- [ ] Existe reconexão automática e indicador visual quando a conexão realtime cai?
- [ ] O usuário pode configurar quais notificações recebe e por qual canal?
- [ ] Notificações redundantes são agrupadas em vez de disparadas uma a uma?
