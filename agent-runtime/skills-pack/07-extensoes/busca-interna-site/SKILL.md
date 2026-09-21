---
name: busca-interna-site
description: Use ao implementar busca interna em sites com muito conteúdo/produtos (e-commerce, blog extenso, catálogo de imóveis, base de conhecimento). Acione quando o usuário mencionar "busca no site", "pesquisar", "encontrar produto/artigo".
---

# Busca Interna do Site

## Quando é necessária
- Sites institucionais pequenos (5-10 páginas): geralmente dispensável, navegação simples resolve.
- E-commerce, imobiliária, blog com dezenas/centenas de itens, base de conhecimento/FAQ extensa: busca é essencial para não frustrar o usuário.

## Implementação
- Busca com autocomplete/sugestões em tempo real conforme o usuário digita, mostrando resultados prováveis antes mesmo de apertar Enter.
- Tolerância a erro de digitação (fuzzy search) — usuário busca "implante dentario" sem acento e o sistema deve entender.
- Resultados categorizados quando o site tem tipos de conteúdo diferentes (ex: separar "Produtos" de "Artigos do blog" nos resultados).
- Página de resultados com filtros adicionais (preço, categoria) quando aplicável, não só uma lista simples.
- Estado vazio de busca bem tratado: quando não há resultado, sugerir termos alternativos ou categorias populares em vez de tela em branco.

## Ferramentas
- Para sites simples: busca client-side com biblioteca leve (ex: Fuse.js) sobre os dados já carregados.
- Para catálogos grandes: serviço de busca dedicado (Algolia, Meilisearch, Typesense) — muito mais rápido e com relevância melhor que busca ingênua em banco relacional.

## Checklist
- [ ] A busca tolera erros de digitação e acentuação?
- [ ] Existem sugestões/autocomplete antes de o usuário confirmar a busca?
- [ ] O estado de "nenhum resultado" oferece alternativa, não é uma tela morta?
