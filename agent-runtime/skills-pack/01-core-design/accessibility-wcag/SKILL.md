---
name: accessibility-wcag
description: Use ao finalizar qualquer tela de site ou app para garantir acessibilidade (WCAG 2.1 AA). Acione sempre antes de entregar um resultado como "pronto", e especialmente quando houver formulários, modais, menus ou conteúdo visual importante (imagens, gráficos, ícones informativos).
---

# Acessibilidade (WCAG 2.1 AA)

## Por que importa aqui
Além de ser requisito legal em vários países (no Brasil, LBI — Lei Brasileira de Inclusão), acessibilidade bem feita é sinal de produto profissional e amplia o público (incluindo idosos, que são público relevante em segmentos como saúde e odontologia).

## Checklist técnico obrigatório
- **Contraste**: texto normal ≥ 4.5:1, texto grande (≥18px bold ou 24px) ≥ 3:1. Nunca cinza claro sobre branco para textos importantes.
- **HTML semântico**: use `<header>`, `<nav>`, `<main>`, `<footer>`, `<button>` (não `<div onClick>`), hierarquia correta de `<h1>`-`<h6>` sem pular níveis.
- **Alt text**: toda imagem informativa com `alt` descritivo; imagens decorativas com `alt=""`.
- **Navegação por teclado**: todo elemento interativo alcançável via Tab, com `:focus-visible` claramente estilizado (nunca `outline: none` sem substituto).
- **Formulários**: `<label>` associado a cada input (não apenas placeholder), mensagens de erro anunciadas (`aria-live` ou `aria-describedby`).
- **ARIA com moderação**: use `aria-label`/`aria-expanded`/`role` apenas quando o HTML semântico não for suficiente (ex: menus custom, modais, tabs).
- **Modais/drawers**: devem prender o foco (focus trap), fechar com Esc, e devolver o foco ao elemento que abriu.
- **Vídeos/áudio**: legendas ou transcrição quando o conteúdo for essencial.
- **Zoom**: layout não pode quebrar até 200% de zoom do navegador.

## Checklist rápido antes de entregar
- [ ] Passei um leitor rápido pela árvore semântica (headings em ordem, landmarks presentes)?
- [ ] Testei tab pelo teclado até o fim da página/tela?
- [ ] Contrastes de texto e ícones importantes passam em 4.5:1?
- [ ] Formulários têm labels e mensagens de erro acessíveis?
