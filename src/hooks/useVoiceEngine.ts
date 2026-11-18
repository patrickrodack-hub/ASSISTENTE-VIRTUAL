import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantId, AssistantTurn, InteractionMode } from '../types/assistant';
import { safeFetchJson } from '../utils/apiClient';
import { triggerHaptic } from '../utils/haptics';

export type JarvisVoiceOption = 'JarvisOriginal';
export type FridayVoiceOption = 'Kore' | 'Zephyr';
export type UltronVoiceOption = 'UltronOriginal';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionInstanceLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstanceLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const buffer = base64ToArrayBuffer(base64);
  const blob = new Blob([buffer], { type: mimeType || 'audio/wav' });
  return URL.createObjectURL(blob);
}

const ZERO_BANDS = Array.from({ length: 24 }, () => 0);

export interface WakeParseResult {
  matched: boolean;
  targetMode: InteractionMode;
  commandText: string;
  wakeOnly: boolean;
}

export function parseWakePhrase(rawTranscript: string): WakeParseResult {
  const normalized = rawTranscript.trim();
  const lower = normalized.toLowerCase();

  const hasJarvis = /\b(jarvis|j\.a\.r\.v\.i\.s|já vis|jarves|jarvis,)\b/i.test(lower);
  const hasFriday = /\b(sexta[\s-]?feira|sexta|friday|f\.r\.i\.d\.a\.y)\b/i.test(lower);
  const hasUltron = /\b(ultron|[uú]ltron)\b/i.test(lower);
  const hasAll = /\b(todos|os tr[eê]s|tr[eê]s|conselho|equipe)\b/i.test(lower);
  const hasBoth =
    (hasJarvis && hasFriday && !hasUltron) || /\b(vocês dois|os dois|ambos)\b/i.test(lower);

  if (!hasJarvis && !hasFriday && !hasUltron && !hasBoth && !hasAll) {
    return { matched: false, targetMode: 'auto', commandText: normalized, wakeOnly: false };
  }

  let targetMode: InteractionMode = 'auto';
  if (hasAll || (hasUltron && (hasJarvis || hasFriday))) targetMode = 'todos';
  else if (hasUltron) targetMode = 'ultron';
  else if (hasBoth) targetMode = 'ambos';
  else if (hasJarvis) targetMode = 'jarvis';
  else if (hasFriday) targetMode = 'sexta-feira';

  const stripped = normalized
    .replace(
      /^(ei|oi|olá|ola|hey|ok|fala|escuta|por favor|atenção)?\s*,?\s*(jarvis e sexta[\s-]?feira|sexta[\s-]?feira e jarvis|jarvis|j\.a\.r\.v\.i\.s|já vis|jarves|sexta[\s-]?feira|sexta|friday|ultron|[uú]ltron|todos|os tr[eê]s|vocês dois|os dois|equipe|conselho)\b[:,.\s-]*/i,
      ''
    )
    .trim();

  const wakeOnly = stripped.length < 3;
  return {
    matched: true,
    targetMode,
    commandText: stripped,
    wakeOnly,
  };
}

interface UseVoiceEngineOptions {
  onWakeCommand: (command: string, mode: InteractionMode) => void;
  onTranscribedClip: (text: string) => void;
  onVoiceError: (message: string) => void;
  onAssistantActivated?: (mode: InteractionMode, source: 'wake_word' | 'standby_on') => void;
}

export function useVoiceEngine({
  onWakeCommand,
  onTranscribedClip,
  onVoiceError,
  onAssistantActivated,
}: UseVoiceEngineOptions) {
  const [isStandbyActive, setIsStandbyActive] = useState(false);
  const [speechSupported] = useState(() => Boolean(getSpeechRecognitionCtor()));
  const [interimTranscript, setInterimTranscript] = useState('');
  const [awakeTarget, setAwakeTarget] = useState<InteractionMode | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingSpeaker, setSpeakingSpeaker] = useState<
    AssistantId | 'ambos' | 'todos' | null
  >(null);
  const [speakingText, setSpeakingText] = useState('');
  const [audioAmplitude, setAudioAmplitude] = useState(0);
  const [audioBands, setAudioBands] = useState<number[]>(ZERO_BANDS);
  const [isSynthesizingAudio, setIsSynthesizingAudio] = useState(false);
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [isTranscribingClip, setIsTranscribingClip] = useState(false);
  const [audioBlockedByBrowser, setAudioBlockedByBrowser] = useState(false);

  const [jarvisVoice, setJarvisVoiceState] = useState<JarvisVoiceOption>(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('stark_jarvis_voice_exclusive', 'JarvisOriginal');
        window.localStorage.setItem('stark_jarvis_voice_v3', 'JarvisOriginal');
        window.localStorage.setItem('stark_jarvis_voice_v2', 'JarvisOriginal');
      } catch {
        // ignore
      }
    }
    return 'JarvisOriginal';
  });

  const [fridayVoice, setFridayVoiceState] = useState<FridayVoiceOption>(() => {
    if (typeof window === 'undefined') return 'Kore';
    const saved = window.localStorage.getItem('stark_friday_voice');
    return saved === 'Zephyr' || saved === 'Kore' ? saved : 'Kore';
  });

  const [ultronVoice, setUltronVoiceState] = useState<UltronVoiceOption>(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('stark_ultron_voice_exclusive', 'UltronOriginal');
        window.localStorage.setItem('stark_ultron_voice_v3', 'UltronOriginal');
        window.localStorage.setItem('stark_ultron_voice_v2', 'UltronOriginal');
      } catch {
        // ignore
      }
    }
    return 'UltronOriginal';
  });

  const setJarvisVoice = useCallback((_v?: JarvisVoiceOption) => {
    setJarvisVoiceState('JarvisOriginal');
    try {
      window.localStorage.setItem('stark_jarvis_voice_exclusive', 'JarvisOriginal');
      window.localStorage.setItem('stark_jarvis_voice_v3', 'JarvisOriginal');
      window.localStorage.setItem('stark_jarvis_voice_v2', 'JarvisOriginal');
    } catch {
      // ignore
    }
  }, []);

  const setFridayVoice = useCallback((v: FridayVoiceOption) => {
    setFridayVoiceState(v);
    try {
      window.localStorage.setItem('stark_friday_voice', v);
    } catch {
      // ignore
    }
  }, []);

  const setUltronVoice = useCallback((_v?: UltronVoiceOption) => {
    setUltronVoiceState('UltronOriginal');
    try {
      window.localStorage.setItem('stark_ultron_voice_exclusive', 'UltronOriginal');
      window.localStorage.setItem('stark_ultron_voice_v3', 'UltronOriginal');
      window.localStorage.setItem('stark_ultron_voice_v2', 'UltronOriginal');
    } catch {
      // ignore
    }
  }, []);

  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const standbyRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const playbackSessionRef = useRef(0);
  const awakeTargetRef = useRef<InteractionMode | null>(null);
  const awakeTimerRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const playbackRafRef = useRef<number | null>(null);
  const sharedAudioCtxRef = useRef<AudioContext | null>(null);
  const activeBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const lastProcessedPhraseRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const audioUnlockedRef = useRef(false);

  const streamChainRef = useRef<Promise<void>>(Promise.resolve());
  const streamSessionIdRef = useRef(0);
  const streamHasEnqueuedRef = useRef(false);

  const onWakeCommandRef = useRef(onWakeCommand);
  onWakeCommandRef.current = onWakeCommand;
  const onAssistantActivatedRef = useRef(onAssistantActivated);
  onAssistantActivatedRef.current = onAssistantActivated;

  const jarvisVoiceRef = useRef(jarvisVoice);
  jarvisVoiceRef.current = jarvisVoice;
  const fridayVoiceRef = useRef(fridayVoice);
  fridayVoiceRef.current = fridayVoice;
  const ultronVoiceRef = useRef(ultronVoice);
  ultronVoiceRef.current = ultronVoice;

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!sharedAudioCtxRef.current || sharedAudioCtxRef.current.state === 'closed') {
      sharedAudioCtxRef.current = new AudioCtx();
    }
    const ctx = sharedAudioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }
    return ctx;
  }, []);

  const unlockAudio = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const ctx = ensureAudioContext();
      if (ctx && !audioUnlockedRef.current) {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
      }
      audioUnlockedRef.current = true;
      setAudioBlockedByBrowser(false);
    } catch {
      // ignore
    }
  }, [ensureAudioContext]);

  const playSubtleChime = useCallback(
    (freqStart: number, freqEnd: number) => {
      try {
        const ctx = ensureAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + 0.14);
        gain.gain.setValueAtTime(0.055, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.19);
      } catch {
        // Ignore audio context restrictions
      }
    },
    [ensureAudioContext]
  );

  useEffect(() => {
    const handleGesture = () => {
      unlockAudio();
    };
    window.addEventListener('pointerdown', handleGesture, { passive: true });
    window.addEventListener('keydown', handleGesture, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
  }, [unlockAudio]);

  const stopPlaybackAnalyser = useCallback(() => {
    if (playbackRafRef.current) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = null;
    }
    if (activeBufferSourceRef.current) {
      try {
        activeBufferSourceRef.current.onended = null;
        activeBufferSourceRef.current.stop();
        activeBufferSourceRef.current.disconnect();
      } catch {
        // already stopped
      }
      activeBufferSourceRef.current = null;
    }
    setAudioAmplitude(0);
    setAudioBands(ZERO_BANDS);
  }, []);

  const driveBandsFromAnalyser = useCallback(
    (analyser: AnalyserNode, isActive: () => boolean) => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastUpdate = 0;

      const tick = (ts: number) => {
        if (!isActive()) return;
        if (ts - lastUpdate >= 33) {
          lastUpdate = ts;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          const bands: number[] = [];
          for (let i = 0; i < 24; i++) {
            const val = (data[i] ?? 0) / 255;
            bands.push(val);
            sum += val;
          }
          const avg = sum / 24;
          setAudioAmplitude(Math.min(1, avg * 1.8));
          setAudioBands(bands);
        }
        playbackRafRef.current = requestAnimationFrame(tick);
      };
      playbackRafRef.current = requestAnimationFrame(tick);
    },
    []
  );

  const stopMicMeter = useCallback(() => {
    if (analyserRafRef.current) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const startMicMeter = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const update = () => {
        if (!standbyRef.current && !mediaRecorderRef.current) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        setMicLevel(Math.min(1, avg * 2.2));
        analyserRafRef.current = requestAnimationFrame(update);
      };
      update();
    } catch {
      // Mic meter optional
    }
  }, []);

  const setAwakeWindow = useCallback(
    (mode: InteractionMode | null) => {
      awakeTargetRef.current = mode;
      setAwakeTarget(mode);
      if (awakeTimerRef.current) {
        window.clearTimeout(awakeTimerRef.current);
        awakeTimerRef.current = null;
      }
      if (mode) {
        triggerHaptic('wake');
        playSubtleChime(mode === 'jarvis' ? 520 : 660, mode === 'jarvis' ? 780 : 880);
        awakeTimerRef.current = window.setTimeout(() => {
          awakeTargetRef.current = null;
          setAwakeTarget(null);
        }, 9000);
      }
    },
    [playSubtleChime]
  );

  const startRecognitionInstance = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || !standbyRef.current || isSpeakingRef.current) return;

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }

      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onresult = (event) => {
        if (isSpeakingRef.current) return;
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript?.trim() ?? '';
          if (!transcript) continue;

          if (result.isFinal) {
            setInterimTranscript('');
            const now = Date.now();
            if (
              lastProcessedPhraseRef.current.text === transcript &&
              now - lastProcessedPhraseRef.current.time < 2500
            ) {
              continue;
            }
            lastProcessedPhraseRef.current = { text: transcript, time: now };

            if (awakeTargetRef.current) {
              const target = awakeTargetRef.current;
              setAwakeWindow(null);
              const parsed = parseWakePhrase(transcript);
              const cleanCmd = parsed.matched && parsed.commandText ? parsed.commandText : transcript;
              if (cleanCmd.length >= 2) {
                triggerHaptic('wake');
                onWakeCommandRef.current(cleanCmd, parsed.matched ? parsed.targetMode : target);
              }
              continue;
            }

            const parsed = parseWakePhrase(transcript);
            if (parsed.matched) {
              if (parsed.wakeOnly) {
                setAwakeWindow(parsed.targetMode);
                onAssistantActivatedRef.current?.(parsed.targetMode, 'wake_word');
              } else {
                triggerHaptic('wake');
                playSubtleChime(560, 840);
                onWakeCommandRef.current(parsed.commandText, parsed.targetMode);
              }
            }
          } else {
            interim += transcript + ' ';
            const quickParse = parseWakePhrase(transcript);
            if (quickParse.matched && !awakeTargetRef.current) {
              setInterimTranscript(transcript);
            }
          }
        }
        if (interim.trim()) {
          setInterimTranscript(interim.trim());
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          standbyRef.current = false;
          setIsStandbyActive(false);
          stopMicMeter();
          onVoiceError(
            'Permissão do microfone negada para escuta contínua. Você ainda pode usar o comando por texto ou gravação manual.'
          );
        }
      };

      recognition.onend = () => {
        if (standbyRef.current && !isSpeakingRef.current) {
          window.setTimeout(() => {
            if (standbyRef.current && !isSpeakingRef.current) {
              startRecognitionInstance();
            }
          }, 300);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // ignore
    }
  }, [onVoiceError, playSubtleChime, setAwakeWindow, stopMicMeter]);

  const toggleStandby = useCallback(async () => {
    unlockAudio();
    triggerHaptic('toggle');
    if (standbyRef.current) {
      standbyRef.current = false;
      setIsStandbyActive(false);
      setInterimTranscript('');
      setAwakeWindow(null);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
      stopMicMeter();
      return;
    }

    if (!getSpeechRecognitionCtor()) {
      onVoiceError(
        'Seu navegador não expõe reconhecimento contínuo nativo. Use o botão de microfone (Gravar Voz) para transcrição direta via Gemini.'
      );
      return;
    }

    standbyRef.current = true;
    setIsStandbyActive(true);
    await startMicMeter();
    startRecognitionInstance();
    onAssistantActivatedRef.current?.('auto', 'standby_on');
  }, [onVoiceError, setAwakeWindow, startMicMeter, startRecognitionInstance, stopMicMeter, unlockAudio]);

  const stopAudio = useCallback(() => {
    playbackSessionRef.current += 1;
    stopPlaybackAnalyser();
    if (audioElRef.current) {
      audioElRef.current.onended = null;
      audioElRef.current.onerror = null;
      audioElRef.current.pause();
      audioElRef.current.src = '';
      audioElRef.current = null;
    }
    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setIsSynthesizingAudio(false);
    setSpeakingSpeaker(null);
    setSpeakingText('');
    if (standbyRef.current) {
      startRecognitionInstance();
    }
  }, [startRecognitionInstance, stopPlaybackAnalyser]);

  const speakSingleTurnWithBrowserFallback = useCallback(
    (turn: AssistantTurn, sessionId: number): Promise<void> =>
      new Promise((resolve) => {
        if (sessionId !== playbackSessionRef.current) {
          resolve();
          return;
        }
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          resolve();
          return;
        }
        const voices = window.speechSynthesis.getVoices();
        const ptVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('pt'));

        const femaleHints =
          /(female|mulher|feminina|maria|luciana|francisca|helena|raquel|vit[oó]ria|joana|let[ií]cia|camila|fernanda|google portugu[eê]s)/i;
        const maleHints = /(male|homem|daniel|ant[oô]nio|ricardo|felipe|tiago|duarte|cristiano)/i;

        const femaleVoice =
          ptVoices.find((v) => femaleHints.test(v.name) && !maleHints.test(v.name)) ??
          ptVoices.find((v) => !maleHints.test(v.name)) ??
          ptVoices[0];

        const maleVoice =
          ptVoices.find((v) => maleHints.test(v.name)) ??
          ptVoices.find((v) => v !== femaleVoice) ??
          ptVoices[0];

        const utter = new SpeechSynthesisUtterance(turn.ttsScript || turn.text);
        utter.lang = 'pt-BR';
        if (turn.speaker === 'jarvis') {
          if (maleVoice) utter.voice = maleVoice;
          utter.pitch = 0.84;
          utter.rate = 0.96;
        } else if (turn.speaker === 'ultron') {
          if (maleVoice) utter.voice = maleVoice;
          utter.pitch = 0.62;
          utter.rate = 0.88;
        } else {
          if (femaleVoice) utter.voice = femaleVoice;
          utter.pitch = femaleVoice && femaleHints.test(femaleVoice.name) ? 1.12 : 1.32;
          utter.rate = 1.04;
        }

        // Visual pulse while browser speech synthesis is active
        let phase = 0;
        let stopped = false;
        const tick = () => {
          if (stopped || sessionId !== playbackSessionRef.current) return;
          phase += 0.25;
          const bands = Array.from({ length: 24 }, (_, idx) =>
            Math.max(0.15, Math.min(1, 0.45 + 0.4 * Math.sin(phase + idx * 0.5)))
          );
          setAudioAmplitude(0.55);
          setAudioBands(bands);
          playbackRafRef.current = requestAnimationFrame(tick);
        };
        playbackRafRef.current = requestAnimationFrame(tick);

        const cleanup = () => {
          stopped = true;
          stopPlaybackAnalyser();
          resolve();
        };

        utter.onend = cleanup;
        utter.onerror = cleanup;
        window.speechSynthesis.speak(utter);
      }),
    [stopPlaybackAnalyser]
  );

  const playBlobUrlWithHtmlAudio = useCallback(
    (url: string, _speaker: AssistantId, sessionId: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (sessionId !== playbackSessionRef.current) {
          URL.revokeObjectURL(url);
          resolve();
          return;
        }
        const audio = new Audio(url);
        audioElRef.current = audio;
        currentObjectUrlRef.current = url;
        // Server WAV already contains exact reference pitch & formant mastering
        audio.playbackRate = 1.0;

        let phase = 0;
        const fallbackTick = () => {
          if (audioElRef.current !== audio || sessionId !== playbackSessionRef.current) return;
          phase += 0.25;
          const bands = Array.from({ length: 24 }, (_, idx) =>
            Math.max(0.18, Math.min(1, 0.45 + 0.4 * Math.sin(phase + idx * 0.5)))
          );
          setAudioAmplitude(0.55);
          setAudioBands(bands);
          playbackRafRef.current = requestAnimationFrame(fallbackTick);
        };
        playbackRafRef.current = requestAnimationFrame(fallbackTick);

        audio.onended = () => {
          stopPlaybackAnalyser();
          URL.revokeObjectURL(url);
          if (currentObjectUrlRef.current === url) currentObjectUrlRef.current = null;
          if (audioElRef.current === audio) audioElRef.current = null;
          resolve();
        };

        audio.onerror = () => {
          stopPlaybackAnalyser();
          URL.revokeObjectURL(url);
          if (currentObjectUrlRef.current === url) currentObjectUrlRef.current = null;
          if (audioElRef.current === audio) audioElRef.current = null;
          reject(new Error('Erro na reprodução do arquivo de áudio.'));
        };

        audio.play().catch((err) => {
          stopPlaybackAnalyser();
          URL.revokeObjectURL(url);
          if (currentObjectUrlRef.current === url) currentObjectUrlRef.current = null;
          if (audioElRef.current === audio) audioElRef.current = null;
          reject(err);
        });
      });
    },
    [stopPlaybackAnalyser]
  );

  const playBase64Audio = useCallback(
    async (
      audioBase64: string,
      mimeType: string,
      speaker: AssistantId,
      sessionId: number
    ): Promise<void> => {
      if (sessionId !== playbackSessionRef.current) return;

      const ctx = ensureAudioContext();
      if (ctx) {
        try {
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          if (ctx.state === 'running') {
            const arrayBuffer = base64ToArrayBuffer(audioBase64);
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            if (sessionId !== playbackSessionRef.current) return;

            await new Promise<void>((resolve) => {
              stopPlaybackAnalyser();
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              // Server WAV from /api/assistant/tts is already reference-mastered (104.3 Hz Exclusive Jarvis / 90.2 Hz Exclusive Ultron)
              source.playbackRate.value = 1.0;
              activeBufferSourceRef.current = source;

              const analyser = ctx.createAnalyser();
              analyser.fftSize = 64;
              analyser.smoothingTimeConstant = 0.72;

              const compressor = ctx.createDynamicsCompressor();
              compressor.threshold.value = -14;
              compressor.knee.value = 12;
              compressor.ratio.value = 2.4;
              compressor.attack.value = 0.005;
              compressor.release.value = 0.16;

              if (speaker === 'ultron') {
                const subPolish = ctx.createBiquadFilter();
                subPolish.type = 'lowshelf';
                subPolish.frequency.value = 93;
                subPolish.gain.value = 1.4;

                const chestBody = ctx.createBiquadFilter();
                chestBody.type = 'peaking';
                chestBody.frequency.value = 185;
                chestBody.Q.value = 1.0;
                chestBody.gain.value = 0.8;

                const armorPresence = ctx.createBiquadFilter();
                armorPresence.type = 'peaking';
                armorPresence.frequency.value = 1800;
                armorPresence.Q.value = 1.4;
                armorPresence.gain.value = 1.2;

                source.connect(subPolish);
                subPolish.connect(chestBody);
                chestBody.connect(armorPresence);
                armorPresence.connect(compressor);
                compressor.connect(analyser);
              } else if (speaker === 'jarvis') {
                // Velvet close-mic baritone polish matching jarvis_fc632df0.m4a (215 Hz warmth + smooth 2.4 kHz contour)
                const velvetChest = ctx.createBiquadFilter();
                velvetChest.type = 'peaking';
                velvetChest.frequency.value = 215;
                velvetChest.Q.value = 0.9;
                velvetChest.gain.value = 1.2;

                const silkDip = ctx.createBiquadFilter();
                silkDip.type = 'peaking';
                silkDip.frequency.value = 2400;
                silkDip.Q.value = 1.1;
                silkDip.gain.value = -1.2;

                source.connect(velvetChest);
                velvetChest.connect(silkDip);
                silkDip.connect(compressor);
                compressor.connect(analyser);
              } else {
                source.connect(compressor);
                compressor.connect(analyser);
              }
              analyser.connect(ctx.destination);

              driveBandsFromAnalyser(
                analyser,
                () =>
                  activeBufferSourceRef.current === source &&
                  sessionId === playbackSessionRef.current
              );

              source.onended = () => {
                if (activeBufferSourceRef.current === source) {
                  activeBufferSourceRef.current = null;
                }
                stopPlaybackAnalyser();
                resolve();
              };

              source.start(0);
            });
            return;
          }
        } catch {
          // Fall through to HTMLAudioElement playback
        }
      }

      const url = base64ToBlobUrl(audioBase64, mimeType);
      await playBlobUrlWithHtmlAudio(url, speaker, sessionId);
    },
    [driveBandsFromAnalyser, ensureAudioContext, playBlobUrlWithHtmlAudio, stopPlaybackAnalyser]
  );

  const clientTtsCacheRef = useRef<Map<string, { audioBase64: string; mimeType: string }>>(
    new Map()
  );

  const clearTtsCache = useCallback(() => {
    clientTtsCacheRef.current.clear();
  }, []);

  const synthesizeSingleTurn = useCallback(
    async (
      turn: AssistantTurn,
      overrideVoices?: {
        jarvisVoice?: JarvisVoiceOption;
        fridayVoice?: FridayVoiceOption;
        ultronVoice?: UltronVoiceOption;
      }
    ) => {
      const activeJarvisVoice: JarvisVoiceOption = 'JarvisOriginal';
      const activeFridayVoice = overrideVoices?.fridayVoice ?? fridayVoiceRef.current;
      const activeUltronVoice: UltronVoiceOption = 'UltronOriginal';

      const spokenText = (turn.ttsScript || turn.text).trim();
      if (!spokenText) {
        return { turn, audioBase64: null as string | null, mimeType: 'audio/wav' };
      }

      const voiceKey =
        turn.speaker === 'jarvis'
          ? activeJarvisVoice
          : turn.speaker === 'sexta-feira'
          ? activeFridayVoice
          : activeUltronVoice;
      const cacheKey = `v5_exclusive_voices:${turn.speaker}:${voiceKey}:${spokenText}`;

      const cached = clientTtsCacheRef.current.get(cacheKey);
      if (cached) {
        return {
          turn,
          audioBase64: cached.audioBase64,
          mimeType: cached.mimeType,
        };
      }

      const res = await safeFetchJson<{ audioBase64?: string; mimeType?: string }>(
        '/api/assistant/tts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turns: [
              {
                speaker: turn.speaker,
                text: spokenText,
              },
            ],
            jarvisVoice: activeJarvisVoice,
            fridayVoice: activeFridayVoice,
            ultronVoice: activeUltronVoice,
          }),
        },
        1
      );

      if (!res.ok || !res.data?.audioBase64) {
        return {
          turn,
          audioBase64: null as string | null,
          mimeType: 'audio/wav',
        };
      }

      const payload = {
        audioBase64: res.data.audioBase64,
        mimeType: res.data.mimeType || 'audio/wav',
      };
      if (clientTtsCacheRef.current.size > 40) {
        const oldest = clientTtsCacheRef.current.keys().next().value;
        if (oldest) clientTtsCacheRef.current.delete(oldest);
      }
      clientTtsCacheRef.current.set(cacheKey, payload);

      return {
        turn,
        audioBase64: payload.audioBase64,
        mimeType: payload.mimeType,
      };
    },
    []
  );

  const playSynthesizedItem = useCallback(
    async (
      synthesized: { turn: AssistantTurn; audioBase64: string | null; mimeType: string },
      sessionId: number
    ) => {
      if (sessionId !== playbackSessionRef.current) return;
      setIsSynthesizingAudio(false);
      setSpeakingSpeaker(synthesized.turn.speaker);
      setSpeakingText(synthesized.turn.text);

      if (synthesized.audioBase64) {
        try {
          await playBase64Audio(
            synthesized.audioBase64,
            synthesized.mimeType,
            synthesized.turn.speaker,
            sessionId
          );
          return;
        } catch (playErr) {
          const name = (playErr as { name?: string })?.name;
          if (name === 'NotAllowedError') {
            setAudioBlockedByBrowser(true);
            throw playErr;
          }
        }
      }
      await speakSingleTurnWithBrowserFallback(synthesized.turn, sessionId);
    },
    [playBase64Audio, speakSingleTurnWithBrowserFallback]
  );

  const beginAudioStreamSession = useCallback(() => {
    stopAudio();
    const sessionId = ++playbackSessionRef.current;
    streamSessionIdRef.current = sessionId;
    streamHasEnqueuedRef.current = false;
    streamChainRef.current = Promise.resolve();
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setIsSynthesizingAudio(true);
    setAudioBlockedByBrowser(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, [stopAudio]);

  const enqueueStreamingTurn = useCallback(
    (turn: AssistantTurn) => {
      const sessionId = streamSessionIdRef.current;
      if (sessionId !== playbackSessionRef.current) return;

      if (!streamHasEnqueuedRef.current) {
        setSpeakingSpeaker(turn.speaker);
        setSpeakingText(turn.text);
      }
      streamHasEnqueuedRef.current = true;

      // Kick off TTS synthesis immediately in parallel while earlier turns play
      const synthPromise = synthesizeSingleTurn(turn);

      streamChainRef.current = streamChainRef.current.then(async () => {
        if (sessionId !== playbackSessionRef.current) return;
        setIsSynthesizingAudio(true);
        setSpeakingSpeaker(turn.speaker);
        setSpeakingText(turn.text);
        try {
          const synthesized = await synthPromise;
          if (sessionId !== playbackSessionRef.current) return;
          await playSynthesizedItem(synthesized, sessionId);
        } catch (err) {
          const name = (err as { name?: string })?.name;
          if (name === 'NotAllowedError') {
            playbackSessionRef.current += 1;
            return;
          }
          await speakSingleTurnWithBrowserFallback(turn, sessionId);
        }
      });
    },
    [playSynthesizedItem, speakSingleTurnWithBrowserFallback, synthesizeSingleTurn]
  );

  const finishAudioStreamSession = useCallback(
    (hadResponses: boolean) => {
      const sessionId = streamSessionIdRef.current;
      const cleanup = () => {
        if (sessionId === playbackSessionRef.current) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setIsSynthesizingAudio(false);
          setSpeakingSpeaker(null);
          setSpeakingText('');
          stopPlaybackAnalyser();
          if (standbyRef.current) {
            startRecognitionInstance();
          }
        }
      };

      if (!hadResponses || !streamHasEnqueuedRef.current) {
        cleanup();
        return;
      }

      streamChainRef.current = streamChainRef.current.finally(cleanup);
    },
    [startRecognitionInstance, stopPlaybackAnalyser]
  );

  const playTurnsAudio = useCallback(
    async (
      turns: AssistantTurn[],
      overrideVoices?: {
        jarvisVoice?: JarvisVoiceOption;
        fridayVoice?: FridayVoiceOption;
        ultronVoice?: UltronVoiceOption;
      }
    ) => {
      if (!turns || turns.length === 0) return;

      stopAudio();
      const sessionId = ++playbackSessionRef.current;
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setIsSynthesizingAudio(true);
      setAudioBlockedByBrowser(false);
      setSpeakingSpeaker(turns[0].speaker);
      setSpeakingText(turns[0].text);

      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }

      // Launch all TTS synthesis tasks in parallel immediately so turn[0] can start playing
      // while turn[1] and turn[2] finish synthesizing in the background
      const synthesisPromises = turns.map((turn) => synthesizeSingleTurn(turn, overrideVoices));

      try {
        for (let i = 0; i < synthesisPromises.length; i++) {
          if (sessionId !== playbackSessionRef.current) return;
          if (i === 0) {
            setIsSynthesizingAudio(true);
          }
          const synthesized = await synthesisPromises[i];
          if (sessionId !== playbackSessionRef.current) return;

          try {
            await playSynthesizedItem(synthesized, sessionId);
          } catch (playErr) {
            const name = (playErr as { name?: string })?.name;
            if (name === 'NotAllowedError') {
              break;
            }
            await speakSingleTurnWithBrowserFallback(synthesized.turn, sessionId);
          }
        }
      } catch {
        setIsSynthesizingAudio(false);
        for (const turn of turns) {
          if (sessionId !== playbackSessionRef.current) break;
          setSpeakingSpeaker(turn.speaker);
          setSpeakingText(turn.text);
          await speakSingleTurnWithBrowserFallback(turn, sessionId);
        }
      } finally {
        if (sessionId === playbackSessionRef.current) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setIsSynthesizingAudio(false);
          setSpeakingSpeaker(null);
          setSpeakingText('');
          stopPlaybackAnalyser();
          if (standbyRef.current) {
            startRecognitionInstance();
          }
        }
      }
    },
    [
      playSynthesizedItem,
      speakSingleTurnWithBrowserFallback,
      startRecognitionInstance,
      stopAudio,
      stopPlaybackAnalyser,
      synthesizeSingleTurn,
    ]
  );

  const startRecordingClip = useCallback(async () => {
    unlockAudio();
    triggerHaptic('tap');
    try {
      stopAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      setIsRecordingClip(true);

      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        setIsRecordingClip(false);

        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        if (blob.size < 500) {
          if (standbyRef.current) startRecognitionInstance();
          return;
        }

        setIsTranscribingClip(true);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = String(reader.result || '');
              resolve(result.split(',')[1] || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const res = await safeFetchJson<{ text?: string }>(
            '/api/assistant/transcribe',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64, mimeType }),
            }
          );
          if (!res.ok) {
            throw new Error(res.errorMessage || 'Não foi possível transcrever o áudio.');
          }
          if (res.data?.text?.trim()) {
            triggerHaptic('success');
            onTranscribedClip(res.data.text.trim());
          }
        } catch (err) {
          onVoiceError(err instanceof Error ? err.message : 'Erro ao processar gravação de voz.');
        } finally {
          setIsTranscribingClip(false);
          if (standbyRef.current) startRecognitionInstance();
        }
      };

      recorder.start();
    } catch {
      setIsRecordingClip(false);
      onVoiceError('Não foi possível acessar o microfone para gravação.');
    }
  }, [onTranscribedClip, onVoiceError, startRecognitionInstance, stopAudio, unlockAudio]);

  const stopRecordingClip = useCallback(() => {
    triggerHaptic('tap');
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  useEffect(() => {
    return () => {
      standbyRef.current = false;
      playbackSessionRef.current += 1;
      if (awakeTimerRef.current) window.clearTimeout(awakeTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (audioElRef.current) {
        audioElRef.current.pause();
      }
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
      }
      if (sharedAudioCtxRef.current && sharedAudioCtxRef.current.state !== 'closed') {
        sharedAudioCtxRef.current.close().catch(() => undefined);
      }
      stopPlaybackAnalyser();
      stopMicMeter();
    };
  }, [stopMicMeter, stopPlaybackAnalyser]);

  const playReferenceClip = useCallback(
    async (url: string, speaker: AssistantId, labelText: string) => {
      unlockAudio();
      stopAudio();
      const sessionId = ++playbackSessionRef.current;
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setIsSynthesizingAudio(false);
      setAudioBlockedByBrowser(false);
      setSpeakingSpeaker(speaker);
      setSpeakingText(labelText);

      try {
        const ctx = ensureAudioContext();
        const res = await fetch(url);
        if (!res.ok) throw new Error('Falha ao carregar áudio de referência.');
        const arrayBuf = await res.arrayBuffer();
        if (sessionId !== playbackSessionRef.current) return;

        if (ctx) {
          if (ctx.state === 'suspended') await ctx.resume();
          const audioBuffer = await ctx.decodeAudioData(arrayBuf);
          if (sessionId !== playbackSessionRef.current) return;

          await new Promise<void>((resolve) => {
            stopPlaybackAnalyser();
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            activeBufferSourceRef.current = source;

            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.72;
            source.connect(analyser);
            analyser.connect(ctx.destination);

            driveBandsFromAnalyser(
              analyser,
              () =>
                activeBufferSourceRef.current === source &&
                sessionId === playbackSessionRef.current
            );

            source.onended = () => {
              if (activeBufferSourceRef.current === source) {
                activeBufferSourceRef.current = null;
              }
              stopPlaybackAnalyser();
              resolve();
            };

            const startOffsetSec =
              url.includes('jarvis_fc632df0') && audioBuffer.duration > 16
                ? 13.25
                : url.includes('ultron_f012fd80') && audioBuffer.duration > 3
                ? 0.45
                : 0;
            source.start(0, startOffsetSec);
          });
        }
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === 'NotAllowedError') {
          setAudioBlockedByBrowser(true);
        }
      } finally {
        if (sessionId === playbackSessionRef.current) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setSpeakingSpeaker(null);
          setSpeakingText('');
          stopPlaybackAnalyser();
          if (standbyRef.current) startRecognitionInstance();
        }
      }
    },
    [
      driveBandsFromAnalyser,
      ensureAudioContext,
      startRecognitionInstance,
      stopAudio,
      stopPlaybackAnalyser,
      unlockAudio,
    ]
  );

  const playDirectAudioBase64 = useCallback(
    async (
      audioBase64: string,
      mimeType: string,
      speaker: AssistantId,
      labelText: string
    ) => {
      unlockAudio();
      stopAudio();
      const sessionId = ++playbackSessionRef.current;
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setIsSynthesizingAudio(false);
      setAudioBlockedByBrowser(false);
      setSpeakingSpeaker(speaker);
      setSpeakingText(labelText);

      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }

      try {
        await playBase64Audio(audioBase64, mimeType, speaker, sessionId);
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === 'NotAllowedError') {
          setAudioBlockedByBrowser(true);
        }
      } finally {
        if (sessionId === playbackSessionRef.current) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setSpeakingSpeaker(null);
          setSpeakingText('');
          stopPlaybackAnalyser();
          if (standbyRef.current) startRecognitionInstance();
        }
      }
    },
    [playBase64Audio, startRecognitionInstance, stopAudio, stopPlaybackAnalyser, unlockAudio]
  );

  return {
    isStandbyActive,
    speechSupported,
    interimTranscript,
    awakeTarget,
    micLevel,
    isSpeaking,
    speakingSpeaker,
    speakingText,
    audioAmplitude,
    audioBands,
    isSynthesizingAudio,
    isRecordingClip,
    isTranscribingClip,
    audioBlockedByBrowser,
    jarvisVoice,
    fridayVoice,
    ultronVoice,
    setJarvisVoice,
    setFridayVoice,
    setUltronVoice,
    unlockAudio,
    toggleStandby,
    playTurnsAudio,
    playReferenceClip,
    playDirectAudioBase64,
    clearTtsCache,
    beginAudioStreamSession,
    enqueueStreamingTurn,
    finishAudioStreamSession,
    stopAudio,
    startRecordingClip,
    stopRecordingClip,
  };
}
