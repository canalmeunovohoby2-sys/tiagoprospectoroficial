---
name: offline-first-sync
description: Use ao construir qualquer app mobile que precise funcionar sem conexão à internet ou em conexão instável, sincronizando dados quando a rede voltar. Acione quando o usuário mencionar "offline", "sem internet", "sincronizar" ou o app for usado em campo (ex: app de vendedor externo, técnico de instalação de energia solar).
---

# Offline-First e Sincronização de Dados

## Princípio
Projetar o app assumindo que a rede vai falhar em algum momento — não como exceção rara, mas como cenário normal a ser tratado desde a arquitetura, especialmente em apps usados em campo (visitas técnicas, vendas externas, entregas).

## Arquitetura recomendada
- Banco de dados local no dispositivo (SQLite, WatermelonDB, Realm, ou armazenamento estruturado equivalente) como fonte principal de leitura da UI — a UI sempre lê do banco local, nunca espera resposta de rede para renderizar.
- Fila de operações pendentes: toda ação do usuário offline (criar, editar, excluir) é registrada localmente com status "pendente de sincronização" e enviada ao servidor assim que a conexão voltar.
- Sincronização em background ao detectar rede disponível novamente, com indicador visual discreto do status (sincronizando / sincronizado / erro de sincronização).

## Resolução de conflitos
- Definir estratégia clara para quando o mesmo dado foi alterado offline em dois dispositivos ou entre o dispositivo e o servidor: "last write wins" (mais simples, aceitável na maioria dos casos), merge de campos específicos, ou notificar o usuário para escolher manualmente em casos críticos.
- Nunca perder silenciosamente uma alteração do usuário por conflito — sempre logar/expor de alguma forma quando um conflito for resolvido automaticamente.

## UX
- Indicar claramente ao usuário quando está offline (banner discreto), sem bloquear o uso do app — o app deve continuar funcional, só avisando que a sincronização está pendente.
- Nunca deixar o usuário achar que uma ação falhou quando na verdade só está pendente de sincronização.

## Checklist
- [ ] A UI lê sempre do banco local, nunca trava esperando rede para mostrar dados já conhecidos?
- [ ] Existe fila de sincronização com retry automático ao voltar a conexão?
- [ ] A estratégia de resolução de conflito está definida e documentada, não deixada ao acaso?
