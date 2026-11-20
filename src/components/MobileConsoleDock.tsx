import { useEffect, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  AudioWaveform,
  Check,
  CheckCircle2,
  Circle,
  Crosshair,
  FlaskConical,
  HeartPulse,
  Radar,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import type {
  AlertItem,
  AssistantId,
  DetectedEmotion,
  InteractionMode,
  TaskItem,
} from '../types/assistant';
import {
  JARVIS_VOICE_OPTIONS,
  ULTRON_VOICE_OPTIONS,
  type AssistantVoiceTuning,
  type AudioTelemetryBuffer,
  type FridayVoiceOption,
  type JarvisVoiceOption,
  type UltronVoiceOption,
  type VoiceTuningMap,
} from '../hooks/useVoiceEngine';
import { triggerHaptic } from '../utils/haptics';
import { MobileLiveWaveform } from './MobileLiveWaveform';

interface MobileConsoleDockProps {
  targetMode: InteractionMode;
  onSelectMode: (mode: InteractionMode) => void;
  isProcessing: boolean;
  processingAssistants: AssistantId[];
  processingTasks: Record<AssistantId, string>;
  isSpeaking: boolean;
  speakingSpeaker: AssistantId | 'ambos' | 'todos' | null;
  audioTelemetryRef: RefObject<AudioTelemetryBuffer>;
  isStandbyActive: boolean;
  micLevel: number;
  interimTranscript: string;
  awakeTarget: InteractionMode | null;
  currentEmotion: DetectedEmotion;
  memoriesCount: number;
  interactionsCount: number;
  jarvisAvatarUrl: string;
  fridayAvatarUrl: string;
  ultronAvatarUrl: string;
  jarvisVoice: JarvisVoiceOption;
  fridayVoice: FridayVoiceOption;
  ultronVoice: UltronVoiceOption;
  adoptMatrixOnListen: boolean;
  labAmbienceEnabled?: boolean;
  voiceTuning: VoiceTuningMap;
  onChangeJarvisVoice: (v: JarvisVoiceOption) => void;
  onChangeFridayVoice: (v: FridayVoiceOption) => void;
  onChangeUltronVoice: (v: UltronVoiceOption) => void;
  onToggleLabAmbience?: (next: boolean) => void;
  onToggleAdoptMatrixOnListen: (next: boolean) => void;
  onUpdateVoiceTuning: (speaker: AssistantId, patch: Partial<AssistantVoiceTuning>) => void;
  onApplyTunedVoice?: (speaker: AssistantId, tuning: AssistantVoiceTuning) => void;
  onResetVoiceTuning: (speaker?: AssistantId) => void;
  onTestSynthesizedVoice: (speaker: AssistantId, previewTuning?: AssistantVoiceTuning) => void;
  onPlayJarvisSample?: () => void;
  onPlayUltronSample?: () => void;
  openAlerts: AlertItem[];
  pendingTasks: TaskItem[];
  allTasks: TaskItem[];
  onToggleAlert: (alert: AlertItem) => void;
  onToggleTask: (task: TaskItem) => void;
  onOpenTasksTab: () => void;
}

export function MobileConsoleDock({
  targetMode,
  onSelectMode,
  isProcessing,
  processingAssistants,
  processingTasks,
  isSpeaking,
  speakingSpeaker,
  audioTelemetryRef,
  isStandbyActive,
  micLevel,
  interimTranscript,
  awakeTarget,
  currentEmotion,
  memoriesCount,
  interactionsCount,
  jarvisAvatarUrl,
  fridayAvatarUrl,
  ultronAvatarUrl,
  jarvisVoice,
  fridayVoice,
  ultronVoice,
  adoptMatrixOnListen,
  labAmbienceEnabled = false,
  voiceTuning,
  onChangeJarvisVoice,
  onChangeFridayVoice,
  onChangeUltronVoice,
  onToggleLabAmbience,
  onToggleAdoptMatrixOnListen,
  onUpdateVoiceTuning,
  onApplyTunedVoice,
  onResetVoiceTuning,
  onTestSynthesizedVoice,
  onPlayJarvisSample,
  onPlayUltronSample,
  openAlerts,
  pendingTasks,
  allTasks,
  onToggleAlert,
  onToggleTask,
  onOpenTasksTab,
}: MobileConsoleDockProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'vozes' | 'afinacao'>('vozes');
  const [draftTuning, setDraftTuning] = useState<VoiceTuningMap>(() => ({
    jarvis: { ...voiceTuning.jarvis },
    'sexta-feira': { ...voiceTuning['sexta-feira'] },
    ultron: { ...voiceTuning.ultron },
  }));

  useEffect(() => {
    setDraftTuning({
      jarvis: { ...voiceTuning.jarvis },
      'sexta-feira': { ...voiceTuning['sexta-feira'] },
      ultron: { ...voiceTuning.ultron },
    });
  }, [voiceTuning]);

  const updateDraftTuning = (
    speaker: AssistantId,
    patch: Partial<AssistantVoiceTuning>
  ) => {
    setDraftTuning((prev) => ({
      ...prev,
      [speaker]: { ...prev[speaker], ...patch },
    }));
  };

  const isTuningDirty = (speaker: AssistantId): boolean => {
    const a = draftTuning[speaker];
    const b = voiceTuning[speaker];
    return (
      a.pitchSemitones !== b.pitchSemitones ||
      a.speed !== b.speed ||
      a.modulation !== b.modulation
    );
  };

  const assistants: Array<{
    id: AssistantId;
    shortLabel: string;
    avatar: string;
    accentBorder: string;
    accentText: string;
    dotColor: string;
  }> = [
    {
      id: 'jarvis',
      shortLabel: 'J.A.R.V.I.S.',
      avatar: jarvisAvatarUrl,
      accentBorder: 'border-amber-500/80 bg-amber-500/10',
      accentText: 'text-amber-700 dark:text-amber-300',
      dotColor: 'bg-amber-400',
    },
    {
      id: 'sexta-feira',
      shortLabel: 'SEXTA-FEIRA',
      avatar: fridayAvatarUrl,
      accentBorder: 'border-sky-500/80 bg-sky-500/10',
      accentText: 'text-sky-700 dark:text-sky-300',
      dotColor: 'bg-sky-400',
    },
    {
      id: 'ultron',
      shortLabel: 'ULTRON',
      avatar: ultronAvatarUrl,
      accentBorder: 'border-red-500/80 bg-red-500/10',
      accentText: 'text-red-600 dark:text-red-400',
      dotColor: 'bg-red-500',
    },
  ];

  const activeThinkingId = processingAssistants[0] ?? null;

  return (
    <div className="lg:hidden space-y-2.5 mb-3">
      {/* Compact Thumb-Zone Assistant Selector Strip */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/85 p-2 shadow-xs">
        <div className="grid grid-cols-4 gap-1.5">
          {assistants.map((a) => {
            const selected = targetMode === a.id;
            const thinking = isProcessing && processingAssistants.includes(a.id);
            const speaking =
              isSpeaking &&
              (speakingSpeaker === a.id ||
                (speakingSpeaker === 'ambos' && a.id !== 'ultron') ||
                speakingSpeaker === 'todos');

            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  onSelectMode(targetMode === a.id ? 'auto' : a.id);
                }}
                className={`relative flex flex-col items-center justify-center rounded-xl border p-2 min-h-[64px] transition-all active:scale-[0.97] ${
                  thinking || speaking || selected
                    ? a.accentBorder
                    : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
                }`}
              >
                <div className="relative h-8 w-8 rounded-full overflow-hidden border border-slate-300 dark:border-slate-700">
                  <img
                    src={a.avatar}
                    alt={a.shortLabel}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  {(thinking || speaking) && (
                    <span
                      className={`absolute inset-0 rounded-full ring-2 ring-inset animate-pulse ${
                        a.id === 'jarvis'
                          ? 'ring-amber-400'
                          : a.id === 'ultron'
                          ? 'ring-red-500'
                          : 'ring-sky-400'
                      }`}
                    />
                  )}
                </div>
                <span className="mt-1 text-[10px] font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate max-w-full">
                  {a.shortLabel}
                </span>
                <span
                  className={`text-[9px] font-medium truncate max-w-full ${
                    thinking || speaking
                      ? a.accentText
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {speaking ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Volume2 className="h-2.5 w-2.5" />
                      Falando
                    </span>
                  ) : thinking ? (
                    <span className="inline-flex items-center gap-0.5">
                      {a.id === 'jarvis' ? (
                        <Radar className="h-2.5 w-2.5 animate-spin" />
                      ) : a.id === 'ultron' ? (
                        <Crosshair className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Activity className="h-2.5 w-2.5 animate-pulse" />
                      )}
                      Ativo
                    </span>
                  ) : selected ? (
                    'Focado'
                  ) : (
                    'Pronto'
                  )}
                </span>
              </button>
            );
          })}

          {/* 4th Slot: All 3 / Settings Drawer Trigger */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('toggle');
                onSelectMode(targetMode === 'todos' ? 'auto' : 'todos');
              }}
              className={`flex-1 flex items-center justify-center gap-1 rounded-xl border px-2 min-h-[30px] text-[10px] font-semibold transition-all active:scale-[0.97] ${
                targetMode === 'todos' || targetMode === 'auto'
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Users className="h-3 w-3 shrink-0" />
              <span>{targetMode === 'auto' ? 'Auto' : '3 IAs'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                setDrawerOpen(true);
              }}
              className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 min-h-[30px] text-[10px] font-semibold text-slate-800 dark:text-slate-200 active:scale-[0.97]"
            >
              <SlidersHorizontal className="h-3 w-3 shrink-0" />
              <span>Vozes</span>
            </button>
          </div>
        </div>

        {/* Dynamic Real-Time AI Speech Waveform inside MobileConsoleDock */}
        <div className="mt-2">
          <MobileLiveWaveform
            audioTelemetryRef={audioTelemetryRef}
            isSpeaking={isSpeaking}
            speakingSpeaker={speakingSpeaker}
            isProcessing={isProcessing}
            isStandbyActive={isStandbyActive}
            micLevel={micLevel}
            compact
          />
        </div>

        {/* Live Mobile "Em processamento" Banner inside Dock */}
        <AnimatePresence initial={false}>
          {isProcessing && activeThinkingId && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 dark:bg-slate-950/90 px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-amber-700 dark:text-amber-300">
                    Em processamento:{' '}
                    {processingAssistants.length === 3
                      ? 'J.A.R.V.I.S. · SEXTA-FEIRA · ULTRON'
                      : processingAssistants
                          .map((id) =>
                            id === 'jarvis'
                              ? 'J.A.R.V.I.S.'
                              : id === 'ultron'
                              ? 'ULTRON'
                              : 'SEXTA-FEIRA'
                          )
                          .join(' & ')}
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                    {processingTasks[activeThinkingId]}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Bottom Sheet Drawer for Voices, Standby Monitor, Alerts & Tasks */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-t-3xl border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 pb-8 max-h-[85vh] overflow-y-auto space-y-5 shadow-2xl"
            >
              <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />

              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                    Central Tática &amp; Calibração Mobile
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Vozes, afinação vocal, modo de operação e alertas de Patrick Pessoa
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Expanded Live Waveform inside Mobile Drawer */}
              <MobileLiveWaveform
                audioTelemetryRef={audioTelemetryRef}
                isSpeaking={isSpeaking}
                speakingSpeaker={speakingSpeaker}
                isProcessing={isProcessing}
                isStandbyActive={isStandbyActive}
                micLevel={micLevel}
                compact={false}
              />

              {/* Drawer Sub-Tabs: Vozes & Operação vs Afinação Vocal */}
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('toggle');
                    setDrawerTab('vozes');
                  }}
                  className={`min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    drawerTab === 'vozes'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-cyan-200 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Vozes &amp; Modo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('toggle');
                    setDrawerTab('afinacao');
                  }}
                  className={`min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    drawerTab === 'afinacao'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-amber-200 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <AudioWaveform className="h-3.5 w-3.5" />
                  <span>Afinação Vocal</span>
                </button>
              </div>

              {drawerTab === 'afinacao' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Tom, Velocidade e Modulação Independentes
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        onResetVoiceTuning();
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-cyan-300"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Restaurar todos</span>
                    </button>
                  </div>

                  {(
                    [
                      {
                        id: 'jarvis' as const,
                        name: 'J.A.R.V.I.S.',
                        accent: 'text-amber-700 dark:text-amber-300',
                        border: 'border-amber-500/35',
                        slider: 'accent-amber-500',
                      },
                      {
                        id: 'sexta-feira' as const,
                        name: 'SEXTA-FEIRA',
                        accent: 'text-sky-700 dark:text-cyan-300',
                        border: 'border-sky-500/35',
                        slider: 'accent-sky-500',
                      },
                      {
                        id: 'ultron' as const,
                        name: 'ULTRON',
                        accent: 'text-red-600 dark:text-red-400',
                        border: 'border-red-500/35',
                        slider: 'accent-red-500',
                      },
                    ]
                  ).map((item) => {
                    const t = draftTuning[item.id];
                    const dirty = isTuningDirty(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border ${item.border} bg-slate-50 dark:bg-slate-950/75 p-3.5 space-y-3`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`font-display text-xs font-bold ${item.accent}`}>
                              {item.name}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold border ${
                                dirty
                                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                                  : 'border-emerald-500/45 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                              }`}
                            >
                              {dirty ? 'Pendente' : 'Ativa'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('tap');
                              onResetVoiceTuning(item.id);
                            }}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-[10px] font-medium text-slate-600 dark:text-slate-300"
                          >
                            Reset
                          </button>
                        </div>

                        <div className="space-y-2.5 text-xs">
                          <div className="space-y-1">
                            <div className="flex justify-between font-mono text-[11px]">
                              <span className="text-slate-600 dark:text-slate-300">Tom (Pitch)</span>
                              <span className={item.accent}>
                                {t.pitchSemitones > 0 ? `+${t.pitchSemitones.toFixed(1)}` : t.pitchSemitones.toFixed(1)} st
                              </span>
                            </div>
                            <input
                              type="range"
                              min={-6}
                              max={6}
                              step={0.5}
                              value={t.pitchSemitones}
                              onChange={(e) =>
                                updateDraftTuning(item.id, {
                                  pitchSemitones: parseFloat(e.target.value),
                                })
                              }
                              className={`w-full ${item.slider}`}
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between font-mono text-[11px]">
                              <span className="text-slate-600 dark:text-slate-300">Velocidade</span>
                              <span className={item.accent}>{t.speed.toFixed(2)}x</span>
                            </div>
                            <input
                              type="range"
                              min={0.75}
                              max={1.35}
                              step={0.05}
                              value={t.speed}
                              onChange={(e) =>
                                updateDraftTuning(item.id, {
                                  speed: parseFloat(e.target.value),
                                })
                              }
                              className={`w-full ${item.slider}`}
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between font-mono text-[11px]">
                              <span className="text-slate-600 dark:text-slate-300">Modulação</span>
                              <span className={item.accent}>{t.modulation}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={t.modulation}
                              onChange={(e) =>
                                updateDraftTuning(item.id, {
                                  modulation: parseInt(e.target.value, 10),
                                })
                              }
                              className={`w-full ${item.slider}`}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isSpeaking}
                            onClick={() => {
                              triggerHaptic('tap');
                              onTestSynthesizedVoice(item.id, t);
                            }}
                            className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-[11px] font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-50"
                          >
                            <Sparkles className="h-3 w-3 shrink-0" />
                            <span>Testar Afinação</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('success');
                              if (onApplyTunedVoice) {
                                onApplyTunedVoice(item.id, t);
                              } else {
                                onUpdateVoiceTuning(item.id, t);
                              }
                            }}
                            className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition-all ${
                              dirty
                                ? 'border-emerald-500 bg-emerald-500 text-slate-950 shadow-xs'
                                : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                            }`}
                          >
                            <Check className="h-3 w-3 shrink-0" />
                            <span>Aplicar Voz Afinada</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
              {onToggleLabAmbience && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={labAmbienceEnabled}
                  onClick={() => {
                    triggerHaptic('toggle');
                    onToggleLabAmbience(!labAmbienceEnabled);
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    labAmbienceEnabled
                      ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-900 dark:text-cyan-200'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 text-xs font-semibold">
                    <FlaskConical className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                    <span>Ambiente de Laboratório (Reverb)</span>
                  </span>
                  <span className="font-mono text-[10px] uppercase font-bold">
                    {labAmbienceEnabled ? 'Ativo' : 'Off'}
                  </span>
                </button>
              )}

              {/* Operation Mode Grid */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Modo de Operação
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'auto', label: 'Automático (Inteligente)' },
                      { id: 'todos', label: 'Todos (3 IAs)' },
                      { id: 'ambos', label: 'Jarvis + Sexta' },
                      { id: 'jarvis', label: 'Só J.A.R.V.I.S.' },
                      { id: 'sexta-feira', label: 'Só SEXTA-FEIRA' },
                      { id: 'ultron', label: 'Só ULTRON' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('toggle');
                        onSelectMode(opt.id);
                      }}
                      className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                        targetMode === opt.id
                          ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Timbre Calibration */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Seleção de Voz dos Assistentes (Ativa na hora)
                </div>

                <label className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 px-3 py-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={adoptMatrixOnListen}
                    onChange={(e) => {
                      triggerHaptic('toggle');
                      onToggleAdoptMatrixOnListen(e.target.checked);
                    }}
                    className="h-3.5 w-3.5 rounded accent-amber-500 dark:accent-cyan-400 cursor-pointer shrink-0"
                  />
                  <span className="text-[11px] leading-snug text-slate-700 dark:text-slate-200">
                    Assumir voz ao clicar em <strong>“Ouvir Matriz Exclusiva”</strong>
                  </span>
                </label>

                <div className="space-y-2.5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor="mobile-jarvis-voice"
                        className="text-xs font-semibold text-amber-700 dark:text-amber-300 shrink-0"
                      >
                        J.A.R.V.I.S.
                      </label>
                      <select
                        id="mobile-jarvis-voice"
                        value={jarvisVoice}
                        onChange={(e) => {
                          triggerHaptic('tap');
                          onChangeJarvisVoice(e.target.value as JarvisVoiceOption);
                        }}
                        className="min-h-[40px] w-52 rounded-xl border border-amber-500/40 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      >
                        {JARVIS_VOICE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.shortLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                    {onPlayJarvisSample && (
                      <button
                        type="button"
                        onClick={onPlayJarvisSample}
                        className={`w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold active:scale-[0.98] transition-colors ${
                          jarvisVoice === 'JarvisOriginal'
                            ? 'border-amber-500/60 bg-amber-500/20 text-amber-800 dark:text-amber-100'
                            : 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200'
                        }`}
                      >
                        <Volume2 className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {adoptMatrixOnListen
                            ? 'Ouvir e Assumir Matriz Exclusiva (104.3 Hz)'
                            : 'Ouvir Matriz Exclusiva (104.3 Hz)'}
                        </span>
                        {jarvisVoice === 'JarvisOriginal' && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="mobile-friday-voice"
                      className="text-xs font-semibold text-sky-700 dark:text-sky-300 shrink-0"
                    >
                      SEXTA-FEIRA
                    </label>
                    <select
                      id="mobile-friday-voice"
                      value={fridayVoice}
                      onChange={(e) => {
                        triggerHaptic('tap');
                        onChangeFridayVoice(e.target.value as FridayVoiceOption);
                      }}
                      className="min-h-[40px] w-52 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="Kore">Kore (Feminina · Tática)</option>
                      <option value="Zephyr">Zephyr (Feminina · Calorosa)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor="mobile-ultron-voice"
                        className="text-xs font-semibold text-red-600 dark:text-red-400 shrink-0"
                      >
                        ULTRON
                      </label>
                      <select
                        id="mobile-ultron-voice"
                        value={ultronVoice}
                        onChange={(e) => {
                          triggerHaptic('tap');
                          onChangeUltronVoice(e.target.value as UltronVoiceOption);
                        }}
                        className="min-h-[40px] w-52 rounded-xl border border-red-500/40 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      >
                        {ULTRON_VOICE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.shortLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                    {onPlayUltronSample && (
                      <button
                        type="button"
                        onClick={onPlayUltronSample}
                        className={`w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold active:scale-[0.98] transition-colors ${
                          ultronVoice === 'UltronOriginal'
                            ? 'border-red-500/60 bg-red-500/20 text-red-800 dark:text-red-100'
                            : 'border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300'
                        }`}
                      >
                        <Volume2 className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {adoptMatrixOnListen
                            ? 'Ouvir e Assumir Matriz Exclusiva (90.2 Hz)'
                            : 'Ouvir Matriz Exclusiva (90.2 Hz)'}
                        </span>
                        {ultronVoice === 'UltronOriginal' && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-300" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Creator Emotion & Background Standby Status */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <HeartPulse className="h-4 w-4 text-sky-500" />
                    <span>Estado de Patrick Pessoa</span>
                  </span>
                  <span className="font-semibold text-sky-600 dark:text-sky-300">
                    {currentEmotion.label}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {currentEmotion.empathyNote}
                </p>
                <div className="flex items-center justify-between pt-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                  <span>
                    {memoriesCount} memórias · {interactionsCount} interações
                  </span>
                  <span>
                    Escuta:{' '}
                    {isStandbyActive
                      ? awakeTarget
                        ? 'Desperto'
                        : interimTranscript
                        ? 'Ouvindo...'
                        : `Ativa (${Math.round(micLevel * 100)}%)`
                      : 'Inativa'}
                  </span>
                </div>
              </div>

              {/* Quick Alerts & Tasks Summary */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Alertas ({openAlerts.length}) &amp; Tarefas Pendentes (
                    {pendingTasks.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onOpenTasksTab();
                    }}
                    className="text-xs font-semibold text-sky-600 dark:text-sky-300"
                  >
                    Gerenciar tudo
                  </button>
                </div>

                {openAlerts.slice(0, 2).map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>{alert.title}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {alert.detail}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('success');
                        onToggleAlert(alert);
                      }}
                      className="min-h-[36px] px-2.5 text-xs font-medium text-sky-600 dark:text-sky-300 shrink-0"
                    >
                      Resolver
                    </button>
                  </div>
                ))}

                {allTasks.slice(0, 3).map((task) => {
                  const done = task.status === 'concluida';
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('success');
                        onToggleTask(task);
                      }}
                      className="w-full min-h-[48px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-3 py-2.5 flex items-center gap-3 text-left"
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      <span
                        className={`text-xs font-medium ${
                          done
                            ? 'line-through text-slate-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {task.title}
                      </span>
                    </button>
                  );
                })}
              </div>
              </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
