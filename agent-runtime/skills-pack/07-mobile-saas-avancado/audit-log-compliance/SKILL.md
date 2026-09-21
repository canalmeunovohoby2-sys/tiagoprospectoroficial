---
name: audit-log-compliance
description: Use ao implementar registro de auditoria (quem fez o quê e quando) em um SaaS, especialmente para clientes enterprise ou setores regulados (saúde, financeiro, jurídico). Acione quando o usuário mencionar "log de auditoria", "rastreabilidade", "compliance" ou "histórico de alterações".
---

# Log de Auditoria e Compliance

## O que registrar
- Toda ação que altera dados sensíveis ou de negócio: criação/edição/exclusão de registros importantes, mudanças de permissão, login/logout, alterações de configuração da conta/organização, acesso a dados sensíveis (visualização, não só edição, em contextos regulados como saúde).
- Para cada evento: quem (usuário), o quê (ação e recurso afetado), quando (timestamp preciso), de onde (IP, dispositivo quando relevante), e o valor antes/depois em alterações de dados críticos.

## Arquitetura
- Log de auditoria deve ser append-only (somente inserção, nunca alteração ou exclusão pelos usuários do sistema, incluindo administradores comuns) — a integridade do log é o que dá valor a ele em uma auditoria real.
- Armazenar separado dos dados operacionais principais (tabela/serviço dedicado) para não impactar performance das operações normais e para permitir retenção/política de acesso diferente.
- Retenção configurável conforme exigência regulatória do setor do cliente (alguns setores exigem anos de retenção).

## Exposição ao cliente
- Em planos enterprise, oferecer ao próprio cliente uma tela de consulta ao log de auditoria da organização dele (filtrável por usuário, ação, período) — é frequentemente um requisito explícito de compra em processos de segurança/compliance corporativo (questionários de segurança, certificações).
- Possibilidade de exportação do log (CSV/API) para os sistemas de SIEM/compliance do próprio cliente.

## Checklist
- [ ] O log de auditoria é append-only e armazenado separado dos dados operacionais?
- [ ] Cada evento registra quem, o quê, quando e o estado antes/depois em alterações críticas?
- [ ] Clientes enterprise conseguem consultar/exportar seu próprio log de auditoria?
