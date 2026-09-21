---
name: white-label-multi-marca
description: Use ao construir um SaaS que precisa ser "vestido" com a marca de cada cliente (logo, cores, domínio próprio) — white-label ou multi-marca. Acione quando o usuário mencionar "white label", "cada cliente com sua marca", "domínio próprio do cliente" ou "personalizar por revenda".
---

# White-Label e Personalização Multi-Marca

## Camadas de personalização a suportar
1. **Visual básico**: logo, cores primária/secundária, favicon — deve alimentar diretamente os tokens de `design-system-premium` de forma dinâmica (tema por tenant, não hardcoded).
2. **Domínio próprio**: cliente acessa via `app.clientedomain.com` (CNAME apontando para sua infraestrutura) em vez de `clientename.seusaas.com` — exige provisionamento automático de certificado SSL por domínio customizado (ex: via Let's Encrypt automatizado ou serviço de proxy como Cloudflare for SaaS).
3. **Conteúdo de e-mail/notificação**: remetente e template de e-mails transacionais (ver `email-transacional`) também devem refletir a marca do cliente, não a marca do seu SaaS, quando for um produto white-label completo.
4. **Remoção de marca própria**: em planos white-label completos, remover qualquer menção "Powered by [seu SaaS]" — isso costuma ser uma feature paga em nível de plano.

## Arquitetura técnica
- Configuração de branding armazenada por tenant no banco (cores, logo, domínio, nome de exibição) e carregada dinamicamente no bootstrap da aplicação (nunca build separado por cliente — inviável de manter em escala).
- Cache de configuração de branding por domínio para não consultar o banco a cada requisição.
- Fallback visual padrão (marca do próprio SaaS) para tenants que não configuraram personalização.

## Checklist
- [ ] O branding (cor, logo) é carregado dinamicamente por tenant, sem exigir build separado por cliente?
- [ ] Domínios customizados têm provisionamento automatizado de SSL?
- [ ] E-mails transacionais refletem a marca do cliente em planos white-label?
