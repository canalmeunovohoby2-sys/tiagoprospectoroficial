---
name: lgpd-privacidade
description: Use SEMPRE que o site/app/SaaS coletar dados pessoais de usuários brasileiros (formulários, cadastro, cookies, dados de saúde) — obrigatório por lei (LGPD). Acione sempre em conjunto com google-maps, analytics-tracking, crm-lead-capture e qualquer formulário de coleta de dados.
---

# LGPD e Privacidade de Dados

## Princípios a aplicar sempre
- **Minimização**: coletar apenas os dados estritamente necessários para a finalidade declarada — nunca "coletar tudo que puder" por precaução.
- **Finalidade explícita**: informar claramente, no momento da coleta, para que aquele dado será usado.
- **Consentimento**: para dados não essenciais (marketing, cookies analíticos), obter consentimento explícito (opt-in), não pré-marcado.
- **Base legal**: identificar a base legal de cada tratamento (consentimento, execução de contrato, legítimo interesse etc.) — para dados sensíveis (saúde, biometria) a régua é mais rígida.

## Itens obrigatórios de implementação
1. Banner/gerenciador de cookies com opção real de recusar cookies não essenciais (não apenas um botão "Aceitar" sem alternativa visível).
2. Política de Privacidade acessível, escrita em linguagem clara, descrevendo dados coletados, finalidade, prazo de retenção, e como o titular exerce seus direitos.
3. Mecanismo para o titular exercer direitos: acesso aos próprios dados, correção, exclusão (direito ao esquecimento) e portabilidade — ao menos um canal de solicitação (e-mail do DPO/encarregado ou formulário dedicado).
4. Segurança técnica proporcional à sensibilidade do dado (ver `seguranca-owasp`), com atenção redobrada a dados de saúde (odontologia, clínicas médicas, estética) e dados financeiros.
5. Contratos com terceiros que processam dados em nome do controlador (gateways de pagamento, provedores de e-mail, analytics) devem prever obrigações de proteção de dados.

## Checklist
- [ ] O site coleta apenas os dados necessários para a finalidade declarada?
- [ ] Existe banner de cookies com opção real de recusa, não só de aceite?
- [ ] Existe Política de Privacidade acessível e canal para o titular exercer seus direitos?
- [ ] Dados sensíveis (saúde, biometria) recebem tratamento de segurança reforçado?
