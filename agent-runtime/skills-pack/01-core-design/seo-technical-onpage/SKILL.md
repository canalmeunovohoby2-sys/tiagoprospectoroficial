---
name: seo-technical-onpage
description: Use ao criar qualquer site institucional, landing page ou blog para garantir SEO técnico e on-page desde o início (não como retrabalho depois). Acione sempre que o usuário mencionar "aparecer no Google", "SEO", "ranquear" ou para qualquer site local (odontologia, energia solar, clínicas etc.) onde busca local é crítica.
---

# SEO Técnico e On-Page

## Fundamentos on-page (todo site)
- Um único `<h1>` por página, descrevendo claramente o negócio/oferta principal; hierarquia `<h2>`/`<h3>` organizando seções.
- `<title>` único por página (50-60 caracteres) e `meta description` (140-160 caracteres) persuasiva, não apenas descritiva.
- URLs limpas e legíveis (`/servicos/implante-dentario`, não `/page?id=123`).
- Dados estruturados (Schema.org/JSON-LD): `LocalBusiness` (ou o tipo específico: `Dentist`, `Restaurant`, `RealEstateAgent` etc.), `FAQPage` quando houver seção de perguntas, `Review`/`AggregateRating` quando houver depoimentos reais.
- Imagens com `alt` descritivo contendo, quando natural, termos relevantes (bom também para acessibilidade).
- Sitemap.xml e robots.txt configurados; canonical tags para evitar conteúdo duplicado.

## SEO local (essencial para odontologia, energia solar, clínicas, restaurantes etc.)
- Nome, Endereço e Telefone (NAP) idênticos em todo o site e consistentes com o Google Business Profile.
- Página/seção com Google Maps incorporado (ver skill `google-maps-integration`).
- Conteúdo mencionando a cidade/região de atuação de forma natural (não "keyword stuffing").
- Schema `LocalBusiness` com `address`, `geo`, `openingHours`, `telephone`.

## Performance como fator de SEO
- SEO técnico depende diretamente da skill `performance-web-vitals` — Core Web Vitals são fator de ranqueamento.

## Checklist
- [ ] Cada página tem título e meta description únicos e persuasivos?
- [ ] Existe apenas um `<h1>` e hierarquia lógica de headings?
- [ ] Dados estruturados (JSON-LD) do tipo correto foram incluídos?
- [ ] NAP consistente e Google Maps incorporado (se negócio local)?
