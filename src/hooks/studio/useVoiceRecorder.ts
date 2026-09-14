// Gravador de voz do chat (estilo WhatsApp): captura o microfone, mostra nível
// real (AnalyserNode) e transcreve com a Web Speech API, entregando TEXTO — que é
// o que o agente entende. Não altera o sistema de anexos/edição.
//
// Transcrição robusta: ao ENVIAR, aguarda por um instante o resultado FINAL que o
// navegador emite após o `stop()` (senão a última fala se perde) e, se ainda não
// houver final, usa o INTERIM acumulado — nunca descarta a fala do usuário.
// Nada é enviado durante a gravação (igual ao ditado do SiteChat).

import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceRecorderOptions {
  /** Chamado UMA vez, ao enviar, com o texto transcrito. */
  onTranscript: (text: string) => void;
  /** Aviso para a UI (sem suporte, microfone negado, transcrição vazia). */
  onNotice?: (message: string) => void;
}

export interface VoiceRecorderApi {
  supported: boolean;
  recording: boolean;
  seconds: number;
  /** Últimos níveis de áudio (0..1) para as barras; vazio se não houver análise. */
  levels: number[];
  start: () => void;
  finish: () => void;
  cancel: () => void;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechResultLike {
  isFinal?: boolean;
  0?: { transcript?: string };
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

const MAX_LEVELS = 28;
// Janela para o navegador emitir o resultado FINAL depois do stop().
const FINALIZE_WAIT_MS = 500;

export function useVoiceRecorder({ onTranscript, onNotice }: VoiceRecorderOptions): VoiceRecorderApi {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);

  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const finalsRef = useRef<string[]>([]);
  const interimRef = useRef("");
  const seenFinalCountRef = useRef(0);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drainRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onNoticeRef = useRef(onNotice);
  onTranscriptRef.current = onTranscript;
  onNoticeRef.current = onNotice;

  const currentText = useCallback(() => (
    [finalsRef.current.join(" "), interimRef.current].join(" ").replace(/\s+/g, " ").trim()
  ), []);

  const teardownStream = useCallback(() => {
    if (rafRef.current !== null) { try { cancelAnimationFrame(rafRef.current); } catch { /* noop */ } rafRef.current = null; }
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recRef.current?.stop(); } catch { /* noop */ }
    recRef.current = null;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    streamRef.current = null;
    try { void audioCtxRef.current?.close(); } catch { /* noop */ }
    audioCtxRef.current = null;
  }, []);

  /** Descarta a gravação atual (invalida a sessão para ignorar resultados tardios). */
  const discard = useCallback(() => {
    activeRef.current = false;
    sessionRef.current += 1;
    if (drainRef.current !== null) { clearTimeout(drainRef.current); drainRef.current = null; }
    teardownStream();
    finalsRef.current = [];
    interimRef.current = "";
    seenFinalCountRef.current = 0;
    setRecording(false);
    setLevels([]);
  }, [teardownStream]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      onNoticeRef.current?.("Ditado por voz não é suportado neste navegador (use Chrome ou Edge).");
      return;
    }
    const mySession = ++sessionRef.current;
    activeRef.current = true;
    finalsRef.current = [];
    interimRef.current = "";
    setLevels([]);
    setSeconds(0);
    setRecording(true);

    // Nível de áudio real (best-effort; sem análise, as barras são animadas por CSS).
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!activeRef.current || mySession !== sessionRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!activeRef.current || mySession !== sessionRef.current) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = data.length ? sum / data.length / 255 : 0;
          setLevels((prev) => [...prev, Math.min(1, avg * 1.8)].slice(-MAX_LEVELS));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch { /* sem análise → barras animadas */ }
    })();

    timerRef.current = setInterval(() => {
      if (activeRef.current && mySession === sessionRef.current) setSeconds((s) => s + 1);
    }, 1000);

    const startRecognition = () => {
      if (!activeRef.current || mySession !== sessionRef.current) return;
      seenFinalCountRef.current = 0; // nova sessão de reconhecimento → zera a contagem
      let rec: SpeechRecognitionLike;
      try { rec = new Ctor(); } catch { onNoticeRef.current?.("Não foi possível iniciar o gravador de voz."); discard(); return; }
      rec.lang = "pt-BR";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (ev: unknown) => {
        // Aceita resultados da MESMA sessão (inclusive os que chegam após o stop,
        // durante a janela de finalização) — só a troca de sessão os invalida.
        if (mySession !== sessionRef.current) return;
        const results = (ev as { results?: ArrayLike<SpeechResultLike> }).results;
        if (!results) return;
        // `results` é CUMULATIVO dentro de uma sessão de reconhecimento. Contamos os
        // finais já vistos para acrescentar só os NOVOS (sem duplicar) e mantemos as
        // partes anteriores quando o navegador reinicia por silêncio.
        let finalCount = 0;
        let interim = "";
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const txt = typeof r?.[0]?.transcript === "string" ? r[0].transcript : "";
          if (!txt) continue;
          if (r?.isFinal) {
            finalCount += 1;
            if (finalCount > seenFinalCountRef.current) finalsRef.current.push(txt);
          } else {
            interim += interim ? ` ${txt}` : txt;
          }
        }
        if (finalCount > 0) seenFinalCountRef.current = finalCount;
        interimRef.current = interim;
      };
      rec.onerror = (e) => {
        if (mySession !== sessionRef.current) return;
        const code = e?.error ?? "";
        if (code === "not-allowed" || code === "service-not-allowed") {
          onNoticeRef.current?.("Permita o acesso ao microfone no navegador para gravar voz.");
          discard();
        }
        // "no-speech"/"aborted" são temporários: onend reinicia.
      };
      rec.onend = () => {
        // Encerrou sozinho (silêncio) mas o usuário ainda está gravando → reinicia.
        if (activeRef.current && mySession === sessionRef.current) {
          try { startRecognition(); } catch { /* noop */ }
        }
      };
      try { rec.start(); recRef.current = rec; }
      catch {
        setTimeout(() => { if (activeRef.current && mySession === sessionRef.current) { try { rec.start(); } catch { /* noop */ } } }, 400);
      }
    };
    startRecognition();
  }, [discard]);

  /** Enviar: fecha a captura e entrega a transcrição (final imediato ou após a janela). */
  const finish = useCallback(() => {
    if (!activeRef.current) return;
    const mySession = sessionRef.current;
    activeRef.current = false; // impede reinício por onend
    setRecording(false);
    setLevels([]);
    try { recRef.current?.stop(); } catch { /* noop */ }

    const emit = () => {
      drainRef.current = null;
      if (mySession !== sessionRef.current) return; // outra gravação assumiu
      const text = currentText();
      teardownStream();
      finalsRef.current = [];
      interimRef.current = "";
      seenFinalCountRef.current = 0;
      if (text) onTranscriptRef.current(text);
      else onNoticeRef.current?.("Não consegui transcrever nada. Tente novamente mais perto do microfone.");
    };

    // Já temos final? Entrega na hora. Só interim (ou nada)? Aguarda a janela de
    // finalização do navegador — é o que evita perder a última fala.
    if (finalsRef.current.length > 0) emit();
    else drainRef.current = setTimeout(emit, FINALIZE_WAIT_MS);
  }, [currentText, teardownStream]);

  const cancel = useCallback(() => discard(), [discard]);

  useEffect(() => () => {
    activeRef.current = false;
    sessionRef.current += 1;
    if (drainRef.current !== null) clearTimeout(drainRef.current);
    teardownStream();
  }, [teardownStream]);

  return { supported: !!getRecognitionCtor(), recording, seconds, levels, start, finish, cancel };
}
