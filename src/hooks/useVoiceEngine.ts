import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantId, AssistantTurn, InteractionMode } from '../types/assistant';

export type JarvisVoiceOption = 'Orus' | 'Charon' | 'Iapetus' | 'Fenrir';
export type FridayVoiceOption = 'Kore' | 'Zephyr';
export type UltronVoiceOption = 'Algenib' | 'Charon' | 'Umbriel' | 'Fenrir';

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

function playSubtleChime(freqStart: number, freqEnd: number) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.19);
    setTimeout(() => {
      ctx.close().catch(() => undefined);
    }, 300);
  } catch {
    // Ignore audio context restrictions
  }
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
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
}

export function useVoiceEngine({
  onWakeCommand,
  onTranscribedClip,
  onVoiceError,
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
    if (typeof window === 'undefined') return 'Orus';
    const saved = window.localStorage.getItem('stark_jarvis_voice');
    return saved === 'Charon' || saved === 'Iapetus' || saved === 'Fenrir' || saved === 'Orus'
      ? saved
      : 'Orus';
  });

  const [fridayVoice, setFridayVoiceState] = useState<FridayVoiceOption>(() => {
    if (typeof window === 'undefined') return 'Kore';
    const saved = window.localStorage.getItem('stark_friday_voice');
    return saved === 'Zephyr' || saved === 'Kore' ? saved : 'Kore';
  });

  const [ultronVoice, setUltronVoiceState] = useState<UltronVoiceOption>(() => {
    if (typeof window === 'undefined') return 'Algenib';
    const saved = window.localStorage.getItem('stark_ultron_voice');
    return saved === 'Algenib' || saved === 'Charon' || saved === 'Umbriel' || saved === 'Fenrir'
      ? saved
      : 'Algenib';
  });

  const setJarvisVoice = useCallback((v: JarvisVoiceOption) => {
    setJarvisVoiceState(v);
    try {
      window.localStorage.setItem('stark_jarvis_voice', v);
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

  const setUltronVoice = useCallback((v: UltronVoiceOption) => {
    setUltronVoiceState(v);
    try {
      window.localStorage.setItem('stark_ultron_voice', v);
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
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const lastProcessedPhraseRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const audioUnlockedRef = useRef(false);

  const onWakeCommandRef = useRef(onWakeCommand);
  onWakeCommandRef.current = onWakeCommand;

  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current || typeof window === 'undefined') return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => undefined);
        }
        const buffer = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
        setTimeout(() => {
          ctx.close().catch(() => undefined);
        }, 200);
      }
      audioUnlockedRef.current = true;
      setAudioBlockedByBrowser(false);
    } catch {
      // ignore
    }
  }, []);

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
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close().catch(() => undefined);
      playbackCtxRef.current = null;
    }
    setAudioAmplitude(0);
    setAudioBands(ZERO_BANDS);
  }, []);

  const startPlaybackAnalyser = useCallback(
    (audio: HTMLAudioElement, speaker: AssistantId) => {
      stopPlaybackAnalyser();
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        playbackCtxRef.current = ctx;
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.72;

        if (speaker === 'ultron') {
          // Subtle Age-of-Ultron deep metallic baritone vocal resonance
          audio.playbackRate = 0.94;
          const lowShelf = ctx.createBiquadFilter();
          lowShelf.type = 'lowshelf';
          lowShelf.frequency.value = 140;
          lowShelf.gain.value = 4.2;

          const metallicPresence = ctx.createBiquadFilter();
          metallicPresence.type = 'peaking';
          metallicPresence.frequency.value = 2400;
          metallicPresence.Q.value = 2.2;
          metallicPresence.gain.value = 3.2;

          source.connect(lowShelf);
          lowShelf.connect(metallicPresence);
          metallicPresence.connect(analyser);
        } else {
          source.connect(analyser);
        }
        analyser.connect(ctx.destination);

        const data = new Uint8Array(analyser.frequencyBinCount);
        let lastUpdate = 0;

        const tick = (ts: number) => {
          if (!audioElRef.current) return;
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
      } catch {
        let phase = 0;
        const fallbackTick = () => {
          if (!audioElRef.current) return;
          phase += 0.25;
          const bands = Array.from({ length: 24 }, (_, idx) =>
            Math.max(0.15, Math.min(1, 0.45 + 0.4 * Math.sin(phase + idx * 0.5)))
          );
          setAudioAmplitude(0.55);
          setAudioBands(bands);
          playbackRafRef.current = requestAnimationFrame(fallbackTick);
        };
        playbackRafRef.current = requestAnimationFrame(fallbackTick);
      }
    },
    [stopPlaybackAnalyser]
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

  const setAwakeWindow = useCallback((mode: InteractionMode | null) => {
    awakeTargetRef.current = mode;
    setAwakeTarget(mode);
    if (awakeTimerRef.current) {
      window.clearTimeout(awakeTimerRef.current);
      awakeTimerRef.current = null;
    }
    if (mode) {
      playSubtleChime(mode === 'jarvis' ? 520 : 660, mode === 'jarvis' ? 780 : 880);
      awakeTimerRef.current = window.setTimeout(() => {
        awakeTargetRef.current = null;
        setAwakeTarget(null);
      }, 9000);
    }
  }, []);

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
                onWakeCommandRef.current(cleanCmd, parsed.matched ? parsed.targetMode : target);
              }
              continue;
            }

            const parsed = parseWakePhrase(transcript);
            if (parsed.matched) {
              if (parsed.wakeOnly) {
                setAwakeWindow(parsed.targetMode);
              } else {
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
  }, [onVoiceError, setAwakeWindow, stopMicMeter]);

  const toggleStandby = useCallback(async () => {
    unlockAudio();
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
    (turn: AssistantTurn): Promise<void> =>
      new Promise((resolve) => {
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
          utter.pitch = 0.88;
          utter.rate = 0.98;
        } else if (turn.speaker === 'ultron') {
          if (maleVoice) utter.voice = maleVoice;
          utter.pitch = 0.65;
          utter.rate = 0.9;
        } else {
          if (femaleVoice) utter.voice = femaleVoice;
          utter.pitch = femaleVoice && femaleHints.test(femaleVoice.name) ? 1.12 : 1.32;
          utter.rate = 1.04;
        }
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      }),
    []
  );

  const playBlobUrl = useCallback(
    (url: string, speaker: AssistantId): Promise<void> => {
      return new Promise((resolve, reject) => {
        const audio = new Audio(url);
        audioElRef.current = audio;
        currentObjectUrlRef.current = url;

        startPlaybackAnalyser(audio, speaker);

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
    [startPlaybackAnalyser, stopPlaybackAnalyser]
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

      try {
        const audioPayloads = await Promise.all(
          turns.map(async (turn) => {
            const res = await fetch('/api/assistant/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                turns: [
                  {
                    speaker: turn.speaker,
                    text: turn.ttsScript || turn.text,
                  },
                ],
                jarvisVoice: overrideVoices?.jarvisVoice ?? jarvisVoice,
                fridayVoice: overrideVoices?.fridayVoice ?? fridayVoice,
                ultronVoice: overrideVoices?.ultronVoice ?? ultronVoice,
              }),
            });
            if (!res.ok) {
              throw new Error('Falha na síntese vocal Gemini');
            }
            const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
            if (!data.audioBase64) {
              throw new Error('Áudio vazio');
            }
            return {
              turn,
              url: base64ToBlobUrl(data.audioBase64, data.mimeType || 'audio/wav'),
            };
          })
        );

        if (sessionId !== playbackSessionRef.current) {
          audioPayloads.forEach((p) => URL.revokeObjectURL(p.url));
          return;
        }

        setIsSynthesizingAudio(false);

        for (let i = 0; i < audioPayloads.length; i++) {
          if (sessionId !== playbackSessionRef.current) {
            for (let j = i; j < audioPayloads.length; j++) {
              URL.revokeObjectURL(audioPayloads[j].url);
            }
            return;
          }
          const { turn, url } = audioPayloads[i];
          setSpeakingSpeaker(turn.speaker);
          setSpeakingText(turn.text);
          try {
            await playBlobUrl(url, turn.speaker);
          } catch (playErr) {
            const name = (playErr as { name?: string })?.name;
            if (name === 'NotAllowedError') {
              setAudioBlockedByBrowser(true);
              for (let j = i + 1; j < audioPayloads.length; j++) {
                URL.revokeObjectURL(audioPayloads[j].url);
              }
              break;
            }
            await speakSingleTurnWithBrowserFallback(turn);
          }
        }
      } catch {
        setIsSynthesizingAudio(false);
        for (const turn of turns) {
          if (sessionId !== playbackSessionRef.current) break;
          setSpeakingSpeaker(turn.speaker);
          setSpeakingText(turn.text);
          await speakSingleTurnWithBrowserFallback(turn);
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
      fridayVoice,
      jarvisVoice,
      playBlobUrl,
      speakSingleTurnWithBrowserFallback,
      startRecognitionInstance,
      stopAudio,
      stopPlaybackAnalyser,
      ultronVoice,
    ]
  );

  const startRecordingClip = useCallback(async () => {
    unlockAudio();
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

          const res = await fetch('/api/assistant/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType }),
          });
          const data = (await res.json()) as { text?: string; error?: string };
          if (!res.ok) throw new Error(data.error || 'Erro ao transcrever');
          if (data.text?.trim()) {
            onTranscribedClip(data.text.trim());
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
      stopPlaybackAnalyser();
      stopMicMeter();
    };
  }, [stopMicMeter, stopPlaybackAnalyser]);

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
    stopAudio,
    startRecordingClip,
    stopRecordingClip,
  };
}
