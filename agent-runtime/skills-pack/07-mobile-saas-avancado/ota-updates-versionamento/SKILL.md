---
name: ota-updates-versionamento
description: Use ao definir a estratégia de atualização de um app mobile (atualizações via loja vs. atualizações remotas de código) e o esquema de versionamento. Acione quando o usuário mencionar "atualizar o app sem passar pela loja", "OTA", "forçar atualização" ou "versionamento".
---

# Atualizações OTA (Over-The-Air) e Versionamento

## OTA para código JS/Dart (React Native/Expo, Flutter)
- Ferramentas como EAS Update (Expo) ou CodePush permitem atualizar o código JavaScript/lógica do app sem passar por nova revisão de loja — ótimo para correções urgentes de bug e pequenos ajustes de UI/lógica.
- **Limite importante**: OTA não pode alterar código nativo (novas permissões, novos módulos nativos, mudança de ícone) — isso sempre exige nova versão via loja.
- Nunca usar OTA para burlar revisão de loja com mudanças que deveriam passar por análise (mudança de funcionalidade central do app) — viola diretrizes e arrisca banimento da conta de desenvolvedor.

## Estratégia de rollout de OTA
- Liberar atualização OTA gradualmente (ex: 10% dos usuários primeiro, monitorar erros, depois 100%) em vez de forçar 100% imediatamente — reduz o risco de um bug de atualização afetar toda a base de uma vez.
- Sempre ter um mecanismo de rollback rápido para a versão anterior de código caso a atualização OTA cause problemas.

## Versionamento semântico
- Seguir `MAJOR.MINOR.PATCH` (ex: 2.4.1): MAJOR para mudanças incompatíveis/grandes redesenhos, MINOR para novas funcionalidades compatíveis, PATCH para correções de bug.
- Manter versão do app (visível ao usuário) separada do "build number" interno (incrementado a cada submissão à loja, mesmo sem mudar a versão visível).

## Forçar atualização (update obrigatório)
- Implementar verificação de versão mínima suportada pelo backend: se o app do usuário estiver abaixo do mínimo (ex: mudança de API que quebra versões antigas), mostrar uma tela bloqueando o uso até atualizar, com link direto para a loja — essencial para não quebrar usuários com apps desatualizados quando a API evolui.

## Checklist
- [ ] Mudanças de código nativo sempre passam pela loja, nunca via OTA?
- [ ] Existe rollout gradual e possibilidade de rollback para atualizações OTA?
- [ ] Há verificação de versão mínima com tela de atualização obrigatória quando necessário?
