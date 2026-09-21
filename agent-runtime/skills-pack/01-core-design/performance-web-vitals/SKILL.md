---
name: performance-web-vitals
description: Use ao construir ou revisar qualquer site/app antes de considerá-lo pronto, para garantir carregamento rápido (Core Web Vitals). Acione quando o usuário mencionar "lento", "performance", "velocidade" ou sempre que forem adicionadas imagens, fontes, vídeos ou scripts de terceiros.
---

# Performance e Core Web Vitals

## Metas
- **LCP** (maior elemento visível) < 2.5s
- **INP** (responsividade a interação) < 200ms
- **CLS** (estabilidade visual) < 0.1

## Práticas obrigatórias
- Imagens: sempre em formato moderno (WebP/AVIF), com `width`/`height` definidos (evita CLS) e `loading="lazy"` exceto na imagem do hero (`fetchpriority="high"`).
- Fontes: `font-display: swap`, pré-carregar (`<link rel="preload">`) a fonte principal usada acima da dobra, e limitar a 2 famílias/poucos pesos.
- CSS/JS: eliminar CSS não usado, dividir JS em chunks (code splitting), adiar (`defer`/`async`) scripts não críticos (analytics, chat, mapas) para depois do carregamento principal.
- Scripts de terceiros (mapas, chat, pixels): carregar sob demanda ou após interação/scroll quando possível — são a maior causa de lentidão em sites "bonitos".
- Evitar shifts de layout: reservar espaço (skeleton, `aspect-ratio`) para imagens, anúncios, embeds e fontes antes de carregarem.
- Cache e CDN: ativos estáticos com cache longo e versionado (hash no nome do arquivo); servir via CDN quando disponível.
- Minimizar bibliotecas pesadas: preferir CSS/vanilla JS ou libs leves a frameworks de animação pesados quando o efeito for simples.

## Checklist
- [ ] Todas as imagens têm dimensões definidas e formato moderno?
- [ ] Scripts de terceiros (mapas, chat, analytics) carregam de forma assíncrona/adiada?
- [ ] A fonte principal está pré-carregada e com `font-display: swap`?
- [ ] Nenhum elemento "pula" a página durante o carregamento (CLS)?
