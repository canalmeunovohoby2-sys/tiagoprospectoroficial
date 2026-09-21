---
name: code-review-clean-code
description: Use como revisão final de qualquer código gerado (frontend, backend, app) antes de entregar como concluído, garantindo legibilidade, manutenibilidade e ausência de código "gambiarra". Acione sempre antes de finalizar uma tarefa de desenvolvimento.
---

# Code Review e Clean Code

## Princípios
- Nomes descritivos de variáveis/funções/componentes (nunca `data2`, `temp`, `handleClick1`) — o nome deve explicar a intenção sem precisar ler a implementação.
- Funções pequenas e com responsabilidade única; se uma função precisa de comentário para explicar "o que faz" em vários pontos, provavelmente deve ser dividida.
- Evitar duplicação (DRY) — mas sem abstrair prematuramente algo usado uma única vez; duplicação simples é melhor que abstração errada.
- Tratamento de erro explícito em toda chamada que pode falhar (rede, banco, parsing) — nunca deixar promessas sem `.catch`/try-catch silencioso engolindo erros.
- Consistência de estilo em todo o código (usar linter/formatter automatizado — ESLint/Prettier ou equivalente — configurado no projeto, não deixado ao critério de cada arquivo).
- Comentários explicam o "porquê" de decisões não óbvias, não o "o quê" (o código já diz o quê).

## Antes de considerar qualquer entrega "pronta"
- Remover código morto, `console.log` de debug e comentários de TODO não resolvidos deixados por engano.
- Verificar que não há segredos/chaves hardcoded no código.
- Verificar que o código segue a organização de pastas/módulos já estabelecida no projeto, sem criar padrões paralelos inconsistentes.
- Rodar linter/build antes de declarar a tarefa concluída.

## Checklist
- [ ] Nomes de variáveis/funções são autoexplicativos?
- [ ] Erros são tratados explicitamente, nunca engolidos silenciosamente?
- [ ] Não há código de debug, segredos hardcoded ou TODOs esquecidos na entrega final?
- [ ] O linter/build passa sem erros antes de considerar a tarefa concluída?
