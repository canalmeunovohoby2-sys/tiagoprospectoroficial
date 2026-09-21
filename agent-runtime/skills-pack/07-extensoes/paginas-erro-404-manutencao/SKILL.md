---
name: paginas-erro-404-manutencao
description: Use ao criar páginas de erro (404, 500) e modo de manutenção de qualquer site. Acione sempre antes de considerar um site pronto — páginas de erro genéricas do servidor quebram a experiência premium do site.
---

# Páginas de Erro e Modo de Manutenção

## Página 404 (não encontrado)
- Nunca deixar a página de erro padrão do servidor/framework — criar uma 404 customizada com a identidade visual do site.
- Incluir: mensagem clara e amigável (sem jargão técnico), busca interna (ver busca-interna-site) ou links para as páginas mais importantes (home, contato, principais serviços/categorias), e manter o header/navegação do site normal para o usuário não ficar "preso".
- Retornar corretamente o status HTTP 404 (não 200) — importante para SEO, evita que o Google indexe páginas de erro como conteúdo válido.

## Modo de manutenção
- Página informando que o site está em manutenção temporária, com estimativa de retorno se possível, e um canal de contato alternativo (WhatsApp, e-mail) para não perder oportunidades de negócio durante o período.
- Retornar status HTTP 503 (indisponível temporariamente) para não prejudicar o SEO acumulado durante manutenções curtas.

## Erro 500 (erro de servidor)
- Página amigável informando que algo deu errado, sem expor detalhes técnicos/stack trace ao usuário (isso é falha de segurança, ver seguranca-owasp), com opção de voltar à home ou tentar novamente.

## Checklist
- [ ] A página 404 tem a identidade visual do site e retorna status HTTP 404?
- [ ] Existe modo de manutenção com canal de contato alternativo?
- [ ] Erros de servidor nunca expõem detalhes técnicos ao usuário final?
