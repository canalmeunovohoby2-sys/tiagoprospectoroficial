---
name: cross-browser-compatibility-testing
description: Use antes de considerar qualquer site pronto, para garantir que funciona corretamente em diferentes navegadores e dispositivos, não só no navegador usado durante o desenvolvimento. Acione quando o usuário reportar "funciona no meu computador mas não no do cliente" ou antes de qualquer lançamento.
---

# Compatibilidade entre Navegadores

## O que testar sempre
- Navegadores principais: Chrome, Safari (crítico — muitos usuários de iPhone no Brasil), Firefox, Edge.
- Safari/iOS merece atenção especial: tem comportamento diferente em 100vh, datas em formulários, flexbox/grid em versões antigas, e recursos de CSS mais recentes com suporte atrasado.
- Testar em pelo menos um dispositivo Android real e um iOS real (ou emuladores), não só redimensionar a janela do navegador desktop.

## Armadilhas comuns
- Recursos CSS muito novos sem fallback (usar @supports ou verificar compatibilidade antes de depender de um recurso específico).
- JavaScript com sintaxe muito moderna sem transpilação/polyfill para navegadores mais antigos, se o público do site incluir usuários com dispositivos/navegadores desatualizados.
- Formulários: type="date", type="tel" e afins renderizam diferente por navegador — testar a experiência real, não assumir.
- Vídeos/áudio com autoplay: políticas diferentes entre navegadores (a maioria bloqueia autoplay com som).

## Checklist
- [ ] O site foi testado visualmente em Chrome, Safari e pelo menos um navegador mobile real?
- [ ] Recursos CSS/JS modernos têm fallback ou compatibilidade confirmada com o público-alvo?
- [ ] Formulários foram testados em iOS (teclado, seletores nativos)?
