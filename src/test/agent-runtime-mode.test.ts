import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideRuntimeMode,
  getAgentRuntimeMode,
  setAgentRuntimeMode,
  LOCAL_AGENT_RUNTIME_URL,
} from "@/lib/siteProjectsApi";

// ONDE o runtime executa é uma decisão SEPARADA do provider de IA.
// "auto" preserva o comportamento histórico; "local"/"remote" são preferências
// explícitas do usuário e nunca podem travar o fluxo (fallback para a nuvem).
const REMOTE = "https://runtime.exemplo.dev";

describe("runtime do agente · preferência salva", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("padrão é 'auto' (sem nada salvo e sem localStorage)", () => {
    expect(getAgentRuntimeMode()).toBe("auto");
  });

  it("grava e lê 'local'/'remote'; valor inválido volta para 'auto'", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v),
      removeItem: (k: string) => void delete store[k],
    });
    setAgentRuntimeMode("local");
    expect(getAgentRuntimeMode()).toBe("local");
    setAgentRuntimeMode("remote");
    expect(getAgentRuntimeMode()).toBe("remote");
    store["prospector.agentRuntimeMode"] = "banana";
    expect(getAgentRuntimeMode()).toBe("auto");
  });
});

describe("runtime do agente · decideRuntimeMode (matriz pura)", () => {
  it("auto + ollama: local quando no ar (comportamento histórico)", () => {
    expect(
      decideRuntimeMode({ mode: "auto", provider: "ollama", localAvailable: true, remoteUrl: REMOTE }),
    ).toEqual({ state: "local", url: LOCAL_AGENT_RUNTIME_URL, provider: "ollama" });
  });

  it("auto + ollama fora do ar: erro explícito (NUNCA cai na nuvem silenciosamente)", () => {
    expect(
      decideRuntimeMode({ mode: "auto", provider: "ollama", localAvailable: false, remoteUrl: REMOTE }),
    ).toEqual({ state: "ollama_local_missing", provider: "ollama" });
  });

  it("auto + provider de nuvem: usa ESTE COMPUTADOR (produção não vai para a nuvem)", () => {
    expect(
      decideRuntimeMode({ mode: "auto", provider: "deepseek", localAvailable: true, remoteUrl: REMOTE }),
    ).toEqual({ state: "local", url: LOCAL_AGENT_RUNTIME_URL, provider: "deepseek" });
  });

  it("auto + runtime local fora do ar: none com orientação (NUNCA Railway silencioso)", () => {
    expect(
      decideRuntimeMode({ mode: "auto", provider: "deepseek", localAvailable: false, remoteUrl: REMOTE }),
    ).toEqual({ state: "none", provider: "deepseek" });
  });

  it("'local' força o runtime deste computador para QUALQUER provider", () => {
    expect(
      decideRuntimeMode({ mode: "local", provider: "gemini", localAvailable: true, remoteUrl: REMOTE }),
    ).toEqual({ state: "local", url: LOCAL_AGENT_RUNTIME_URL, provider: "gemini" });
  });

  it("'local' fora do ar: none (avisa em vez de ir para a nuvem)", () => {
    expect(
      decideRuntimeMode({ mode: "local", provider: "gemini", localAvailable: false, remoteUrl: REMOTE }),
    ).toEqual({ state: "none", provider: "gemini" });
  });

  it("'local' fora do ar e sem nuvem: none (sem runtime fantasma)", () => {
    expect(
      decideRuntimeMode({ mode: "local", provider: "gemini", localAvailable: false, remoteUrl: null }),
    ).toEqual({ state: "none", provider: "gemini" });
  });

  it("'remote' ignora o runtime local, mesmo com Ollama ativo", () => {
    expect(
      decideRuntimeMode({ mode: "remote", provider: "ollama", localAvailable: true, remoteUrl: REMOTE }),
    ).toEqual({ state: "remote", url: REMOTE, provider: "ollama" });
  });

  it("'remote' sem runtime remoto: none", () => {
    expect(
      decideRuntimeMode({ mode: "remote", provider: "ollama", localAvailable: true, remoteUrl: null }),
    ).toEqual({ state: "none", provider: "ollama" });
  });

  it("sem provider e sem nuvem: none com provider null", () => {
    expect(
      decideRuntimeMode({ mode: "auto", provider: null, localAvailable: false, remoteUrl: null }),
    ).toEqual({ state: "none", provider: null });
  });
});

describe("runtime do agente · fiação no código real", () => {
  const api = readFileSync(join(process.cwd(), "src/lib/siteProjectsApi.ts"), "utf8");

  it("resolveEditorRuntime usa a preferência salva e a decisão pura", () => {
    expect(api).toContain("getAgentRuntimeMode()");
    expect(api).toContain("decideRuntimeMode({ mode, provider, localAvailable, remoteUrl })");
    expect(api).toContain('localStorage.getItem(AGENT_RUNTIME_MODE_KEY)');
  });

  it("sonda o runtime local em TODOS os modos (é o caminho de produção)", () => {
    // 2 tentativas: se o Chrome está mostrando o prompt de permissão de rede local, a
    // primeira sonda pode voltar vazia e a segunda passa.
    expect(api).toMatch(/const localAvailable = \(await localRuntimeAvailable\(\)\) \|\| \(await localRuntimeAvailable\(\)\);/);
    expect(api).toContain('const remoteUrl = mode === "remote" ? await remoteRuntimeUrl() : null;');
  });

  it("os invokes seguem usando runtimeUrl do resolver (sem URL duplicada)", () => {
    expect(api).toMatch(/\$\{runtimeUrl\.replace[^`]*\}\/run/);
    expect(LOCAL_AGENT_RUNTIME_URL).toBe("http://127.0.0.1:8787");
  });

  it("o seletor de runtime é renderizado na tela de provedores de IA", () => {
    const settings = readFileSync(
      join(process.cwd(), "src/components/app/AiProvidersSettings.tsx"),
      "utf8",
    );
    expect(settings).toContain('import { AgentRuntimeSettings } from "./AgentRuntimeSettings"');
    expect(settings).toContain("<AgentRuntimeSettings />");
  });
});
