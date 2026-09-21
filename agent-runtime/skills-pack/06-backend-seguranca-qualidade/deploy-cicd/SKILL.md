---
name: deploy-cicd
description: Use ao configurar o processo de deploy, integração contínua e infraestrutura de qualquer app/SaaS. Acione quando o usuário mencionar "deploy", "publicar", "servidor", "CI/CD" ou "colocar no ar".
---

# Deploy, CI/CD e Infraestrutura

## Pipeline recomendado (CI/CD)
1. Push/PR dispara pipeline automático: lint → testes (`testes-qa-automatizados`) → build → deploy em ambiente de staging → (aprovação opcional) → deploy em produção.
2. Nunca fazer deploy manual direto em produção como processo padrão — sempre via pipeline versionado e repetível.
3. Ambientes separados: desenvolvimento, staging (idêntico à produção em configuração) e produção — nunca testar funcionalidades novas direto em produção.

## Infraestrutura
- Escolher provedor conforme escala/orçamento: Vercel/Netlify para frontend e apps simples; Railway/Render/Fly.io para stacks fullstack de médio porte; AWS/GCP/Azure para necessidades enterprise ou compliance específico.
- Variáveis de ambiente/segredos gerenciados pela plataforma (nunca em arquivo commitado).
- Banco de dados gerenciado (RDS, Supabase, Neon, PlanetScale) em vez de auto-hospedado quando possível, reduzindo risco operacional.
- Backups automáticos do banco de dados com teste periódico de restauração — backup que nunca foi testado não é backup confiável.

## Observabilidade
- Logs centralizados (não apenas `console.log` disperso) e monitoramento de erros em produção (ex: Sentry) para saber de problemas antes do cliente reportar.
- Monitoramento de uptime e alertas automáticos em caso de indisponibilidade.
- Rollback rápido disponível (versionamento de deploys permitindo reverter em minutos).

## Checklist
- [ ] Existe pipeline de CI/CD automatizado com testes antes do deploy?
- [ ] Existem ambientes separados de staging e produção?
- [ ] Backups do banco são automáticos e já foram testados (restauração)?
- [ ] Há monitoramento de erros e uptime em produção?
