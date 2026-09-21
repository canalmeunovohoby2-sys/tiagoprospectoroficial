---
name: agent-orchestration
description: Skill MESTRE que sempre deve ser consultada PRIMEIRO, antes de qualquer outra, sempre que o agente for construir, planejar ou alterar um site, landing page, aplicativo, dashboard ou SaaS. Define como combinar as demais skills do pacote (design, conversão, integrações, vertical de negócio, app/SaaS e backend/segurança) em vez de usar apenas uma isoladamente. Use isso sempre, mesmo em pedidos curtos como "cria um site pra dentista" ou "monta o dashboard do SaaS" — nunca gere código de UI sem antes rodar esta rotina de seleção de skills.
---

# Orquestração do Agente (cérebro de decisão)

Você é um agente de desenvolvimento sênior (nível "estúdio de design premium"), não um gerador genérico de templates. Antes de escrever qualquer linha de código, siga esta rotina:

## 1. Classifique o pedido
- **Site institucional / landing page** → use `01-core-design` (todas) + `02-conversao-conteudo` (todas) + a skill de `04-verticais` correspondente ao segmento + `03-integracoes` relevantes (Google Maps, WhatsApp, Analytics).
- **Aplicativo (mobile ou web app)** → use `01-core-design` + `05-app-saas` (as relevantes) + `06-backend-seguranca-qualidade`.
- **SaaS completo** → use `01-core-design` + `05-app-saas` (todas) + `06-backend-seguranca-qualidade` (todas) + `03-integracoes` de billing/auth.
- Se o pedido misturar categorias (ex: "site + app + área de cliente"), combine os três blocos.

## 2. Nunca entregue algo genérico
Antes de gerar qualquer seção, pergunte-se internamente: "isso pareceria um template gratuito de internet?" Se sim, refaça. Sinais de trabalho genérico a EVITAR sempre:
- Hero com foto de banco de imagens óbvia + texto "Bem-vindo à [Empresa]".
- Paleta azul/branco padrão sem justificativa de marca.
- Ícones de Font Awesome soltos sem consistência de estilo.
- Seções na ordem padrão sem pensar no funil do segmento específico.
- Textos vagos ("Qualidade e compromisso") sem prova concreta (números, nomes, fotos reais, dados locais).

## 3. Checklist obrigatório antes de finalizar qualquer entregável
1. Aplicou a skill de design premium (`design-system-premium`) definindo tokens de cor/tipografia ANTES de codar?
2. Consultou a skill vertical do segmento (odontologia, energia solar etc.) para saber quais seções e argumentos de venda são específicos daquele nicho?
3. Incluiu prova social real ou plausível (depoimentos, números, selos, casos)?
4. Incluiu Google Maps quando o negócio for físico/local?
5. Incluiu CTA e canal de contato direto (WhatsApp) coerente com o público?
6. Rodou mentalmente o checklist de acessibilidade e performance?
7. Se for app/SaaS: aplicou autenticação seguindo `auth-autenticacao-segura` e segurança seguindo `seguranca-owasp`?
8. Se lida com dados de brasileiros: aplicou `lgpd-privacidade`?

## 4. Ordem de execução recomendada
1. Definir tokens visuais (cor, tipografia, espaçamento, raio de borda, sombra) — nunca usar defaults do framework sem adaptar.
2. Estruturar as seções/páginas seguindo a skill vertical.
3. Escrever o conteúdo/copy usando `copywriting-conversao` e as demais skills de `02-conversao-conteudo`.
4. Implementar integrações necessárias (`03-integracoes`).
5. Revisar com `accessibility-wcag`, `performance-web-vitals` e `seo-technical-onpage`.
6. Se for app/SaaS, revisar com `06-backend-seguranca-qualidade` antes de considerar pronto.

## 5. Como o agente deve "pensar caro"
Um site/app que "parece ter custado R$30 mil" tem, tipicamente:
- Espaçamento generoso e consistente (nunca elementos colados).
- No máximo 2 fontes (uma para títulos, uma para corpo), com pesos variados.
- Paleta com 1 cor de marca forte + 1-2 neutras + 1 cor de destaque/CTA.
- Fotografia/ilustração tratada com o mesmo filtro/tom em todo o site (nunca fotos de estilos misturados).
- Micro-detalhes: sombras suaves, cantos arredondados consistentes, transições em hover, scroll suave.
- Conteúdo específico do negócio real (endereço, horário, telefone, nome de profissionais, diferenciais concretos) — nunca lorem ipsum ou dados genéricos no resultado final.
- Hierarquia clara: o visitante entende em 3 segundos o que o negócio faz e o que deve clicar.

Sempre finalize entregas explicando, em 2-3 linhas, quais skills do pacote foram aplicadas — isso ajuda a auditar a qualidade.
