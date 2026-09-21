---
name: sso-enterprise-saml-oidc
description: Use ao implementar login corporativo (SSO) via SAML/OIDC para clientes empresariais de um SaaS. Acione quando o usuário mencionar "SSO", "login corporativo", "Azure AD", "Okta" ou "cliente enterprise pedindo login único".
---

# SSO Enterprise (SAML / OIDC)

## Por que é necessário para vender a empresas maiores
Clientes enterprise frequentemente exigem que seus funcionários façam login no seu SaaS usando a identidade corporativa já existente (Google Workspace, Microsoft Entra ID/Azure AD, Okta) — sem isso, é comum perder negociações inteiras com empresas de médio/grande porte, independente da qualidade do produto.

## Protocolos
- **OIDC (OpenID Connect)**: construído sobre OAuth 2.0, mais moderno e simples de implementar — preferir quando o provedor de identidade do cliente suportar.
- **SAML 2.0**: mais antigo, ainda muito exigido por empresas grandes/tradicionais (bancos, governo, corporações antigas) — exige biblioteca dedicada (ex: `passport-saml`, `node-saml`) e manuseio cuidadoso de certificados XML.
- Oferecer suporte a ambos amplia significativamente o público enterprise atendível.

## Implementação no contexto multi-tenant
- Cada organização/cliente configura seu próprio provedor de identidade (metadata URL/certificado do IdP dela) — o login SSO deve ser específico por tenant, não um único login corporativo genérico.
- Provisionamento de usuário: decidir entre Just-in-Time provisioning (cria a conta automaticamente no primeiro login SSO bem-sucedido) ou exigir convite prévio — JIT costuma ser preferido por reduzir fricção administrativa do cliente.
- Mapear atributos do IdP (nome, e-mail, grupos/papéis) para os campos e permissões do seu sistema, incluindo possibilidade de sincronizar papéis/times automaticamente via grupos do SAML/OIDC quando o cliente exigir (SCIM para provisionamento/desprovisionamento automático de usuários é o próximo nível, valorizado por clientes muito grandes).

## Segurança
- Validar rigorosamente assinatura e emissor (issuer) de toda resposta SAML/OIDC, nunca confiar em dados não assinados/validados do provedor de identidade.
- Suportar desprovisionamento: quando um funcionário é removido do IdP do cliente, o acesso deve ser revogado (imediatamente com SCIM, ou ao menos no próximo login tentado sem sucesso).

## Checklist
- [ ] Cada organização configura seu próprio IdP, com login SSO isolado por tenant?
- [ ] Assinatura e emissor de toda resposta SAML/OIDC são validados rigorosamente?
- [ ] Existe estratégia clara de provisionamento (JIT ou convite) e, idealmente, desprovisionamento de usuários?
