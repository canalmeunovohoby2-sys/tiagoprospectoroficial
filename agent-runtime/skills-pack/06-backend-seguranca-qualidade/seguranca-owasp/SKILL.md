---
name: seguranca-owasp
description: Use SEMPRE ao escrever backend, APIs ou qualquer código que trate dados de usuários — é obrigatório revisar contra esta skill antes de considerar qualquer app ou SaaS pronto para produção. Acione sempre, mesmo sem o usuário pedir explicitamente por "segurança".
---

# Segurança (baseado em OWASP Top 10)

## Checklist de vulnerabilidades a prevenir sempre
1. **Injeção (SQL/NoSQL)**: sempre usar queries parametrizadas/ORM, nunca concatenar input do usuário diretamente em queries.
2. **Autenticação quebrada**: ver skill `auth-autenticacao-segura` (hash de senha, rate limiting, sessões seguras).
3. **Exposição de dados sensíveis**: nunca retornar mais campos do que o necessário em respostas de API (evitar `SELECT *` exposto), criptografar dados sensíveis em repouso, sempre usar HTTPS.
4. **Controle de acesso quebrado (IDOR/broken access control)**: validar sempre, no backend, que o usuário autenticado tem permissão E posse sobre o recurso específico solicitado — nunca confiar em IDs previsíveis sem checagem.
5. **Configuração incorreta de segurança**: nunca deixar variáveis de ambiente/segredos no código-fonte ou repositório; desabilitar mensagens de erro detalhadas (stack trace) em produção; headers de segurança configurados (CSP, `X-Frame-Options`, `X-Content-Type-Options`, HSTS).
6. **XSS (Cross-Site Scripting)**: sempre sanitizar/escapar conteúdo gerado por usuário antes de renderizar em HTML; usar frameworks que escapam por padrão (React/Vue) e nunca usar `dangerouslySetInnerHTML`/`v-html` com conteúdo não sanitizado.
7. **CSRF**: tokens anti-CSRF em formulários/mutações quando usar cookies de sessão; usar `SameSite=Strict/Lax` em cookies.
8. **Componentes vulneráveis**: manter dependências atualizadas, rodar auditoria (`npm audit`/similares) periodicamente.
9. **Logging e monitoramento insuficientes**: registrar tentativas de acesso suspeitas/falhas de autenticação sem logar dados sensíveis (senhas, tokens, dados de cartão).
10. **SSRF e validação de entrada**: sempre validar e sanitizar toda entrada (tipo, tamanho, formato) tanto no frontend (UX) quanto no backend (segurança real).

## Segredos e infraestrutura
- Segredos (chaves de API, senhas de banco) sempre em variáveis de ambiente/gerenciador de segredos, nunca hardcoded ou commitados no Git.
- Princípio do menor privilégio: cada serviço/chave de API com apenas as permissões estritamente necessárias.

## Checklist final antes de "produção pronta"
- [ ] Toda entrada de usuário é validada e sanitizada no backend?
- [ ] Toda rota sensível verifica autenticação E autorização sobre o recurso específico?
- [ ] Não há segredos expostos no código-fonte/repositório?
- [ ] HTTPS, headers de segurança e cookies seguros estão configurados?
