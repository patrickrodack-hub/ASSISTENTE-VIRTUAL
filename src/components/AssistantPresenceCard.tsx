import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Bot,
  Cpu,
  Crosshair,
  Radar,
  Shield,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { AssistantId, InteractionMode } from '../types/assistant';

interface AssistantPresenceCardProps {
  id: AssistantId;
  name: string;
  subtitle: string;
  specialtyLine: string;
  imageSrc: string;
  isSelected: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  anyAssistantThinking?: boolean;
  thinkingTask?: string;
  isAwake: boolean;
  audioBands?: number[];
  onSelect: (mode: InteractionMode) => void;
}

const PROCESSING_STAGES: Record<AssistantId, [string, string, string]> = {
  jarvis: ['Contexto', 'Arquitetura', 'Síntese'],
  'sexta-feira': ['Leitura', 'Tática Ágil', 'Ação'],
  ultron: ['Varredura', 'Vetores de Falha', 'Previsão'],
};

const ENGINE_TITLES: Record<AssistantId, string> = {
  jarvis: 'Matriz Analítica & Blindagem',
  'sexta-feira': 'Motor Tático de Execução Ágil',
  ultron: 'Núcleo Preditivo & Diagnóstico',
};

export function AssistantPresenceCard({
  id,
  name,
  subtitle,
  specialtyLine,
  imageSrc,
  isSelected,
  isSpeaking,
  isThinking,
  anyAssistantThinking = false,
  thinkingTask,
  isAwake,
  audioBands,
  onSelect,
}: AssistantPresenceCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [elapsedTenths, setElapsedTenths] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!isThinking) {
      setElapsedTenths(0);
      setStageIndex(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      const diffMs = Date.now() - started;
      const tenths = Math.floor(diffMs / 100);
      setElapsedTenths(tenths);
      setStageIndex(Math.min(2, Math.floor(diffMs / 950)));
    }, 100);
    return () => window.clearInterval(timer);
  }, [isThinking]);

  const isJarvis = id === 'jarvis';
  const isUltron = id === 'ultron';

  const ringColor = isJarvis
    ? 'border-amber-500/75 dark:border-amber-400/70'
    : isUltron
    ? 'border-red-500/80 dark:border-red-500/75'
    : 'border-sky-500/75 dark:border-sky-400/70';

  const cardSurface = isThinking
    ? isJarvis
      ? 'border-amber-500/85 bg-amber-50/90 dark:border-amber-400/80 dark:bg-amber-950/25 shadow-[0_0_26px_rgba(245,158,11,0.16)]'
      : isUltron
      ? 'border-red-500/85 bg-red-50/90 dark:border-red-500/80 dark:bg-red-950/30 shadow-[0_0_26px_rgba(239,68,68,0.2)]'
      : 'border-sky-500/85 bg-sky-50/90 dark:border-sky-400/80 dark:bg-sky-950/25 shadow-[0_0_26px_rgba(56,189,248,0.16)]'
    : isSelected
    ? isJarvis
      ? 'border-amber-500/70 bg-amber-50/70 dark:border-amber-500/60 dark:bg-slate-900/90'
      : isUltron
      ? 'border-red-500/70 bg-red-50/70 dark:border-red-500/65 dark:bg-red-950/20'
      : 'border-sky-500/70 bg-sky-50/70 dark:border-sky-500/60 dark:bg-slate-900/90'
    : 'border-slate-200/90 bg-white/90 hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900/60 dark:hover:border-slate-700';

  const standbyDim =
    anyAssistantThinking && !isThinking && !isSpeaking ? 'opacity-65' : 'opacity-100';

  const accentText = isJarvis
    ? 'text-amber-700 dark:text-amber-300'
    : isUltron
    ? 'text-red-600 dark:text-red-400'
    : 'text-sky-700 dark:text-sky-300';

  const barColor = isJarvis
    ? 'bg-amber-500 dark:bg-amber-400'
    : isUltron
    ? 'bg-red-500'
    : 'bg-sky-500 dark:bg-sky-400';

  const focusRing = isJarvis
    ? 'focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400'
    : isUltron
    ? 'focus-visible:ring-red-500'
    : 'focus-visible:ring-sky-500 dark:focus-visible:ring-sky-400';

  const stages = PROCESSING_STAGES[id];
  const elapsedFormatted = `${(elapsedTenths / 10).toFixed(1)}s`;

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-busy={isThinking}
      className={`group relative w-full overflow-hidden text-left rounded-xl border p-4 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 ${focusRing} ${cardSurface} ${standbyDim}`}
    >
      {/* Top Optical Sweep Bar when this specific assistant is processing */}
      {isThinking && (
        <motion.div
          aria-hidden="true"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 1.15, repeat: Infinity, ease: 'linear' }}
          className={`pointer-events-none absolute top-0 inset-x-0 h-0.5 ${
            isJarvis
              ? 'bg-gradient-to-r from-transparent via-amber-400 to-transparent'
              : isUltron
              ? 'bg-gradient-to-r from-transparent via-red-500 to-transparent'
              : 'bg-gradient-to-r from-transparent via-sky-400 to-transparent'
          }`}
        />
      )}

      <div className="flex items-start gap-3.5">
        {/* Avatar & Custom Per-Assistant Optical Processing Rings */}
        <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 mt-0.5">
          {/* Outer Ring */}
          <div
            className={`absolute -inset-1.5 rounded-full border border-dashed transition-opacity duration-300 ${ringColor} ${
              isThinking || isSpeaking || isAwake
                ? 'opacity-100 animate-optical-slow'
                : 'opacity-30 group-hover:opacity-65'
            }`}
          />

          {/* Inner Counter-Rotating Ring */}
          <div
            className={`absolute -inset-0.5 rounded-full border transition-opacity duration-300 ${ringColor} ${
              isThinking || isSpeaking
                ? 'opacity-95 animate-optical-reverse'
                : 'opacity-25'
            }`}
          />

          {/* Custom Persona Processing Overlay Ring when isThinking */}
          {isThinking && (
            <motion.div
              aria-hidden="true"
              animate={{
                scale: [1, 1.08, 1],
                opacity: [0.45, 0.9, 0.45],
              }}
              transition={{
                duration: isUltron ? 0.9 : isJarvis ? 1.4 : 1.1,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className={`pointer-events-none absolute -inset-2 rounded-full border-2 ${
                isJarvis
                  ? 'border-amber-400/60 shadow-[0_0_16px_rgba(251,191,36,0.45)]'
                  : isUltron
                  ? 'border-red-500/70 shadow-[0_0_18px_rgba(239,68,68,0.55)]'
                  : 'border-sky-400/60 shadow-[0_0_16px_rgba(56,189,248,0.45)]'
              }`}
            />
          )}

          <div className="relative h-full w-full overflow-hidden rounded-full border border-slate-300 dark:border-slate-700/80 bg-slate-900 dark:bg-slate-950">
            {!imgFailed ? (
              <img
                src={imageSrc}
                alt={`Núcleo visual de ${name}`}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className={`h-full w-full object-cover transition-transform duration-300 ${
                  isSpeaking || isThinking ? 'scale-105' : 'scale-100'
                }`}
              />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center ${
                  isJarvis
                    ? 'bg-gradient-to-br from-amber-950 via-slate-900 to-slate-950 text-amber-300'
                    : isUltron
                    ? 'bg-gradient-to-br from-red-950 via-slate-900 to-slate-950 text-red-400'
                    : 'bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950 text-sky-300'
                }`}
              >
                {isJarvis ? (
                  <Shield className="h-7 w-7" />
                ) : isUltron ? (
                  <Bot className="h-7 w-7" />
                ) : (
                  <Cpu className="h-7 w-7" />
                )}
              </div>
            )}

            {/* Subtle Holographic Core Tint during Active Reasoning */}
            {isThinking && (
              <div
                aria-hidden="true"
                className={`absolute inset-0 ${
                  isJarvis
                    ? 'bg-amber-500/15'
                    : isUltron
                    ? 'bg-red-600/20'
                    : 'bg-sky-500/15'
                } animate-pulse`}
              />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50 truncate">
              {name}
            </h2>
            {isSpeaking ? (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 ${accentText}`}
              >
                <Volume2 className="h-3.5 w-3.5 shrink-0" />
                <span>Falando</span>
              </span>
            ) : isThinking ? (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 ${accentText}`}
              >
                {isJarvis ? (
                  <Radar className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : isUltron ? (
                  <Crosshair className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                )}
                <span>Em processamento</span>
              </span>
            ) : isAwake ? (
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${accentText}`}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>Ouvindo você</span>
              </span>
            ) : anyAssistantThinking ? (
              <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                Em espera
              </span>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                {isSelected ? 'Alvo ativo' : 'Em prontidão'}
              </span>
            )}
          </div>

          <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300 leading-snug">
            {subtitle}
          </p>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {specialtyLine}
          </p>

          {/* Speaking Audio Equalizer */}
          {isSpeaking && (
            <div className="mt-2.5 flex items-end gap-1 h-4" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, idx) => {
                const level = audioBands?.[idx] ?? 0.45;
                const px = Math.max(3, Math.round(level * 16));
                return (
                  <span
                    key={idx}
                    className={`w-1 rounded-full ${barColor} transition-all duration-75`}
                    style={{
                      height: `${px}px`,
                      opacity: 0.5 + level * 0.5,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Custom Per-Assistant "Em Processamento" Telemetry Strip */}
      <AnimatePresence initial={false}>
        {isThinking && (
          <motion.div
            key={`thinking-${id}`}
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div
              className={`rounded-lg border px-3 py-2.5 space-y-2 ${
                isJarvis
                  ? 'border-amber-500/35 bg-amber-500/10 dark:border-amber-400/30 dark:bg-slate-950/80'
                  : isUltron
                  ? 'border-red-500/40 bg-red-500/10 dark:border-red-500/35 dark:bg-slate-950/85'
                  : 'border-sky-500/35 bg-sky-500/10 dark:border-sky-400/30 dark:bg-slate-950/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className={`font-semibold tracking-tight ${accentText}`}>
                  {ENGINE_TITLES[id]}
                </span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {elapsedFormatted}
                </span>
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">
                {thinkingTask ||
                  (isJarvis
                    ? 'Processando matriz de arquitetura e blindagem técnica...'
                    : isUltron
                    ? 'Calculando diagnóstico preditivo e vetores de falha...'
                    : 'Executando análise tática de resposta rápida...')}
              </p>

              {/* 3-Stage Reasoning Pipeline + Persona Frequency Pulse */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {stages.map((label, idx) => {
                    const isCurrent = idx === stageIndex;
                    const isDone = idx < stageIndex;
                    return (
                      <span
                        key={label}
                        className={`text-[10px] font-mono transition-colors ${
                          isCurrent
                            ? `${accentText} font-semibold underline underline-offset-4`
                            : isDone
                            ? 'text-slate-600 dark:text-slate-300'
                            : 'text-slate-400 dark:text-slate-600'
                        }`}
                      >
                        {idx > 0 ? `· ${label}` : label}
                      </span>
                    );
                  })}
                </div>

                {/* Custom Persona Animated Pulse Bars */}
                <div className="flex items-end gap-0.5 h-3.5 shrink-0" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <motion.span
                      key={idx}
                      animate={
                        isJarvis
                          ? { height: ['4px', '13px', '6px', '11px', '4px'] }
                          : isUltron
                          ? { height: ['3px', '14px', '3px', '12px', '3px'] }
                          : { height: ['5px', '12px', '8px', '14px', '5px'] }
                      }
                      transition={{
                        duration: isUltron ? 0.65 : isJarvis ? 1.05 : 0.8,
                        repeat: Infinity,
                        delay: idx * 0.09,
                        ease: 'easeInOut',
                      }}
                      className={`w-1 rounded-full ${barColor}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
