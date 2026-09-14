import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { FileCode2, Loader2 } from "lucide-react";
import { languageForPath } from "@/lib/studio/fileTree";

export interface StudioCodeEditorProps {
  /** Caminho do arquivo ativo (usado para linguagem e título). */
  path: string | null;
  /** Conteúdo efetivo (inclui edições não salvas). */
  value: string;
  onChange: (path: string, content: string) => void;
  onCursorChange?: (pos: { line: number; column: number }) => void;
  readOnly?: boolean;
}

// Editor controlado único, como no DaveLovable: NÃO há models por arquivo nem
// um Monaco por aba; a troca de arquivo reaproveita a mesma instância. Evita
// vazamento de models e mantém o comportamento previsível.
export function StudioCodeEditor({ path, value, onChange, onCursorChange, readOnly = false }: StudioCodeEditorProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const [ready, setReady] = useState(false);
  const cursorSubRef = useRef<{ dispose: () => void } | null>(null);
  const onCursorRef = useRef(onCursorChange);
  onCursorRef.current = onCursorChange;

  useEffect(() => () => {
    cursorSubRef.current?.dispose();
    cursorSubRef.current = null;
  }, []);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    setReady(true);
    cursorSubRef.current = editor.onDidChangeCursorPosition((e) => {
      onCursorRef.current?.({ line: e.position.lineNumber, column: e.position.column });
    });
  };

  const theme = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "vs-dark" : "light";

  if (!path) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        <FileCode2 className="h-7 w-7 opacity-40" />
        <p>Selecione um arquivo no explorador para editar o código.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/70 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando editor…
        </div>
      )}
      <Editor
        key={path}
        height="100%"
        language={languageForPath(path)}
        value={value}
        theme={theme}
        onMount={handleMount}
        onChange={(next) => onChange(path, next ?? "")}
        loading={<div className="p-4 text-xs text-muted-foreground">carregando editor…</div>}
        options={{
          readOnly,
          fontSize: 13,
          lineHeight: 20,
          minimap: { enabled: false },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: "off",
          renderWhitespace: "selection",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          padding: { top: 10, bottom: 10 },
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        }}
      />
    </div>
  );
}
