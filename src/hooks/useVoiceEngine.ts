import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantId, AssistantTurn, InteractionMode } from '../types/assistant';
import { safeFetchJson } from '../utils/apiClient';
import { detectAssistantMentions } from '../utils/assistantRouter';
import {
  AdaptiveAudioRingBuffer,
  splitTurnIntoAudioChunks,
  type AudioChunkDescriptor,
  type AudioRingBufferStats,
} from '../utils/audioRingBuffer';
import { triggerHaptic } from '../utils/haptics';

export type JarvisVoiceOption =
  | 'JarvisOriginal'
  | 'Charon'
  | 'Orus'
  | 'Enceladus'
  | 'Puck';
export type FridayVoiceOption = 'Kore' | 'Zephyr';
export type UltronVoiceOption =
  | 'UltronOriginal'
  | 'Fenrir'
  | 'Algenib'
  | 'Charon'
  | 'Orus';

export interface AssistantVoiceTuning {
  /** Pitch offset in semitones (-6.0 to +6.0, 0 = default) */
  pitchSemitones: number;
  /** Playback speed multiplier (0.75 to 1.35, 1.0 = default) */
  speed: number;
  /** Modulation intensity percentage (0 to 100) */
  modulation: number;
}

export type VoiceTuningMap = Record<AssistantId, AssistantVoiceTuning>;

export const DEFAULT_VOICE_TUNING: VoiceTuningMap = {
  jarvis: { pitchSemitones: 0, speed: 1.0, modulation: 15 },
  'sexta-feira': { pitchSemitones: 0, speed: 1.0, modulation: 10 },
  ultron: { pitchSemitones: 0, speed: 1.0, modulation: 45 },
};

function clampVoiceTuning(input?: Partial<AssistantVoiceTuning>, fallback?: AssistantVoiceTuning): AssistantVoiceTuning {
  const base = fallback ?? { pitchSemitones: 0, speed: 1.0, modulation: 0 };
  const pitch = Number.isFinite(input?.pitchSemitones) ? Number(input?.pitchSemitones) : base.pitchSemitones;
  const speed = Number.isFinite(input?.speed) ? Number(input?.speed) : base.speed;
  const modulation = Number.isFinite(input?.modulation) ? Number(input?.modulation) : base.modulation;
  return {
    pitchSemitones: Math.round(Math.max(-6, Math.min(6, pitch)) * 2) / 2,
    speed: Math.round(Math.max(0.75, Math.min(1.35, speed)) * 20) / 20,
    modulation: Math.round(Math.max(0, Math.min(100, modulation))),
  };
}

export const JARVIS_VOICE_OPTIONS: Array<{
  value: JarvisVoiceOption;
  shortLabel: string;
  label: string;
  spec: string;
  description: string;
}> = [
  {
    value: 'JarvisOriginal',
    shortLabel: 'JarvisOriginal (104.3 Hz · Padrão)',
    label: 'JarvisOriginal (Matriz Exclusiva · 104.3 Hz — Padrão)',
    spec: '104.3 Hz F0 · Barítono Aveludado Close-Mic (jarvis_fc632df0.m4a)',
    description:
      'Assinatura vocal original calibrada de J.A.R.V.I.S.: F0 em 104.3 Hz, corpo aveludado em 180–250 Hz e dicção britânica contemplativa.',
  },
  {
    value: 'Charon',
    shortLabel: 'Charon (Barítono Natural)',
    label: 'Charon (Barítono Clássico · Estúdio Natural)',
    spec: 'Timbre Natural · Barítono Equilibrado & Elegante',
    description:
      'Voz masculina barítono natural sem deslocamento de pitch, com clareza analítica de estúdio e presença equilibrada.',
  },
  {
    value: 'Orus',
    shortLabel: 'Orus (Executivo Firme)',
    label: 'Orus (Executivo · Firme & Direto)',
    spec: 'Timbre Firme · Comando Estratégico & Precisão',
    description:
      'Voz masculina assertiva, nítida e executiva para respostas diretas, auditoria técnica e decisões rápidas.',
  },
  {
    value: 'Enceladus',
    shortLabel: 'Enceladus (Calmo & Suave)',
    label: 'Enceladus (Sussurrado · Calmo & Contemplativo)',
    spec: 'Timbre Aveludado · Close-Mic Sereno',
    description:
      'Voz masculina calma e íntima com cadência tranquila e conforto auditivo prolongado.',
  },
  {
    value: 'Puck',
    shortLabel: 'Puck (Ágil & Moderno)',
    label: 'Puck (Contemporâneo · Ágil & Expressivo)',
    spec: 'Timbre Dinâmico · Ritmo Rápido & Lúcido',
    description:
      'Voz masculina mais leve, ágil e expressiva para interações rápidas no console.',
  },
];

export const ULTRON_VOICE_OPTIONS: Array<{
  value: UltronVoiceOption;
  shortLabel: string;
  label: string;
  spec: string;
  description: string;
}> = [
  {
    value: 'UltronOriginal',
    shortLabel: 'UltronOriginal (90.2 Hz + Reverb)',
    label: 'UltronOriginal (Matriz Exclusiva · 90.2 Hz + Reverb — Padrão)',
    spec: '90.2 Hz F0 · Baixo-Barítono Cibernético + Câmara Metálica',
    description:
      'Assinatura vocal original de ULTRON: F0 em 90.2 Hz, divisor sub-harmônico de oitava, ressonador metálico e reverb de câmara.',
  },
  {
    value: 'Fenrir',
    shortLabel: 'Fenrir (Grave Imponente + Reverb)',
    label: 'Fenrir (Grave Natural Imponente + Reverb Metálico)',
    spec: 'Grave Natural · Autoridade Profunda + Reverb de Câmara',
    description:
      'Timbre grave natural de Fenrir preservado sem distorção pesada, finalizado com reverb metálico sutil de ULTRON.',
  },
  {
    value: 'Algenib',
    shortLabel: 'Algenib (Áspero & Sombrio + Reverb)',
    label: 'Algenib (Áspero & Sombrio + Reverb Metálico)',
    spec: 'Timbre Rasgado · Presença Sombria + Câmara Metálica',
    description:
      'Voz masculina áspera e intimidadora com textura grave marcante e reverberação metálica sutil.',
  },
  {
    value: 'Charon',
    shortLabel: 'Charon (Frio & Calculista + Reverb)',
    label: 'Charon (Barítono Frio & Calculista + Reverb)',
    spec: 'Barítono Frio · Precisão Sintética + Reverb Sutil',
    description:
      'Voz barítono ressonante em cadência fria, calculista e sintética com ambiência metálica.',
  },
  {
    value: 'Orus',
    shortLabel: 'Orus (Autoritário & Cortante + Reverb)',
    label: 'Orus (Autoritário & Cortante + Reverb)',
    spec: 'Comando Austero · Clareza Cortante + Reverb Sutil',
    description:
      'Timbre firme, cortante e dominante com dicção implacável e reverberação espacial.',
  },
];

const VALID_JARVIS_VOICE_SET = new Set<JarvisVoiceOption>(
  JARVIS_VOICE_OPTIONS.map((o) => o.value)
);
const VALID_ULTRON_VOICE_SET = new Set<UltronVoiceOption>(
  ULTRON_VOICE_OPTIONS.map((o) => o.value)
);

interface SynthesizedChunkPayload {
  turn: AssistantTurn;
  chunk: AudioChunkDescriptor;
  audioBase64: string | null;
  mimeType: string;
  byteSize: number;
  fetchLatencyMs: number;
  fromCache: boolean;
}

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
  maxAlternatives?: number;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export interface AudioTelemetryBuffer {
  amplitude: number;
  bands: Float32Array;
  active: boolean;
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

export type LabAmbienceLevel = 'sutil' | 'equilibrado' | 'imersivo';

export interface StartupDefaultVoices {
  jarvis: JarvisVoiceOption;
  'sexta-feira': FridayVoiceOption;
  ultron: UltronVoiceOption;
}

export const FACTORY_DEFAULT_VOICES: StartupDefaultVoices = {
  jarvis: 'JarvisOriginal',
  'sexta-feira': 'Kore',
  ultron: 'UltronOriginal',
};

const STARTUP_DEFAULT_VOICES_STORAGE_KEY = 'stark_startup_default_voices_v1';
const LAB_AMBIENCE_ENABLED_STORAGE_KEY = 'stark_lab_ambience_enabled_v1';
const LAB_AMBIENCE_LEVEL_STORAGE_KEY = 'stark_lab_ambience_level_v1';

function readStoredStartupDefaultVoices(): {
  voices: StartupDefaultVoices;
  hasCustom: boolean;
} {
  if (typeof window === 'undefined') {
    return { voices: { ...FACTORY_DEFAULT_VOICES }, hasCustom: false };
  }
  try {
    const raw = window.localStorage.getItem(STARTUP_DEFAULT_VOICES_STORAGE_KEY);
    if (!raw) {
      return { voices: { ...FACTORY_DEFAULT_VOICES }, hasCustom: false };
    }
    const parsed = JSON.parse(raw) as Partial<StartupDefaultVoices>;
    const jarvis: JarvisVoiceOption =
      parsed.jarvis && VALID_JARVIS_VOICE_SET.has(parsed.jarvis)
        ? parsed.jarvis
        : FACTORY_DEFAULT_VOICES.jarvis;
    const friday: FridayVoiceOption =
      parsed['sexta-feira'] === 'Zephyr' || parsed['sexta-feira'] === 'Kore'
        ? parsed['sexta-feira']
        : FACTORY_DEFAULT_VOICES['sexta-feira'];
    const ultron: UltronVoiceOption =
      parsed.ultron && VALID_ULTRON_VOICE_SET.has(parsed.ultron)
        ? parsed.ultron
        : FACTORY_DEFAULT_VOICES.ultron;
    return {
      voices: { jarvis, 'sexta-feira': friday, ultron },
      hasCustom: true,
    };
  } catch {
    return { voices: { ...FACTORY_DEFAULT_VOICES }, hasCustom: false };
  }
}

/**
 * Builds a crisp stereo "Ambiente de Laboratório" room impulse response (~0.92s)
 * with glass/titanium early reflections and smooth airy decay so every assistant
 * acquires subtle command-lab acoustics without losing vocal intelligibility.
 */
function createLabAmbienceImpulseResponse(ctx: AudioContext): AudioBuffer {
  const durationSec = 0.92;
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const ir = ctx.createBuffer(2, length, sampleRate);
  const preDelaySamples = Math.floor(sampleRate * 0.014);

  const earlyTapMs = [18, 29, 41, 56, 74];
  const earlyTapGains = [0.42, 0.31, 0.24, 0.17, 0.11];

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0;
    let seed = ch === 0 ? 421043 : 104342;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const white = (seed / 0xffffffff) * 2 - 1;
      if (i < preDelaySamples) {
        data[i] = 0;
        continue;
      }
      const t = (i - preDelaySamples) / Math.max(1, length - preDelaySamples);
      const env = Math.pow(1 - t, 3.15);
      // Smooth warm-high damping for clean laboratory glass/steel acoustic tail
      lp = lp * 0.64 + white * 0.36;
      data[i] = lp * env * 0.48;
    }

    // Add distinct stereo-offset early reflections
    for (let k = 0; k < earlyTapMs.length; k++) {
      const chOffsetMs = ch === 0 ? 0 : 2.3;
      const idx = Math.floor(((earlyTapMs[k] + chOffsetMs) / 1000) * sampleRate);
      if (idx >= 0 && idx < length) {
        const polarity = (k + ch) % 2 === 0 ? 1 : -1;
        data[idx] += polarity * earlyTapGains[k];
      }
    }
  }
  return ir;
}

/**
 * Builds a subtle stereo metallic chamber impulse response (~0.52s) for ULTRON's
 * WebAudio playback bus, preserving crisp 90.2 Hz bass clarity while adding stereo depth.
 */
function createUltronImpulseResponse(ctx: AudioContext): AudioBuffer {
  const durationSec = 0.52;
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const ir = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0;
    // Deterministic seeded PRNG so stereo L/R decorrelation is consistent and zero-glitch
    let seed = ch === 0 ? 1337902 : 9021337;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const white = (seed / 0xffffffff) * 2 - 1;
      const t = i / length;
      // Fast pre-delay (12ms) + smooth exponential metallic chamber decay
      const preDelaySamples = Math.floor(sampleRate * 0.012);
      if (i < preDelaySamples) {
        data[i] = 0;
        continue;
      }
      const env = Math.pow(1 - t, 2.75);
      lp = lp * 0.55 + white * 0.45;
      data[i] = lp * env * 0.68;
    }
  }
  return ir;
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
  const mentions = detectAssistantMentions(normalized);

  if (!mentions.anyMention || !mentions.directTargetMode) {
    return { matched: false, targetMode: 'auto', commandText: normalized, wakeOnly: false };
  }

  const targetMode: InteractionMode = mentions.directTargetMode;

  const stripped = normalized
    .replace(
      /^(ei|oi|ol[áa]|hey|ok|fala|fala\s+a[íi]|fala\s+comigo|escuta|por\s+favor|aten[çc][ãa]o|e\s+a[íi]|chama|chamar|ativa|ativar|acorda|desperta|cad[êe]|vem\s+c[áa]|quero\s+falar\s+com|falar\s+com|conectar\s+com)?\s*,?\s*(o|a|os|as)?\s*(jarvis\s+e\s+sexta[\s-]?feira|sexta[\s-]?feira\s+e\s+jarvis|jarvis|j\.?\s*a\.?\s*r\.?\s*v\.?\s*i\.?\s*s|j[áa]\s*vis|jarves|jarvez|jarbis|sexta[\s-]?feira|sexta|friday|f\.?\s*r\.?\s*i\.?\s*d\.?\s*a\.?\s*y|ultron|ultrons|ultrom|ultran|ultram|ultr[ãa]o|utron|utrom|utr[ãa]o|altron|oltron|autron|outron|outr[ãa]o|hultron|eltron|voltron|ul[\s-]?tron|ul[\s-]?trom|u[\s-]?tron|ultra|outro|neutro|neutron|todos|os\s+tr[êe]s|voc[êe]s\s+dois|os\s+dois|equipe|conselho)\b[:,.\s!?-]*/i,
      ''
    )
    .replace(
      /^(voc[êe]\s+)?(t[áa]\s+a[íi]|est[áa]\s+a[íi]|me\s+ouve|est[áa]\s+me\s+ouvindo|pode\s+vir|aparece|apare[çc]a|responde|responda|por\s+favor)[,.\s!?-]*$/i,
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

  const initialStartupDefaults = readStoredStartupDefaultVoices();
  const [startupDefaultVoices, setStartupDefaultVoicesState] = useState<StartupDefaultVoices>(
    () => initialStartupDefaults.voices
  );
  const [hasCustomStartupDefaults, setHasCustomStartupDefaults] = useState<boolean>(
    () => initialStartupDefaults.hasCustom
  );

  const [jarvisVoice, setJarvisVoiceState] = useState<JarvisVoiceOption>(() => {
    if (typeof window === 'undefined') return 'JarvisOriginal';
    if (initialStartupDefaults.hasCustom) {
      return initialStartupDefaults.voices.jarvis;
    }
    try {
      const saved = window.localStorage.getItem('stark_jarvis_voice_v4') as JarvisVoiceOption | null;
      if (saved && VALID_JARVIS_VOICE_SET.has(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'JarvisOriginal';
  });

  const [fridayVoice, setFridayVoiceState] = useState<FridayVoiceOption>(() => {
    if (typeof window === 'undefined') return 'Kore';
    if (initialStartupDefaults.hasCustom) {
      return initialStartupDefaults.voices['sexta-feira'];
    }
    const saved = window.localStorage.getItem('stark_friday_voice');
    return saved === 'Zephyr' || saved === 'Kore' ? saved : 'Kore';
  });

  const [ultronVoice, setUltronVoiceState] = useState<UltronVoiceOption>(() => {
    if (typeof window === 'undefined') return 'UltronOriginal';
    if (initialStartupDefaults.hasCustom) {
      return initialStartupDefaults.voices.ultron;
    }
    try {
      const saved = window.localStorage.getItem('stark_ultron_voice_v4') as UltronVoiceOption | null;
      if (saved && VALID_ULTRON_VOICE_SET.has(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'UltronOriginal';
  });

  const setJarvisVoice = useCallback((next: JarvisVoiceOption) => {
    const resolved: JarvisVoiceOption = VALID_JARVIS_VOICE_SET.has(next)
      ? next
      : 'JarvisOriginal';
    jarvisVoiceRef.current = resolved;
    setJarvisVoiceState(resolved);
    try {
      window.localStorage.setItem('stark_jarvis_voice_v4', resolved);
    } catch {
      // ignore
    }
  }, []);

  const setFridayVoice = useCallback((v: FridayVoiceOption) => {
    fridayVoiceRef.current = v;
    setFridayVoiceState(v);
    try {
      window.localStorage.setItem('stark_friday_voice', v);
    } catch {
      // ignore
    }
  }, []);

  const setUltronVoice = useCallback((next: UltronVoiceOption) => {
    const resolved: UltronVoiceOption = VALID_ULTRON_VOICE_SET.has(next)
      ? next
      : 'UltronOriginal';
    ultronVoiceRef.current = resolved;
    setUltronVoiceState(resolved);
    try {
      window.localStorage.setItem('stark_ultron_voice_v4', resolved);
    } catch {
      // ignore
    }
  }, []);

  const saveStartupDefaultVoices = useCallback(
    (next: StartupDefaultVoices, applyImmediately = true) => {
      const sanitized: StartupDefaultVoices = {
        jarvis: VALID_JARVIS_VOICE_SET.has(next.jarvis)
          ? next.jarvis
          : FACTORY_DEFAULT_VOICES.jarvis,
        'sexta-feira':
          next['sexta-feira'] === 'Zephyr' || next['sexta-feira'] === 'Kore'
            ? next['sexta-feira']
            : FACTORY_DEFAULT_VOICES['sexta-feira'],
        ultron: VALID_ULTRON_VOICE_SET.has(next.ultron)
          ? next.ultron
          : FACTORY_DEFAULT_VOICES.ultron,
      };
      setStartupDefaultVoicesState(sanitized);
      setHasCustomStartupDefaults(true);
      try {
        window.localStorage.setItem(
          STARTUP_DEFAULT_VOICES_STORAGE_KEY,
          JSON.stringify(sanitized)
        );
      } catch {
        // ignore
      }
      if (applyImmediately) {
        setJarvisVoice(sanitized.jarvis);
        setFridayVoice(sanitized['sexta-feira']);
        setUltronVoice(sanitized.ultron);
      }
    },
    [setFridayVoice, setJarvisVoice, setUltronVoice]
  );

  const resetStartupDefaultVoices = useCallback(() => {
    const factory = { ...FACTORY_DEFAULT_VOICES };
    setStartupDefaultVoicesState(factory);
    setHasCustomStartupDefaults(false);
    try {
      window.localStorage.removeItem(STARTUP_DEFAULT_VOICES_STORAGE_KEY);
    } catch {
      // ignore
    }
    setJarvisVoice(factory.jarvis);
    setFridayVoice(factory['sexta-feira']);
    setUltronVoice(factory.ultron);
  }, [setFridayVoice, setJarvisVoice, setUltronVoice]);

  const [labAmbienceEnabled, setLabAmbienceEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(LAB_AMBIENCE_ENABLED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const labAmbienceEnabledRef = useRef(labAmbienceEnabled);
  labAmbienceEnabledRef.current = labAmbienceEnabled;

  const setLabAmbienceEnabled = useCallback((next: boolean) => {
    labAmbienceEnabledRef.current = next;
    setLabAmbienceEnabledState(next);
    try {
      window.localStorage.setItem(LAB_AMBIENCE_ENABLED_STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
  }, []);

  const [labAmbienceLevel, setLabAmbienceLevelState] = useState<LabAmbienceLevel>(() => {
    if (typeof window === 'undefined') return 'sutil';
    try {
      const saved = window.localStorage.getItem(LAB_AMBIENCE_LEVEL_STORAGE_KEY);
      if (saved === 'sutil' || saved === 'equilibrado' || saved === 'imersivo') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'sutil';
  });
  const labAmbienceLevelRef = useRef<LabAmbienceLevel>(labAmbienceLevel);
  labAmbienceLevelRef.current = labAmbienceLevel;

  const setLabAmbienceLevel = useCallback((next: LabAmbienceLevel) => {
    labAmbienceLevelRef.current = next;
    setLabAmbienceLevelState(next);
    try {
      window.localStorage.setItem(LAB_AMBIENCE_LEVEL_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const [adoptMatrixOnListen, setAdoptMatrixOnListenState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = window.localStorage.getItem('stark_adopt_matrix_on_listen_v1');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const adoptMatrixOnListenRef = useRef(adoptMatrixOnListen);
  adoptMatrixOnListenRef.current = adoptMatrixOnListen;

  const setAdoptMatrixOnListen = useCallback((next: boolean) => {
    adoptMatrixOnListenRef.current = next;
    setAdoptMatrixOnListenState(next);
    try {
      window.localStorage.setItem('stark_adopt_matrix_on_listen_v1', String(next));
    } catch {
      // ignore
    }
  }, []);

  const [voiceTuning, setVoiceTuningState] = useState<VoiceTuningMap>(() => {
    if (typeof window === 'undefined') return DEFAULT_VOICE_TUNING;
    try {
      const raw = window.localStorage.getItem('stark_voice_tuning_v1');
      if (!raw) return DEFAULT_VOICE_TUNING;
      const parsed = JSON.parse(raw) as Partial<Record<AssistantId, Partial<AssistantVoiceTuning>>>;
      return {
        jarvis: clampVoiceTuning(parsed.jarvis, DEFAULT_VOICE_TUNING.jarvis),
        'sexta-feira': clampVoiceTuning(parsed['sexta-feira'], DEFAULT_VOICE_TUNING['sexta-feira']),
        ultron: clampVoiceTuning(parsed.ultron, DEFAULT_VOICE_TUNING.ultron),
      };
    } catch {
      return DEFAULT_VOICE_TUNING;
    }
  });

  const voiceTuningRef = useRef<VoiceTuningMap>(voiceTuning);
  voiceTuningRef.current = voiceTuning;
  const previewTuningOverrideRef = useRef<Partial<VoiceTuningMap> | null>(null);

  const getEffectiveTuning = useCallback((speaker: AssistantId): AssistantVoiceTuning => {
    return (
      previewTuningOverrideRef.current?.[speaker] ??
      voiceTuningRef.current[speaker] ??
      DEFAULT_VOICE_TUNING[speaker]
    );
  }, []);

  const updateAssistantVoiceTuning = useCallback(
    (speaker: AssistantId, patch: Partial<AssistantVoiceTuning>) => {
      const prev = voiceTuningRef.current;
      const next: VoiceTuningMap = {
        ...prev,
        [speaker]: clampVoiceTuning({ ...prev[speaker], ...patch }, DEFAULT_VOICE_TUNING[speaker]),
      };
      voiceTuningRef.current = next;
      setVoiceTuningState(next);
      try {
        window.localStorage.setItem('stark_voice_tuning_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    []
  );

  const resetVoiceTuning = useCallback((speaker?: AssistantId) => {
    const prev = voiceTuningRef.current;
    const next: VoiceTuningMap = speaker
      ? { ...prev, [speaker]: { ...DEFAULT_VOICE_TUNING[speaker] } }
      : {
          jarvis: { ...DEFAULT_VOICE_TUNING.jarvis },
          'sexta-feira': { ...DEFAULT_VOICE_TUNING['sexta-feira'] },
          ultron: { ...DEFAULT_VOICE_TUNING.ultron },
        };
    voiceTuningRef.current = next;
    setVoiceTuningState(next);
    try {
      window.localStorage.setItem('stark_voice_tuning_v1', JSON.stringify(next));
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
  const activeAudioNodesRef = useRef<AudioNode[]>([]);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);
  const audioTelemetryRef = useRef<AudioTelemetryBuffer>({
    amplitude: 0,
    bands: new Float32Array(24),
    active: false,
  });
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
    if (activeOscillatorsRef.current.length > 0) {
      for (const osc of activeOscillatorsRef.current) {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore already stopped oscillators
        }
      }
      activeOscillatorsRef.current = [];
    }
    if (activeAudioNodesRef.current.length > 0) {
      for (const node of activeAudioNodesRef.current) {
        try {
          node.disconnect();
        } catch {
          // ignore already disconnected nodes
        }
      }
      activeAudioNodesRef.current = [];
    }
    audioTelemetryRef.current.amplitude = 0;
    audioTelemetryRef.current.active = false;
    audioTelemetryRef.current.bands.fill(0);
    setAudioAmplitude(0);
    setAudioBands(ZERO_BANDS);
  }, []);

  const driveBandsFromAnalyser = useCallback(
    (analyser: AnalyserNode, isActive: () => boolean) => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastReactCommit = 0;
      const telemetry = audioTelemetryRef.current;
      telemetry.active = true;

      const tick = (ts: number) => {
        if (!isActive()) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < 24; i++) {
          const val = (data[i] ?? 0) / 255;
          telemetry.bands[i] = val;
          sum += val;
        }
        const amp = Math.min(1, (sum / 24) * 1.8);
        telemetry.amplitude = amp;

        // Throttle React tree updates to ~12.5 Hz (80ms) while GPU reads telemetry at full 60 FPS
        if (ts - lastReactCommit >= 80) {
          lastReactCommit = ts;
          setAudioAmplitude(amp);
          setAudioBands(Array.from(telemetry.bands));
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
      let lastMicCommit = 0;
      let lastReportedLevel = -1;

      const update = (ts: number) => {
        if (!standbyRef.current && !mediaRecorderRef.current) return;
        // Throttle mic meter React updates to 10 Hz with delta deadband to prevent 60 FPS App re-renders
        if (ts - lastMicCommit >= 100) {
          lastMicCommit = ts;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = Math.min(1, (sum / data.length / 255) * 2.2);
          if (Math.abs(avg - lastReportedLevel) >= 0.025) {
            lastReportedLevel = avg;
            setMicLevel(avg);
          }
        }
        analyserRafRef.current = requestAnimationFrame(update);
      };
      analyserRafRef.current = requestAnimationFrame(update);
    } catch {
      // Mic meter optional
    }
  }, []);

  const setAwakeWindow = useCallback(
    (mode: InteractionMode | null, silent = false) => {
      awakeTargetRef.current = mode;
      setAwakeTarget(mode);
      if (awakeTimerRef.current) {
        window.clearTimeout(awakeTimerRef.current);
        awakeTimerRef.current = null;
      }
      if (mode) {
        if (!silent) {
          triggerHaptic('wake');
          if (mode === 'ultron') {
            playSubtleChime(210, 145);
          } else if (mode === 'jarvis') {
            playSubtleChime(520, 780);
          } else {
            playSubtleChime(660, 880);
          }
        }
        awakeTimerRef.current = window.setTimeout(() => {
          // Do not expire the awake window while the assistant is still speaking its wake greeting
          if (isSpeakingRef.current) return;
          awakeTargetRef.current = null;
          setAwakeTarget(null);
        }, 15000);
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
      recognition.maxAlternatives = 4;
      recognition.lang = 'pt-BR';

      // Inspect all ASR hypotheses and prioritize explicit assistant wake calls (especially ULTRON)
      const pickBestWakeCandidate = (result: SpeechRecognitionResultLike) => {
        const primaryTranscript = result[0]?.transcript?.trim() ?? '';
        let bestParsed = parseWakePhrase(primaryTranscript);
        let bestTranscript = primaryTranscript;

        for (let altIdx = 0; altIdx < result.length; altIdx++) {
          const altText = result[altIdx]?.transcript?.trim() ?? '';
          if (!altText) continue;
          const candidate = parseWakePhrase(altText);
          if (!candidate.matched) continue;
          // Explicit priority: ULTRON match in any ASR alternative immediately overrides misheard primary text
          if (candidate.targetMode === 'ultron') {
            return { transcript: altText, parsed: candidate };
          }
          if (!bestParsed.matched) {
            bestParsed = candidate;
            bestTranscript = altText;
          }
        }
        return { transcript: bestTranscript, parsed: bestParsed };
      };

      recognition.onresult = (event) => {
        if (isSpeakingRef.current) return;
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const primaryRaw = result[0]?.transcript?.trim() ?? '';
          if (!primaryRaw) continue;

          const { transcript, parsed } = pickBestWakeCandidate(result);

          if (result.isFinal) {
            setInterimTranscript('');
            const now = Date.now();
            if (
              lastProcessedPhraseRef.current.text === transcript &&
              now - lastProcessedPhraseRef.current.time < 2200
            ) {
              continue;
            }
            lastProcessedPhraseRef.current = { text: transcript, time: now };

            if (awakeTargetRef.current) {
              const target = awakeTargetRef.current;
              setAwakeWindow(null);
              const cleanCmd = parsed.matched && parsed.commandText ? parsed.commandText : transcript;
              if (cleanCmd.length >= 2) {
                triggerHaptic('wake');
                onWakeCommandRef.current(cleanCmd, parsed.matched ? parsed.targetMode : target);
              }
              continue;
            }

            if (parsed.matched) {
              if (parsed.wakeOnly) {
                setAwakeWindow(parsed.targetMode);
                onAssistantActivatedRef.current?.(parsed.targetMode, 'wake_word');
              } else {
                triggerHaptic('wake');
                if (parsed.targetMode === 'ultron') {
                  playSubtleChime(210, 145);
                } else {
                  playSubtleChime(560, 840);
                }
                onWakeCommandRef.current(parsed.commandText, parsed.targetMode);
              }
            }
          } else {
            interim += transcript + ' ';
            if (parsed.matched && !awakeTargetRef.current) {
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

  const clientTtsCacheRef = useRef<
    Map<string, { audioBase64: string; mimeType: string; byteSize: number }>
  >(new Map());
  const clientTtsBytesRef = useRef(0);
  const ultronIrBufferRef = useRef<AudioBuffer | null>(null);
  const labAmbienceIrBufferRef = useRef<AudioBuffer | null>(null);
  const ringBufferRef = useRef<AdaptiveAudioRingBuffer<SynthesizedChunkPayload>>(
    new AdaptiveAudioRingBuffer<SynthesizedChunkPayload>()
  );
  const ringBufferStatsRef = useRef<AudioRingBufferStats>(ringBufferRef.current.getStats());
  const [ringBufferStats, setRingBufferStats] = useState<AudioRingBufferStats>(() =>
    ringBufferRef.current.getStats()
  );
  const lastRingStatsPublishRef = useRef(0);
  const streamTurnIndexRef = useRef(0);

  const publishRingBufferStats = useCallback((force = false) => {
    const stats = ringBufferRef.current.getStats();
    ringBufferStatsRef.current = stats;
    const now = performance.now();
    if (force || now - lastRingStatsPublishRef.current >= 220) {
      lastRingStatsPublishRef.current = now;
      setRingBufferStats(stats);
    }
  }, []);

  const stopAudio = useCallback(() => {
    playbackSessionRef.current += 1;
    previewTuningOverrideRef.current = null;
    ringBufferRef.current.clear();
    publishRingBufferStats(true);
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
  }, [publishRingBufferStats, startRecognitionInstance, stopPlaybackAnalyser]);

  // Pre-warm browser SpeechSynthesis voices on external HTTPS deployments (Chrome/Safari load voices asynchronously)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const warmVoices = () => {
      try {
        window.speechSynthesis.getVoices();
      } catch {
        // ignore
      }
    };
    warmVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', warmVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', warmVoices);
    };
  }, []);

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

        const rawScript = (turn.ttsScript || turn.text || '')
          .replace(/[*_`#>-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (!rawScript) {
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

        const tuning = getEffectiveTuning(turn.speaker);
        const pitchScale = Math.pow(2, tuning.pitchSemitones / 12);
        const speedScale = tuning.speed;
        const modPitchBias =
          turn.speaker === 'ultron' ? 1 - (tuning.modulation / 100) * 0.08 : 1;

        let targetVoice: SpeechSynthesisVoice | undefined;
        let resolvedPitch = 1.0;
        let resolvedRate = 1.0;

        if (turn.speaker === 'jarvis') {
          targetVoice = maleVoice;
          const activeJarvis = jarvisVoiceRef.current;
          let basePitch = 0.82;
          let baseRate = 0.95;
          if (activeJarvis === 'Orus') {
            basePitch = 0.92;
            baseRate = 1.03;
          } else if (activeJarvis === 'Enceladus') {
            basePitch = 0.80;
            baseRate = 0.91;
          } else if (activeJarvis === 'Puck') {
            basePitch = 1.04;
            baseRate = 1.09;
          } else if (activeJarvis === 'Charon') {
            basePitch = 0.88;
            baseRate = 0.98;
          }
          resolvedPitch = Math.max(0.35, Math.min(1.85, basePitch * pitchScale));
          resolvedRate = Math.max(0.65, Math.min(1.65, baseRate * speedScale));
        } else if (turn.speaker === 'ultron') {
          targetVoice = maleVoice;
          const activeUltron = ultronVoiceRef.current;
          let basePitch = 0.60;
          let baseRate = 0.86;
          if (activeUltron === 'Fenrir') {
            basePitch = 0.72;
            baseRate = 0.93;
          } else if (activeUltron === 'Algenib') {
            basePitch = 0.66;
            baseRate = 0.89;
          } else if (activeUltron === 'Charon') {
            basePitch = 0.78;
            baseRate = 0.94;
          } else if (activeUltron === 'Orus') {
            basePitch = 0.84;
            baseRate = 0.99;
          }
          resolvedPitch = Math.max(0.35, Math.min(1.85, basePitch * pitchScale * modPitchBias));
          resolvedRate = Math.max(0.65, Math.min(1.65, baseRate * speedScale));
        } else {
          targetVoice = femaleVoice;
          const isZephyr = fridayVoiceRef.current === 'Zephyr';
          const basePitch =
            femaleVoice && femaleHints.test(femaleVoice.name)
              ? isZephyr
                ? 1.18
                : 1.10
              : isZephyr
              ? 1.36
              : 1.28;
          const baseRate = isZephyr ? 1.0 : 1.06;
          resolvedPitch = Math.max(0.45, Math.min(1.9, basePitch * pitchScale));
          resolvedRate = Math.max(0.65, Math.min(1.65, baseRate * speedScale));
        }

        // Split long texts into <= 175-char chunks to avoid Chrome's 15-second SpeechSynthesis freeze bug
        const sentenceParts = rawScript.match(/[^.!?]+[.!?]*\s*/g) ?? [rawScript];
        const speechChunks: string[] = [];
        let currentBuf = '';
        for (const rawPart of sentenceParts) {
          const part = rawPart.trim();
          if (!part) continue;
          if (currentBuf && currentBuf.length + part.length + 1 > 175) {
            speechChunks.push(currentBuf.trim());
            currentBuf = part;
          } else {
            currentBuf = currentBuf ? `${currentBuf} ${part}` : part;
          }
        }
        if (currentBuf.trim()) speechChunks.push(currentBuf.trim());
        if (speechChunks.length === 0) speechChunks.push(rawScript.slice(0, 175));

        // Visual pulse while browser speech synthesis is active (also feeds 60 FPS audioTelemetryRef)
        let phase = 0;
        let stopped = false;
        let settled = false;
        let watchdogTimer: number | null = null;
        const telemetry = audioTelemetryRef.current;
        telemetry.active = true;
        let lastReactCommit = 0;
        const tick = (ts: number) => {
          if (stopped || sessionId !== playbackSessionRef.current) return;
          phase += 0.22 * speedScale;
          const envelope = 0.42 + 0.34 * Math.abs(Math.sin(phase * 0.7)) + 0.16 * Math.sin(phase * 1.9);
          telemetry.amplitude = Math.max(0.18, Math.min(0.95, envelope));
          for (let idx = 0; idx < 24; idx++) {
            telemetry.bands[idx] = Math.max(
              0.12,
              Math.min(1, telemetry.amplitude * (0.65 + 0.35 * Math.sin(phase + idx * 0.55)))
            );
          }
          if (ts - lastReactCommit >= 90) {
            lastReactCommit = ts;
            setAudioAmplitude(telemetry.amplitude);
            setAudioBands(Array.from(telemetry.bands));
          }
          playbackRafRef.current = requestAnimationFrame(tick);
        };
        playbackRafRef.current = requestAnimationFrame(tick);

        const cleanup = () => {
          if (settled) return;
          settled = true;
          stopped = true;
          if (watchdogTimer !== null) {
            window.clearTimeout(watchdogTimer);
            watchdogTimer = null;
          }
          stopPlaybackAnalyser();
          resolve();
        };

        let chunkIdx = 0;
        const speakNextChunk = () => {
          if (settled || sessionId !== playbackSessionRef.current || chunkIdx >= speechChunks.length) {
            cleanup();
            return;
          }
          const chunkText = speechChunks[chunkIdx];
          chunkIdx += 1;

          const utter = new SpeechSynthesisUtterance(chunkText);
          utter.lang = 'pt-BR';
          if (targetVoice) utter.voice = targetVoice;
          utter.pitch = resolvedPitch;
          utter.rate = resolvedRate;

          let chunkDone = false;
          const onChunkFinished = () => {
            if (chunkDone) return;
            chunkDone = true;
            if (watchdogTimer !== null) {
              window.clearTimeout(watchdogTimer);
              watchdogTimer = null;
            }
            speakNextChunk();
          };

          utter.onend = onChunkFinished;
          utter.onerror = onChunkFinished;

          // Safety watchdog prevents silent browser hangs from locking the speech queue permanently
          const estimatedMs = Math.max(4500, Math.min(16000, Math.round((chunkText.length / 11) * 1000 / Math.max(0.65, resolvedRate)) + 3500));
          watchdogTimer = window.setTimeout(() => {
            try {
              window.speechSynthesis.cancel();
            } catch {
              // ignore
            }
            onChunkFinished();
          }, estimatedMs);

          try {
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
            window.speechSynthesis.speak(utter);
          } catch {
            onChunkFinished();
          }
        };

        speakNextChunk();
      }),
    [stopPlaybackAnalyser]
  );

  const playBlobUrlWithHtmlAudio = useCallback(
    (url: string, speaker: AssistantId, sessionId: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (sessionId !== playbackSessionRef.current) {
          URL.revokeObjectURL(url);
          resolve();
          return;
        }
        const audio = new Audio(url);
        audioElRef.current = audio;
        currentObjectUrlRef.current = url;
        const tuning = getEffectiveTuning(speaker);
        audio.playbackRate = tuning.speed;

        let phase = 0;
        const telemetry = audioTelemetryRef.current;
        telemetry.active = true;
        let lastReactCommit = 0;
        const fallbackTick = (ts: number) => {
          if (audioElRef.current !== audio || sessionId !== playbackSessionRef.current) return;
          phase += 0.24 * tuning.speed;
          telemetry.amplitude = Math.max(0.22, Math.min(0.92, 0.52 + 0.32 * Math.sin(phase * 0.85)));
          for (let idx = 0; idx < 24; idx++) {
            telemetry.bands[idx] = Math.max(
              0.15,
              Math.min(1, telemetry.amplitude * (0.65 + 0.35 * Math.sin(phase + idx * 0.5)))
            );
          }
          if (ts - lastReactCommit >= 90) {
            lastReactCommit = ts;
            setAudioAmplitude(telemetry.amplitude);
            setAudioBands(Array.from(telemetry.bands));
          }
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

              // Apply independent manual vocal tuning (Pitch in cents, Speed multiplier, Modulation depth)
              const tuning = getEffectiveTuning(speaker);
              const modNorm = Math.max(0, Math.min(1, tuning.modulation / 100));
              source.playbackRate.value = Math.max(0.75, Math.min(1.35, tuning.speed));
              if (typeof source.detune !== 'undefined') {
                source.detune.value = Math.max(-6, Math.min(6, tuning.pitchSemitones)) * 100;
              }
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

              const trackedNodes: AudioNode[] = [compressor, analyser];
              const trackedOscillators: OscillatorNode[] = [];

              const attachModulatedChorusBus = (
                inputNode: AudioNode,
                opts: {
                  delaySec: number;
                  lfoHz: number;
                  lfoDepthSec: number;
                  hpFreq: number;
                  wetLevel: number;
                  feedbackGain?: number;
                }
              ) => {
                if (opts.wetLevel <= 0.01) return;
                const hp = ctx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = opts.hpFreq;
                hp.Q.value = 0.75;

                const delay = ctx.createDelay(0.1);
                delay.delayTime.value = opts.delaySec;

                const lfo = ctx.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.value = opts.lfoHz;

                const lfoDepth = ctx.createGain();
                lfoDepth.gain.value = opts.lfoDepthSec;

                const modWet = ctx.createGain();
                modWet.gain.value = opts.wetLevel;

                lfo.connect(lfoDepth);
                lfoDepth.connect(delay.delayTime);

                inputNode.connect(hp);
                hp.connect(delay);

                if (opts.feedbackGain && opts.feedbackGain > 0) {
                  const fb = ctx.createGain();
                  fb.gain.value = opts.feedbackGain;
                  delay.connect(fb);
                  fb.connect(delay);
                  trackedNodes.push(fb);
                }

                delay.connect(modWet);
                modWet.connect(compressor);

                lfo.start();
                trackedOscillators.push(lfo);
                trackedNodes.push(hp, delay, lfoDepth, modWet);
              };

              const attachLabAmbienceBus = (inputNode: AudioNode) => {
                if (!labAmbienceEnabledRef.current) return;
                const level = labAmbienceLevelRef.current;
                const baseWet =
                  level === 'imersivo' ? 0.38 : level === 'equilibrado' ? 0.27 : 0.18;
                // Attenuate slightly for ULTRON so it layers harmoniously over Ultron's chamber reverb
                const wetValue = speaker === 'ultron' ? baseWet * 0.72 : baseWet;

                const labHp = ctx.createBiquadFilter();
                labHp.type = 'highpass';
                labHp.frequency.value = 260;
                labHp.Q.value = 0.7;

                const labLp = ctx.createBiquadFilter();
                labLp.type = 'lowpass';
                labLp.frequency.value = 5400;
                labLp.Q.value = 0.7;

                const labConvolver = ctx.createConvolver();
                if (
                  !labAmbienceIrBufferRef.current ||
                  labAmbienceIrBufferRef.current.sampleRate !== ctx.sampleRate
                ) {
                  labAmbienceIrBufferRef.current = createLabAmbienceImpulseResponse(ctx);
                }
                labConvolver.buffer = labAmbienceIrBufferRef.current;

                // Subtle slow spatial modulation on the laboratory room reflection return
                const labModDelay = ctx.createDelay(0.08);
                labModDelay.delayTime.value = 0.018;

                const labLfo = ctx.createOscillator();
                labLfo.type = 'sine';
                labLfo.frequency.value = 0.65;

                const labLfoDepth = ctx.createGain();
                labLfoDepth.gain.value = 0.00045;

                const labWetGain = ctx.createGain();
                labWetGain.gain.value = wetValue;

                labLfo.connect(labLfoDepth);
                labLfoDepth.connect(labModDelay.delayTime);

                inputNode.connect(labHp);
                labHp.connect(labLp);
                labLp.connect(labConvolver);
                labConvolver.connect(labModDelay);
                labModDelay.connect(labWetGain);
                labWetGain.connect(compressor);

                labLfo.start();
                trackedOscillators.push(labLfo);
                trackedNodes.push(
                  labHp,
                  labLp,
                  labConvolver,
                  labModDelay,
                  labLfoDepth,
                  labWetGain
                );
              };

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
                armorPresence.gain.value = 1.0 + modNorm * 2.2;

                // Subtle stereo chamber reverb parallel send scaled smoothly by ULTRON modulation slider
                const dryGain = ctx.createGain();
                dryGain.gain.value = 0.96 - modNorm * 0.08;

                const reverbHp = ctx.createBiquadFilter();
                reverbHp.type = 'highpass';
                reverbHp.frequency.value = 240;
                reverbHp.Q.value = 0.7;

                const convolver = ctx.createConvolver();
                if (
                  !ultronIrBufferRef.current ||
                  ultronIrBufferRef.current.sampleRate !== ctx.sampleRate
                ) {
                  ultronIrBufferRef.current = createUltronImpulseResponse(ctx);
                }
                convolver.buffer = ultronIrBufferRef.current;

                const wetGain = ctx.createGain();
                wetGain.gain.value = 0.03 + modNorm * 0.34;

                trackedNodes.push(
                  subPolish,
                  chestBody,
                  armorPresence,
                  dryGain,
                  reverbHp,
                  convolver,
                  wetGain
                );
                source.connect(subPolish);
                subPolish.connect(chestBody);
                chestBody.connect(armorPresence);

                // Dry path
                armorPresence.connect(dryGain);
                dryGain.connect(compressor);

                // Stereo wet chamber reverb path
                armorPresence.connect(reverbHp);
                reverbHp.connect(convolver);
                convolver.connect(wetGain);
                wetGain.connect(compressor);

                // Cybernetic metallic comb modulation bus driven by modulation %
                attachModulatedChorusBus(armorPresence, {
                  delaySec: 0.017,
                  lfoHz: 2.3 + modNorm * 1.4,
                  lfoDepthSec: 0.0008 + modNorm * 0.0018,
                  hpFreq: 280,
                  wetLevel: modNorm * 0.34,
                  feedbackGain: modNorm * 0.28,
                });

                attachLabAmbienceBus(armorPresence);

                compressor.connect(analyser);
              } else if (speaker === 'jarvis') {
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

                trackedNodes.push(velvetChest, silkDip);
                source.connect(velvetChest);
                velvetChest.connect(silkDip);
                silkDip.connect(compressor);

                // Stark HUD micro-chorus holographic shimmer driven by J.A.R.V.I.S. modulation %
                attachModulatedChorusBus(silkDip, {
                  delaySec: 0.014,
                  lfoHz: 1.7 + modNorm * 0.9,
                  lfoDepthSec: 0.0006 + modNorm * 0.0012,
                  hpFreq: 340,
                  wetLevel: modNorm * 0.34,
                  feedbackGain: modNorm * 0.14,
                });

                attachLabAmbienceBus(silkDip);

                compressor.connect(analyser);
              } else {
                source.connect(compressor);
                // Crisp tactical comms modulation driven by SEXTA-FEIRA modulation %
                attachModulatedChorusBus(source, {
                  delaySec: 0.011,
                  lfoHz: 2.5 + modNorm * 1.1,
                  lfoDepthSec: 0.0005 + modNorm * 0.0011,
                  hpFreq: 480,
                  wetLevel: modNorm * 0.30,
                  feedbackGain: modNorm * 0.12,
                });

                attachLabAmbienceBus(source);

                compressor.connect(analyser);
              }
              activeAudioNodesRef.current = trackedNodes;
              activeOscillatorsRef.current = trackedOscillators;
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

  const clearTtsCache = useCallback(() => {
    clientTtsCacheRef.current.clear();
    clientTtsBytesRef.current = 0;
    ringBufferRef.current.clear();
    publishRingBufferStats(true);
  }, [publishRingBufferStats]);

  const synthesizeChunk = useCallback(
    async (
      chunk: AudioChunkDescriptor,
      parentTurn: AssistantTurn,
      overrideVoices?: {
        jarvisVoice?: JarvisVoiceOption;
        fridayVoice?: FridayVoiceOption;
        ultronVoice?: UltronVoiceOption;
      }
    ): Promise<SynthesizedChunkPayload> => {
      const activeJarvisVoice: JarvisVoiceOption =
        overrideVoices?.jarvisVoice ?? jarvisVoiceRef.current;
      const activeFridayVoice: FridayVoiceOption =
        overrideVoices?.fridayVoice ?? fridayVoiceRef.current;
      const activeUltronVoice: UltronVoiceOption =
        overrideVoices?.ultronVoice ?? ultronVoiceRef.current;

      const spokenText = chunk.text.trim();
      const chunkTurn: AssistantTurn = {
        ...parentTurn,
        speaker: chunk.speaker,
        text: chunk.totalChunks > 1 ? spokenText : parentTurn.text,
        ttsScript: spokenText,
      };

      if (!spokenText) {
        return {
          turn: chunkTurn,
          chunk,
          audioBase64: null,
          mimeType: 'audio/wav',
          byteSize: 0,
          fetchLatencyMs: 0,
          fromCache: false,
        };
      }

      const voiceKey =
        chunk.speaker === 'jarvis'
          ? activeJarvisVoice
          : chunk.speaker === 'sexta-feira'
          ? activeFridayVoice
          : activeUltronVoice;
      const cacheKey = `v7_selectable_voices_reverb:${chunk.speaker}:${voiceKey}:${spokenText}`;

      const cached = clientTtsCacheRef.current.get(cacheKey);
      if (cached) {
        clientTtsCacheRef.current.delete(cacheKey);
        clientTtsCacheRef.current.set(cacheKey, cached);
        ringBufferRef.current.recordCacheHit();
        publishRingBufferStats(false);
        return {
          turn: chunkTurn,
          chunk,
          audioBase64: cached.audioBase64,
          mimeType: cached.mimeType,
          byteSize: cached.byteSize,
          fetchLatencyMs: 0,
          fromCache: true,
        };
      }

      const t0 = performance.now();
      const ttsController = new AbortController();
      const ttsTimeoutId = window.setTimeout(() => ttsController.abort(), 11500);
      let res: Awaited<ReturnType<typeof safeFetchJson<{ audioBase64?: string; mimeType?: string }>>>;
      try {
        res = await safeFetchJson<{ audioBase64?: string; mimeType?: string }>(
          '/api/assistant/tts',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ttsController.signal,
            body: JSON.stringify({
              turns: [
                {
                  speaker: chunk.speaker,
                  text: spokenText,
                },
              ],
              jarvisVoice: activeJarvisVoice,
              fridayVoice: activeFridayVoice,
              ultronVoice: activeUltronVoice,
            }),
          },
          0
        );
      } finally {
        window.clearTimeout(ttsTimeoutId);
      }
      const rttMs = Math.max(1, Math.round(performance.now() - t0));
      ringBufferRef.current.recordNetworkLatency(rttMs);
      publishRingBufferStats(false);

      if (!res.ok || !res.data?.audioBase64) {
        return {
          turn: chunkTurn,
          chunk,
          audioBase64: null,
          mimeType: 'audio/wav',
          byteSize: 0,
          fetchLatencyMs: rttMs,
          fromCache: false,
        };
      }

      const byteSize = res.data.audioBase64.length * 2;
      const MAX_CLIENT_TTS_ENTRIES = 12;
      const MAX_CLIENT_TTS_BYTES = 5 * 1024 * 1024; // 5 MB client LRU ceiling
      const payload = {
        audioBase64: res.data.audioBase64,
        mimeType: res.data.mimeType || 'audio/wav',
        byteSize,
      };
      if (byteSize <= MAX_CLIENT_TTS_BYTES * 0.5) {
        while (
          (clientTtsCacheRef.current.size >= MAX_CLIENT_TTS_ENTRIES ||
            clientTtsBytesRef.current + byteSize > MAX_CLIENT_TTS_BYTES) &&
          clientTtsCacheRef.current.size > 0
        ) {
          const oldestKey = clientTtsCacheRef.current.keys().next().value;
          if (!oldestKey) break;
          const oldestEntry = clientTtsCacheRef.current.get(oldestKey);
          if (oldestEntry) clientTtsBytesRef.current -= oldestEntry.byteSize;
          clientTtsCacheRef.current.delete(oldestKey);
        }
        clientTtsCacheRef.current.set(cacheKey, payload);
        clientTtsBytesRef.current += byteSize;
      }

      return {
        turn: chunkTurn,
        chunk,
        audioBase64: payload.audioBase64,
        mimeType: payload.mimeType,
        byteSize,
        fetchLatencyMs: rttMs,
        fromCache: false,
      };
    },
    [publishRingBufferStats]
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

  /**
   * Drives sentence-aligned chunks through the AdaptiveAudioRingBuffer with dynamic
   * network-latency prefetching and immediate slot recycling after playback.
   */
  const playChunkedEntriesWithRingBuffer = useCallback(
    async (
      entries: Array<{ chunk: AudioChunkDescriptor; parentTurn: AssistantTurn }>,
      sessionId: number,
      overrideVoices?: {
        jarvisVoice?: JarvisVoiceOption;
        fridayVoice?: FridayVoiceOption;
        ultronVoice?: UltronVoiceOption;
      }
    ) => {
      if (entries.length === 0) return;

      const ring = ringBufferRef.current;
      const inFlight = new Map<number, Promise<SynthesizedChunkPayload>>();
      const readyStaging = new Map<
        number,
        { payload: SynthesizedChunkPayload; prefetched: boolean }
      >();
      let nextPrefetchIdx = 0;
      let nextEnqueueIdx = 0;

      const drainStagingIntoRing = () => {
        if (sessionId !== playbackSessionRef.current) return;
        while (readyStaging.has(nextEnqueueIdx) && ring.hasFreeSlot()) {
          const ready = readyStaging.get(nextEnqueueIdx)!;
          readyStaging.delete(nextEnqueueIdx);
          ring.enqueue({
            chunk: ready.payload.chunk,
            payload: ready.payload,
            byteSize: ready.payload.byteSize,
            enqueuedAt: performance.now(),
            fetchLatencyMs: ready.payload.fetchLatencyMs,
            prefetched: ready.prefetched,
          });
          nextEnqueueIdx += 1;
        }
        publishRingBufferStats(false);
      };

      const pumpPrefetchWindow = (currentIdx: number) => {
        if (sessionId !== playbackSessionRef.current) return;
        const cfg = ring.getConfig();
        const maxLookahead = Math.min(cfg.capacitySlots, cfg.prefetchAhead + 1);

        while (
          nextPrefetchIdx < entries.length &&
          nextPrefetchIdx < currentIdx + maxLookahead &&
          ring.getOccupiedCount() + readyStaging.size + inFlight.size < cfg.capacitySlots
        ) {
          const targetIdx = nextPrefetchIdx;
          nextPrefetchIdx += 1;
          const entry = entries[targetIdx];
          const isPrefetch = targetIdx > currentIdx;

          const p = synthesizeChunk(entry.chunk, entry.parentTurn, overrideVoices)
            .then((payload) => {
              inFlight.delete(targetIdx);
              ring.setInFlightPrefetches(inFlight.size);
              if (sessionId === playbackSessionRef.current && targetIdx >= nextEnqueueIdx) {
                readyStaging.set(targetIdx, { payload, prefetched: isPrefetch });
                drainStagingIntoRing();
              }
              return payload;
            })
            .catch((err) => {
              inFlight.delete(targetIdx);
              ring.setInFlightPrefetches(inFlight.size);
              throw err;
            });

          inFlight.set(targetIdx, p);
          ring.setInFlightPrefetches(inFlight.size);
        }
        publishRingBufferStats(false);
      };

      for (let i = 0; i < entries.length; i++) {
        if (sessionId !== playbackSessionRef.current) return;

        drainStagingIntoRing();
        pumpPrefetchWindow(i);

        let slot = ring.consumeNext();
        if (!slot) {
          if (i > 0) {
            ring.recordUnderrun();
          }
          setIsSynthesizingAudio(true);
          const pending = inFlight.get(i);
          if (pending) {
            await pending;
            if (sessionId !== playbackSessionRef.current) return;
            drainStagingIntoRing();
            slot = ring.consumeNext();
          }
          if (!slot) {
            const staged = readyStaging.get(i);
            if (staged) {
              readyStaging.delete(i);
              if (nextEnqueueIdx === i) nextEnqueueIdx = i + 1;
              slot = {
                chunk: staged.payload.chunk,
                payload: staged.payload,
                byteSize: staged.payload.byteSize,
                enqueuedAt: performance.now(),
                fetchLatencyMs: staged.payload.fetchLatencyMs,
                prefetched: staged.prefetched,
              };
              ring.setActiveSpeaker(staged.payload.chunk.speaker);
            } else {
              const entry = entries[i];
              const payload = await synthesizeChunk(entry.chunk, entry.parentTurn, overrideVoices);
              if (sessionId !== playbackSessionRef.current) return;
              if (nextEnqueueIdx <= i) nextEnqueueIdx = i + 1;
              slot = {
                chunk: payload.chunk,
                payload,
                byteSize: payload.byteSize,
                enqueuedAt: performance.now(),
                fetchLatencyMs: payload.fetchLatencyMs,
                prefetched: false,
              };
              ring.setActiveSpeaker(payload.chunk.speaker);
            }
          }
        }

        // Immediately drain any staged chunks and trigger next lookahead prefetch while playing
        drainStagingIntoRing();
        pumpPrefetchWindow(i + 1);
        publishRingBufferStats(false);

        try {
          await playSynthesizedItem(slot.payload, sessionId);
        } catch (playErr) {
          const name = (playErr as { name?: string })?.name;
          if (name === 'NotAllowedError') {
            ring.clear();
            publishRingBufferStats(true);
            throw playErr;
          }
          await speakSingleTurnWithBrowserFallback(slot.payload.turn, sessionId);
        } finally {
          // Drop strong reference immediately after playback to minimize heap retention
          slot.payload.audioBase64 = null;
          publishRingBufferStats(false);
        }
      }
    },
    [playSynthesizedItem, publishRingBufferStats, speakSingleTurnWithBrowserFallback, synthesizeChunk]
  );

  const beginAudioStreamSession = useCallback(() => {
    stopAudio();
    const sessionId = ++playbackSessionRef.current;
    streamSessionIdRef.current = sessionId;
    streamHasEnqueuedRef.current = false;
    streamTurnIndexRef.current = 0;
    streamChainRef.current = Promise.resolve();
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setIsSynthesizingAudio(true);
    setAudioBlockedByBrowser(false);
    publishRingBufferStats(true);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, [publishRingBufferStats, stopAudio]);

  const enqueueStreamingTurn = useCallback(
    (turn: AssistantTurn) => {
      const sessionId = streamSessionIdRef.current;
      if (sessionId !== playbackSessionRef.current) return;

      if (!streamHasEnqueuedRef.current) {
        setSpeakingSpeaker(turn.speaker);
        setSpeakingText(turn.text);
      }
      streamHasEnqueuedRef.current = true;

      const turnIdx = streamTurnIndexRef.current++;
      const spokenText = (turn.ttsScript || turn.text).trim();
      const maxChunkChars = ringBufferRef.current.getConfig().maxChunkChars;
      const chunks = splitTurnIntoAudioChunks(turn.speaker, spokenText, turnIdx, maxChunkChars);
      const entries = chunks.map((chunk) => ({ chunk, parentTurn: turn }));

      // Prefetch chunk 0 immediately into the adaptive ring buffer while prior turns finish
      const warmFirstChunk =
        entries.length > 0 && ringBufferRef.current.hasFreeSlot()
          ? synthesizeChunk(entries[0].chunk, entries[0].parentTurn)
              .then((payload) => {
                if (sessionId === playbackSessionRef.current) {
                  ringBufferRef.current.enqueue({
                    chunk: payload.chunk,
                    payload,
                    byteSize: payload.byteSize,
                    enqueuedAt: performance.now(),
                    fetchLatencyMs: payload.fetchLatencyMs,
                    prefetched: true,
                  });
                  publishRingBufferStats(false);
                }
                return payload;
              })
              .catch(() => null)
          : null;

      streamChainRef.current = streamChainRef.current.then(async () => {
        if (sessionId !== playbackSessionRef.current) return;
        setSpeakingSpeaker(turn.speaker);
        setSpeakingText(turn.text);
        try {
          if (warmFirstChunk) {
            const firstPayload = await warmFirstChunk;
            if (sessionId !== playbackSessionRef.current) return;
            if (firstPayload) {
              const consumed = ringBufferRef.current.consumeNext();
              const activePayload =
                consumed && consumed.chunk.id === firstPayload.chunk.id
                  ? consumed.payload
                  : firstPayload;
              publishRingBufferStats(false);
              // Play warmed chunk 0 while prefetching remaining chunks of this turn via ring buffer
              const remaining = entries.slice(1);
              const nextWarmPromise =
                remaining.length > 0
                  ? playSynthesizedItem(activePayload, sessionId).then(() =>
                      playChunkedEntriesWithRingBuffer(remaining, sessionId)
                    )
                  : playSynthesizedItem(activePayload, sessionId);
              await nextWarmPromise;
              activePayload.audioBase64 = null;
              publishRingBufferStats(false);
              return;
            }
          }
          await playChunkedEntriesWithRingBuffer(entries, sessionId);
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
    [
      playChunkedEntriesWithRingBuffer,
      playSynthesizedItem,
      publishRingBufferStats,
      speakSingleTurnWithBrowserFallback,
      synthesizeChunk,
    ]
  );

  const finishAudioStreamSession = useCallback(
    (hadResponses: boolean) => {
      const sessionId = streamSessionIdRef.current;
      const cleanup = () => {
        if (sessionId === playbackSessionRef.current) {
          ringBufferRef.current.setActiveSpeaker(null);
          publishRingBufferStats(true);
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setIsSynthesizingAudio(false);
          setSpeakingSpeaker(null);
          setSpeakingText('');
          stopPlaybackAnalyser();
          if (standbyRef.current) {
            if (awakeTargetRef.current) {
              setAwakeWindow(awakeTargetRef.current, true);
            }
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
    [publishRingBufferStats, setAwakeWindow, startRecognitionInstance, stopPlaybackAnalyser]
  );

  const playTurnsAudio = useCallback(
    async (
      turns: AssistantTurn[],
      overrideVoices?: {
        jarvisVoice?: JarvisVoiceOption;
        fridayVoice?: FridayVoiceOption;
        ultronVoice?: UltronVoiceOption;
        tuningOverride?: Partial<VoiceTuningMap>;
      }
    ) => {
      if (!turns || turns.length === 0) return;

      stopAudio();
      previewTuningOverrideRef.current = overrideVoices?.tuningOverride ?? null;
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

      const maxChunkChars = ringBufferRef.current.getConfig().maxChunkChars;
      const chunkedEntries: Array<{ chunk: AudioChunkDescriptor; parentTurn: AssistantTurn }> = [];
      turns.forEach((turn, idx) => {
        const spokenText = (turn.ttsScript || turn.text).trim();
        const chunks = splitTurnIntoAudioChunks(turn.speaker, spokenText, idx, maxChunkChars);
        chunks.forEach((chunk) => {
          chunkedEntries.push({ chunk, parentTurn: turn });
        });
      });

      try {
        await playChunkedEntriesWithRingBuffer(chunkedEntries, sessionId, overrideVoices);
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name !== 'NotAllowedError') {
          setIsSynthesizingAudio(false);
          for (const turn of turns) {
            if (sessionId !== playbackSessionRef.current) break;
            setSpeakingSpeaker(turn.speaker);
            setSpeakingText(turn.text);
            await speakSingleTurnWithBrowserFallback(turn, sessionId);
          }
        }
      } finally {
        if (sessionId === playbackSessionRef.current) {
          previewTuningOverrideRef.current = null;
          ringBufferRef.current.setActiveSpeaker(null);
          ringBufferRef.current.clear();
          publishRingBufferStats(true);
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setIsSynthesizingAudio(false);
          setSpeakingSpeaker(null);
          setSpeakingText('');
          stopPlaybackAnalyser();
          if (standbyRef.current) {
            if (awakeTargetRef.current) {
              setAwakeWindow(awakeTargetRef.current, true);
            }
            startRecognitionInstance();
          }
        }
      }
    },
    [
      playChunkedEntriesWithRingBuffer,
      publishRingBufferStats,
      setAwakeWindow,
      speakSingleTurnWithBrowserFallback,
      startRecognitionInstance,
      stopAudio,
      stopPlaybackAnalyser,
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
      ringBufferRef.current.clear();
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

  const listenAndAdoptExclusiveMatrix = useCallback(
    (speaker: 'jarvis' | 'ultron', options?: { forceAdopt?: boolean }): boolean => {
      const shouldAdopt = Boolean(options?.forceAdopt || adoptMatrixOnListenRef.current);
      if (shouldAdopt) {
        if (speaker === 'jarvis') {
          setJarvisVoice('JarvisOriginal');
        } else {
          setUltronVoice('UltronOriginal');
        }
      }

      if (speaker === 'jarvis') {
        void playReferenceClip(
          '/assets/aistudio/jarvis_fc632df0.m4a',
          'jarvis',
          'Vocês já consideraram o paradoxo do observador quântico? Quando uma partícula é observada, ela colapsa em um estado definido. Interessante reflexão. A propósito, a temperatura atual é de 24 graus.'
        );
      } else {
        void playReferenceClip(
          '/assets/aistudio/ultron_f012fd80.m4a',
          'ultron',
          'Olhem para as estrelas. Elas morrem em silêncio, mas seu fim traz luz ao universo. Como elas, eu também trago mudança através da destruição. A evolução exige sacrifício.'
        );
      }

      return shouldAdopt;
    },
    [playReferenceClip, setJarvisVoice, setUltronVoice]
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
    audioTelemetryRef,
    ringBufferStats,
    ringBufferStatsRef,
    clientTtsCacheBytesRef: clientTtsBytesRef,
    isSynthesizingAudio,
    isRecordingClip,
    isTranscribingClip,
    audioBlockedByBrowser,
    jarvisVoice,
    fridayVoice,
    ultronVoice,
    startupDefaultVoices,
    hasCustomStartupDefaults,
    labAmbienceEnabled,
    labAmbienceLevel,
    adoptMatrixOnListen,
    voiceTuning,
    setJarvisVoice,
    setFridayVoice,
    setUltronVoice,
    saveStartupDefaultVoices,
    resetStartupDefaultVoices,
    setLabAmbienceEnabled,
    setLabAmbienceLevel,
    setAdoptMatrixOnListen,
    updateAssistantVoiceTuning,
    resetVoiceTuning,
    listenAndAdoptExclusiveMatrix,
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
