---
name: deep-linking-universal-links
description: Use ao implementar links que abrem diretamente uma tela específica do app (deep links), inclusive vindos de fora do app (e-mail, WhatsApp, anúncios, notificações). Acione quando o usuário mencionar "abrir o app direto nessa tela", "link compartilhável" ou "vindo do e-mail abrir no app".
---

# Deep Linking e Universal/App Links

## Tipos de link
- **Deep link customizado** (`meuapp://produto/123`): funciona apenas se o app já estiver instalado e o SO souber tratar o esquema — mais simples, mas quebra se o app não estiver instalado.
- **Universal Links (iOS) / App Links (Android)**: usam URL https normal (`https://meuapp.com/produto/123`) que abre o app se instalado, ou cai no site/loja de app se não estiver — é a abordagem recomendada por padrão, pois funciona em qualquer canal de compartilhamento (WhatsApp, e-mail, redes sociais) sem quebrar a experiência.

## Implementação
- Configurar arquivo de associação de domínio (`apple-app-site-association` no iOS, `assetlinks.json` no Android) hospedado no domínio do site, provando a propriedade do app sobre aquelas rotas.
- Definir mapeamento claro entre rota de URL e tela do app (ex: `/produto/:id` → tela de detalhe do produto com aquele ID) — reutilizando a mesma estrutura de rotas do site quando o app tiver contraparte web.
- Fallback obrigatório: se o app não estiver instalado, o link deve levar a uma página web equivalente ou à loja de app com um link "smart" que, após a instalação, idealmente leva o usuário direto ao conteúdo pretendido (deferred deep linking) usando serviços como Branch.io ou Firebase Dynamic Links (verificar status atual do serviço, pois esse mercado muda com frequência).

## Casos de uso essenciais a cobrir
- Link de notificação push abrindo a tela específica do evento.
- Link de compartilhamento social de um item específico do app.
- Link de e-mail transacional (ex: "ver seu pedido") abrindo direto no app em vez do navegador.
- Link de convite/referral com atribuição de quem convidou.

## Checklist
- [ ] Links usam Universal/App Links (https), não apenas esquema customizado?
- [ ] Existe fallback funcional para quando o app não está instalado?
- [ ] Notificações push e e-mails transacionais usam deep link para a tela certa, não jogam sempre para a home?
