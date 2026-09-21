---
name: dominio-dns-hosting-setup
description: Use ao configurar domínio próprio, DNS, SSL/HTTPS e hospedagem de qualquer site novo. Acione quando o usuário mencionar "domínio", "DNS", "hospedagem", "colocar no ar" ou "subdomínio".
---

# Domínio, DNS e Hospedagem

## Configuração de domínio
- Registrar domínio em registrador confiável (Registro.br para .com.br, ou registradores internacionais para .com).
- Configurar registros DNS corretamente: A/AAAA para IP direto, CNAME para apontar subdomínio a outro serviço, MX para e-mail corporativo, TXT para verificação de propriedade e SPF/DKIM (ver email-transacional).
- Sempre usar www e domínio raiz de forma consistente, com redirecionamento 301 de um para o outro (nunca deixar os dois acessíveis como páginas "diferentes" — problema de conteúdo duplicado para SEO).

## SSL/HTTPS
- Certificado SSL obrigatório em todo site (HTTPS), geralmente automático em plataformas modernas (Vercel, Netlify, Cloudflare) — nunca lançar site em HTTP puro.
- Forçar redirecionamento automático de HTTP para HTTPS.

## Subdomínios para multi-tenant/SaaS
- Quando o SaaS oferece subdomínio por cliente (ex: cliente.seusaas.com.br), configurar DNS coringa (*.seusaas.com.br) e certificado wildcard, com roteamento por subdomínio tratado na aplicação.

## Checklist
- [ ] O site responde por HTTPS com redirecionamento automático desde HTTP?
- [ ] www e domínio raiz não coexistem como páginas duplicadas (há redirect 301)?
- [ ] Registros DNS de e-mail (SPF/DKIM) estão corretos, se houver envio de e-mail pelo domínio?
