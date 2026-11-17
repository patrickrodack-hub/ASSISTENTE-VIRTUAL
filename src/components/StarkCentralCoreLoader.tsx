import { motion } from 'motion/react';
import { Cpu, Radio, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import type { AssistantId } from '../types/assistant';

interface StarkCentralCoreLoaderProps {
  variant: 'workspace' | 'processing';
  activeAssistants?: AssistantId[];
  processingTasks?: Record<AssistantId, string>;
  statusLabel?: string;
}

const ASSISTANT_META: Record<
  AssistantId,
  {
    name: string;
    freq: string;
    role: string;
    accentText: string;
    accentBorder: string;
    accentBg: string;
    dotClass: string;
  }
> = {
  jarvis: {
    name: 'J.A.R.V.I.S.',
    freq: '104.8 Hz',
    role: 'Arquitetura & Estratégia',
    accentText: 'text-amber-700 dark:text-amber-300',
    accentBorder: 'border-amber-500/45 dark:border-amber-400/40',
    accentBg: 'bg-amber-500/10 dark:bg-amber-950/30',
    dotClass: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]',
  },
  'sexta-feira': {
    name: 'SEXTA-FEIRA',
    freq: '210.4 Hz',
    role: 'Rotina, Clima RJ & Execução',
    accentText: 'text-sky-700 dark:text-cyan-300',
    accentBorder: 'border-sky-500/45 dark:border-cyan-400/40',
    accentBg: 'bg-sky-500/10 dark:bg-cyan-950/30',
    dotClass: 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]',
  },
  ultron: {
    name: 'ULTRON',
    freq: '93.0 Hz',
    role: 'Diagnóstico Preditivo & Riscos',
    accentText: 'text-red-700 dark:text-red-400',
    accentBorder: 'border-red-500/45 dark:border-red-500/40',
    accentBg: 'bg-red-500/10 dark:bg-red-950/30',
    dotClass: 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]',
  },
};

export function StarkCentralCoreLoader({
  variant,
  activeAssistants = ['jarvis', 'sexta-feira', 'ultron'],
  processingTasks,
  statusLabel,
}: StarkCentralCoreLoaderProps) {
  const effectiveAssistants: AssistantId[] =
    activeAssistants.length > 0
      ? activeAssistants
      : ['jarvis', 'sexta-feira', 'ultron'];

  if (variant === 'workspace') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="relative overflow-hidden rounded-2xl rodack-holo-panel border border-cyan-400/35 bg-[#040E1A]/90 p-6 sm:p-10 text-cyan-50 shadow-[0_0_50px_rgba(6,182,212,0.2)]"
      >
        {/* Corner Stark HUD Brackets */}
        <span className="pointer-events-none absolute top-3 left-3 h-5 w-5 border-t-2 border-l-2 border-cyan-400/80" />
        <span className="pointer-events-none absolute top-3 right-3 h-5 w-5 border-t-2 border-r-2 border-cyan-400/80" />
        <span className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-cyan-400/80" />
        <span className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-cyan-400/80" />

        {/* Horizontal Optical Laser Scanline */}
        <motion.div
          aria-hidden="true"
          animate={{ y: ['0%', '420%', '0%'] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'linear' }}
          className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-cyan-400/15 via-cyan-300/5 to-transparent"
        />

        <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto space-y-6">
          {/* Top Stark Industries / Rodack Header Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-3.5 py-1 text-[11px] font-mono uppercase tracking-widest text-cyan-200">
            <Cpu className="h-3.5 w-3.5 text-cyan-300 animate-pulse" />
            <span>INDÚSTRIAS STARK · NÚCLEO DE PROCESSAMENTO CENTRALIZADO</span>
          </div>

          {/* Centralized Arc Reactor Multi-Ring SVG */}
          <div className="relative flex h-44 w-44 sm:h-52 sm:w-52 items-center justify-center">
            {/* Outer Glow */}
            <div className="absolute inset-2 rounded-full bg-cyan-400/15 blur-2xl animate-pulse" />

            {/* Outer Segmented Ring */}
            <svg
              viewBox="0 0 220 220"
              className="absolute inset-0 h-full w-full text-cyan-400/85 animate-optical-slow"
            >
              <circle
                cx="110"
                cy="110"
                r="102"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="24 8 4 8"
              />
              <circle
                cx="110"
                cy="110"
                r="92"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="16 20"
                opacity="0.7"
              />
              <polygon
                points="110,18 190,64 190,156 110,202 30,156 30,64"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.45"
              />
            </svg>

            {/* Counter-Rotating Inner Synaptic Ring */}
            <svg
              viewBox="0 0 220 220"
              className="absolute inset-0 h-full w-full text-sky-300/90 animate-optical-reverse"
            >
              <circle
                cx="110"
                cy="110"
                r="74"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="36 12"
              />
              <circle
                cx="110"
                cy="110"
                r="58"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.5"
                strokeDasharray="8 10"
                opacity="0.75"
              />
              <polygon
                points="110,44 167,77 167,143 110,176 53,143 53,77"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="10 6"
              />
            </svg>

            {/* Central Arc Core */}
            <motion.div
              animate={{ scale: [0.96, 1.05, 0.96] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full border-2 border-cyan-300/80 bg-gradient-to-b from-cyan-400/30 via-cyan-950/90 to-[#030A14] shadow-[0_0_32px_rgba(34,211,238,0.65)]"
            >
              <Zap className="h-6 w-6 text-cyan-200" />
              <span className="mt-1 font-mono text-[10px] font-bold tracking-widest text-white">
                STARK OS
              </span>
              <span className="font-mono text-[9px] text-cyan-300">ONLINE</span>
            </motion.div>
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-lg sm:text-xl font-bold tracking-wide text-white">
              {statusLabel ||
                'Sincronizando Matriz Neural Centralizada · RODACK SISTEMA DE IA'}
            </h2>
            <p className="text-xs sm:text-sm text-cyan-200/80 max-w-xl mx-auto leading-relaxed">
              Carregando banco de memória contínua, dossiê soberano de{' '}
              <strong className="text-white">Patrick Pessoa</strong>, agenda ativa e
              telemetria do Rio de Janeiro.
            </p>
          </div>

          {/* 3 AI Core Synchronization Bars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full pt-2">
            {(['jarvis', 'sexta-feira', 'ultron'] as const).map((id, idx) => {
              const meta = ASSISTANT_META[id];
              return (
                <div
                  key={id}
                  className={`rounded-xl border ${meta.accentBorder} ${meta.accentBg} p-3 text-left space-y-2`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-bold text-white flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${meta.dotClass} animate-ping`} />
                      {meta.name}
                    </span>
                    <span className="font-mono text-[10px] text-cyan-200/90">
                      {meta.freq}
                    </span>
                  </div>
                  <p className="text-[11px] text-cyan-100/75 truncate">{meta.role}</p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-900/90">
                    <motion.div
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      transition={{
                        duration: 1.5 + idx * 0.25,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      className="h-full w-2/3 rounded-full bg-gradient-to-r from-transparent via-cyan-300 to-amber-300"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // variant === 'processing' (Used inside DialogueStream during live AI reasoning & streaming initialization)
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="relative overflow-hidden rounded-2xl border border-cyan-500/40 dark:border-cyan-400/35 bg-gradient-to-br from-slate-900 via-[#051322] to-[#030A14] p-4 sm:p-5 text-cyan-50 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
    >
      {/* Corner HUD Brackets */}
      <span className="pointer-events-none absolute top-2 left-2 h-3.5 w-3.5 border-t-2 border-l-2 border-cyan-400/80" />
      <span className="pointer-events-none absolute top-2 right-2 h-3.5 w-3.5 border-t-2 border-r-2 border-cyan-400/80" />
      <span className="pointer-events-none absolute bottom-2 left-2 h-3.5 w-3.5 border-b-2 border-l-2 border-cyan-400/80" />
      <span className="pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 border-b-2 border-r-2 border-cyan-400/80" />

      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
        {/* Compact Centralized Stark Arc Reactor Spinner */}
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
          <div className="absolute inset-1 rounded-full bg-cyan-400/20 blur-md animate-pulse" />
          <svg
            viewBox="0 0 120 120"
            className="absolute inset-0 h-full w-full text-cyan-400 animate-optical-slow"
          >
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="16 6 4 6"
            />
            <polygon
              points="60,12 102,36 102,84 60,108 18,84 18,36"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              opacity="0.6"
            />
          </svg>
          <svg
            viewBox="0 0 120 120"
            className="absolute inset-0 h-full w-full text-amber-400/90 animate-optical-reverse"
          >
            <circle
              cx="60"
              cy="60"
              r="39"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="22 10"
            />
          </svg>
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/80 bg-cyan-950/90 shadow-[0_0_16px_rgba(34,211,238,0.65)]">
            <Sparkles className="h-4 w-4 text-cyan-200 animate-pulse" />
          </div>
        </div>

        {/* Centralized Telemetry & Active Assistant Nodes */}
        <div className="flex-1 min-w-0 w-full space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan-200">
                <Radio className="h-3 w-3 text-cyan-300 animate-pulse" />
                <span>PROCESSAMENTO CENTRALIZADO STARK</span>
              </span>
              <span className="font-mono text-[11px] text-cyan-300/85 hidden sm:inline">
                {effectiveAssistants.length === 3
                  ? 'CONSELHO TRIPLO ATIVO'
                  : effectiveAssistants.length === 2
                  ? 'CONSELHO DUPLO ATIVO'
                  : `NÚCLEO ${ASSISTANT_META[effectiveAssistants[0]].name}`}
              </span>
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>STREAMING NEURAL</span>
            </span>
          </div>

          <p className="text-xs font-medium text-white">
            {statusLabel ||
              'Cruzando memória contextual de Patrick Pessoa, radar em tempo real e síntese de voz...'}
          </p>

          {/* Individual Assistant Reasoning Bars */}
          <div className="grid grid-cols-1 gap-1.5 pt-0.5">
            {effectiveAssistants.map((id, idx) => {
              const meta = ASSISTANT_META[id];
              const taskText =
                processingTasks?.[id] ||
                `Sincronizando núcleo ${meta.name} (${meta.freq})...`;
              return (
                <div
                  key={id}
                  className="rounded-lg border border-cyan-500/25 bg-[#030B14]/85 px-3 py-1.5 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-display font-semibold text-cyan-100 flex items-center gap-1.5 shrink-0">
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
                      <span>{meta.name}</span>
                      <span className="font-mono text-[10px] text-cyan-400/80">
                        ({meta.freq})
                      </span>
                    </span>
                    <span className="text-cyan-200/80 truncate text-right">
                      {taskText}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-slate-900">
                    <motion.div
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      transition={{
                        duration: 1.25 + idx * 0.2,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      className="h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-cyan-400 to-amber-400"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
