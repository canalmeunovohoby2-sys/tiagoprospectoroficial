---
name: popup-captura-exit-intent
description: Use ao implementar pop-ups de captura de lead, newsletter ou ofertas em sites — com regras rígidas de bom uso para não prejudicar a experiência nem a conversão. Acione quando o usuário mencionar "pop-up", "captura de e-mail", "oferta especial" ou "exit intent".
---

# Pop-ups de Captura e Exit Intent

## Regra de ouro
Pop-up mal cronometrado é a forma mais rápida de parecer um site barato e afastar visitantes. Usar com moderação e sempre com timing justificado.

## Gatilhos recomendados (em vez de aparecer imediatamente ao carregar)
- Exit intent (desktop): detectar quando o cursor se move em direção ao topo da tela, sinal de que o usuário vai sair — momento ideal para uma última oferta.
- Por tempo/scroll: aparecer após 30-60 segundos de navegação ou após o usuário rolar 50-70% da página — sinal de que já está engajado, não é o primeiro contato.
- Por intenção específica: ex: aparecer só na página de blog oferecendo newsletter, ou só ao visitante que já visitou 2+ páginas (maior probabilidade de conversão que um visitante de primeira visita).

## Boas práticas de UX
- Nunca mostrar o mesmo pop-up mais de uma vez na mesma sessão (usar cookie/localStorage para lembrar que já foi fechado).
- Botão de fechar sempre visível e fácil de clicar — pop-up "difícil de fechar" gera frustração e prejudica a marca.
- Oferta clara e específica (desconto real, conteúdo exclusivo) — nunca um pop-up genérico "assine nossa newsletter" sem motivo para o usuário querer.
- Nunca usar em mobile de forma que cubra a tela inteira sem X visível, e nunca no primeiro segundo de carregamento (prejudica Core Web Vitals e é péssima experiência).

## Checklist
- [ ] O pop-up aparece com base em tempo/scroll/intenção, não imediatamente ao carregar?
- [ ] Ele não reaparece repetidamente na mesma sessão após ser fechado?
- [ ] A oferta é específica e vale a interrupção causada?
