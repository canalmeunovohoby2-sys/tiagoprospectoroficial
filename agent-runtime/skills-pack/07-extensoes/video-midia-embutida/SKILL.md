---
name: video-midia-embutida
description: Use ao incorporar vídeos (institucional, depoimentos, tutoriais, procedimentos) em qualquer site, garantindo que não prejudiquem performance nem experiência. Acione quando o usuário mencionar "vídeo", "player", "YouTube", "Vimeo" ou "media".
---

# Vídeo e Mídia Incorporada

## Hospedagem do vídeo
- Preferir YouTube/Vimeo (não hospedar arquivo de vídeo pesado no próprio servidor) — melhor performance, streaming adaptativo automático, e menor custo de banda.
- Vimeo costuma ser preferido quando se quer um player sem marca/anúncios do YouTube e mais controle visual (comum em sites premium de arquitetura, eventos, imobiliárias de alto padrão).

## Performance
- Nunca fazer autoplay de vídeo com som ao carregar a página — além de má prática de UX, a maioria dos navegadores bloqueia mesmo assim.
- Usar uma thumbnail estática (imagem leve) no lugar do embed pesado, carregando o player de verdade (iframe do YouTube/Vimeo) somente quando o usuário clica em play — evita carregar o JS pesado do player desnecessariamente (técnica de "facade" para vídeo, grande ganho de performance).
- Definir width/height ou aspect-ratio no container do vídeo para evitar CLS (ver performance-web-vitals).

## Legendas e acessibilidade
- Sempre que o vídeo tiver fala relevante (institucional, depoimento, tutorial), disponibilizar legenda — ajuda acessibilidade e SEO (o texto da legenda pode ser indexado).

## Checklist
- [ ] O vídeo carrega via thumbnail + clique, não via embed pesado automático?
- [ ] Não há autoplay com som?
- [ ] Existe legenda quando o conteúdo falado for relevante?
