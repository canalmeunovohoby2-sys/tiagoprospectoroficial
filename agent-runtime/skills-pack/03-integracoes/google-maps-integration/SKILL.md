---
name: google-maps-integration
description: Use sempre que o negócio tiver endereço físico (clínicas, escritórios, lojas, restaurantes, instaladoras) e precisar exibir localização, rota ou área de atendimento no site. Acione quando o usuário mencionar "mapa", "localização", "onde fica", "como chegar" ou "área de atendimento".
---

# Integração com Google Maps

## Opções de implementação
1. **Embed simples (mais comum e leve)**: iframe do Google Maps com endereço/coordenadas exatas — zero custo, zero chave de API necessária para o embed básico. Ideal para "onde estamos".
2. **Maps JavaScript API**: quando precisar de mapa interativo customizado (múltiplas unidades, marcadores estilizados, cálculo de área de cobertura) — exige chave de API e configuração de billing no Google Cloud; sempre restringir a chave por domínio/referrer.
3. **Places API**: para autocomplete de endereço em formulários (ex: cadastro de instalação de energia solar, endereço de entrega).

## Boas práticas
- Sempre carregar o mapa de forma adiada (lazy) — é um dos maiores vilões de performance (ver `performance-web-vitals`): usar `loading="lazy"` no iframe, ou carregar o script da API só quando a seção entra na viewport.
- Estilizar o mapa (snazzy maps / cloud-based styling) para combinar com a paleta do site em vez de deixar o estilo padrão do Google — reforça a sensação premium.
- Sempre incluir, ao lado do mapa: endereço completo em texto (bom para SEO local e acessibilidade), botão "Como chegar" (deep link `https://www.google.com/maps/dir/?api=1&destination=...`), horário de funcionamento.
- Múltiplas unidades: usar marcadores customizados com nome/endereço no popup e, se muitas unidades, adicionar campo de busca por cidade/CEP.
- Nunca expor a chave de API sem restrição de domínio (risco de abuso de billing).

## Checklist
- [ ] O mapa carrega de forma lazy, sem travar o carregamento inicial da página?
- [ ] O endereço também existe em texto puro na página (SEO/acessibilidade)?
- [ ] Existe botão de rota direto para o app do Google Maps?
- [ ] A chave de API (se usada) está restrita por domínio?
