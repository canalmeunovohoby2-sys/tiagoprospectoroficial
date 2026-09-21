---
name: formularios-ux-avancado
description: Use ao construir formulários mais complexos que um simples "nome + telefone" — formulários multi-etapa, com lógica condicional, upload de arquivo ou muitos campos. Acione quando o usuário mencionar "formulário", "cadastro completo", "orçamento detalhado" ou "anexar arquivo".
---

# UX Avançada de Formulários

## Formulários longos: quebrar em etapas
- Acima de 5-6 campos, transformar em formulário multi-step com barra de progresso visível — completude percebida aumenta a taxa de conclusão.
- Mostrar sempre quantas etapas faltam ("Etapa 2 de 4"), nunca deixar o usuário sem noção de quanto falta.
- Salvar progresso localmente (ao menos durante a sessão) para não perder tudo se o usuário atualizar a página por engano.

## Lógica condicional
- Mostrar/ocultar campos com base em respostas anteriores (ex: "Você já tem projeto de reforma pronto?" -> se sim, mostrar campo de upload; se não, pular) — reduz a percepção de formulário longo.

## Upload de arquivo
- Indicar claramente tipos de arquivo aceitos e tamanho máximo antes de tentar o upload, com feedback de progresso e erro claro caso falhe.
- Preview do arquivo enviado (nome, miniatura se for imagem) antes da confirmação final.

## Validação e erro
- Validar campo a campo conforme o usuário preenche (não só ao clicar em enviar), com mensagens específicas ("E-mail inválido", não apenas "Campo inválido").
- Nunca apagar o que o usuário já preencheu em caso de erro de envio — preservar todos os dados e destacar apenas o(s) campo(s) com problema.

## Checklist
- [ ] Formulários longos estão divididos em etapas com progresso visível?
- [ ] Campos condicionais aparecem só quando relevantes?
- [ ] Erros de validação são específicos e não apagam o que já foi preenchido?
