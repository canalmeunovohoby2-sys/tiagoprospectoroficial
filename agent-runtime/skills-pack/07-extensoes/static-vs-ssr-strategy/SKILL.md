---
name: static-vs-ssr-strategy
description: Use ao decidir a arquitetura de renderização de um site (estático, server-side rendering, geração incremental) antes de começar a construir. Acione sempre no início de um projeto novo com Next.js, Nuxt, Astro ou similar, quando o usuário perguntar "qual a melhor forma de construir isso" ou mencionar performance/SEO em conjunto.
---

# Estratégia de Renderização: SSG, SSR, ISR, CSR

## Como escolher
- SSG (Static Site Generation): páginas geradas em build time — ideal para sites institucionais, landing pages, conteúdo que muda pouco (a maioria dos sites de segmento local: odontologia, energia solar, advocacia etc.). Máxima performance e menor custo de servidor.
- ISR (Incremental Static Regeneration): como SSG, mas revalida páginas em intervalos ou sob demanda — ideal para blog/catálogo que muda com frequência moderada sem precisar rebuild manual.
- SSR (Server-Side Rendering): página gerada a cada requisição no servidor — necessário quando o conteúdo é altamente personalizado por usuário (ex: dashboard logado, preços dinâmicos por sessão) ou depende de dados em tempo real no carregamento inicial.
- CSR (Client-Side Rendering): renderização só no navegador — aceitável para áreas internas/logadas de SaaS onde SEO não importa, mas ruim para páginas públicas (SEO fraco, LCP mais lento).

## Regra prática
- Site institucional/marketing (a maioria dos segmentos do pacote de verticais) -> SSG ou ISR.
- Área logada de SaaS/dashboard -> SSR ou CSR, dependendo da necessidade de SEO (geralmente não precisa).
- Catálogo grande (e-commerce, imobiliária) -> ISR, para equilibrar performance com atualização de estoque/preço.

## Checklist
- [ ] A escolha de renderização foi justificada pela necessidade real de SEO/personalização, não por padrão do framework?
- [ ] Páginas públicas priorizam SSG/ISR para performance e SEO?
