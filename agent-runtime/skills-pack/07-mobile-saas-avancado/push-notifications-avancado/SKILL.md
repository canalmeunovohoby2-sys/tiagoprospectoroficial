---
name: push-notifications-avancado
description: Use ao implementar notificações push nativas em apps mobile (iOS/Android) de forma estratégica — segmentação, personalização e timing — não apenas o envio técnico básico. Acione quando o usuário mencionar "push", "notificação no celular" ou "reengajar usuários".
---

# Push Notifications Avançado (Mobile)

## Infraestrutura
- Firebase Cloud Messaging (FCM) como camada unificada para Android e iOS (via APNs por baixo), ou serviços como OneSignal para simplificar segmentação e campanhas sem construir tudo do zero.
- Registrar o token do dispositivo no backend associado ao usuário autenticado, tratando renovação de token (tokens podem expirar/mudar) e remoção ao desinstalar/fazer logout.

## Estratégia (o que separa push "chato" de push que engaja)
- Segmentar por comportamento, não enviar o mesmo push para toda a base: usuários inativos há X dias recebem mensagem de reengajamento diferente de usuários ativos recebendo novidade de funcionalidade.
- Timing baseado em fuso horário e padrão de uso do usuário, não horário fixo de servidor — enviar push às 3h da manhã local destrói a percepção do produto.
- Personalização real do conteúdo (nome, dado específico do usuário) tem taxa de abertura muito maior que mensagem genérica.
- Rich push: incluir imagem, ações rápidas (ex: "Confirmar" / "Ver depois" direto na notificação) quando a plataforma suportar — aumenta engajamento vs. texto puro.
- Deep link em toda notificação levando à tela relevante (ver `deep-linking-universal-links`), nunca abrindo genericamente a home.

## Governança e opt-in
- Pedir permissão de notificação com contexto/priming antes do prompt nativo do SO (ver `device-native-features`).
- Preferências granulares por categoria (ex: "notificações de pedido" vs. "novidades e promoções") acessíveis nas configurações do app — reduz desinstalação por excesso de notificação indesejada.
- Nunca ultrapassar uma frequência razoável de push promocional (definir limite de campanhas por semana) — fadiga de notificação é uma das maiores causas de desinstalação e desativação de push.

## Checklist
- [ ] Pushes são segmentados por comportamento, não disparados em massa uniforme?
- [ ] O horário de envio respeita o fuso horário/padrão de uso do usuário?
- [ ] Toda notificação leva a uma tela específica via deep link, não sempre à home?
- [ ] O usuário pode controlar granularmente quais categorias de push recebe?
