---
name: crash-monitoring-observabilidade-mobile
description: Use ao configurar monitoramento de erros, crashes e performance em qualquer app mobile antes de lançar em produção. Acione quando o usuário mencionar "crash", "erro no app", "monitoramento" ou antes de qualquer publicação em loja.
---

# Monitoramento de Crashes e Observabilidade Mobile

## Ferramentas essenciais
- Sentry, Firebase Crashlytics ou Bugsnag para captura automática de crashes e erros não tratados, com stack trace legível (symbolication configurada corretamente para iOS/Android, senão o erro chega ilegível).
- Configurar desde o primeiro build de teste, não deixar para depois do lançamento — crashes em produção sem monitoramento significam perder usuários silenciosamente sem saber o motivo.

## O que capturar além do crash puro
- Erros de rede (falhas de API, timeouts) com contexto (endpoint, código de status).
- Breadcrumbs de navegação (últimas telas visitadas antes do erro) para reconstruir o que o usuário estava fazendo.
- Informações de dispositivo/SO/versão do app associadas a cada erro, para identificar padrões (ex: erro só ocorre em uma versão específica de Android).
- Performance: tempo de carregamento de telas críticas, taxa de ANR (Application Not Responding) no Android, travamentos de UI.

## Priorização de correção
- Agrupar erros por impacto (número de usuários afetados × frequência), não apenas por ordem cronológica — um erro raro que afeta 1000 usuários é mais urgente que um comum que afeta 2.
- Definir alerta automático (Slack/e-mail) quando a taxa de crash ultrapassar um limiar aceitável após um novo lançamento — permite reagir rápido e até reverter o rollout OTA/pausar o rollout na loja.

## Privacidade
- Nunca logar dados sensíveis (senha, token completo, dados de cartão) nos relatórios de erro — mascarar/omitir esses campos antes de enviar ao serviço de monitoramento (ver `lgpd-privacidade`).

## Checklist
- [ ] Monitoramento de crash está ativo desde o primeiro build de teste?
- [ ] Existe alerta automático quando a taxa de crash sobe após um lançamento?
- [ ] Dados sensíveis são filtrados antes de qualquer erro ser enviado ao serviço de monitoramento?
