import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  CheckCircle2,
  Circle,
  Crosshair,
  HeartPulse,
  Radar,
  ShieldAlert,
  SlidersHorizontal,
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
import type {
  FridayVoiceOption,
  JarvisVoiceOption,
  UltronVoiceOption,
} from '../hooks/useVoiceEngine';
import { triggerHaptic } from '../utils/haptics';

interface MobileConsoleDockProps {
  targetMode: InteractionMode;
  onSelectMode: (mode: InteractionMode) => void;
  isProcessing: boolean;
  processingAssistants: AssistantId[];
  processingTasks: Record<AssistantId, string>;
  isSpeaking: boolean;
  speakingSpeaker: AssistantId | 'ambos' | 'todos' | null;
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
  onChangeJarvisVoice: (v: JarvisVoiceOption) => void;
  onChangeFridayVoice: (v: FridayVoiceOption) => void;
  onChangeUltronVoice: (v: UltronVoiceOption) => void;
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
  onChangeJarvisVoice,
  onChangeFridayVoice,
  onChangeUltronVoice,
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
                    Vozes originais, modo de operação e alertas de Patrick Pessoa
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
                  Calibração das Vozes Originais (Toque para testar)
                </div>

                <div className="space-y-2.5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        J.A.R.V.I.S.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('tap');
                          onChangeJarvisVoice(jarvisVoice);
                        }}
                        className="min-h-[38px] w-52 rounded-xl border border-amber-500/40 bg-amber-500/10 dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center justify-between gap-1.5 active:scale-[0.98]"
                      >
                        <span className="truncate">Exclusiva · {jarvisVoice}</span>
                        <span className="font-mono text-[10px] shrink-0">104.3 Hz</span>
                      </button>
                    </div>
                    {onPlayJarvisSample && (
                      <button
                        type="button"
                        onClick={onPlayJarvisSample}
                        className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-200 active:scale-[0.98]"
                      >
                        <Volume2 className="h-3.5 w-3.5 shrink-0" />
                        <span>Ouvir Matriz Exclusiva (104.3 Hz)</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="mobile-friday-voice"
                      className="text-xs font-semibold text-sky-700 dark:text-sky-300"
                    >
                      SEXTA-FEIRA
                    </label>
                    <select
                      id="mobile-friday-voice"
                      value={fridayVoice}
                      onChange={(e) =>
                        onChangeFridayVoice(e.target.value as FridayVoiceOption)
                      }
                      className="min-h-[40px] w-48 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="Kore">Kore (Feminina · Tática)</option>
                      <option value="Zephyr">Zephyr (Feminina · Calorosa)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor="mobile-ultron-voice"
                        className="text-xs font-semibold text-red-600 dark:text-red-400"
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
                        className="min-h-[40px] w-52 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      >
                        <option value="UltronOriginal">
                          Áudio Ultron Extraído (Padrão · 93 Hz)
                        </option>
                        <option value="Umbriel">Umbriel (Frio · Calculista)</option>
                        <option value="Algenib">Algenib (Metálico · Era de Ultron)</option>
                        <option value="Fenrir">Fenrir (Intenso · Implacável)</option>
                      </select>
                    </div>
                    {onPlayUltronSample && (
                      <button
                        type="button"
                        onClick={onPlayUltronSample}
                        className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 active:scale-[0.98]"
                      >
                        <Volume2 className="h-3.5 w-3.5 shrink-0" />
                        <span>Ouvir Amostra Original (93 Hz)</span>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
