---
name: background-jobs-filas
description: Use ao implementar processamento assíncrono/em segundo plano em um SaaS (envio de e-mail em massa, geração de relatório, processamento de imagem/vídeo, sincronização com terceiros). Acione quando o usuário mencionar "processamento em background", "fila", "job", "tarefa demorada" ou quando uma ação do usuário não deve travar a resposta da API esperando terminar.
---

# Jobs em Background e Filas de Processamento

## Quando usar
Qualquer operação que demore mais que ~1-2 segundos ou dependa de recurso externo lento (envio de e-mail em massa, geração de PDF/relatório, processamento de imagem, chamadas a APIs de terceiros não críticas para a resposta imediata) deve ser tirada do ciclo de requisição-resposta síncrono e processada em background.

## Arquitetura
- Fila de mensagens (Redis + BullMQ, RabbitMQ, Amazon SQS, ou similar) com workers dedicados consumindo a fila separadamente da API principal — a API apenas enfileira o job e responde rápido ao usuário ("seu relatório está sendo gerado"), o worker processa de forma assíncrona.
- Retry automático com backoff exponencial para jobs que falham por motivo transitório (API externa fora do ar momentaneamente), com limite máximo de tentativas antes de marcar como falha definitiva e notificar.
- Dead letter queue (fila de jobs que falharam definitivamente) para investigação manual, em vez de simplesmente descartar silenciosamente.

## UX de operações assíncronas
- Sempre informar ao usuário que a ação está em processamento (status visível: pendente → processando → concluído/erro), nunca deixar a UI parecendo travada ou dar a entender que nada aconteceu.
- Notificar o usuário quando o job concluir (in-app, e-mail, ou push conforme o canal apropriado ao contexto) em vez de exigir que ele fique checando manualmente.

## Agendamento (jobs recorrentes)
- Tarefas recorrentes (relatórios diários, cobrança mensal, limpeza de dados antigos) via scheduler dedicado (cron jobs gerenciados, não `setInterval` solto em um processo que pode reiniciar) — garantir idempotência (rodar duas vezes por engano não deve duplicar efeitos, ex: cobrar duas vezes).

## Checklist
- [ ] Operações lentas são processadas em fila/background, não travando a resposta da API?
- [ ] Jobs falhos têm retry automático e vão para uma fila de investigação (dead letter), não somem silenciosamente?
- [ ] O usuário recebe feedback claro do status de operações assíncronas, sem parecer que o sistema travou?
