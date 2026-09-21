---
name: headless-cms-integration
description: Use quando o site precisar que o cliente edite conteúdo (textos, imagens, posts de blog) sem depender de um desenvolvedor a cada alteração. Acione quando o usuário mencionar "CMS", "editar o site sozinho", "painel de conteúdo" ou "atualizar sem mexer no código".
---

# Integração com CMS Headless

## Quando usar
- Sempre que o cliente final do site (não o desenvolvedor) precisar trocar textos, fotos, preços ou publicar posts com frequência — sem isso, cada alteração vira um chamado técnico desnecessário.

## Opções comuns
- Sanity / Contentful / Strapi: CMS headless dedicado, ótimo para sites com forte necessidade de modelagem de conteúdo customizada (ex: catálogo de imóveis, portfólio de projetos).
- WordPress em modo headless: quando o cliente já conhece WordPress e quer interface familiar, mas o frontend é construído à parte (mais performático que WP tradicional).
- CMS simples no próprio banco do SaaS: quando o site faz parte do produto e os dados já vivem no banco da aplicação — não precisa de CMS externo, só uma tela de edição própria.

## Boas práticas
- Modelar o conteúdo pensando em reuso (ex: um "serviço" como tipo de conteúdo estruturado, não um bloco de texto livre) para permitir listagens automáticas e SEO consistente.
- Preview de conteúdo antes de publicar (o cliente precisa ver como vai ficar antes de confirmar).
- Definir quem pode editar o quê (permissões) quando houver mais de uma pessoa no time do cliente atualizando o site.
- Cache/regeneração de página automática quando o conteúdo é atualizado (evitar site "desatualizado" após edição).

## Checklist
- [ ] O cliente consegue editar conteúdo recorrente sem depender de código?
- [ ] Existe preview antes de publicar mudanças?
- [ ] O conteúdo é modelado de forma estruturada, não como texto livre bagunçado?
