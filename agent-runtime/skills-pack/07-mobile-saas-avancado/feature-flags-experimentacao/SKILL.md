---
name: feature-flags-experimentacao
description: Use ao implementar lançamento controlado de novas funcionalidades em apps ou SaaS (feature flags, rollout gradual, testes A/B de funcionalidade). Acione quando o usuário mencionar "lançar aos poucos", "testar com um grupo", "feature flag" ou "rollout".
---

# Feature Flags e Rollout Controlado

## Por que usar
Permite deployar código em produção "desligado" e ativá-lo depois para grupos específicos, sem precisar de novo deploy/nova versão de app — reduz risco de lançamentos e viabiliza testes controlados com usuários reais.

## Tipos de flag
- **Release flag**: liga/desliga uma funcionalidade nova, permitindo desativar rapidamente se algo der errado (kill switch) sem rollback de deploy inteiro.
- **Permission flag**: libera funcionalidade só para determinados planos/organizações (ex: funcionalidade exclusiva de plano Enterprise).
- **Experiment flag**: usada para teste A/B, dividindo usuários em grupos e medindo o impacto de cada variante (ver `cro-teste-ab` para a metodologia de análise).
- **Ops flag**: liga/desliga comportamento operacional (ex: modo de manutenção parcial de um módulo específico) sem afetar o resto do sistema.

## Implementação
- Usar serviço dedicado (LaunchDarkly, Unleash, GrowthBook, ou implementação própria simples baseada em tabela no banco + cache) em vez de espalhar `if` condicionais hardcoded pelo código sem controle central.
- Avaliação da flag deve ser rápida (idealmente com cache local/CDN) para não adicionar latência perceptível a cada carregamento de tela.
- Sempre definir um valor padrão seguro (fallback) caso o serviço de flags fique indisponível — o app nunca deve quebrar por não conseguir consultar uma flag.

## Higiene de flags
- Toda flag temporária (rollout gradual, experimento) deve ter uma data/critério de "aposentadoria" — flags esquecidas acumulam dívida técnica e tornam o código difícil de entender com o tempo.
- Documentar o propósito de cada flag ativa e quem é responsável por removê-la quando o rollout for concluído.

## Checklist
- [ ] Novas funcionalidades de risco têm kill switch (release flag) para desativação rápida sem novo deploy?
- [ ] Existe fallback seguro quando o serviço de flags está indisponível?
- [ ] Flags temporárias têm prazo definido para remoção, evitando acúmulo de dívida técnica?
