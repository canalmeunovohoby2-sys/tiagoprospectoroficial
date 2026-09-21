---
name: internacionalizacao-multilingue
description: Use ao construir um site que precisa atender públicos em mais de um idioma/país. Acione quando o usuário mencionar "outro idioma", "site em inglês também", "multilíngue" ou "internacional".
---

# Internacionalização (i18n) e Sites Multilíngues

## Estrutura de URLs
- Preferir subpastas por idioma (site.com/pt/, site.com/en/) ou subdomínios (en.site.com) — nunca depender só de detecção automática de navegador sem URL própria por idioma (prejudica SEO e compartilhamento de links).
- Tag hreflang em cada página apontando para as versões equivalentes em outros idiomas — evita que o Google trate como conteúdo duplicado e garante que mostra a versão certa para cada busca regional.

## Conteúdo
- Tradução profissional/revisão humana para conteúdo de venda (copy) — tradução automática pura costuma soar artificial e prejudicar a conversão, especialmente em headlines e CTAs.
- Adaptar não só o idioma, mas referências culturais, moeda, formato de data/telefone e, quando aplicável, prova social local (depoimentos/casos daquele mercado específico têm mais peso que os de outro país).

## Técnico
- Usar biblioteca de i18n adequada ao framework (ex: next-intl, react-i18next, vue-i18n) para gerenciar strings de forma organizada, nunca texto hardcoded espalhado pelo código.
- Testar layout com idiomas de tamanho de texto muito diferente (alemão tende a ser mais longo, por exemplo) para garantir que o design não quebra.

## Checklist
- [ ] Cada idioma tem URL própria (subpasta/subdomínio) com hreflang configurado?
- [ ] O conteúdo foi adaptado culturalmente, não só traduzido literalmente?
- [ ] O layout foi testado com textos mais longos/curtos entre os idiomas?
