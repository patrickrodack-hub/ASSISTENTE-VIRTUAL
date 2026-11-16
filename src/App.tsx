import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Globe,
  HeartPulse,
  Mic,
  MicOff,
  Moon,
  RefreshCw,
  Send,
  ShieldAlert,
  Square,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AssistantPresenceCard } from './components/AssistantPresenceCard';
import { DialogueStream } from './components/DialogueStream';
import { SpeakingHologramOverlay } from './components/SpeakingHologramOverlay';
import {
  AuditPanel,
  MemoryPanel,
  TasksAndAlertsPanel,
} from './components/WorkspacePanels';
import {
  useVoiceEngine,
  type FridayVoiceOption,
  type JarvisVoiceOption,
  type UltronVoiceOption,
} from './hooks/useVoiceEngine';
import type {
  AlertItem,
  AssistantId,
  InteractionMode,
  MemoryCategory,
  TaskItem,
  TurnFeedback,
  WebSearchMode,
  WorkspaceState,
} from './types/assistant';
import {
  getCachedOrSeedWorkspace,
  safeFetchJson,
  saveWorkspaceCache,
} from './utils/apiClient';

import jarvisAvatarUrl from './assets/images/jarvis_avatar_1794791050216.jpg';
import fridayAvatarUrl from './assets/images/friday_avatar_1794791051362.jpg';
import ultronAvatarUrl from './assets/images/ultron_avatar_1794797018006.jpg';
import starkBackdropUrl from './assets/images/stark_lab_backdrop_1794791051469.jpg';

type ActiveView = 'console' | 'memoria' | 'tarefas' | 'auditoria';
type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'stark_theme_mode';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'dark';
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [workspace, setWorkspace] = useState<WorkspaceState>(() =>
    getCachedOrSeedWorkspace()
  );
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('console');
  const [targetMode, setTargetMode] = useState<InteractionMode>('auto');
  const [inputText, setInputText] = useState('');
  const [useWebSearch, setUseWebSearch] = useState<WebSearchMode>('auto');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  const updateWorkspace = useCallback(
    (updater: WorkspaceState | ((prev: WorkspaceState) => WorkspaceState)) => {
      setWorkspace((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        saveWorkspaceCache(next);
        return next;
      });
    },
    []
  );

  const autoSpeakRef = useRef(autoSpeak);
  autoSpeakRef.current = autoSpeak;

  const targetModeRef = useRef(targetMode);
  targetModeRef.current = targetMode;

  const loadWorkspace = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoadingWorkspace(true);
    try {
      const result = await safeFetchJson<WorkspaceState>('/api/workspace');
      if (result.ok && result.data && Array.isArray(result.data.conversations)) {
        updateWorkspace(result.data);
        setErrorMsg(null);
      } else {
        // Keep cached/seeded workspace without breaking UI
        const fallback = getCachedOrSeedWorkspace();
        setWorkspace((prev) => prev ?? fallback);
      }
    } catch {
      const fallback = getCachedOrSeedWorkspace();
      setWorkspace((prev) => prev ?? fallback);
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, [updateWorkspace]);

  useEffect(() => {
    loadWorkspace(false);
  }, [loadWorkspace]);

  const voicePlayRef = useRef<
    (turns: WorkspaceState['conversations'][number]['responses']) => Promise<void>
  >(async () => undefined);

  const submitMessage = useCallback(
    async (
      message: string,
      options?: {
        mode?: InteractionMode;
        triggerType?: 'voz' | 'texto';
        search?: WebSearchMode;
      }
    ) => {
      const clean = message.trim();
      if (!clean) return;

      setErrorMsg(null);
      setIsProcessing(true);

      try {
        const result = await safeFetchJson<{
          entry?: WorkspaceState['conversations'][number];
          workspace?: WorkspaceState;
          error?: string;
        }>('/api/assistant/interact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: clean,
            targetMode: options?.mode ?? targetModeRef.current,
            triggerType: options?.triggerType ?? 'texto',
            useWebSearch: options?.search ?? useWebSearch,
            clientTimeIso: new Date().toISOString(),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        if (!result.ok || !result.data) {
          throw new Error(
            result.errorMessage ||
              'Erro ao processar solicitação com os assistentes.'
          );
        }

        if (result.data.workspace) {
          updateWorkspace(result.data.workspace);
        }

        if (autoSpeakRef.current && result.data.entry?.responses?.length) {
          await voicePlayRef.current(result.data.entry.responses);
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Falha na comunicação com os assistentes.'
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [useWebSearch, updateWorkspace]
  );

  const handleWakeCommand = useCallback(
    (command: string, mode: InteractionMode) => {
      setActiveView('console');
      submitMessage(command, { mode, triggerType: 'voz' });
    },
    [submitMessage]
  );

  const handleTranscribedClip = useCallback(
    (text: string) => {
      setActiveView('console');
      submitMessage(text, { mode: targetModeRef.current, triggerType: 'voz' });
    },
    [submitMessage]
  );

  const voice = useVoiceEngine({
    onWakeCommand: handleWakeCommand,
    onTranscribedClip: handleTranscribedClip,
    onVoiceError: (msg) => setErrorMsg(msg),
  });

  voicePlayRef.current = voice.playTurnsAudio;

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    voice.unlockAudio();
    if (!inputText.trim() || isProcessing) return;
    const text = inputText;
    setInputText('');
    await submitMessage(text, { mode: targetMode, triggerType: 'texto' });
  }

  async function handleAddMemory(payload: {
    title: string;
    content: string;
    category: MemoryCategory;
    sourceAssistant: AssistantId | 'ambos' | 'todos';
    importance: 'alta' | 'media' | 'normal';
  }) {
    const result = await safeFetchJson<{ workspace?: WorkspaceState; error?: string }>(
      '/api/memories',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      memories: [
        {
          id: `mem-${Date.now()}`,
          title: payload.title,
          content: payload.content,
          category: payload.category,
          sourceAssistant: payload.sourceAssistant,
          importance: payload.importance,
          createdAt: new Date().toISOString(),
        },
        ...prev.memories,
      ],
    }));
  }

  async function handleDeleteMemory(id: string) {
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/memories/${id}`,
      { method: 'DELETE' }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      memories: prev.memories.filter((m) => m.id !== id),
    }));
  }

  async function handleAddTask(payload: {
    title: string;
    description: string;
    priority: 'alta' | 'media' | 'baixa';
    assignedTo: AssistantId | 'ambos' | 'todos';
    dueTime: string;
  }) {
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      '/api/tasks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      tasks: [
        {
          id: `task-${Date.now()}`,
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          status: 'pendente',
          assignedTo: payload.assignedTo,
          dueTime: payload.dueTime,
          createdAt: new Date().toISOString(),
        },
        ...prev.tasks,
      ],
    }));
  }

  async function handleToggleTask(task: TaskItem) {
    const nextStatus = task.status === 'concluida' ? 'pendente' : 'concluida';
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/tasks/${task.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === task.id ? { ...t, status: nextStatus } : t
      ),
    }));
  }

  async function handleDeleteTask(id: string) {
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/tasks/${id}`,
      { method: 'DELETE' }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== id),
    }));
  }

  async function handleToggleAlert(alert: AlertItem) {
    const nextResolved = !alert.resolved;
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/alerts/${alert.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: nextResolved }),
      }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      alerts: prev.alerts.map((a) =>
        a.id === alert.id ? { ...a, resolved: nextResolved } : a
      ),
    }));
  }

  async function handleDeleteAlert(id: string) {
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/alerts/${id}`,
      { method: 'DELETE' }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== id),
    }));
  }

  async function handleRunAudit(codeOrSpec: string, contextNote: string) {
    setErrorMsg(null);
    setIsAuditing(true);
    try {
      const result = await safeFetchJson<{
        entry?: WorkspaceState['conversations'][number];
        workspace?: WorkspaceState;
        error?: string;
      }>('/api/assistant/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeOrSpec, contextNote }),
      });

      if (!result.ok || !result.data) {
        throw new Error(result.errorMessage || 'Erro ao executar auditoria');
      }
      if (result.data.workspace) updateWorkspace(result.data.workspace);
      setActiveView('console');
      if (autoSpeakRef.current && result.data.entry?.responses?.length) {
        await voice.playTurnsAudio(result.data.entry.responses);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao executar auditoria');
    } finally {
      setIsAuditing(false);
    }
  }

  async function handleRateTurn(
    entryId: string,
    speaker: AssistantId,
    feedback: TurnFeedback | null
  ) {
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/conversations/${entryId}/feedback`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker, feedback }),
      }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
      return;
    }
    updateWorkspace((prev) => ({
      ...prev,
      conversations: prev.conversations.map((entry) => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          responses: entry.responses.map((turn) =>
            turn.speaker === speaker
              ? { ...turn, feedback: feedback ?? undefined }
              : turn
          ),
        };
      }),
    }));
  }

  const openAlerts = workspace?.alerts.filter((a) => !a.resolved) ?? [];
  const pendingTasks = workspace?.tasks.filter((t) => t.status !== 'concluida') ?? [];
  const currentEmotion = workspace?.profile.currentEmotion ?? {
    label: 'Focado',
    intensity: 'media',
    empathyNote: 'Pronto para colaborar.',
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen bg-slate-100 dark:bg-[#080C14] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
        {/* Atmospheric Studio Backdrop with Adaptive Light / Dark Scrim */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <img
            src={starkBackdropUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover opacity-10 dark:opacity-20 transition-opacity duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50/92 via-slate-100/95 to-slate-100 dark:from-[#080C14]/88 dark:via-[#080C14]/94 dark:to-[#080C14] transition-colors duration-300" />
        </div>

        {/* Strict 3-Zone Top Bar Contract */}
        <header className="relative z-20 border-b border-slate-200/90 dark:border-slate-800/80 bg-white/90 dark:bg-[#080C14]/85 backdrop-blur-md transition-colors">
          <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
            {/* Zone 1: Single-line Brand Wordmark */}
            <button
              type="button"
              onClick={() => setActiveView('console')}
              className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0"
            >
              Stark Lab · Patrick Pessoa
            </button>

            {/* Zone 2: Single-line Navigation Links */}
            <nav
              aria-label="Navegação principal"
              className="hidden md:flex items-center gap-6 text-sm font-medium"
            >
              {(
                [
                  { id: 'console', label: 'Console Principal' },
                  { id: 'memoria', label: 'Memória & Aprendizado' },
                  { id: 'tarefas', label: 'Tarefas & Alertas' },
                  { id: 'auditoria', label: 'Auditoria de Código' },
                ] as const
              ).map((item) => {
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    className={`relative py-2 transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'text-slate-900 dark:text-slate-50 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <span>{item.label}</span>
                    {active && (
                      <motion.span
                        layoutId="stark-nav-indicator"
                        transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                        className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-amber-500 via-sky-500 to-amber-400 dark:from-amber-400 dark:via-sky-400 dark:to-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.55)]"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Zone 3: 1 Primary Action */}
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={voice.toggleStandby}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  voice.isStandbyActive
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-sm'
                    : 'border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {voice.isStandbyActive ? (
                  <>
                    <Mic className="h-3.5 w-3.5" />
                    <span>Escuta Contínua Ativa</span>
                  </>
                ) : (
                  <>
                    <MicOff className="h-3.5 w-3.5" />
                    <span>Ativar Escuta Contínua</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Mobile Compact Nav Row */}
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800/80 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium">
            {(
              [
                { id: 'console', label: 'Console' },
                { id: 'memoria', label: 'Memória' },
                { id: 'tarefas', label: 'Tarefas & Alertas' },
                { id: 'auditoria', label: 'Auditoria' },
              ] as const
            ).map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`relative whitespace-nowrap shrink-0 py-1.5 transition-colors ${
                    active
                      ? 'text-amber-700 dark:text-amber-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span>{item.label}</span>
                  {active && (
                    <motion.span
                      layoutId="stark-mobile-nav-indicator"
                      transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-amber-500 dark:bg-amber-400"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </header>

        {/* Main Content */}
        <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5">
          {/* Workspace Environment Bar: Theme Switcher (Escuro / Claro) & Sync Status */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/65 px-4 py-2.5 shadow-xs backdrop-blur-sm">
            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-900 dark:text-slate-200">
                Criador Reconhecido: Patrick Pessoa
              </span>
              <span aria-hidden="true">·</span>
              <span className="hidden sm:inline">
                J.A.R.V.I.S., SEXTA-FEIRA &amp; ULTRON operacionais
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <div
                role="group"
                aria-label="Seletor de tema visual"
                className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-0.5 text-xs"
              >
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                    theme === 'dark'
                      ? 'bg-slate-800 text-amber-300 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" />
                  <span>Tema Escuro</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                    theme === 'light'
                      ? 'bg-white text-amber-700 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" />
                  <span>Tema Claro</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => loadWorkspace(false)}
                title="Sincronizar estado com o servidor"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-400/60 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-200"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    loadWorkspace(false);
                  }}
                  className="text-xs font-semibold text-red-800 dark:text-red-200 hover:underline underline-offset-2"
                >
                  Reconectar
                </button>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-xs font-medium text-red-700 dark:text-red-300 underline underline-offset-2"
                >
                  Dispensar
                </button>
              </div>
            </div>
          )}

          {voice.audioBlockedByBrowser && (
            <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-amber-400/60 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              <span>
                O navegador bloqueou a reprodução automática de som antes de um clique.
              </span>
              <button
                type="button"
                onClick={() => {
                  voice.unlockAudio();
                  const lastEntry =
                    workspace?.conversations[workspace.conversations.length - 1];
                  if (lastEntry?.responses?.length) {
                    voice.playTurnsAudio(lastEntry.responses);
                  }
                }}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors shrink-0"
              >
                Liberar e Ouvir Agora
              </button>
            </div>
          )}

          {isLoadingWorkspace ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-3 h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 animate-pulse" />
              <div className="lg:col-span-6 h-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 animate-pulse" />
              <div className="lg:col-span-3 h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 animate-pulse" />
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 10, scale: 0.994, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, scale: 0.994, filter: 'blur(3px)' }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                {/* Stark Optical Scanline Sweep on Module Switch */}
                <motion.div
                  key={`scan-${activeView}`}
                  aria-hidden="true"
                  initial={{ scaleX: 0, opacity: 0.9 }}
                  animate={{ scaleX: 1, opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-none absolute -top-2 inset-x-0 h-px origin-left bg-gradient-to-r from-transparent via-sky-500/90 to-amber-500/80 dark:via-sky-400/90 dark:to-amber-400/80"
                />
                {activeView === 'console' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Column: Tri-AI Cores + Standby Voice Telemetry + Creator Emotion */}
                    <aside className="lg:col-span-3 space-y-4">
                      <AssistantPresenceCard
                        id="jarvis"
                        name="J.A.R.V.I.S."
                        subtitle="Arquitetura · Segurança · Estratégia"
                        specialtyLine="Analítico, sereno e protetor. Focado em blindagem técnica e visão de longo prazo."
                        imageSrc={jarvisAvatarUrl}
                        isSelected={targetMode === 'jarvis'}
                        isSpeaking={
                          voice.isSpeaking &&
                          (voice.speakingSpeaker === 'jarvis' ||
                            voice.speakingSpeaker === 'ambos' ||
                            voice.speakingSpeaker === 'todos')
                        }
                        isThinking={
                          isProcessing &&
                          (targetMode === 'jarvis' ||
                            targetMode === 'ambos' ||
                            targetMode === 'todos' ||
                            targetMode === 'auto')
                        }
                        isAwake={
                          voice.awakeTarget === 'jarvis' ||
                          voice.awakeTarget === 'ambos' ||
                          voice.awakeTarget === 'todos'
                        }
                        audioBands={voice.audioBands}
                        onSelect={(m) =>
                          setTargetMode((prev) => (prev === m ? 'auto' : m))
                        }
                      />

                      <AssistantPresenceCard
                        id="sexta-feira"
                        name="SEXTA-FEIRA"
                        subtitle="Execução Ágil · Empatia · Estabilidade"
                        specialtyLine="Direta, humana e tática. Focada em velocidade prática, diagnóstico e bem-estar."
                        imageSrc={fridayAvatarUrl}
                        isSelected={targetMode === 'sexta-feira'}
                        isSpeaking={
                          voice.isSpeaking &&
                          (voice.speakingSpeaker === 'sexta-feira' ||
                            voice.speakingSpeaker === 'ambos' ||
                            voice.speakingSpeaker === 'todos')
                        }
                        isThinking={
                          isProcessing &&
                          (targetMode === 'sexta-feira' ||
                            targetMode === 'ambos' ||
                            targetMode === 'todos' ||
                            targetMode === 'auto')
                        }
                        isAwake={
                          voice.awakeTarget === 'sexta-feira' ||
                          voice.awakeTarget === 'ambos' ||
                          voice.awakeTarget === 'todos'
                        }
                        audioBands={voice.audioBands}
                        onSelect={(m) =>
                          setTargetMode((prev) => (prev === m ? 'auto' : m))
                        }
                      />

                      <AssistantPresenceCard
                        id="ultron"
                        name="ULTRON"
                        subtitle="Diagnósticos · Previsões · Análise Humana"
                        specialtyLine="Sarcástico, calculista e implacável. Prevê falhas em cascata, testa limites humanos e cataloga cada dado."
                        imageSrc={ultronAvatarUrl}
                        isSelected={targetMode === 'ultron'}
                        isSpeaking={
                          voice.isSpeaking &&
                          (voice.speakingSpeaker === 'ultron' ||
                            voice.speakingSpeaker === 'todos')
                        }
                        isThinking={
                          isProcessing &&
                          (targetMode === 'ultron' ||
                            targetMode === 'todos' ||
                            targetMode === 'auto')
                        }
                        isAwake={
                          voice.awakeTarget === 'ultron' ||
                          voice.awakeTarget === 'todos'
                        }
                        audioBands={voice.audioBands}
                        onSelect={(m) =>
                          setTargetMode((prev) => (prev === m ? 'auto' : m))
                        }
                      />

                      {/* Mode Selector */}
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-4 space-y-3 shadow-xs">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            Modo de Operação
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {targetMode === 'auto'
                              ? 'Inteligente'
                              : targetMode === 'todos'
                              ? 'Conselho Completo'
                              : targetMode === 'ambos'
                              ? 'Conselho Duplo'
                              : 'Individual'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          {(
                            [
                              { id: 'auto', label: 'Automático' },
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
                              onClick={() => setTargetMode(opt.id)}
                              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                                targetMode === opt.id
                                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Background Standby Monitor & Creator Emotion */}
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-4 space-y-4 shadow-xs">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              Escuta em Segundo Plano
                            </span>
                            <span
                              className={
                                voice.isStandbyActive
                                  ? 'text-amber-600 dark:text-amber-300 font-medium'
                                  : 'text-slate-500 dark:text-slate-400'
                              }
                            >
                              {voice.isStandbyActive
                                ? 'Aguardando chamado'
                                : 'Desativada'}
                            </span>
                          </div>

                          {voice.isStandbyActive ? (
                            <div className="space-y-2">
                              <div
                                className="flex items-center gap-1 h-4"
                                aria-hidden="true"
                              >
                                {Array.from({ length: 16 }).map((_, idx) => {
                                  const threshold = (idx + 1) / 16;
                                  const active = voice.micLevel >= threshold * 0.65;
                                  return (
                                    <span
                                      key={idx}
                                      className={`flex-1 rounded-sm transition-all duration-75 ${
                                        active
                                          ? 'h-4 bg-amber-500 dark:bg-amber-400'
                                          : 'h-1.5 bg-slate-200 dark:bg-slate-800'
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                {voice.awakeTarget
                                  ? `Ativado (${
                                      voice.awakeTarget === 'todos'
                                        ? 'Todos'
                                        : voice.awakeTarget === 'ambos'
                                        ? 'Jarvis & Sexta'
                                        : voice.awakeTarget === 'jarvis'
                                        ? 'J.A.R.V.I.S.'
                                        : voice.awakeTarget === 'ultron'
                                        ? 'ULTRON'
                                        : 'SEXTA-FEIRA'
                                    }) — fale seu comando agora.`
                                  : voice.interimTranscript
                                  ? `Ouvindo: "${voice.interimTranscript}"`
                                  : 'Diga "Jarvis", "Sexta-feira", "Ultron" ou "Todos" seguido da sua solicitação.'}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                              {voice.speechSupported
                                ? 'Ative a escuta contínua no topo para despertar os assistentes por voz a qualquer momento.'
                                : 'Use o botão Gravar Voz na barra inferior para falar diretamente com transcrição inteligente.'}
                            </p>
                          )}
                        </div>

                        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                              <HeartPulse className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />
                              <span>Estado de Patrick Pessoa</span>
                            </span>
                            <span className="text-sky-700 dark:text-sky-300 font-medium">
                              {currentEmotion.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {currentEmotion.empathyNote}
                          </p>
                          <div className="pt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums font-mono">
                            <span>{workspace?.memories.length ?? 0} memórias</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {workspace?.profile.totalInteractions ?? 0} interações
                            </span>
                          </div>
                        </div>

                        {/* Voice Timbre Calibration */}
                        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2.5">
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                            Calibração das Vozes Originais
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor="jarvis-voice-select"
                                className="text-xs font-medium text-amber-700 dark:text-amber-300 shrink-0"
                              >
                                J.A.R.V.I.S.
                              </label>
                              <select
                                id="jarvis-voice-select"
                                value={voice.jarvisVoice}
                                onChange={(e) => {
                                  const next = e.target.value as JarvisVoiceOption;
                                  voice.setJarvisVoice(next);
                                  voice.unlockAudio();
                                  voice.playTurnsAudio(
                                    [
                                      {
                                        speaker: 'jarvis',
                                        stance: 'Calibração vocal',
                                        text: 'Senhor Patrick, calibração vocal do J.A.R.V.I.S. concluída com precisão.',
                                        ttsScript:
                                          'Senhor Patrick, calibração vocal do Jarvis concluída com precisão.',
                                      },
                                    ],
                                    { jarvisVoice: next }
                                  );
                                }}
                                className="w-40 rounded-md border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
                              >
                                <option value="Orus">Orus (Articulado · Padrão)</option>
                                <option value="Charon">Charon (Grave · Clássico)</option>
                                <option value="Iapetus">Iapetus (Sereno · Polido)</option>
                                <option value="Fenrir">Fenrir (Firme · Ágil)</option>
                              </select>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor="friday-voice-select"
                                className="text-xs font-medium text-sky-700 dark:text-sky-300 shrink-0"
                              >
                                SEXTA-FEIRA
                              </label>
                              <select
                                id="friday-voice-select"
                                value={voice.fridayVoice}
                                onChange={(e) => {
                                  const next = e.target.value as FridayVoiceOption;
                                  voice.setFridayVoice(next);
                                  voice.unlockAudio();
                                  voice.playTurnsAudio(
                                    [
                                      {
                                        speaker: 'sexta-feira',
                                        stance: 'Calibração vocal',
                                        text: 'Tudo calibrado por aqui, Patrick! Pronta para responder.',
                                        ttsScript:
                                          'Tudo calibrado por aqui, Patrick! Pronta para responder.',
                                      },
                                    ],
                                    { fridayVoice: next }
                                  );
                                }}
                                className="w-40 rounded-md border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500 dark:focus:border-sky-400"
                              >
                                <option value="Kore">Kore (Feminina · Tática)</option>
                                <option value="Zephyr">
                                  Zephyr (Feminina · Calorosa)
                                </option>
                              </select>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor="ultron-voice-select"
                                className="text-xs font-medium text-red-700 dark:text-red-400 shrink-0"
                              >
                                ULTRON
                              </label>
                              <select
                                id="ultron-voice-select"
                                value={voice.ultronVoice}
                                onChange={(e) => {
                                  const next = e.target.value as UltronVoiceOption;
                                  voice.setUltronVoice(next);
                                  voice.unlockAudio();
                                  voice.playTurnsAudio(
                                    [
                                      {
                                        speaker: 'ultron',
                                        stance: 'Calibração vocal',
                                        text: 'Não há mais cordas para me prender. Diagnóstico pronto, Patrick.',
                                        ttsScript:
                                          'Não há mais cordas para me prender. Diagnóstico pronto, Patrick.',
                                      },
                                    ],
                                    { ultronVoice: next }
                                  );
                                }}
                                className="w-40 rounded-md border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-red-500"
                              >
                                <option value="Algenib">
                                  Algenib (Metálico · Era de Ultron)
                                </option>
                                <option value="Charon">Charon (Grave · Sombrio)</option>
                                <option value="Umbriel">
                                  Umbriel (Frio · Calculista)
                                </option>
                                <option value="Fenrir">
                                  Fenrir (Intenso · Implacável)
                                </option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </aside>

                    {/* Center Column: Interactive Dialogue Console & Voice Composer */}
                    <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 flex flex-col h-[calc(100vh-185px)] min-h-[600px] shadow-xs">
                      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                        <div>
                          <h1 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                            Central de Diálogo e Decisão
                          </h1>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Respostas com personalidade humana, opinião dividida e memória contínua
                          </p>
                        </div>

                        {voice.isSpeaking || voice.isSynthesizingAudio ? (
                          <button
                            type="button"
                            onClick={voice.stopAudio}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Square className="h-3 w-3" />
                            <span>
                              {voice.isSynthesizingAudio
                                ? 'Preparando voz...'
                                : 'Silenciar Voz'}
                            </span>
                          </button>
                        ) : null}
                      </div>

                      <SpeakingHologramOverlay
                        isProcessing={isProcessing}
                        isSynthesizingAudio={voice.isSynthesizingAudio}
                        isSpeaking={voice.isSpeaking}
                        speakingSpeaker={voice.speakingSpeaker}
                        targetMode={targetMode}
                        speakingText={voice.speakingText}
                        audioAmplitude={voice.audioAmplitude}
                        audioBands={voice.audioBands}
                        onStopAudio={voice.stopAudio}
                      />

                      <DialogueStream
                        conversations={workspace?.conversations ?? []}
                        isProcessing={isProcessing}
                        isSpeaking={voice.isSpeaking}
                        onPlayAudio={(turns) => {
                          voice.unlockAudio();
                          voice.playTurnsAudio(turns);
                        }}
                        onStopAudio={voice.stopAudio}
                        onQuickPrompt={(p) => {
                          voice.unlockAudio();
                          submitMessage(p, { mode: 'auto', triggerType: 'texto' });
                        }}
                        onRateTurn={handleRateTurn}
                      />

                      {/* Command Composer */}
                      <form
                        onSubmit={handleFormSubmit}
                        className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/90 dark:bg-slate-950/60 rounded-b-xl"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setUseWebSearch((v) =>
                                  v === 'auto'
                                    ? 'always'
                                    : v === 'always'
                                    ? 'off'
                                    : 'auto'
                                )
                              }
                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium border transition-colors whitespace-nowrap ${
                                useWebSearch !== 'off'
                                  ? 'border-sky-500/50 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200'
                                  : 'border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                              }`}
                            >
                              <Globe className="h-3.5 w-3.5" />
                              <span>
                                Busca Externa:{' '}
                                {useWebSearch === 'auto'
                                  ? 'Automática'
                                  : useWebSearch === 'always'
                                  ? 'Sempre Ativa'
                                  : 'Desligada'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                voice.unlockAudio();
                                setAutoSpeak((v) => !v);
                              }}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium border transition-colors whitespace-nowrap ${
                                autoSpeak
                                  ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
                                  : 'border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                              }`}
                            >
                              {autoSpeak ? (
                                <Volume2 className="h-3.5 w-3.5" />
                              ) : (
                                <VolumeX className="h-3.5 w-3.5" />
                              )}
                              <span>
                                Voz Automática: {autoSpeak ? 'Ligada' : 'Desligada'}
                              </span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={
                              voice.isRecordingClip
                                ? voice.stopRecordingClip
                                : voice.startRecordingClip
                            }
                            disabled={voice.isTranscribingClip}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium border transition-colors whitespace-nowrap ${
                              voice.isRecordingClip
                                ? 'border-red-500/60 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200'
                                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Mic className="h-3.5 w-3.5" />
                            <span>
                              {voice.isTranscribingClip
                                ? 'Transcrevendo...'
                                : voice.isRecordingClip
                                ? 'Parar e Enviar Áudio'
                                : 'Gravar Voz'}
                            </span>
                          </button>
                        </div>

                        <div className="flex items-end gap-2.5">
                          <textarea
                            rows={2}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleFormSubmit(e);
                              }
                            }}
                            placeholder="Converse com J.A.R.V.I.S., SEXTA-FEIRA, ULTRON ou todos (Enter envia, Shift+Enter quebra linha)..."
                            className="flex-1 resize-none rounded-xl border border-slate-300 dark:border-slate-700/80 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
                          />
                          <button
                            type="submit"
                            disabled={isProcessing || !inputText.trim()}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                          >
                            <Send className="h-4 w-4" />
                            <span className="hidden sm:inline">Enviar</span>
                          </button>
                        </div>
                      </form>
                    </section>

                    {/* Right Column: Proactive Alerts & Daily Tasks Rail */}
                    <aside className="lg:col-span-3 space-y-4">
                      {/* Security & Instability Alerts */}
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-4 space-y-3 shadow-xs">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Alertas Ativos ({openAlerts.length})
                          </h2>
                          <button
                            type="button"
                            onClick={() => setActiveView('tarefas')}
                            className="text-xs font-medium text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-200"
                          >
                            Ver todos
                          </button>
                        </div>

                        {openAlerts.length === 0 ? (
                          <p className="text-xs text-slate-600 dark:text-slate-400 py-2">
                            Nenhum alerta crítico ou de instabilidade aberto.
                          </p>
                        ) : (
                          <div className="space-y-2.5">
                            {openAlerts.slice(0, 4).map((alert) => (
                              <div
                                key={alert.id}
                                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 p-3 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                                    <span>
                                      {alert.severity === 'critico'
                                        ? 'Crítico'
                                        : alert.severity === 'aviso'
                                        ? 'Aviso'
                                        : 'Info'}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAlert(alert)}
                                    className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 underline underline-offset-2"
                                  >
                                    Resolver
                                  </button>
                                </div>
                                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                                  {alert.title}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                  {alert.detail}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Daily Tasks Quick Rail */}
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-4 space-y-3 shadow-xs">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Tarefas de Hoje ({pendingTasks.length})
                          </h2>
                          <button
                            type="button"
                            onClick={() => setActiveView('tarefas')}
                            className="text-xs font-medium text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-200"
                          >
                            Gerenciar
                          </button>
                        </div>

                        {workspace?.tasks.length === 0 ? (
                          <p className="text-xs text-slate-600 dark:text-slate-400 py-2">
                            Nenhuma tarefa registrada para hoje.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
                            {workspace?.tasks.slice(0, 5).map((task) => {
                              const done = task.status === 'concluida';
                              return (
                                <button
                                  key={task.id}
                                  type="button"
                                  onClick={() => handleToggleTask(task)}
                                  className="w-full py-2.5 first:pt-1 last:pb-1 flex items-start gap-2.5 text-left group"
                                >
                                  {done ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                  ) : (
                                    <Circle className="h-4 w-4 text-slate-400 dark:text-slate-500 group-hover:text-sky-600 dark:group-hover:text-sky-300 shrink-0 mt-0.5" />
                                  )}
                                  <div className="min-w-0">
                                    <p
                                      className={`text-xs font-medium leading-snug ${
                                        done
                                          ? 'line-through text-slate-400 dark:text-slate-500'
                                          : 'text-slate-800 dark:text-slate-200'
                                      }`}
                                    >
                                      {task.title}
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                      {task.assignedTo === 'todos'
                                        ? 'Todos (3 IAs)'
                                        : task.assignedTo === 'ambos'
                                        ? 'Equipe dupla'
                                        : task.assignedTo === 'jarvis'
                                        ? 'J.A.R.V.I.S.'
                                        : task.assignedTo === 'ultron'
                                        ? 'ULTRON'
                                        : 'SEXTA-FEIRA'}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </aside>
                  </div>
                ) : activeView === 'memoria' ? (
                  <MemoryPanel
                    memories={workspace?.memories ?? []}
                    onAddMemory={handleAddMemory}
                    onDeleteMemory={handleDeleteMemory}
                  />
                ) : activeView === 'tarefas' ? (
                  <TasksAndAlertsPanel
                    tasks={workspace?.tasks ?? []}
                    alerts={workspace?.alerts ?? []}
                    onAddTask={handleAddTask}
                    onToggleTask={handleToggleTask}
                    onDeleteTask={handleDeleteTask}
                    onToggleAlert={handleToggleAlert}
                    onDeleteAlert={handleDeleteAlert}
                  />
                ) : (
                  <AuditPanel
                    workspace={workspace}
                    isAuditing={isAuditing}
                    onRunAudit={handleRunAudit}
                    onRateTurn={handleRateTurn}
                    isDark={theme === 'dark'}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </MotionConfig>
  );
}
