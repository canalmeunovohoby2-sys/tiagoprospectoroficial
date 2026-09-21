---
name: auth-autenticacao-segura
description: Use SEMPRE ao implementar cadastro, login, recuperação de senha ou controle de acesso em qualquer app/SaaS. Combine sempre com a skill seguranca-owasp. Acione quando o usuário mencionar "login", "autenticação", "cadastro" ou "controle de acesso".
---

# Autenticação e Autorização Seguras

## Autenticação (quem é o usuário)
- Nunca armazenar senha em texto puro — usar hash forte (bcrypt, argon2) com salt.
- Preferir, quando possível, login social (OAuth Google/Microsoft) ou magic link por e-mail além de senha, reduzindo fricção e superfície de ataque.
- Implementar 2FA (autenticação em dois fatores) ao menos como opção para contas administrativas/sensíveis.
- Rate limiting em tentativas de login (bloqueio temporário após N tentativas falhas) para mitigar força bruta.
- Recuperação de senha via token de uso único com expiração curta (ex: 15-30 min), nunca enviando a senha atual por e-mail.
- Sessões: tokens JWT com expiração curta + refresh token, ou sessões server-side com cookie `httpOnly`, `secure`, `sameSite`.

## Autorização (o que o usuário pode fazer)
- Implementar RBAC (papéis: admin, membro, visualizador etc.) verificado sempre no backend — nunca confiar em esconder botão no frontend como única proteção.
- Toda rota de API deve validar que o usuário autenticado tem permissão sobre o recurso específico solicitado (não só que está logado) — evita "IDOR" (acesso a recursos de outros usuários trocando um ID na URL).
- Em contexto multi-tenant, validar sempre que o recurso pertence à organização do usuário autenticado (ver `saas-arquitetura-multi-tenant`).

## Checklist
- [ ] Senhas usam hash forte (bcrypt/argon2), nunca texto puro ou hash fraco (MD5/SHA1)?
- [ ] Existe rate limiting em login e recuperação de senha?
- [ ] Toda rota valida permissão E posse do recurso no backend, não só autenticação?
- [ ] Tokens/sessões têm expiração e renovação seguras?
