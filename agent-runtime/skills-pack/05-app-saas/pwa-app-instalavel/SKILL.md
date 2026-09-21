---
name: pwa-app-instalavel
description: Use quando o usuário quiser que o site/app funcione como aplicativo instalável no celular sem passar pelas lojas de app (PWA), ou pedir funcionamento offline. Acione ao mencionar "instalar no celular", "ícone na tela inicial", "funcionar offline" ou "PWA".
---

# PWA (Progressive Web App) / App Instalável

## Requisitos técnicos mínimos
- `manifest.json` com nome, ícones em múltiplos tamanhos, cor de tema, `display: standalone` (remove barra de navegador ao abrir).
- Service Worker registrando cache de assets essenciais (app shell) para carregamento instantâneo e funcionamento offline básico.
- Servido via HTTPS (obrigatório para PWA funcionar).
- Prompt de instalação customizado (interceptar `beforeinstallprompt` no Android/desktop) em vez de depender só do prompt automático do navegador — permite escolher o melhor momento para sugerir a instalação (ex: após uma ação de valor, não no primeiro segundo).
- No iOS/Safari, orientar manualmente o usuário ("Adicionar à Tela de Início" via menu de compartilhamento), pois o Safari não oferece prompt automático.

## Experiência offline
- Definir estratégia de cache por tipo de conteúdo: cache-first para assets estáticos (CSS/JS/imagens), network-first para dados dinâmicos com fallback para cache quando offline.
- Tela/estado claro informando "você está offline" com o que ainda funciona, evitando erros genéricos de rede.

## Checklist
- [ ] O manifest.json e ícones estão configurados corretamente para todos os tamanhos exigidos?
- [ ] O site funciona (ao menos parcialmente) sem conexão, com fallback claro?
- [ ] O prompt de instalação é acionado em um momento estratégico, não imediatamente ao abrir?
