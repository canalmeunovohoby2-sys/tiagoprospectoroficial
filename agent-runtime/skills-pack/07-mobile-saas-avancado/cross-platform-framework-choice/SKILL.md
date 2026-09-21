---
name: cross-platform-framework-choice
description: Use SEMPRE no início de qualquer projeto de aplicativo mobile, antes de escrever código, para decidir a stack técnica certa (nativo, React Native, Flutter, ou web app). Acione quando o usuário disser "app", "aplicativo", "iOS", "Android" ou pedir para "criar um app do zero".
---

# Escolha de Stack para Apps Mobile

## Árvore de decisão
- **Precisa de máxima performance gráfica (jogos, edição de vídeo/imagem pesada, AR)?** → Nativo (Swift/SwiftUI + Kotlin/Jetpack Compose), mesmo custando mais tempo/dois códigos.
- **Time já domina React/JavaScript e quer 1 código para iOS+Android com boa performance e acesso a recursos nativos?** → React Native (com Expo para acelerar desenvolvimento, ejetando apenas se precisar de módulo nativo muito específico).
- **Quer a UI mais consistente entre plataformas e performance próxima do nativo, sem depender do ecossistema JS?** → Flutter (Dart) — ótimo para apps com UI customizada intensa (dashboards, apps de dados visuais).
- **É essencialmente um app "vitrine" de conteúdo/formulários, sem necessidade forte de recursos nativos profundos?** → PWA (`pwa-app-instalavel`) pode ser suficiente e mais barato — evita todo o processo de loja de app.
- **Time pequeno/solo e quer entregar rápido em ambas as lojas com boa DX?** → React Native + Expo é geralmente o melhor custo-benefício hoje.

## Fatores que pesam na decisão
- Orçamento e prazo (nativo separado por plataforma custa ~2x mais tempo de manutenção).
- Dependência de recursos nativos exclusivos de uma versão específica de SO recém-lançada (nativo tem acesso mais rápido a novidades da Apple/Google).
- Tamanho da equipe e stack já dominada (reaproveitar conhecimento do time do SaaS web em React Native, por exemplo, acelera muito).
- Necessidade de distribuição fora das lojas oficiais (sideload/enterprise) — nativo e Flutter lidam melhor com isso que soluções muito atadas a um único ecossistema.

## Checklist
- [ ] A escolha de stack foi justificada pelos requisitos reais do app, não por modismo?
- [ ] Ficou claro o trade-off de manutenção (1 código vs. 2 códigos nativos) para o cliente/time?
- [ ] Recursos nativos críticos ao produto foram verificados como suportados pela stack escolhida antes de começar?
