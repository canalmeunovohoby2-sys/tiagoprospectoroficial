---
name: site-e-commerce
description: Use SEMPRE para lojas virtuais e e-commerce de qualquer nicho de produto. Combine com 01-core-design, payment-gateways, performance-web-vitals e seo-technical-onpage.
---

# Site de E-commerce

## Estrutura essencial
1. Home: destaque de categorias/coleções, produtos em promoção/mais vendidos, prova social (avaliações agregadas), proposta de valor clara (frete, garantia, formas de pagamento).
2. Página de categoria/listagem: filtros (preço, tamanho, cor, categoria), ordenação, cards de produto com imagem, preço (com desconto destacado se houver), avaliação em estrelas.
3. Página de produto: galeria com zoom, variações (cor/tamanho) claras, preço, prazo/valor de frete calculado, avaliações de clientes, produtos relacionados/complementares, botão de compra sempre visível (sticky em mobile).
4. Carrinho e checkout: o mais enxuto possível (idealmente checkout em 1 página ou wizard curto), opção de compra sem cadastro obrigatório (guest checkout), múltiplas formas de pagamento incluindo PIX.
5. Conta do cliente: histórico de pedidos, rastreamento, dados salvos.

## Boas práticas de conversão
- Reduzir ao máximo os cliques entre "quero comprar" e "compra concluída".
- Exibir frete e prazo o quanto antes (idealmente já na listagem/produto via CEP), pois abandono de carrinho por frete surpresa é uma das maiores causas de perda de venda.
- Selos de segurança e política de troca/devolução visíveis perto do botão de compra.
- Avaliações reais de produto aumentam conversão mais que qualquer outro elemento nesta página.

## Técnico
- Seguir `payment-gateways` para checkout seguro, `performance-web-vitals` (catálogos grandes tendem a ficar pesados) e `seo-technical-onpage` (Schema `Product`, `Offer`, `AggregateRating` em cada página de produto).
