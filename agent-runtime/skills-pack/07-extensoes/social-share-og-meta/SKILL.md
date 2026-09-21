---
name: social-share-og-meta
description: Use ao finalizar qualquer página de site para garantir que o link, ao ser compartilhado em WhatsApp/Instagram/Facebook/LinkedIn, mostre uma prévia bonita (imagem, título, descrição) em vez de um link "cru" ou quebrado. Acione sempre antes de considerar um site pronto para divulgação.
---

# Open Graph, Twitter Cards e Preview de Compartilhamento

## Tags obrigatórias em toda página
- og:title, og:description, og:image (1200x630px, com texto legível mesmo em miniatura), og:url, og:type.
- twitter:card (summary_large_image na maioria dos casos), twitter:title, twitter:description, twitter:image.
- Título e descrição do OG podem ser diferentes do <title>/meta description de SEO — o OG é para gerar clique social, pode ser mais chamativo.

## Imagem de compartilhamento
- Nunca usar o logo sozinho como imagem padrão — criar um template com logo + frase de valor + visual da marca, gerado por página quando possível (ex: título do artigo do blog renderizado dinamicamente na imagem).
- Sempre testar a prévia real antes de divulgar (ferramentas de debug do Facebook/LinkedIn, ou preview direto no WhatsApp).

## Favicon e ícones
- Favicon em múltiplos tamanhos (16x16, 32x32, apple-touch-icon 180x180) e manifest.json com ícones para quando o site for adicionado à tela inicial.

## Checklist
- [ ] Toda página principal tem og:image customizada, não genérica/ausente?
- [ ] A prévia foi testada em pelo menos um app de mensagem real antes do lançamento?
- [ ] Favicon aparece corretamente em aba do navegador e em atalhos de celular?
