---
name: mobile-security-armazenamento-seguro
description: Use SEMPRE ao lidar com dados sensíveis (tokens, senhas, dados financeiros/de saúde) armazenados localmente em um app mobile, e ao proteger a comunicação do app com o backend contra interceptação. Acione em conjunto com auth-autenticacao-segura e seguranca-owasp sempre que o app for além de conteúdo puramente público.
---

# Segurança Mobile: Armazenamento e Comunicação

## Armazenamento local seguro
- Nunca armazenar tokens de sessão, senhas ou dados sensíveis em `localStorage`/`AsyncStorage` puro (não criptografado) — usar Keychain (iOS) e Keystore (Android) através de bibliotecas apropriadas (ex: `expo-secure-store`, `react-native-keychain`), que armazenam dados criptografados e protegidos pelo hardware do dispositivo.
- Dados de cache não sensíveis (preferências de tema, dados públicos) podem usar storage comum; a regra de ouro é: se vazar o storage do dispositivo, nada crítico deve estar legível.

## Comunicação com o backend
- Certificate pinning em apps que lidam com dados de alta sensibilidade (financeiro, saúde) — impede ataques man-in-the-middle mesmo em redes comprometidas/certificados falsos instalados no dispositivo.
- HTTPS obrigatório em toda chamada de API, sem exceção, mesmo em ambiente de desenvolvimento sempre que possível, para já testar o comportamento real.
- Nunca embutir chaves de API secretas (chave privada, segredo de backend) diretamente no código do app — o app pode ser decompilado e a chave extraída; segredos sensíveis devem viver apenas no backend, com o app se autenticando via token de usuário.

## Proteção contra engenharia reversa (para apps de alta sensibilidade)
- Ofuscação de código (ProGuard/R8 no Android) como camada adicional — não é proteção definitiva, mas dificulta análise casual.
- Detecção de dispositivo com jailbreak/root para funcionalidades críticas (ex: apps bancários costumam bloquear ou alertar nesses casos) — usar com critério, pois pode gerar fricção desnecessária em apps que não lidam com dados críticos.

## Sessão e logout
- Expirar sessão/token adequadamente e limpar completamente o storage seguro ao fazer logout — nunca deixar resíduo de dados do usuário anterior acessível ao próximo usuário no mesmo dispositivo (cenário comum em apps compartilhados/dispositivos corporativos).

## Checklist
- [ ] Tokens e dados sensíveis usam Keychain/Keystore, nunca storage não criptografado?
- [ ] Nenhuma chave secreta de backend está embutida no código do app?
- [ ] O logout limpa completamente os dados sensíveis armazenados localmente?
