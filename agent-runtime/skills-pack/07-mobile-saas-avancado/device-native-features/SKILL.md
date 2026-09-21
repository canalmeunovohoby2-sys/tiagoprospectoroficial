---
name: device-native-features
description: Use ao integrar recursos nativos do dispositivo (câmera, GPS, biometria, contatos, sensores, Bluetooth) em qualquer app mobile. Acione quando o usuário mencionar câmera, localização, digital/Face ID, notificações push nativas, ou qualquer permissão de dispositivo.
---

# Recursos Nativos do Dispositivo

## Princípio de permissões
- Nunca solicitar uma permissão sensível (localização, câmera, contatos, notificações) no primeiro segundo de uso do app — pedir no momento exato em que o recurso vai ser usado, com contexto explicando o motivo antes do prompt do sistema aparecer ("priming" educativo).
- Sempre tratar o cenário de permissão negada com uma experiência alternativa funcional (ex: sem GPS, permitir digitar endereço manualmente) — nunca travar o app inteiro por causa de uma permissão recusada.
- Respeitar diferenças entre iOS e Android nas strings de justificativa de permissão (`NSCameraUsageDescription`, etc.) — escrever a justificativa pensando no usuário leigo, não em termos técnicos.

## Recursos comuns e cuidados
- **Câmera/galeria**: comprimir/redimensionar imagens antes de enviar ao servidor (nunca enviar foto de 12MP crua desnecessariamente); pedir apenas acesso limitado a fotos quando o SO permitir (iOS "selected photos").
- **Geolocalização**: usar precisão adequada ao caso de uso (não pedir localização de alta precisão contínua se só precisa da cidade); parar de rastrear em background assim que não for mais necessário (custo de bateria e privacidade).
- **Biometria (Face ID/digital)**: usar as APIs nativas de biometria do SO para autenticação local (nunca implementar reconhecimento próprio) e sempre oferecer alternativa (senha/PIN) para quando a biometria falhar ou não estiver configurada.
- **Notificações push nativas**: solicitar token de dispositivo e registrar no backend associando ao usuário autenticado; respeitar preferências de notificação por categoria.
- **Bluetooth/sensores (quando aplicável, ex: apps de saúde/fitness)**: tratar desconexões abruptas e reconexão automática como cenário normal, não exceção.

## Checklist
- [ ] Toda permissão sensível é solicitada com contexto, no momento certo, nunca de forma abrupta no início?
- [ ] Existe experiência alternativa funcional quando a permissão é negada?
- [ ] Imagens são comprimidas antes do upload e localização usa a precisão mínima necessária?
