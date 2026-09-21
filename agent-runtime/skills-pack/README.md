# Pack de Skills — Agente Sênior de Design & Desenvolvimento (Web, App, SaaS)

50 skills organizadas em 7 categorias, no formato `SKILL.md` (nome + descrição de gatilho + instruções). Pense nisso como o "manual de estúdio sênior" que seu agente vai consultar antes de gerar qualquer site, app ou SaaS.

## Estrutura

```
skills-pack/
├── 00-orquestracao/          → 1 skill MESTRE (sempre consultada primeiro)
├── 01-core-design/           → 8 skills de design/frontend (sempre usadas)
├── 02-conversao-conteudo/    → 6 skills de copywriting e conversão
├── 03-integracoes/           → 6 skills de integrações (Maps, WhatsApp, pagamento...)
├── 04-verticais/             → 14 skills por segmento de negócio
├── 05-app-saas/              → 8 skills para apps e SaaS
└── 06-backend-seguranca-qualidade/ → 7 skills de backend/segurança/qualidade
```

A skill **`00-orquestracao/agent-orchestration`** é a mais importante do pacote: ela ensina o agente a combinar as outras skills em vez de usar só uma isolada (ex: um site de odontologia precisa de `site-odontologia` + todas as `01-core-design` + `copywriting-conversao` + `google-maps-integration` + `whatsapp-business-integration`).

## Como instalar no seu SaaS (com o DeepSeek)

Como seu agente roda dentro do seu próprio SaaS (não é o formato nativo de "Skills" da Anthropic), a forma mais direta de usar isso é como **base de conhecimento/instruções do sistema** que o DeepSeek consulta. Passo a passo sugerido no VS Code:

1. Copie a pasta `skills-pack/` inteira para dentro do repositório do seu SaaS (ex: `/agent/skills/`).
2. Peça ao DeepSeek (dentro do VS Code) algo como:
   > "Leia todos os arquivos SKILL.md dentro de /agent/skills/, extraia o campo `description` de cada um como índice, e implemente uma função que, antes de responder a um pedido do usuário, selecione e injete no contexto do modelo os SKILL.md relevantes (sempre incluindo `agent-orchestration`), da mesma forma que o campo `description` explica quando usar cada skill."
3. Estratégias comuns de implementação técnica:
   - **RAG simples**: indexar os `SKILL.md` (ex: com embeddings) e recuperar os mais relevantes por similaridade com o pedido do usuário, sempre incluindo `agent-orchestration` fixo no contexto.
   - **Roteamento por categoria**: manter um índice leve (nome + description de cada skill, ~50 linhas) sempre no prompt do sistema; quando o modelo "decidir" que uma skill se aplica, o agente injeta o conteúdo completo daquele `SKILL.md` na chamada seguinte.
   - **Mais simples (bom para começar)**: concatenar `agent-orchestration` + as skills de `01-core-design` e `02-conversao-conteudo` (são quase sempre necessárias) no prompt de sistema padrão, e injetar dinamicamente a skill vertical (`04-verticais`) e as de app/SaaS conforme o tipo de pedido.
4. Depois de implementado, teste pedindo coisas como "cria um site para minha clínica odontológica" e "cria o dashboard do meu SaaS" e verifique se o agente está de fato citando/aplicando os checklists das skills certas.

## Como expandir depois
- Para adicionar um novo segmento (ex: pet hotel, salão de barbeiro, contabilidade), copie o padrão de qualquer arquivo em `04-verticais/` e ajuste paleta, seções obrigatórias e objeções do segmento.
- Mantenha sempre o mesmo formato de frontmatter (`name`, `description`) — é o que permite ao agente decidir sozinho quando cada skill se aplica.

## Filosofia do pacote (vale reforçar no prompt de sistema do seu agente)
Um resultado "que parece ter custado R$30 mil" não vem de um framework específico — vem de: tokens de design consistentes, copy específica (não genérica), prova social real, hierarquia visual clara, performance e acessibilidade cuidadas, e conteúdo que fala a língua exata do segmento do cliente. Essa é a lógica central que todas as 50 skills reforçam de formas diferentes.
