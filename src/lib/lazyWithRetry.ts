import { lazy, type ComponentType } from "react";

/**
 * Wrapper para `React.lazy` que tolera erros de "Failed to fetch dynamically
 * imported module" — que ocorrem quando o HTML do usuário está cacheado e
 * aponta para um chunk cujo hash mudou após um novo deploy/build (Vite).
 *
 * Estratégia:
 *  1. Retry silencioso (1x) após 400ms.
 *  2. Se falhar de novo, faz um reload único da página (com sessionStorage
 *     como flag anti-loop) para o navegador buscar o `index.html` novo.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkName?: string,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    const flagKey = `lovable:chunk-reload:${chunkName ?? factory.toString().slice(0, 40)}`;
    try {
      return await factory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isChunkError =
        /Failed to fetch dynamically imported module/i.test(msg) ||
        /Importing a module script failed/i.test(msg) ||
        /error loading dynamically imported module/i.test(msg);

      if (!isChunkError) throw err;

      // Retry silencioso — resolve casos de rede intermitente.
      try {
        await new Promise((r) => setTimeout(r, 400));
        return await factory();
      } catch (err2) {
        // Reload único — evita loop infinito se o erro persistir.
        if (typeof window !== "undefined" && !sessionStorage.getItem(flagKey)) {
          sessionStorage.setItem(flagKey, "1");
          console.warn("[lazyWithRetry] chunk stale, reloading page once", { chunkName, msg });
          window.location.reload();
          // Retorna um componente vazio enquanto a página recarrega.
          return { default: (() => null) as unknown as T };
        }
        throw err2;
      }
    }
  });
}
