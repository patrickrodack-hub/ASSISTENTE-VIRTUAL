import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Play,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import type { AudioTelemetryBuffer } from '../hooks/useVoiceEngine';
import type { AssistantId, InteractionMode } from '../types/assistant';
import {
  ASSISTANT_AVATAR_URLS,
  ASSISTANT_VISUAL_PROFILES,
} from '../utils/assistantAssets';
import { Hologram3DStage } from './Hologram3DStage';

interface SpeakingHologramOverlayProps {
  isProcessing: boolean;
  isSynthesizingAudio: boolean;
  isSpeaking: boolean;
  speakingSpeaker: AssistantId | 'ambos' | 'todos' | null;
  targetMode: InteractionMode;
  processingAssistants?: AssistantId[];
  processingTasks?: Record<AssistantId, string>;
  speakingText: string | null;
  liveStreamingText?: string | null;
  liveStreamingSpeaker?: AssistantId | null;
  audioAmplitude: number;
  audioBands?: number[];
  audioTelemetryRef?: MutableRefObject<AudioTelemetryBuffer>;
  manualSpeaker?: AssistantId | null;
  onSelectManualSpeaker?: (speaker: AssistantId | null) => void;
  onTestSpeak?: (speaker: AssistantId) => void;
  onStopAudio: () => void;
}

const ALL_ASSISTANTS: AssistantId[] = ['jarvis', 'sexta-feira', 'ultron'];

function resolveActiveSpeaker(
  speakingSpeaker: AssistantId | 'ambos' | 'todos' | null,
  liveStreamingSpeaker: AssistantId | null | undefined,
  processingAssistants: AssistantId[] | undefined,
  targetMode: InteractionMode,
  manualSpeaker: AssistantId | null | undefined
): AssistantId {
  if (
    speakingSpeaker === 'jarvis' ||
    speakingSpeaker === 'sexta-feira' ||
    speakingSpeaker === 'ultron'
  ) {
    return speakingSpeaker;
  }
  if (liveStreamingSpeaker) {
    return liveStreamingSpeaker;
  }
  if (manualSpeaker) {
    return manualSpeaker;
  }
  if (processingAssistants && processingAssistants.length > 0) {
    return processingAssistants[0];
  }
  if (
    targetMode === 'jarvis' ||
    targetMode === 'sexta-feira' ||
    targetMode === 'ultron'
  ) {
    return targetMode;
  }
  return 'jarvis';
}

function cleanNarrativeForDisplay(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/[#_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function SpeakingHologramOverlay({
  isProcessing,
  isSynthesizingAudio,
  isSpeaking,
  speakingSpeaker,
  targetMode,
  processingAssistants,
  processingTasks,
  speakingText,
  liveStreamingText,
  liveStreamingSpeaker,
  audioAmplitude,
  audioBands,
  audioTelemetryRef,
  manualSpeaker,
  onSelectManualSpeaker,
  onTestSpeak,
  onStopAudio,
}: SpeakingHologramOverlayProps) {
  const isAutoActive = isProcessing || isSynthesizingAudio || isSpeaking;
  const isVisible = isAutoActive || Boolean(manualSpeaker);

  const [isMinimized, setIsMinimized] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [manualOverride, setManualOverride] = useState<AssistantId | null>(null);
  const wasAutoActiveRef = useRef(false);

  // Auto-expand whenever a new AI communication cycle begins
  useEffect(() => {
    if (isAutoActive && !wasAutoActiveRef.current) {
      setIsMinimized(false);
      setManualOverride(null);
    }
    wasAutoActiveRef.current = isAutoActive;
  }, [isAutoActive]);

  // Auto-expand when user explicitly clicks to project a hologram in 3D
  useEffect(() => {
    if (manualSpeaker) {
      setIsMinimized(false);
      setManualOverride(null);
    }
  }, [manualSpeaker]);

  // Clear temporary switcher override when an actual speaker begins speaking
  useEffect(() => {
    if (
      speakingSpeaker === 'jarvis' ||
      speakingSpeaker === 'sexta-feira' ||
      speakingSpeaker === 'ultron'
    ) {
      setManualOverride(null);
    }
  }, [speakingSpeaker]);

  const autoSpeaker = resolveActiveSpeaker(
    speakingSpeaker,
    liveStreamingSpeaker,
    processingAssistants,
    targetMode,
    manualSpeaker
  );

  const activeSpeaker: AssistantId =
    isSpeaking &&
    (speakingSpeaker === 'jarvis' ||
      speakingSpeaker === 'sexta-feira' ||
      speakingSpeaker === 'ultron')
      ? speakingSpeaker
      : manualOverride ?? autoSpeaker;

  const profile = ASSISTANT_VISUAL_PROFILES[activeSpeaker];
  const isThinkingState = (isProcessing || isSynthesizingAudio) && !isSpeaking;

  const narrativeText = useMemo(() => {
    if (isSpeaking && speakingText) {
      return cleanNarrativeForDisplay(speakingText);
    }
    if (liveStreamingText) {
      return cleanNarrativeForDisplay(liveStreamingText);
    }
    if (isProcessing || isSynthesizingAudio) {
      return (
        processingTasks?.[activeSpeaker] ||
        `Processando análise neural em tempo real com ${profile.name}...`
      );
    }
    return profile.sampleGreeting;
  }, [
    isSpeaking,
    speakingText,
    liveStreamingText,
    isProcessing,
    isSynthesizingAudio,
    processingTasks,
    activeSpeaker,
    profile.name,
    profile.sampleGreeting,
  ]);

  const words = useMemo(
    () => narrativeText.split(/\s+/).filter(Boolean),
    [narrativeText]
  );

  // Throttled narrative word cursor & emphasis (12.5 Hz max React commits — eliminates 60fps React thrash)
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [narrativeEmphasis, setNarrativeEmphasis] = useState(0);
  const ampRef = useRef(audioAmplitude);
  ampRef.current = audioAmplitude;

  useEffect(() => {
    setActiveWordIndex(0);
  }, [narrativeText, activeSpeaker, isSpeaking]);

  useEffect(() => {
    if (!isVisible || words.length === 0) {
      setNarrativeEmphasis(0);
      return;
    }

    if (!isSpeaking) {
      if (liveStreamingText) {
        setActiveWordIndex(Math.max(0, words.length - 1));
      }
      if (!isThinkingState) {
        setNarrativeEmphasis(0.06);
        return;
      }
      // Lightweight 8 Hz thinking pulse (zero 60fps React re-render loop)
      const timer = window.setInterval(() => {
        setNarrativeEmphasis(0.24 + Math.sin(performance.now() * 0.005) * 0.14);
      }, 125);
      return () => window.clearInterval(timer);
    }

    // Speaking mode: advance word index smoothly with 80ms React commit pacing
    let cursorFloat = 0;
    let lastCommittedIdx = -1;
    let lastTs = performance.now();

    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - lastTs) / 1000, 0.15);
      lastTs = now;

      const directAmp = audioTelemetryRef?.current?.active
        ? audioTelemetryRef.current.amplitude
        : ampRef.current;

      const speechSpeed = directAmp > 0.04 ? 2.55 + directAmp * 1.45 : 1.75;
      cursorFloat = Math.min(words.length - 1, cursorFloat + dt * speechSpeed);
      const idx = Math.floor(cursorFloat);
      if (idx !== lastCommittedIdx) {
        lastCommittedIdx = idx;
        setActiveWordIndex(idx);
      }

      const currentWord = words[idx] || '';
      const hasPunctuationPeak = /[!?]/.test(currentWord);
      const isEmphaticWord =
        currentWord.length >= 7 || /^[A-ZÁÉÍÓÚÂÊÔÃÕ]{2,}/.test(currentWord);
      const textBoost = hasPunctuationPeak
        ? 0.55
        : isEmphaticWord
        ? 0.28
        : 0.1;

      setNarrativeEmphasis(
        Math.min(1, directAmp * 0.95 + textBoost * (0.45 + directAmp))
      );
    }, 80);

    return () => window.clearInterval(timer);
  }, [isVisible, isSpeaking, isThinkingState, liveStreamingText, words, audioTelemetryRef]);

  // Escape key cleanly minimizes during speech or closes manual 3D projection
  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAutoActive) {
          setIsMinimized(true);
        } else {
          onSelectManualSpeaker?.(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVisible, isAutoActive, onSelectManualSpeaker]);

  const subtitleSlice = useMemo(() => {
    if (words.length <= 28) {
      return { start: 0, items: words };
    }
    const windowSize = 26;
    const start = Math.max(
      0,
      Math.min(words.length - windowSize, activeWordIndex - 8)
    );
    return {
      start,
      items: words.slice(start, start + windowSize),
    };
  }, [words, activeWordIndex]);

  const narrativeProgress =
    words.length > 1 ? activeWordIndex / (words.length - 1) : 0;

  const phaseLabel = isSpeaking
    ? 'Em Comunicação Direta'
    : isSynthesizingAudio
    ? 'Sincronizando Voz Exclusiva'
    : isProcessing
    ? 'Processando Resposta Neural'
    : 'Projeção Holográfica 3D';

  const handleClose = () => {
    if (isSpeaking || isSynthesizingAudio) {
      onStopAudio();
    }
    if (isProcessing) {
      setIsMinimized(true);
    } else {
      onSelectManualSpeaker?.(null);
    }
  };

  const handleSwitchEntity = (nextId: AssistantId) => {
    setManualOverride(nextId);
    if (manualSpeaker) {
      onSelectManualSpeaker?.(nextId);
    }
  };

  const renderBars = useMemo(() => {
    const count = 24;
    return Array.from({ length: count }, (_, idx) => {
      const band =
        audioBands && audioBands.length > idx
          ? audioBands[idx]
          : isSpeaking
          ? Math.max(0.14, audioAmplitude * (0.65 + ((idx * 17) % 10) / 20))
          : isThinkingState
          ? 0.22 + ((idx * 13) % 10) / 35
          : 0.08;
      return Math.max(0.08, Math.min(1, band));
    });
  }, [audioBands, isSpeaking, isThinkingState, audioAmplitude]);

  // Dynamic CSS 3D + Framer Motion reactive transform values driven by voice energy
  const reactiveScale = 1 + audioAmplitude * 0.09 + narrativeEmphasis * 0.05;
  const reactiveTiltX = isSpeaking ? (narrativeEmphasis - 0.3) * 10 : 0;
  const reactiveTiltY = isSpeaking ? Math.sin(narrativeProgress * Math.PI * 5) * 10 : 0;

  return (
    <AnimatePresence>
      {isVisible && (
        isMinimized ? (
          /* Compact Floating 3D Corner Mini-Hologram when minimized */
          <motion.div
            key="hologram-mini"
            initial={{ opacity: 0, y: 24, scale: 0.9, rotateX: 16 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              rotateX: 0,
            }}
            exit={{ opacity: 0, y: 20, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            style={{
              perspective: 900,
              boxShadow: `0 14px 44px rgba(0,0,0,0.65), 0 0 ${Math.round(24 + audioAmplitude * 32)}px ${profile.primaryHex}38`,
            }}
            className={`fixed bottom-20 md:bottom-5 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border ${profile.borderClass} bg-[#040915]/95 p-3 text-slate-100`}
          >
            <div className="flex items-center gap-3">
              {/* 3D Reactive Framer Motion Avatar Medallion */}
              <div style={{ perspective: 700 }} className="relative h-14 w-14 shrink-0 flex items-center justify-center">
                <motion.div
                  aria-hidden="true"
                  animate={{
                    rotateZ: isSpeaking || isThinkingState ? 360 : 0,
                    scale: 1 + audioAmplitude * 0.16,
                  }}
                  transition={{
                    rotateZ: { duration: isThinkingState ? 3.5 : 8, repeat: Infinity, ease: 'linear' },
                    scale: { type: 'spring', stiffness: 280, damping: 18 },
                  }}
                  className="pointer-events-none absolute inset-0 rounded-full border border-dashed"
                  style={{ borderColor: `${profile.primaryHex}88` }}
                />
                <motion.div
                  animate={{
                    scale: reactiveScale,
                    rotateY: reactiveTiltY,
                    rotateX: reactiveTiltX,
                  }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  style={{
                    transformStyle: 'preserve-3d',
                    boxShadow: `0 0 ${Math.round(16 + audioAmplitude * 24)}px ${profile.primaryHex}77`,
                  }}
                  className={`relative h-11 w-11 rounded-full overflow-hidden border ${profile.borderClass}`}
                >
                  <img
                    src={ASSISTANT_AVATAR_URLS[activeSpeaker]}
                    alt={profile.name}
                    className="h-full w-full object-cover"
                  />
                </motion.div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold tracking-wide ${profile.textAccentClass}`}>
                    {profile.name}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">
                    {phaseLabel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 line-clamp-1 mt-0.5">
                  {narrativeText}
                </p>
                <div className="mt-1.5 flex items-end gap-0.5 h-3" aria-hidden="true">
                  {renderBars.slice(0, 16).map((v, i) => (
                    <span
                      key={i}
                      className={`flex-1 rounded-full ${profile.barClass} transition-all duration-75`}
                      style={{ height: `${Math.round(20 + v * 80)}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-800/90 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-100 transition-colors"
              >
                <Maximize2 className="h-3 w-3" />
                <span>Expandir 3D</span>
              </button>
              {(isSpeaking || isSynthesizingAudio) && (
                <button
                  type="button"
                  onClick={onStopAudio}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-950/50 hover:bg-red-900/60 px-2.5 py-1 text-[11px] font-medium text-red-200 transition-colors"
                >
                  <Square className="h-3 w-3" />
                  <span>Parar</span>
                </button>
              )}
              {!isAutoActive && (
                <button
                  type="button"
                  onClick={() => onSelectManualSpeaker?.(null)}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 p-1 text-slate-300"
                  aria-label="Fechar projeção 3D"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          /* Full-Screen Floating 3D Holographic Communication Projection */
          <motion.div
            key="hologram-fullscreen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            role="dialog"
            aria-modal="false"
            aria-label={`Comunicação holográfica 3D com ${profile.name}`}
            className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-[#020612]/84 text-slate-100"
          >
            {/* Dynamic Radial Energy Field (GPU-composited opacity, zero backdrop-blur over WebGL) */}
            <motion.div
              aria-hidden="true"
              animate={{
                opacity: 0.72 + audioAmplitude * 0.28 + narrativeEmphasis * 0.14,
                scale: 1 + audioAmplitude * 0.06,
              }}
              transition={{ type: 'spring', stiffness: 180, damping: 24 }}
              className="pointer-events-none absolute inset-0 will-change-transform"
              style={{
                background: `radial-gradient(circle at 50% 45%, ${profile.primaryHex}28 0%, ${profile.primaryHex}0A 34%, rgba(2,6,18,0.72) 76%)`,
              }}
            />

            {/* CSS 3D Perspective Orbital Reticle Ring Array synchronized to Speech & Narrative */}
            <div
              aria-hidden="true"
              style={{ perspective: 1200 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
            >
              <motion.div
                animate={{
                  rotateX: 70 + reactiveTiltX * 0.35,
                  rotateZ: isSpeaking ? 360 : 180,
                  scale: 1 + audioAmplitude * 0.1 + narrativeEmphasis * 0.05,
                }}
                transition={{
                  rotateZ: { duration: isThinkingState ? 10 : 22, repeat: Infinity, ease: 'linear' },
                  scale: { type: 'spring', stiffness: 220, damping: 22 },
                  rotateX: { type: 'spring', stiffness: 180, damping: 22 },
                }}
                style={{
                  transformStyle: 'preserve-3d',
                  borderColor: `${profile.primaryHex}38`,
                  boxShadow: `0 0 42px ${profile.primaryHex}24, inset 0 0 28px ${profile.primaryHex}1A`,
                }}
                className="w-[min(86vw,580px)] h-[min(86vw,580px)] rounded-full border will-change-transform"
              />
              <motion.div
                animate={{
                  rotateX: 62 - reactiveTiltX * 0.25,
                  rotateY: reactiveTiltY * 0.6,
                  rotateZ: isSpeaking ? -360 : -180,
                  scale: 0.92 + audioAmplitude * 0.12,
                }}
                transition={{
                  rotateZ: { duration: isThinkingState ? 7.5 : 16, repeat: Infinity, ease: 'linear' },
                  scale: { type: 'spring', stiffness: 240, damping: 20 },
                }}
                style={{
                  transformStyle: 'preserve-3d',
                  borderColor: `${profile.secondaryHex}30`,
                }}
                className="absolute w-[min(74vw,480px)] h-[min(74vw,480px)] rounded-full border border-dashed will-change-transform"
              />
            </div>

            {/* Full-Viewport Unobstructed Three.js 3D Hologram Canvas */}
            <div className="absolute inset-0">
              <Hologram3DStage
                speaker={activeSpeaker}
                isSpeaking={isSpeaking}
                isThinking={isThinkingState}
                audioAmplitude={audioAmplitude}
                audioBands={audioBands}
                audioTelemetryRef={audioTelemetryRef}
                narrativeEmphasis={narrativeEmphasis}
                narrativeProgress={narrativeProgress}
              />
            </div>

            {/* Minimal Top Identity Bar with 3D Reactive Medallion */}
            <header className="relative z-10 flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                className="pointer-events-auto flex items-center gap-3 rounded-xl border border-slate-700/70 bg-[#050C1B]/88 px-3.5 py-2 shadow-lg"
              >
                <div style={{ perspective: 600 }} className="relative h-10 w-10 shrink-0 flex items-center justify-center">
                  <motion.div
                    animate={{
                      scale: 1 + audioAmplitude * 0.14,
                      rotateY: reactiveTiltY * 0.85,
                      rotateX: reactiveTiltX * 0.6,
                    }}
                    transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                    style={{
                      transformStyle: 'preserve-3d',
                      boxShadow: `0 0 ${Math.round(12 + audioAmplitude * 20)}px ${profile.primaryHex}66`,
                    }}
                    className={`h-9 w-9 rounded-full overflow-hidden border ${profile.borderClass}`}
                  >
                    <img
                      src={ASSISTANT_AVATAR_URLS[activeSpeaker]}
                      alt={profile.name}
                      className="h-full w-full object-cover"
                    />
                  </motion.div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-sm sm:text-base font-bold tracking-wide text-white">
                      {profile.name}
                    </h2>
                    <span className={`text-[11px] font-mono ${profile.textAccentClass} hidden sm:inline`}>
                      {profile.frequencyLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate">
                    {phaseLabel} · {profile.role}
                  </p>
                </div>
              </motion.div>

              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-[#050C1B]/88 hover:bg-slate-800/90 px-3 py-2 text-xs font-medium text-slate-200 transition-colors"
                  title="Minimizar para o canto e ver o console"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Minimizar</span>
                </button>

                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-[#050C1B]/88 hover:bg-red-950/80 hover:border-red-500/50 px-3 py-2 text-xs font-medium text-slate-200 hover:text-red-100 transition-colors"
                  title={isSpeaking ? 'Silenciar voz e fechar' : 'Fechar projeção 3D'}
                >
                  {isSpeaking || isSynthesizingAudio ? (
                    <>
                      <Square className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Silenciar</span>
                    </>
                  ) : (
                    <>
                      <X className="h-4 w-4" />
                      <span className="hidden sm:inline">Fechar</span>
                    </>
                  )}
                </button>
              </div>
            </header>

            {/* Unified Bottom Communication & Narrative Dock with 3D Spring Depth */}
            <footer className="relative z-10 px-4 pb-5 sm:pb-6 flex justify-center pointer-events-none">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{
                  opacity: 1,
                  y: isSpeaking ? -narrativeEmphasis * 3 : 0,
                  scale: 1,
                }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                className={`pointer-events-auto w-full max-w-2xl rounded-2xl border ${profile.borderClass} bg-[#050C1B]/92 shadow-2xl`}
                style={{
                  boxShadow: `0 16px 48px rgba(0,0,0,0.68), 0 0 ${Math.round(30 + audioAmplitude * 28)}px ${profile.primaryHex}28`,
                }}
              >
                {/* Dock Header Strip: Entity Switcher & Collapse Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    {ALL_ASSISTANTS.map((id) => {
                      const item = ASSISTANT_VISUAL_PROFILES[id];
                      const selected = activeSpeaker === id;
                      const disabled =
                        isSpeaking &&
                        speakingSpeaker !== null &&
                        speakingSpeaker !== 'ambos' &&
                        speakingSpeaker !== 'todos' &&
                        speakingSpeaker !== id;
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSwitchEntity(id)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            selected
                              ? `border ${item.borderClass} bg-slate-900 text-white`
                              : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          <img
                            src={ASSISTANT_AVATAR_URLS[id]}
                            alt=""
                            className="h-4 w-4 rounded-full object-cover"
                          />
                          <span>{item.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    {!isAutoActive && onTestSpeak && (
                      <button
                        type="button"
                        onClick={() => onTestSpeak(activeSpeaker)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border ${profile.borderClass} bg-slate-900 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold ${profile.textAccentClass} transition-colors`}
                      >
                        <Play className="h-3 w-3" />
                        <span>Falar Agora</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDockCollapsed((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-900/90 hover:bg-slate-800 px-2 py-1 text-[11px] text-slate-300 transition-colors"
                      aria-label={dockCollapsed ? 'Mostrar narrativa' : 'Recolher legenda'}
                    >
                      {dockCollapsed ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          <span>Legenda</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          <span>Recolher</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Live Synchronized Narrative Caption + 24-Band Voice Equalizer */}
                {!dockCollapsed && (
                  <div className="px-4 py-3.5 space-y-3">
                    <div className="min-h-[3.25rem] flex items-center justify-center text-center">
                      <p className="text-sm sm:text-base leading-relaxed font-medium text-slate-200">
                        {subtitleSlice.start > 0 && (
                          <span className="text-slate-500 mr-1">…</span>
                        )}
                        {subtitleSlice.items.map((word, idx) => {
                          const globalIdx = subtitleSlice.start + idx;
                          const isCurrent = isSpeaking && globalIdx === activeWordIndex;
                          const isSpoken = isSpeaking && globalIdx < activeWordIndex;
                          return (
                            <span
                              key={`${globalIdx}-${word}`}
                              className={`inline-block mr-1.5 transition-all duration-150 ${
                                isCurrent
                                  ? `${profile.textAccentClass} font-bold scale-[1.06]`
                                  : isSpoken
                                  ? 'text-slate-100'
                                  : isSpeaking
                                  ? 'text-slate-400'
                                  : 'text-slate-200'
                              }`}
                            >
                              {word}
                            </span>
                          );
                        })}
                        {subtitleSlice.start + subtitleSlice.items.length < words.length && (
                          <span className="text-slate-500">…</span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Volume2 className={`h-4 w-4 shrink-0 ${profile.textAccentClass}`} />
                      <div
                        className="flex-1 flex items-end gap-1 h-6"
                        aria-hidden="true"
                      >
                        {renderBars.map((val, idx) => (
                          <span
                            key={idx}
                            className={`flex-1 rounded-full ${profile.barClass} transition-all duration-75`}
                            style={{
                              height: `${Math.round(14 + val * 86)}%`,
                              opacity: 0.45 + val * 0.55,
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                        {isSpeaking
                          ? `${Math.round(narrativeProgress * 100)}%`
                          : isThinkingState
                          ? '3D ATIVO'
                          : 'STANDBY'}
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            </footer>
          </motion.div>
        )
      )}
    </AnimatePresence>
  );
}
