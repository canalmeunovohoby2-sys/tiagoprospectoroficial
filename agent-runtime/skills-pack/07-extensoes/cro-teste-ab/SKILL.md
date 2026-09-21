---
name: cro-teste-ab
description: Use quando o usuário quiser melhorar a taxa de conversão de um site já existente através de testes controlados, não apenas "achismo" de design. Acione quando o usuário mencionar "otimizar conversão", "teste A/B", "aumentar vendas do site" ou "o site converte pouco".
---

# CRO (Conversion Rate Optimization) e Teste A/B

## Processo correto
1. Definir a métrica de conversão principal da página (ex: envio de formulário, clique no WhatsApp, compra concluída) e garantir que já está sendo medida corretamente (ver analytics-tracking) antes de testar qualquer coisa.
2. Formular hipótese específica, não "vamos mudar a cor do botão porque sim": ex: "Se destacarmos o preço no hero, a taxa de clique no CTA vai aumentar porque reduz a incerteza do visitante".
3. Testar UMA variável de cada vez quando o tráfego for baixo/médio (teste A/B simples) — testar múltiplas variáveis ao mesmo tempo (multivariado) só faz sentido com volume alto de tráfego, senão o resultado não é confiável.
4. Rodar o teste até atingir significância estatística mínima (não tirar conclusão com poucos dias/poucas conversões) — ferramentas como Google Optimize (descontinuado, usar alternativas como VWO, GrowthBook, ou implementação própria) ajudam a calcular isso.
5. Implementar o vencedor e documentar o aprendizado antes de testar a próxima hipótese.

## O que costuma ter mais impacto (priorizar testes aqui)
- Texto e clareza do headline/hero (maior impacto geral).
- Prova social visível (posição e tipo de depoimento).
- Fricção do formulário (número de campos, etapas).
- Clareza e posicionamento do CTA principal.

## Checklist
- [ ] Existe uma métrica de conversão clara e corretamente instrumentada antes do teste?
- [ ] O teste parte de uma hipótese específica, não de uma mudança aleatória?
- [ ] O resultado foi validado com significância estatística antes de virar decisão definitiva?
