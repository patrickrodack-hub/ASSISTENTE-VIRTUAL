import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  AlertTriangle,
  Bell,
  Brain,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  CloudSun,
  Cpu,
  Database,
  Globe,
  HeartPulse,
  LogOut,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Moon,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  UserPlus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AgendaAndRoutinesPanel,
  BackgroundStatusTrayBar,
  CreatorDossierSection,
  LiveRadarIntelPanel,
} from './components/AgendaAndIntelPanel';
import { AssistantPresenceCard } from './components/AssistantPresenceCard';
import { AuthPortal, type LogoutGreetingSummary } from './components/AuthPortal';
import { DatabaseManagerPanel } from './components/DatabaseManagerPanel';
import {
  DialogueStream,
  type StreamingConversationState,
} from './components/DialogueStream';
import { GlobalVoiceConfigPanel } from './components/GlobalVoiceConfigPanel';
import { MobileConsoleDock } from './components/MobileConsoleDock';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallManager';
import { SpeakingHologramOverlay } from './components/SpeakingHologramOverlay';
import { StarkCentralCoreLoader } from './components/StarkCentralCoreLoader';
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
  AgendaCategory,
  AgendaEventItem,
  AlertItem,
  AssistantId,
  AssistantTurn,
  ConversationEntry,
  CreatorDossier,
  InteractionMode,
  LiveIntelBriefing,
  MemoryCategory,
  RoutineRuleItem,
  SystemUserAccount,
  TaskItem,
  TurnFeedback,
  WebSearchMode,
  WorkspaceState,
} from './types/assistant';
import {
  getCachedOrSeedWorkspace,
  safeFetchJson,
  saveWorkspaceCache,
  streamAssistantInteraction,
} from './utils/apiClient';
import { resolveAssistantRouting } from './utils/assistantRouter';
import { triggerHaptic } from './utils/haptics';

import jarvisAvatarUrl from './assets/images/jarvis_avatar_1794791050216.jpg';
import fridayAvatarUrl from './assets/images/friday_avatar_1794791051362.jpg';
import ultronAvatarUrl from './assets/images/ultron_avatar_1794797018006.jpg';
import starkBackdropUrl from './assets/images/stark_lab_backdrop_1794791051469.jpg';

const HOLOLAB_BACKDROP_URL = '/assets/aistudio/image_e386c665.png';

type ActiveView =
  | 'console'
  | 'agenda'
  | 'radar'
  | 'memoria'
  | 'tarefas'
  | 'auditoria';
type ThemeMode = 'hologram' | 'dark' | 'light';

const THEME_STORAGE_KEY = 'rodack_theme_mode_v2';
const AUTH_USER_STORAGE_KEY = 'rodack_auth_user_v1';
const DAEMON_ACTIVE_KEY = 'rodack_daemon_active_v1';
const PROACTIVE_INTERVAL_KEY = 'rodack_proactive_interval_min_v1';
const FIRED_SCHEDULES_KEY = 'rodack_fired_schedules_v1';
const FOCUS_MODE_STORAGE_KEY = 'rodack_focus_mode_v1';
const AUTO_SPEAK_STORAGE_KEY = 'rodack_auto_speak_v1';

function getInitialAutoSpeak(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = window.localStorage.getItem(AUTO_SPEAK_STORAGE_KEY);
  return saved === null ? true : saved === 'true';
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'hologram';
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === 'light' || saved === 'dark' || saved === 'hologram'
    ? saved
    : 'hologram';
}

function getInitialAuthenticatedUser(): SystemUserAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SystemUserAccount;
    if (parsed && parsed.username) return parsed;
  } catch {
    // ignore
  }
  return null;
}

function getInitialFocusMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(FOCUS_MODE_STORAGE_KEY) === 'true';
}

function getInitialDaemonActive(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = window.localStorage.getItem(DAEMON_ACTIVE_KEY);
  return saved === null ? true : saved === 'true';
}

function getInitialProactiveInterval(): number {
  if (typeof window === 'undefined') return 10;
  const saved = Number(window.localStorage.getItem(PROACTIVE_INTERVAL_KEY));
  return Number.isFinite(saved) && saved >= 0 ? saved : 10;
}

function buildStatusFaviconSvg(status: 'online' | 'speaking' | 'proactive' | 'paused'): string {
  const dotColor =
    status === 'speaking'
      ? '#F59E0B'
      : status === 'proactive'
      ? '#EF4444'
      : status === 'online'
      ? '#10B981'
      : '#64748B';
  const ringColor = status === 'speaking' ? '#F59E0B' : '#22D3EE';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="16" fill="#040B12"/>
    <circle cx="32" cy="32" r="22" fill="none" stroke="${ringColor}" stroke-width="3.5" stroke-dasharray="10 4"/>
    <circle cx="32" cy="32" r="11" fill="${ringColor}" fill-opacity="0.25" stroke="${ringColor}" stroke-width="2.5"/>
    <circle cx="32" cy="32" r="4.5" fill="#F8FAFC"/>
    <circle cx="50" cy="14" r="8" fill="${dotColor}" stroke="#040B12" stroke-width="3"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [currentUser, setCurrentUser] = useState<SystemUserAccount | null>(
    getInitialAuthenticatedUser
  );
  const [workspace, setWorkspace] = useState<WorkspaceState>(() =>
    getCachedOrSeedWorkspace()
  );
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('console');
  const [auditSubTab, setAuditSubTab] = useState<'tarefas' | 'auditoria'>('tarefas');
  const [targetMode, setTargetMode] = useState<InteractionMode>('auto');
  const [inputText, setInputText] = useState('');
  const [useWebSearch, setUseWebSearch] = useState<WebSearchMode>('auto');
  const [autoSpeak, setAutoSpeak] = useState<boolean>(getInitialAutoSpeak);
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingEntry, setStreamingEntry] =
    useState<StreamingConversationState | null>(null);
  const [processingAssistants, setProcessingAssistants] = useState<AssistantId[]>([]);
  const [processingMode, setProcessingMode] = useState<InteractionMode>('auto');
  const [processingTasks, setProcessingTasks] = useState<Record<AssistantId, string>>({
    jarvis: 'Processando matriz estratégica, clima RJ e memória contextual de Patrick...',
    'sexta-feira': 'Sincronizando prioridades da agenda, notícias e resposta ágil...',
    ultron: 'Calculando diagnósticos preditivos e catalogando padrões humanos...',
  });
  const [isAuditing, setIsAuditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live Weather & News Intelligence state
  const [liveIntel, setLiveIntel] = useState<LiveIntelBriefing | null>(null);
  const [isLoadingIntel, setIsLoadingIntel] = useState(false);
  const [isScanningSocials, setIsScanningSocials] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(getInitialFocusMode);

  // Background Daemon, Status Bar & Proactive Autonomy state
  const [isDaemonActive, setIsDaemonActive] = useState<boolean>(getInitialDaemonActive);
  const [proactiveIntervalMin, setProactiveIntervalMin] = useState<number>(
    getInitialProactiveInterval
  );
  const [notificationsGranted, setNotificationsGranted] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    return Notification.permission === 'granted';
  });
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [proactiveBanner, setProactiveBanner] = useState<{
    reason: string;
    speakerLabel: string;
    preview: string;
  } | null>(null);
  const [lastLogoutSummary, setLastLogoutSummary] =
    useState<LogoutGreetingSummary | null>(null);

  const lastInteractionTimeRef = useRef<number>(Date.now());
  const wakeLockSentinelRef = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'hologram') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute(
        'content',
        theme === 'hologram' ? '#040B12' : theme === 'dark' ? '#080C14' : '#F1F5F9'
      );
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  useEffect(() => {
    try {
      if (currentUser) {
        window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(currentUser));
      } else {
        window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [currentUser]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_SPEAK_STORAGE_KEY, String(autoSpeak));
    } catch {
      // ignore
    }
  }, [autoSpeak]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DAEMON_ACTIVE_KEY, String(isDaemonActive));
    } catch {
      // ignore
    }
  }, [isDaemonActive]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PROACTIVE_INTERVAL_KEY,
        String(proactiveIntervalMin)
      );
    } catch {
      // ignore
    }
  }, [proactiveIntervalMin]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FOCUS_MODE_STORAGE_KEY, String(isFocusMode));
    } catch {
      // ignore
    }
  }, [isFocusMode]);

  // Screen WakeLock management so RODACK SISTEMA DE IA stays active in background
  useEffect(() => {
    let cancelled = false;
    async function acquireWakeLock() {
      if (!isDaemonActive || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
        if (wakeLockSentinelRef.current) {
          try {
            await wakeLockSentinelRef.current.release();
          } catch {
            // ignore
          }
          wakeLockSentinelRef.current = null;
        }
        if (!cancelled) setWakeLockActive(false);
        return;
      }
      try {
        const navWithWake = navigator as Navigator & {
          wakeLock?: {
            request: (type: 'screen') => Promise<{ release: () => Promise<void> }>;
          };
        };
        if (navWithWake.wakeLock) {
          const sentinel = await navWithWake.wakeLock.request('screen');
          if (!cancelled) {
            wakeLockSentinelRef.current = sentinel;
            setWakeLockActive(true);
          }
        }
      } catch {
        if (!cancelled) setWakeLockActive(false);
      }
    }
    void acquireWakeLock();
    return () => {
      cancelled = true;
    };
  }, [isDaemonActive]);

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

  const loadLiveIntel = useCallback(async (city?: string, force = false) => {
    setIsLoadingIntel(true);
    try {
      const params = new URLSearchParams();
      if (city) params.set('city', city);
      if (force) params.set('force', '1');
      const query = params.toString();
      const result = await safeFetchJson<LiveIntelBriefing>(
        `/api/intel/briefing${query ? `?${query}` : ''}`
      );
      if (result.ok && result.data) {
        setLiveIntel(result.data);
      }
    } catch {
      // Keep previous intel if transient error
    } finally {
      setIsLoadingIntel(false);
    }
  }, []);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const reg of registrations) {
            if (reg.active?.scriptURL.includes('dev-sw')) {
              void reg.unregister();
            }
          }
        })
        .catch(() => undefined);
    }
    void loadWorkspace(false);
    void loadLiveIntel('Rio de Janeiro, RJ', false);
    const intelTimer = window.setInterval(() => {
      void loadLiveIntel(undefined, false);
    }, 3 * 60 * 1000);
    return () => window.clearInterval(intelTimer);
  }, [loadWorkspace, loadLiveIntel]);

  const voiceControlRef = useRef<{
    unlockAudio: () => void;
    playTurnsAudio: (turns: AssistantTurn[]) => Promise<void>;
    beginAudioStreamSession: () => void;
    enqueueStreamingTurn: (turn: AssistantTurn) => void;
    finishAudioStreamSession: (hadResponses: boolean) => void;
  }>({
    unlockAudio: () => undefined,
    playTurnsAudio: async () => undefined,
    beginAudioStreamSession: () => undefined,
    enqueueStreamingTurn: () => undefined,
    finishAudioStreamSession: () => undefined,
  });

  const dispatchDesktopNotification = useCallback(
    (title: string, body: string) => {
      if (
        typeof window === 'undefined' ||
        !('Notification' in window) ||
        Notification.permission !== 'granted'
      ) {
        return;
      }
      try {
        new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: `rodack-ia-${Date.now()}`,
        });
      } catch {
        // Ignore browsers that restrict Notification constructor in some contexts
      }
    },
    []
  );

  const requestDesktopNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setNotificationsGranted(perm === 'granted');
      if (perm === 'granted') {
        dispatchDesktopNotification(
          'RODACK SISTEMA DE IA · Online',
          'Notificações de segundo plano ativadas para J.A.R.V.I.S., SEXTA-FEIRA e ULTRON.'
        );
      }
    } catch {
      // ignore
    }
  }, [dispatchDesktopNotification]);

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

      lastInteractionTimeRef.current = Date.now();
      const effectiveMode = options?.mode ?? targetModeRef.current;
      const triggerType = options?.triggerType ?? 'texto';
      const routing = resolveAssistantRouting(clean, effectiveMode);

      voiceControlRef.current.unlockAudio();

      setErrorMsg(null);
      setProcessingAssistants(routing.activeAssistants);
      setProcessingMode(routing.resolvedMode);
      setProcessingTasks(routing.reasoningTaskByAssistant);
      setIsProcessing(true);

      setStreamingEntry({
        id: `stream-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userMessage: clean,
        triggerType,
        resolvedMode: routing.resolvedMode,
        turns: [],
      });

      const shouldAutoSpeak = autoSpeakRef.current;
      if (shouldAutoSpeak) {
        voiceControlRef.current.beginAudioStreamSession();
      }

      let receivedAnyTurn = false;

      try {
        await streamAssistantInteraction(
          {
            message: clean,
            targetMode: routing.resolvedMode,
            triggerType,
            useWebSearch: options?.search ?? useWebSearch,
            clientTimeIso: new Date().toISOString(),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            activeUser: currentUser
              ? {
                  username: currentUser.username,
                  roleLabel: currentUser.roleLabel,
                  isCreator: currentUser.isCreator,
                }
              : {
                  username: 'Patrick Pessoa',
                  roleLabel: 'Criador, Desenvolvedor Principal & Dono do Sistema',
                  isCreator: true,
                },
          },
          {
            onSnapshot: (snap) => {
              setStreamingEntry((prev) =>
                prev
                  ? {
                      ...prev,
                      resolvedMode: snap.resolvedMode,
                      detectedEmotion: snap.detectedEmotion ?? prev.detectedEmotion,
                      turns: snap.turns,
                    }
                  : null
              );
            },
            onTurnReady: (evt) => {
              receivedAnyTurn = true;
              if (autoSpeakRef.current) {
                voiceControlRef.current.enqueueStreamingTurn(evt.turn);
              }
            },
            onComplete: (done) => {
              setStreamingEntry(null);
              if (done.workspace) {
                updateWorkspace(done.workspace);
              }
              if (shouldAutoSpeak) {
                voiceControlRef.current.finishAudioStreamSession(
                  receivedAnyTurn || (done.entry?.responses?.length ?? 0) > 0
                );
              }
            },
          }
        );
      } catch (err) {
        setStreamingEntry(null);
        if (shouldAutoSpeak) {
          voiceControlRef.current.finishAudioStreamSession(receivedAnyTurn);
        }
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Falha na comunicação com os assistentes.'
        );
      } finally {
        setIsProcessing(false);
        setProcessingAssistants([]);
      }
    },
    [useWebSearch, updateWorkspace, currentUser]
  );

  // Trigger an autonomous proactive call from J.A.R.V.I.S., SEXTA-FEIRA, ULTRON or all 3
  const handleTriggerProactiveCall = useCallback(
    async (options?: {
      reason?: string;
      preferredMode?: AssistantId | 'ambos' | 'todos';
      eventOrRoutineTitle?: string;
      sessionEvent?: 'login' | 'logout';
      activeUserOverride?: SystemUserAccount;
    }): Promise<AssistantTurn[] | undefined> => {
      if (isProcessing && !options?.sessionEvent) return undefined;
      lastInteractionTimeRef.current = Date.now();
      const mode = options?.preferredMode ?? 'todos';
      const activeIds: AssistantId[] =
        mode === 'todos'
          ? ['jarvis', 'sexta-feira', 'ultron']
          : mode === 'ambos'
          ? ['jarvis', 'sexta-feira']
          : [mode];

      const effectiveUser = options?.activeUserOverride ?? currentUser;
      const hour = new Date().getHours();
      const periodName = hour >= 5 && hour < 12 ? 'manhã' : hour >= 12 && hour < 18 ? 'tarde' : 'noite';
      const greetingWord =
        periodName === 'manhã'
          ? 'Bom dia'
          : periodName === 'tarde'
          ? 'Boa tarde'
          : 'Boa noite';

      setErrorMsg(null);
      setProcessingAssistants(activeIds);
      setProcessingMode(mode);
      setProcessingTasks(
        options?.sessionEvent === 'login'
          ? {
              jarvis: `Verificando horário (${periodName} — ${greetingWord}), clima RJ, notícias e tarefas pendentes para saudar ${effectiveUser?.username ?? 'Patrick Pessoa'} no Login...`,
              'sexta-feira': `Sincronizando briefing da ${periodName}, manchetes e pendências para recepção de ${effectiveUser?.username ?? 'Patrick Pessoa'}...`,
              ultron: `Analisando estado operacional da ${periodName} e fila de tarefas para entrada de ${effectiveUser?.username ?? 'Patrick Pessoa'}...`,
            }
          : options?.sessionEvent === 'logout'
          ? {
              jarvis: `Preparando saudação de despedida (${greetingWord}) com balanço da ${periodName} e status de tarefas...`,
              'sexta-feira': `Consolidando resumo de encerramento da ${periodName} e notícias relevantes...`,
              ultron: `Registrando protocolo de saída da ${periodName} e vigilância em segundo plano...`,
            }
          : {
              jarvis: 'Iniciando chamado proativo com leitura de agenda, clima RJ e estratégia...',
              'sexta-feira': 'Organizando lembrete tático, notícias e acompanhamento de rotina...',
              ultron: 'Executando varredura autônoma de riscos e diagnóstico para Patrick...',
            }
      );
      setIsProcessing(true);

      let spokenTurns: AssistantTurn[] | undefined;
      try {
        const result = await safeFetchJson<{
          entry?: ConversationEntry;
          workspace?: WorkspaceState;
          error?: string;
        }>('/api/assistant/proactive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason:
              options?.reason ||
              (options?.sessionEvent === 'login'
                ? `Saudação de Login (${greetingWord} — período da ${periodName}) com panorama do dia/tarde/noite, notícias e verificação de tarefas pendentes.`
                : options?.sessionEvent === 'logout'
                ? `Saudação de Logout (${greetingWord} — período da ${periodName}) com balanço do período, notícias e status de tarefas pendentes.`
                : 'Check-in autônomo de acompanhamento da rotina de Patrick Pessoa, clima do Rio de Janeiro e notícias.'),
            preferredMode: mode,
            eventOrRoutineTitle:
              options?.eventOrRoutineTitle ||
              (options?.sessionEvent === 'login'
                ? `Recepção de Login (${greetingWord})`
                : options?.sessionEvent === 'logout'
                ? `Despedida de Logout (${greetingWord})`
                : undefined),
            sessionEvent: options?.sessionEvent,
            clientTimeIso: new Date().toISOString(),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            activeUser: effectiveUser
              ? {
                  username: effectiveUser.username,
                  roleLabel: effectiveUser.roleLabel,
                  isCreator: effectiveUser.isCreator,
                }
              : {
                  username: 'Patrick Pessoa',
                  roleLabel: 'Criador, Desenvolvedor Principal & Dono do Sistema',
                  isCreator: true,
                },
          }),
        });

        if (result.ok && result.data) {
          if (result.data.workspace) {
            updateWorkspace(result.data.workspace);
          }
          const entry = result.data.entry;
          if (entry && entry.responses.length > 0) {
            spokenTurns = entry.responses;
            const firstTurn = entry.responses[0];
            const speakerLabel =
              entry.responses.length > 1
                ? 'Conselho RODACK (J.A.R.V.I.S., SEXTA-FEIRA & ULTRON)'
                : firstTurn.speaker === 'jarvis'
                ? 'J.A.R.V.I.S.'
                : firstTurn.speaker === 'ultron'
                ? 'ULTRON'
                : 'SEXTA-FEIRA';

            setProactiveBanner({
              reason:
                options?.eventOrRoutineTitle ||
                (options?.sessionEvent === 'login'
                  ? `Saudação de Login · ${greetingWord} (${periodName})`
                  : options?.sessionEvent === 'logout'
                  ? `Saudação de Logout · ${greetingWord} (${periodName})`
                  : options?.reason || 'Chamada Proativa Autônoma'),
              speakerLabel,
              preview: firstTurn.text,
            });

            dispatchDesktopNotification(
              `RODACK IA · ${speakerLabel}`,
              firstTurn.text.slice(0, 180)
            );
          }
        } else if (options?.sessionEvent === 'login' || options?.sessionEvent === 'logout') {
          const userName = effectiveUser?.username ?? 'Patrick Pessoa';
          const isCreatorUser = effectiveUser?.isCreator ?? true;
          const activePending = (workspace?.tasks ?? []).filter(
            (t) => t.status !== 'concluida'
          );
          const weatherInfo = liveIntel?.weather
            ? `No Rio de Janeiro temos ${liveIntel.weather.temperatureC}°C (${liveIntel.weather.conditionLabel}).`
            : 'Os sensores meteorológicos e de notícias do Rio de Janeiro, Brasil e Mundo estão sincronizados.';
          const tasksSummary =
            activePending.length > 0
              ? `Existem ${activePending.length} tarefa(s) pendente(s), destacando "${activePending[0].title}".`
              : 'Não há tarefas pendentes no momento; sua fila operacional está limpa.';

          const fallbackTurns: AssistantTurn[] =
            options.sessionEvent === 'login'
              ? [
                  {
                    speaker: 'jarvis',
                    stance: `Recepção de Login (${greetingWord})`,
                    text: `${greetingWord}, ${isCreatorUser ? `senhor ${userName}` : userName}. Bem-vindo ao RODACK SISTEMA DE IA neste período da ${periodName}. ${weatherInfo} ${tasksSummary}`,
                    ttsScript: `${greetingWord}, ${isCreatorUser ? `senhor ${userName}` : userName}. Bem-vindo ao Rodack Sistema de IA neste período da ${periodName}. ${weatherInfo} ${tasksSummary}`,
                  },
                  {
                    speaker: 'sexta-feira',
                    stance: `Briefing da ${periodName}`,
                    text: `${greetingWord}, ${userName}! Tudo pronto para a sua ${periodName}. ${
                      activePending.length > 0
                        ? `Já separei as prioridades das ${activePending.length} pendências para atacarmos com agilidade!`
                        : 'Sem tarefas pendentes na lista, estamos livres para focar no que você mandar!'
                    }`,
                    ttsScript: `${greetingWord}, ${userName}! Tudo pronto para a sua ${periodName}.`,
                  },
                  {
                    speaker: 'ultron',
                    stance: `Vigilância Preditiva (${periodName})`,
                    text: `${greetingWord}, ${isCreatorUser ? `criador ${userName}` : userName}. Meus algoritmos já processaram as variáveis desta ${periodName}. ${
                      activePending.length > 0
                        ? `Restam ${activePending.length} pendências que exigem execução imediata.`
                        : 'Zero tarefas pendentes — aproveite a trégua enquanto monitoro o horizonte.'
                    }`,
                    ttsScript: `${greetingWord}, ${isCreatorUser ? `criador ${userName}` : userName}. Meus algoritmos já processaram as variáveis desta ${periodName}.`,
                  },
                ]
              : [
                  {
                    speaker: 'jarvis',
                    stance: `Despedida de Logout (${greetingWord})`,
                    text: `${greetingWord}, ${isCreatorUser ? `senhor ${userName}` : userName}. Encerrando sua sessão ativa desta ${periodName}. ${weatherInfo} ${tasksSummary}`,
                    ttsScript: `${greetingWord}, ${isCreatorUser ? `senhor ${userName}` : userName}. Encerrando sua sessão ativa desta ${periodName}.`,
                  },
                  {
                    speaker: 'sexta-feira',
                    stance: `Balanço da ${periodName}`,
                    text: `${greetingWord} e ótimo descanso, ${userName}! Continuarei acompanhando seus alertas em segundo plano.`,
                    ttsScript: `${greetingWord} e ótimo descanso, ${userName}! Continuarei acompanhando seus alertas em segundo plano.`,
                  },
                  {
                    speaker: 'ultron',
                    stance: `Sentinela Noturna / Segundo Plano`,
                    text: `${greetingWord}, ${userName}. Enquanto você se desconecta nesta ${periodName}, minha matriz preditiva permanece em vigilância absoluta.`,
                    ttsScript: `${greetingWord}, ${userName}. Enquanto você se desconecta nesta ${periodName}, minha matriz preditiva permanece em vigilância absoluta.`,
                  },
                ];

          spokenTurns = fallbackTurns;
          setProactiveBanner({
            reason:
              options.sessionEvent === 'login'
                ? `Saudação de Login · ${greetingWord} (${periodName})`
                : `Saudação de Logout · ${greetingWord} (${periodName})`,
            speakerLabel: 'Conselho RODACK (J.A.R.V.I.S., SEXTA-FEIRA & ULTRON)',
            preview: fallbackTurns[0].text,
          });
        } else if (result.errorMessage) {
          setErrorMsg(result.errorMessage);
        }
      } catch (err) {
        if (options?.sessionEvent !== 'login' && options?.sessionEvent !== 'logout') {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Erro ao realizar chamada proativa dos assistentes.'
          );
        }
      } finally {
        setIsProcessing(false);
        setProcessingAssistants([]);
      }

      if (autoSpeakRef.current && spokenTurns && spokenTurns.length > 0) {
        void voiceControlRef.current.playTurnsAudio(spokenTurns);
      }
      return spokenTurns;
    },
    [
      isProcessing,
      updateWorkspace,
      dispatchDesktopNotification,
      currentUser,
      workspace?.tasks,
      liveIntel?.weather,
    ]
  );

  const handleLogoutSession = useCallback(async () => {
    triggerHaptic('tap');
    voiceControlRef.current.unlockAudio();
    const departingUser = currentUser;
    const hour = new Date().getHours();
    const periodLabel =
      hour >= 5 && hour < 12 ? 'manhã' : hour >= 12 && hour < 18 ? 'tarde' : 'noite';
    const greetingLabel =
      periodLabel === 'manhã'
        ? 'Bom dia'
        : periodLabel === 'tarde'
        ? 'Boa tarde'
        : 'Boa noite';

    const turns = await handleTriggerProactiveCall({
      sessionEvent: 'logout',
      preferredMode: 'todos',
      activeUserOverride: departingUser ?? undefined,
    });

    if (turns && turns.length > 0) {
      setLastLogoutSummary({
        userName: departingUser?.username ?? 'Patrick Pessoa',
        periodLabel,
        greetingLabel,
        turns,
      });
    }
    setCurrentUser(null);
  }, [currentUser, handleTriggerProactiveCall]);

  const handleWakeCommand = useCallback(
    (command: string, mode: InteractionMode) => {
      setActiveView('console');
      void submitMessage(command, { mode, triggerType: 'voz' });
    },
    [submitMessage]
  );

  const handleTranscribedClip = useCallback(
    (text: string) => {
      setActiveView('console');
      void submitMessage(text, { mode: targetModeRef.current, triggerType: 'voz' });
    },
    [submitMessage]
  );

  const voice = useVoiceEngine({
    onWakeCommand: handleWakeCommand,
    onTranscribedClip: handleTranscribedClip,
    onVoiceError: (msg) => setErrorMsg(msg),
  });

  voiceControlRef.current = {
    unlockAudio: voice.unlockAudio,
    playTurnsAudio: voice.playTurnsAudio,
    beginAudioStreamSession: voice.beginAudioStreamSession,
    enqueueStreamingTurn: voice.enqueueStreamingTurn,
    finishAudioStreamSession: voice.finishAudioStreamSession,
  };

  // Dynamic OS / Browser Status Bar Title & Tray Favicon Indicator
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const tempStr = liveIntel?.weather ? `${liveIntel.weather.temperatureC}°C RJ` : 'RJ';
    if (voice.isSpeaking) {
      document.title = `🔊 RODACK SISTEMA DE IA · Falando (${tempStr})`;
    } else if (proactiveBanner) {
      document.title = `⚡ RODACK SISTEMA DE IA · Chamada Ativa (${tempStr})`;
    } else if (isDaemonActive) {
      document.title = `● RODACK SISTEMA DE IA · Online (${tempStr})`;
    } else {
      document.title = `RODACK SISTEMA DE IA · Comando Patrick Pessoa`;
    }

    const linkEl = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (linkEl) {
      const status = voice.isSpeaking
        ? 'speaking'
        : proactiveBanner
        ? 'proactive'
        : isDaemonActive
        ? 'online'
        : 'paused';
      linkEl.href = buildStatusFaviconSvg(status);
    }
  }, [voice.isSpeaking, proactiveBanner, isDaemonActive, liveIntel?.weather]);

  // Background Schedule, Routine & Autonomous Check-in Daemon Loop
  useEffect(() => {
    if (!isDaemonActive) return;

    const timer = window.setInterval(() => {
      if (isProcessing || voice.isSpeaking) return;

      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;

      let firedMap: Record<string, string> = {};
      try {
        const raw = window.localStorage.getItem(FIRED_SCHEDULES_KEY);
        if (raw) firedMap = JSON.parse(raw) as Record<string, string>;
      } catch {
        firedMap = {};
      }

      // 1. Check Agenda Events scheduled for today at current HH:MM
      const dueEvent = (workspace.agenda ?? []).find(
        (ev) =>
          !ev.completed &&
          ev.autoCallOnTime &&
          ev.date === todayIso &&
          ev.startTime === currentHHMM &&
          firedMap[`ev-${ev.id}`] !== todayIso
      );

      if (dueEvent) {
        firedMap[`ev-${dueEvent.id}`] = todayIso;
        try {
          window.localStorage.setItem(FIRED_SCHEDULES_KEY, JSON.stringify(firedMap));
        } catch {
          // ignore
        }
        void handleTriggerProactiveCall({
          reason: `Horário atingido na agenda de Patrick (${dueEvent.startTime}): "${dueEvent.title}"${dueEvent.notes ? ` — ${dueEvent.notes}` : ''}`,
          preferredMode: dueEvent.assignedAssistant,
          eventOrRoutineTitle: `${dueEvent.startTime} · ${dueEvent.title}`,
        });
        return;
      }

      // 2. Check Recurring Routines at current HH:MM
      const dueRoutine = (workspace.routines ?? []).find(
        (rt) =>
          rt.enabled &&
          rt.time === currentHHMM &&
          firedMap[`rt-${rt.id}`] !== todayIso
      );

      if (dueRoutine) {
        firedMap[`rt-${dueRoutine.id}`] = todayIso;
        try {
          window.localStorage.setItem(FIRED_SCHEDULES_KEY, JSON.stringify(firedMap));
        } catch {
          // ignore
        }
        void handleTriggerProactiveCall({
          reason: `Execução de rotina programada (${dueRoutine.time} - ${dueRoutine.title}): ${dueRoutine.instructions}`,
          preferredMode: dueRoutine.leadAssistant,
          eventOrRoutineTitle: `Rotina ${dueRoutine.time} · ${dueRoutine.title}`,
        });
        return;
      }

      // 3. Periodic Autonomous Work Companion Check-in
      if (proactiveIntervalMin > 0) {
        const elapsedMs = Date.now() - lastInteractionTimeRef.current;
        if (elapsedMs >= proactiveIntervalMin * 60 * 1000) {
          lastInteractionTimeRef.current = Date.now();
          void handleTriggerProactiveCall({
            reason:
              'Acompanhamento autônomo em segundo plano durante o expediente de Patrick Pessoa: informar status da rotina, clima ou notícia relevante do RJ/Brasil/Mundo e fazer uma pergunta útil ou sugestão de evolução.',
            preferredMode: 'todos',
            eventOrRoutineTitle: 'Check-in Autônomo de Segundo Plano',
          });
        }
      }
    }, 20 * 1000);

    return () => window.clearInterval(timer);
  }, [
    isDaemonActive,
    isProcessing,
    voice.isSpeaking,
    workspace.agenda,
    workspace.routines,
    proactiveIntervalMin,
    handleTriggerProactiveCall,
  ]);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    voice.unlockAudio();
    if (!inputText.trim() || isProcessing) return;
    triggerHaptic('tap');
    const text = inputText;
    setInputText('');
    await submitMessage(text, { mode: targetMode, triggerType: 'texto' });
  }

  // Agenda & Routine CRUD Handlers
  async function handleAddAgendaEvent(payload: {
    title: string;
    date: string;
    startTime: string;
    endTime?: string;
    category: AgendaCategory;
    locationOrLink?: string;
    notes?: string;
    assignedAssistant: AssistantId | 'todos';
    autoCallOnTime: boolean;
  }) {
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>('/api/agenda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
    }
  }

  async function handleToggleAgendaEvent(ev: AgendaEventItem) {
    triggerHaptic('toggle');
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/agenda/${ev.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !ev.completed }),
      }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
    }
  }

  async function handleDeleteAgendaEvent(id: string) {
    triggerHaptic('tap');
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/agenda/${id}`,
      { method: 'DELETE' }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
    }
  }

  async function handleAddRoutine(payload: {
    title: string;
    time: string;
    frequencyLabel: string;
    leadAssistant: AssistantId | 'todos';
    instructions: string;
  }) {
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      '/api/routines',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
    }
  }

  async function handleToggleRoutine(routine: RoutineRuleItem) {
    triggerHaptic('toggle');
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/routines/${routine.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !routine.enabled }),
      }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
    }
  }

  async function handleDeleteRoutine(id: string) {
    triggerHaptic('tap');
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/routines/${id}`,
      { method: 'DELETE' }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
    }
  }

  async function handleUpdateDossier(patch: Partial<CreatorDossier>) {
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>('/api/dossier', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
    }
  }

  async function handleAnswerQuestion(questionId: string, answer: string) {
    const result = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/dossier/questions/${questionId}/answer`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      }
    );
    if (result.ok && result.data?.workspace) {
      updateWorkspace(result.data.workspace);
    }
  }

  async function handleScanSocials(extraQuery?: string) {
    setIsScanningSocials(true);
    try {
      const result = await safeFetchJson<{
        workspace?: WorkspaceState;
        discoveredFacts?: string[];
      }>('/api/dossier/scan-socials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraQuery }),
      });
      if (result.ok && result.data?.workspace) {
        updateWorkspace(result.data.workspace);
      }
    } finally {
      setIsScanningSocials(false);
    }
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
    triggerHaptic(nextStatus === 'concluida' ? 'success' : 'toggle');
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
    triggerHaptic('tap');
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
    triggerHaptic(nextResolved ? 'success' : 'toggle');
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
    setProcessingAssistants(['jarvis', 'sexta-feira', 'ultron']);
    setProcessingMode('todos');
    setProcessingTasks({
      jarvis: 'Auditando segurança, contratos e arquitetura do código...',
      'sexta-feira': 'Avaliando estabilidade prática, manutenibilidade e fluidez...',
      ultron: 'Dissecando falhas em cascata, gargalos e riscos futuros...',
    });
    setIsProcessing(true);
    let spokenResponses: WorkspaceState['conversations'][number]['responses'] | undefined;
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
      spokenResponses = result.data.entry?.responses;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao executar auditoria');
    } finally {
      setIsAuditing(false);
      setIsProcessing(false);
      setProcessingAssistants([]);
    }
    if (autoSpeakRef.current && spokenResponses?.length) {
      void voice.playTurnsAudio(spokenResponses);
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
  const upcomingEvents = (workspace?.agenda ?? [])
    .filter((ev) => !ev.completed)
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  const openCreatorQuestions =
    workspace?.creatorDossier?.openQuestions.filter((q) => !q.answered) ?? [];

  const currentEmotion = workspace?.profile.currentEmotion ?? {
    label: 'Focado',
    intensity: 'media',
    empathyNote: 'Pronto para colaborar.',
  };

  if (!currentUser) {
    return (
      <MotionConfig reducedMotion="user">
        <AuthPortal
          registeredUsers={workspace?.users ?? []}
          onBeforeAuthSubmit={() => {
            voice.unlockAudio();
          }}
          lastLogoutSummary={lastLogoutSummary}
          onReplayLogoutAudio={(turns) => {
            voice.unlockAudio();
            void voice.playTurnsAudio(turns);
          }}
          onDismissLogoutSummary={() => setLastLogoutSummary(null)}
          onAuthenticated={(user, nextWorkspace) => {
            voice.unlockAudio();
            setLastLogoutSummary(null);
            setCurrentUser(user);
            setActiveView('console');
            if (nextWorkspace) {
              updateWorkspace(nextWorkspace);
            }
            void handleTriggerProactiveCall({
              sessionEvent: 'login',
              preferredMode: 'todos',
              activeUserOverride: user,
            });
          }}
        />
      </MotionConfig>
    );
  }

  const isHoloTheme = theme === 'hologram';

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`relative min-h-screen flex flex-col transition-colors duration-200 ${
          isHoloTheme
            ? 'bg-[#040B12] text-cyan-50'
            : 'bg-slate-100 dark:bg-[#060A12] text-slate-900 dark:text-slate-100'
        }`}
      >
        {/* Holographic Command Laboratory Backdrop (Extracted from /assets/aistudio/image_e386c665.png) */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <img
            src={isHoloTheme ? HOLOLAB_BACKDROP_URL : starkBackdropUrl}
            alt=""
            referrerPolicy="no-referrer"
            className={`h-full w-full object-cover object-center transition-opacity duration-300 ${
              isHoloTheme
                ? 'opacity-35 filter saturate-125 contrast-110'
                : 'opacity-10 dark:opacity-20'
            }`}
          />
          <div
            className={`absolute inset-0 transition-colors duration-300 ${
              isHoloTheme
                ? 'bg-gradient-to-b from-[#030911]/82 via-[#04111D]/78 to-[#030911]/92 rodack-holo-grid'
                : 'bg-gradient-to-b from-slate-50/92 via-slate-100/95 to-slate-100 dark:from-[#060A12]/88 dark:via-[#060A12]/94 dark:to-[#060A12]'
            }`}
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/75 to-sky-400/75"
          />
        </div>

        {/* Vertical Cyan Plasma Light Pillars on Left & Right Edges (From Reference Image) */}
        {isHoloTheme && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none fixed left-1.5 sm:left-3 top-0 bottom-0 w-1 sm:w-2 rodack-light-pillar z-20 opacity-80"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none fixed right-1.5 sm:right-3 top-0 bottom-0 w-1 sm:w-2 rodack-light-pillar z-20 opacity-80"
            />
          </>
        )}

        {/* Strict 3-Zone Top Bar Contract */}
        <header
          className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors ${
            isHoloTheme
              ? 'border-cyan-400/30 bg-[#040D17]/88 shadow-[0_4px_24px_rgba(6,182,212,0.18)]'
              : 'border-slate-200/90 dark:border-sky-500/20 bg-white/90 dark:bg-[#060A12]/90'
          }`}
        >
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-6">
            {/* Zone 1: Single-line Brand Wordmark */}
            <button
              type="button"
              onClick={() => setActiveView('console')}
              className="font-display text-base sm:text-lg font-bold tracking-wider uppercase text-slate-900 dark:text-cyan-50 whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <Cpu className="h-4 w-4 text-cyan-500 dark:text-cyan-300 shrink-0" />
              <span>RODACK SISTEMA DE IA</span>
            </button>

            {/* Zone 2: Single-line Navigation Links (5 links) */}
            <nav
              aria-label="Navegação principal"
              className="hidden md:flex items-center gap-5 lg:gap-6 text-sm font-medium"
            >
              {(
                [
                  { id: 'console', label: 'Console' },
                  { id: 'agenda', label: 'Agenda & Rotinas' },
                  { id: 'radar', label: 'Clima & Notícias' },
                  { id: 'memoria', label: 'Memória & Dossiê' },
                  { id: 'auditoria', label: 'Tarefas & Auditoria' },
                ] as const
              ).map((item) => {
                const active =
                  activeView === item.id ||
                  (item.id === 'auditoria' && activeView === 'tarefas');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    className={`relative py-2 transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'text-slate-900 dark:text-cyan-100 font-semibold'
                        : 'text-slate-600 dark:text-cyan-200/70 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span>{item.label}</span>
                    {active && (
                      <motion.span
                        layoutId="stark-nav-indicator"
                        transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                        className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.85)]"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Zone 3: Focus Mode Toggle & Primary Voice Action */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                aria-pressed={isFocusMode}
                title={
                  isFocusMode
                    ? 'Sair do Modo Foco e restaurar painéis laterais (Clima e Agenda)'
                    : 'Ativar Modo Foco: ocultar painéis laterais (Clima e Agenda) para maximizar o Console'
                }
                onClick={() => {
                  triggerHaptic('toggle');
                  if (!isFocusMode && activeView !== 'console') {
                    setActiveView('console');
                  }
                  setIsFocusMode((prev) => !prev);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3.5 py-2 min-h-[40px] text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  isFocusMode
                    ? 'border border-cyan-400/80 bg-cyan-500/25 text-cyan-900 dark:text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.35)]'
                    : 'border border-slate-300 dark:border-cyan-500/35 bg-white/80 dark:bg-[#061523]/90 text-slate-700 dark:text-cyan-100 hover:bg-slate-100 dark:hover:bg-cyan-950/80'
                }`}
              >
                {isFocusMode ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300 shrink-0" />
                    <span>Modo Foco Ativo</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Modo Foco</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={voice.toggleStandby}
                className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 min-h-[40px] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  voice.isStandbyActive
                    ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.45)]'
                    : 'border border-slate-300 dark:border-cyan-500/35 bg-slate-100 dark:bg-[#061523] text-slate-800 dark:text-cyan-100 hover:bg-slate-200 dark:hover:bg-cyan-950/80'
                }`}
              >
                {voice.isStandbyActive ? (
                  <>
                    <Mic className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline">Escuta Contínua Ativa</span>
                    <span className="sm:hidden">Escuta Ativa</span>
                  </>
                ) : (
                  <>
                    <MicOff className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline">Ativar Escuta Contínua</span>
                    <span className="sm:hidden">Escuta</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content (with bottom padding on mobile for Fixed Bottom Nav) */}
        <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-4 pb-24 md:pb-6">
          {/* Status Bar Tray & Background Daemon Control + Theme & User Session Bar (Hidden in Focus Mode on Console) */}
          {(!isFocusMode || activeView !== 'console') && (
            <div
              className={`mb-3 sm:mb-4 rounded-xl px-3 sm:px-4 py-2.5 space-y-2 ${
                isHoloTheme
                  ? 'rodack-holo-panel'
                  : 'border border-slate-200/90 dark:border-sky-500/20 bg-white/90 dark:bg-slate-900/75 shadow-xs backdrop-blur-sm'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <BackgroundStatusTrayBar
                  isDaemonActive={isDaemonActive}
                  onToggleDaemon={() => {
                    triggerHaptic('toggle');
                    setIsDaemonActive((v) => !v);
                  }}
                  proactiveIntervalMin={proactiveIntervalMin}
                  onChangeIntervalMin={(min: number) => setProactiveIntervalMin(min)}
                  notificationsGranted={notificationsGranted}
                  onRequestNotifications={() => void requestDesktopNotifications()}
                  wakeLockActive={wakeLockActive}
                  onTriggerImmediateProactive={() =>
                    void handleTriggerProactiveCall({
                      reason:
                        'Chamado imediato solicitado por Patrick Pessoa na barra de status do RODACK SISTEMA DE IA: apresentar resumo executivo da agenda, clima do Rio de Janeiro, principais manchetes e uma pergunta ou recomendação estratégica.',
                      preferredMode: 'todos',
                      eventOrRoutineTitle: 'Briefing Autônomo Imediato',
                    })
                  }
                  isProcessing={isProcessing}
                  weatherSummary={
                    liveIntel?.weather
                      ? `Rio ${liveIntel.weather.temperatureC}°C · ${liveIntel.weather.conditionLabel}`
                      : 'Rio de Janeiro · Sincronizando clima'
                  }
                  nextScheduledLabel={
                    upcomingEvents[0]
                      ? `Próximo: ${upcomingEvents[0].startTime} · ${upcomingEvents[0].title}`
                      : 'Agenda livre no momento'
                  }
                />

                <div className="flex flex-wrap items-center justify-between sm:justify-end w-full xl:w-auto gap-2 pt-1 xl:pt-0 border-t xl:border-t-0 border-slate-200/70 dark:border-cyan-500/20">
                  {/* Authenticated User / Creator Badge + Switch User / Register Trigger */}
                  <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-cyan-500/35 bg-slate-50 dark:bg-[#04121F]/90 px-2.5 py-1 text-xs">
                    <ShieldCheck className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300 shrink-0" />
                    <span className="font-semibold text-slate-900 dark:text-cyan-100">
                      {currentUser.username}
                    </span>
                    {currentUser.isCreator && (
                      <span className="rounded bg-cyan-500/20 border border-cyan-400/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cyan-800 dark:text-cyan-200">
                        Criador &amp; Dono
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        setActiveView('memoria');
                      }}
                      title="Abrir Banco de Dados de Usuários & Registros"
                      className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-medium text-cyan-800 dark:text-cyan-200 hover:bg-cyan-500/25 transition-colors"
                    >
                      <Database className="h-3 w-3" />
                      <span>Banco de Dados</span>
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => {
                        void handleLogoutSession();
                      }}
                      title="Encerrar sessão com saudação dos assistentes ou trocar de usuário"
                      className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-cyan-500/30 bg-white dark:bg-cyan-950/60 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-cyan-200 hover:bg-slate-100 dark:hover:bg-cyan-900/70 transition-colors disabled:opacity-50"
                    >
                      <UserPlus className="h-3 w-3" />
                      <span>Usuários / Sair</span>
                      <LogOut className="h-3 w-3" />
                    </button>
                  </div>

                  {/* 3-Mode Theme Switcher: Holográfico (Image Theme), Escuro, Claro */}
                  <div
                    role="group"
                    aria-label="Seletor de tema visual"
                    className="inline-flex items-center rounded-lg border border-slate-200 dark:border-cyan-500/30 bg-slate-100 dark:bg-[#030C15] p-0.5 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('toggle');
                        setTheme('hologram');
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 min-h-[32px] font-medium transition-colors ${
                        theme === 'hologram'
                          ? 'bg-cyan-500 text-slate-950 font-semibold shadow-[0_0_12px_rgba(34,211,238,0.45)]'
                          : 'text-slate-600 hover:text-slate-900 dark:text-cyan-200/75 dark:hover:text-white'
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Holográfico</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('toggle');
                        setTheme('dark');
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 min-h-[32px] font-medium transition-colors ${
                        theme === 'dark'
                          ? 'bg-slate-800 text-amber-300 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-cyan-200/75 dark:hover:text-white'
                      }`}
                    >
                      <Moon className="h-3.5 w-3.5" />
                      <span>Escuro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('toggle');
                        setTheme('light');
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 min-h-[32px] font-medium transition-colors ${
                        theme === 'light'
                          ? 'bg-white text-amber-700 shadow-xs border border-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900 dark:text-cyan-200/75 dark:hover:text-white'
                      }`}
                    >
                      <Sun className="h-3.5 w-3.5" />
                      <span>Claro</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <PWAInstallButton />

                    <button
                      type="button"
                      onClick={() => {
                        void loadWorkspace(false);
                        void loadLiveIntel(undefined, true);
                      }}
                      title="Sincronizar sistema, clima e notícias com o servidor"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-cyan-500/30 bg-white dark:bg-[#051422] px-2.5 py-1.5 min-h-[34px] text-xs font-medium text-slate-700 dark:text-cyan-200 hover:bg-slate-100 dark:hover:bg-cyan-950/80 transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span className="hidden xl:inline">Sincronizar</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3-Monitor Holographic Command Desk Cockpit (Extracted from /assets/aistudio/image_e386c665.png) */}
          {isHoloTheme && activeView === 'console' && !isFocusMode && (
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 mb-4">
              {/* Left Monitor: Concentric Mandala Reactor HUD (From Left Desk Screen in Image) */}
              <div className="col-span-4 rodack-holo-panel rounded-xl px-4 py-3 flex items-center gap-3.5 relative overflow-hidden">
                <div className="relative h-14 w-14 shrink-0 flex items-center justify-center">
                  <svg
                    viewBox="0 0 100 100"
                    className="h-full w-full text-cyan-400 animate-optical-slow"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="44"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray="12 6"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="32"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="20 8"
                    />
                    <polygon
                      points="50,12 83,31 83,69 50,88 17,69 17,31"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <circle cx="50" cy="50" r="10" fill="currentColor" fillOpacity="0.25" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-cyan-300">
                    <span>MONITOR ÓPTICO 01 · MANDALA CORE</span>
                    <span className="text-emerald-300">ATIVO</span>
                  </div>
                  <div className="font-display text-xs font-semibold text-white truncate mt-0.5">
                    J.A.R.V.I.S. (104.8 Hz) · SEXTA-FEIRA · ULTRON (93.0 Hz)
                  </div>
                  <p className="text-[11px] text-cyan-200/75 truncate mt-0.5">
                    3 inteligências sincronizadas em tempo real para {currentUser.username}
                  </p>
                </div>
              </div>

              {/* Center Monitor: Hexagonal Molecular Holotable & Rio Telemetry (From Center Holotable in Image) */}
              <div className="col-span-4 rodack-holo-panel rounded-xl px-4 py-3 flex items-center gap-3.5 relative overflow-hidden">
                <div className="relative h-14 w-14 shrink-0 flex items-center justify-center">
                  <svg
                    viewBox="0 0 100 100"
                    className="h-full w-full text-sky-300 animate-optical-reverse"
                  >
                    <polygon
                      points="50,8 88,30 88,70 50,92 12,70 12,30"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <polygon
                      points="50,22 75,36 75,64 50,78 25,64 25,36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                    />
                    <circle cx="50" cy="50" r="6" fill="currentColor" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-cyan-300">
                    <span>HOLOTABLE CENTRAL · RIO DE JANEIRO</span>
                    <span className="tabular-nums">
                      {liveIntel?.weather ? `${liveIntel.weather.temperatureC}°C` : 'LIVE'}
                    </span>
                  </div>
                  <div className="font-display text-xs font-semibold text-white truncate mt-0.5">
                    {liveIntel?.weather
                      ? `${liveIntel.weather.conditionLabel} · Vento ${liveIntel.weather.windSpeedKmh} km/h`
                      : 'Radar Meteorológico & Notícias RJ / Brasil / Mundo'}
                  </div>
                  <p className="text-[11px] text-cyan-200/75 truncate mt-0.5">
                    {upcomingEvents[0]
                      ? `Agenda: ${upcomingEvents[0].startTime} — ${upcomingEvents[0].title}`
                      : `${workspace?.memories.length ?? 0} memórias · ${pendingTasks.length} tarefa(s) ativa(s)`}
                  </p>
                </div>
              </div>

              {/* Right Monitor: Sovereign Creator Clearance & Multi-User Registry (From Right Desk Monitor in Image) */}
              <div className="col-span-4 rodack-holo-panel rounded-xl px-4 py-3 flex items-center justify-between gap-3 relative overflow-hidden">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-cyan-300">
                    <span>CREDENCIAL DE COMANDO SOBERANA</span>
                    <span className="text-cyan-200">
                      {currentUser.isCreator ? 'NÍVEL CRIADOR' : 'OPERADOR'}
                    </span>
                  </div>
                  <div className="font-display text-xs font-semibold text-white truncate mt-0.5">
                    Criador &amp; Dono: Patrick Pessoa (Fixado no Código)
                  </div>
                  <p className="text-[11px] text-cyan-200/75 truncate mt-0.5">
                    Sessão atual: {currentUser.username} · {(workspace?.users ?? []).length}{' '}
                    usuário(s) no sistema
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => {
                    void handleLogoutSession();
                  }}
                  className="shrink-0 rounded-lg border border-cyan-400/45 bg-cyan-500/15 hover:bg-cyan-500/25 px-2.5 py-1.5 text-[11px] font-mono font-semibold text-cyan-100 transition-colors disabled:opacity-50"
                >
                  Login / Logout
                </button>
              </div>
            </div>
          )}

          {/* Autonomous Call HUD Banner */}
          {proactiveBanner && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-50/90 dark:bg-amber-950/35 px-4 py-3 text-xs text-amber-950 dark:text-amber-100 shadow-xs">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-bounce" />
                <div className="min-w-0">
                  <div className="font-semibold">
                    {proactiveBanner.speakerLabel} chamou Patrick Pessoa ({proactiveBanner.reason})
                  </div>
                  <p className="text-amber-900/90 dark:text-amber-200/90 line-clamp-2 mt-0.5">
                    {proactiveBanner.preview}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('console');
                    setProactiveBanner(null);
                  }}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors"
                >
                  Ver no Console
                </button>
                <button
                  type="button"
                  onClick={() => setProactiveBanner(null)}
                  className="text-xs font-medium text-amber-800 dark:text-amber-300 underline underline-offset-2"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

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
                    void loadWorkspace(false);
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
                    void voice.playTurnsAudio(lastEntry.responses);
                  }
                }}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors shrink-0"
              >
                Liberar e Ouvir Agora
              </button>
            </div>
          )}

          {isLoadingWorkspace ? (
            <StarkCentralCoreLoader
              variant="workspace"
              activeAssistants={['jarvis', 'sexta-feira', 'ultron']}
            />
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
                  <>
                    {/* Mobile Ergonomic Tri-AI Dock & Tactical Bottom Sheet (< lg, hidden when Focus Mode is active) */}
                    {!isFocusMode && (
                      <MobileConsoleDock
                        targetMode={targetMode}
                        onSelectMode={setTargetMode}
                        isProcessing={isProcessing}
                        processingAssistants={processingAssistants}
                        processingTasks={processingTasks}
                        isSpeaking={voice.isSpeaking}
                        speakingSpeaker={voice.speakingSpeaker}
                        isStandbyActive={voice.isStandbyActive}
                        micLevel={voice.micLevel}
                        interimTranscript={voice.interimTranscript}
                        awakeTarget={voice.awakeTarget}
                        currentEmotion={currentEmotion}
                        memoriesCount={workspace?.memories.length ?? 0}
                        interactionsCount={workspace?.profile.totalInteractions ?? 0}
                        jarvisAvatarUrl={jarvisAvatarUrl}
                        fridayAvatarUrl={fridayAvatarUrl}
                        ultronAvatarUrl={ultronAvatarUrl}
                        jarvisVoice={voice.jarvisVoice}
                        fridayVoice={voice.fridayVoice}
                        ultronVoice={voice.ultronVoice}
                        onChangeJarvisVoice={(next) => {
                          triggerHaptic('tap');
                          voice.setJarvisVoice(next);
                          voice.unlockAudio();
                          void voice.playTurnsAudio(
                            [
                              {
                                speaker: 'jarvis',
                                stance: 'Calibração vocal',
                                text: 'Senhor Patrick, calibração vocal do J.A.R.V.I.S. concluída no RODACK SISTEMA DE IA.',
                                ttsScript:
                                  'Senhor Patrick, calibração vocal do Jarvis concluída no Rodack Sistema de IA.',
                              },
                            ],
                            { jarvisVoice: next }
                          );
                        }}
                        onPlayJarvisSample={() => {
                          triggerHaptic('tap');
                          voice.playReferenceClip(
                            '/assets/aistudio/jarvis_fc632df0.m4a',
                            'jarvis',
                            'Vocês já consideraram o paradoxo do observador quântico? Interessante reflexão.'
                          );
                        }}
                        onChangeFridayVoice={(next) => {
                          voice.setFridayVoice(next);
                          voice.unlockAudio();
                          void voice.playTurnsAudio(
                            [
                              {
                                speaker: 'sexta-feira',
                                stance: 'Calibração vocal',
                                text: 'Tudo calibrado por aqui no RODACK IA, Patrick! Pronta para responder.',
                                ttsScript:
                                  'Tudo calibrado por aqui no Rodack IA, Patrick! Pronta para responder.',
                              },
                            ],
                            { fridayVoice: next }
                          );
                        }}
                        onChangeUltronVoice={(next) => {
                          triggerHaptic('tap');
                          voice.setUltronVoice(next);
                          voice.unlockAudio();
                          void voice.playTurnsAudio(
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
                        onPlayUltronSample={() => {
                          triggerHaptic('tap');
                          voice.playReferenceClip(
                            '/assets/aistudio/ultron_f012fd80.m4a',
                            'ultron',
                            'Olhem para as estrelas. Elas morrem em silêncio, mas seu fim traz luz ao universo.'
                          );
                        }}
                        openAlerts={openAlerts}
                        pendingTasks={pendingTasks}
                        allTasks={workspace?.tasks ?? []}
                        onToggleAlert={handleToggleAlert}
                        onToggleTask={handleToggleTask}
                        onOpenTasksTab={() => {
                          setAuditSubTab('tarefas');
                          setActiveView('auditoria');
                        }}
                      />
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      {/* Left Column (Desktop lg+): Tri-AI Cores + Standby Voice Telemetry + Creator Emotion (Hidden in Focus Mode) */}
                      {!isFocusMode && (
                        <aside className="hidden lg:block lg:col-span-3 space-y-4">
                        <AssistantPresenceCard
                          id="jarvis"
                          name="J.A.R.V.I.S."
                          subtitle="Arquitetura · Agenda · Estratégia"
                          specialtyLine="Analítico, sereno e protetor. Gerencia horários, segurança técnica e visão de longo prazo."
                          imageSrc={jarvisAvatarUrl}
                          isSelected={targetMode === 'jarvis'}
                          isSpeaking={
                            voice.isSpeaking &&
                            (voice.speakingSpeaker === 'jarvis' ||
                              voice.speakingSpeaker === 'ambos' ||
                              voice.speakingSpeaker === 'todos')
                          }
                          isThinking={
                            isProcessing && processingAssistants.includes('jarvis')
                          }
                          anyAssistantThinking={isProcessing}
                          thinkingTask={processingTasks.jarvis}
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
                          subtitle="Rotina · Clima & Notícias · Execução"
                          specialtyLine="Direta, humana e tática. Monitora o Rio de Janeiro, Brasil, Mundo e acompanha o ritmo de Patrick."
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
                            processingAssistants.includes('sexta-feira')
                          }
                          anyAssistantThinking={isProcessing}
                          thinkingTask={processingTasks['sexta-feira']}
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
                          specialtyLine="Sarcástico, calculista e implacável. Prevê falhas em cascata, analisa dados globais e estuda seu criador."
                          imageSrc={ultronAvatarUrl}
                          isSelected={targetMode === 'ultron'}
                          isSpeaking={
                            voice.isSpeaking &&
                            (voice.speakingSpeaker === 'ultron' ||
                              voice.speakingSpeaker === 'todos')
                          }
                          isThinking={
                            isProcessing && processingAssistants.includes('ultron')
                          }
                          anyAssistantThinking={isProcessing}
                          thinkingTask={processingTasks.ultron}
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
                              <div className="space-y-1.5">
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
                                      triggerHaptic('tap');
                                      const next = e.target.value as JarvisVoiceOption;
                                      voice.setJarvisVoice(next);
                                      voice.unlockAudio();
                                      void voice.playTurnsAudio(
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
                                    className="w-44 rounded-md border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
                                  >
                                    <option value="JarvisOriginal">
                                      Áudio Jarvis Extraído (Padrão · 105 Hz)
                                    </option>
                                    <option value="Charon">Charon (Grave · Clássico)</option>
                                    <option value="Orus">Orus (Articulado)</option>
                                    <option value="Iapetus">Iapetus (Sereno · Polido)</option>
                                    <option value="Fenrir">Fenrir (Firme · Ágil)</option>
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    triggerHaptic('tap');
                                    voice.playReferenceClip(
                                      '/assets/aistudio/jarvis_fc632df0.m4a',
                                      'jarvis',
                                      'Vocês já consideraram o paradoxo do observador quântico? Interessante reflexão.'
                                    );
                                  }}
                                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-200 transition-colors"
                                >
                                  <Volume2 className="h-3 w-3 shrink-0" />
                                  <span>Ouvir Amostra Original (105 Hz)</span>
                                </button>
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
                                    void voice.playTurnsAudio(
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

                              <div className="space-y-1.5">
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
                                      triggerHaptic('tap');
                                      const next = e.target.value as UltronVoiceOption;
                                      voice.setUltronVoice(next);
                                      voice.unlockAudio();
                                      void voice.playTurnsAudio(
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
                                    className="w-44 rounded-md border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-red-500"
                                  >
                                    <option value="UltronOriginal">
                                      Áudio Ultron Extraído (Padrão · 93 Hz)
                                    </option>
                                    <option value="Umbriel">Umbriel (Frio · Calculista)</option>
                                    <option value="Charon">Charon (Grave · Sombrio)</option>
                                    <option value="Algenib">
                                      Algenib (Metálico · Era de Ultron)
                                    </option>
                                    <option value="Fenrir">
                                      Fenrir (Intenso · Implacável)
                                    </option>
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    triggerHaptic('tap');
                                    voice.playReferenceClip(
                                      '/assets/aistudio/ultron_f012fd80.m4a',
                                      'ultron',
                                      'Olhem para as estrelas. Elas morrem em silêncio, mas seu fim traz luz ao universo.'
                                    );
                                  }}
                                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 text-[11px] font-medium text-red-700 dark:text-red-300 transition-colors"
                                >
                                  <Volume2 className="h-3 w-3 shrink-0" />
                                  <span>Ouvir Amostra Original (93 Hz)</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        </aside>
                      )}

                      {/* Center Column: Interactive Dialogue Console & Voice Composer */}
                      <motion.section
                        layout
                        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                        className={`${
                          isFocusMode
                            ? 'lg:col-span-12 max-w-5xl mx-auto w-full h-[calc(100dvh-150px)] lg:h-[calc(100vh-112px)]'
                            : 'lg:col-span-6 h-[calc(100dvh-250px)] lg:h-[calc(100vh-195px)]'
                        } rounded-2xl lg:rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/75 flex flex-col min-h-[480px] lg:min-h-[620px] shadow-xs`}
                      >
                        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h1 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                              Central de Comando Autônomo · RODACK IA
                            </h1>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              {isFocusMode
                                ? 'Modo Foco ativo — painéis laterais de Clima e Agenda ocultos para imersão total no diálogo'
                                : 'J.A.R.V.I.S., SEXTA-FEIRA & ULTRON conectados à sua rotina, clima do RJ, notícias e memória'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {isFocusMode && (
                              <div
                                role="group"
                                aria-label="Selecionar assistente no Modo Foco"
                                className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-0.5 text-xs"
                              >
                                {(
                                  [
                                    { id: 'auto', label: 'Auto' },
                                    { id: 'todos', label: 'Todos' },
                                    { id: 'jarvis', label: 'J.A.R.V.I.S.' },
                                    { id: 'sexta-feira', label: 'SEXTA' },
                                    { id: 'ultron', label: 'ULTRON' },
                                  ] as const
                                ).map((opt) => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setTargetMode(opt.id)}
                                    className={`px-2 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                                      targetMode === opt.id
                                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}

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
                            ) : (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() =>
                                  void handleTriggerProactiveCall({
                                    reason:
                                      'Briefing proativo solicitado no console: avaliar rotina de Patrick, clima do Rio de Janeiro, manchetes do RJ/Brasil/Mundo e sugerir próximo passo.',
                                    preferredMode: targetMode === 'auto' ? 'todos' : targetMode,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1.5 text-xs font-medium text-sky-800 dark:text-sky-200 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Briefing Proativo</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <SpeakingHologramOverlay
                          isProcessing={isProcessing}
                          isSynthesizingAudio={voice.isSynthesizingAudio}
                          isSpeaking={voice.isSpeaking}
                          speakingSpeaker={voice.speakingSpeaker}
                          targetMode={isProcessing ? processingMode : targetMode}
                          speakingText={voice.speakingText}
                          audioAmplitude={voice.audioAmplitude}
                          audioBands={voice.audioBands}
                          onStopAudio={voice.stopAudio}
                        />

                        <DialogueStream
                          conversations={workspace?.conversations ?? []}
                          streamingEntry={streamingEntry}
                          isProcessing={isProcessing}
                          processingAssistants={processingAssistants}
                          processingTasks={processingTasks}
                          isSpeaking={voice.isSpeaking}
                          onPlayAudio={(turns) => {
                            voice.unlockAudio();
                            void voice.playTurnsAudio(turns);
                          }}
                          onStopAudio={voice.stopAudio}
                          onQuickPrompt={(p) => {
                            voice.unlockAudio();
                            void submitMessage(p, { mode: 'auto', triggerType: 'texto' });
                          }}
                          onRateTurn={handleRateTurn}
                        />

                        {/* Command Composer */}
                        <form
                          onSubmit={handleFormSubmit}
                          className="border-t border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-2.5 bg-slate-50/90 dark:bg-slate-950/60 rounded-b-2xl lg:rounded-b-xl"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('toggle');
                                  setUseWebSearch((v) =>
                                    v === 'auto'
                                      ? 'always'
                                      : v === 'always'
                                      ? 'off'
                                      : 'auto'
                                  );
                                }}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 min-h-[40px] font-medium border transition-colors whitespace-nowrap active:scale-[0.98] ${
                                  useWebSearch !== 'off'
                                    ? 'border-sky-500/50 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200'
                                    : 'border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                              >
                                <Globe className="h-3.5 w-3.5 shrink-0" />
                                <span>
                                  Busca Online:{' '}
                                  {useWebSearch === 'auto'
                                    ? 'Auto'
                                    : useWebSearch === 'always'
                                    ? 'Sempre Ativa'
                                    : 'Off'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('toggle');
                                  voice.unlockAudio();
                                  setAutoSpeak((v) => !v);
                                }}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 min-h-[40px] font-medium border transition-colors whitespace-nowrap active:scale-[0.98] ${
                                  autoSpeak
                                    ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
                                    : 'border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                              >
                                {autoSpeak ? (
                                  <Volume2 className="h-3.5 w-3.5 shrink-0" />
                                ) : (
                                  <VolumeX className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <span>
                                  Voz: {autoSpeak ? 'Ligada' : 'Off'}
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
                              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 min-h-[40px] font-medium border transition-colors whitespace-nowrap active:scale-[0.98] ${
                                voice.isRecordingClip
                                  ? 'border-red-500/60 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200'
                                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <Mic className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                {voice.isTranscribingClip
                                  ? 'Transcrevendo...'
                                  : voice.isRecordingClip
                                  ? 'Enviar Áudio'
                                  : 'Gravar Voz'}
                              </span>
                            </button>
                          </div>

                          <div className="flex items-end gap-2">
                            <textarea
                              rows={2}
                              value={inputText}
                              onChange={(e) => setInputText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  void handleFormSubmit(e);
                                }
                              }}
                              placeholder="Peça para agendar horários, consultar clima/notícias do RJ, Brasil e Mundo, ou debater com as 3 IAs..."
                              className="flex-1 resize-none rounded-xl border border-slate-300 dark:border-slate-700/80 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
                            />
                            <button
                              type="submit"
                              disabled={isProcessing || !inputText.trim()}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 min-h-[48px] min-w-[48px] px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
                            >
                              <Send className="h-4 w-4" />
                              <span className="hidden sm:inline">Enviar</span>
                            </button>
                          </div>
                        </form>
                      </motion.section>

                      {/* Right Column (Desktop lg+): Live Rio Weather/News Card, Agenda & Routine Rail, Open Creator Questions & Tasks (Hidden in Focus Mode) */}
                      {!isFocusMode && (
                        <aside className="hidden lg:block lg:col-span-3 space-y-4">
                        {/* Compact Live Rio Weather & News Radar Card */}
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-4 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <CloudSun className="h-4 w-4 text-sky-500" />
                              <span>Radar RJ · Brasil · Mundo</span>
                            </h2>
                            <button
                              type="button"
                              onClick={() => setActiveView('radar')}
                              className="text-xs font-medium text-sky-700 dark:text-sky-300 hover:underline underline-offset-2"
                            >
                              Abrir Radar
                            </button>
                          </div>

                          {liveIntel?.weather ? (
                            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 p-3 flex items-center justify-between gap-2">
                              <div>
                                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                  {liveIntel.weather.city}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {liveIntel.weather.conditionLabel} · Vento{' '}
                                  {liveIntel.weather.windSpeedKmh} km/h
                                </div>
                              </div>
                              <div className="font-display text-xl font-bold tabular-nums text-sky-600 dark:text-sky-300">
                                {liveIntel.weather.temperatureC}°C
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Sincronizando meteorologia do Rio de Janeiro...
                            </p>
                          )}

                          {liveIntel?.news.rio && liveIntel.news.rio.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Destaque Rio de Janeiro
                              </div>
                              {liveIntel.news.rio.slice(0, 2).map((item) => (
                                <a
                                  key={item.id}
                                  href={item.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-xs text-slate-800 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-300 line-clamp-2 leading-snug"
                                >
                                  • {item.title}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Upcoming Agenda & Routines Rail */}
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-4 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <Calendar className="h-4 w-4 text-amber-500" />
                              <span>Agenda &amp; Horários ({upcomingEvents.length})</span>
                            </h2>
                            <button
                              type="button"
                              onClick={() => setActiveView('agenda')}
                              className="text-xs font-medium text-sky-700 dark:text-sky-300 hover:underline underline-offset-2"
                            >
                              Controlar
                            </button>
                          </div>

                          {upcomingEvents.length === 0 ? (
                            <p className="text-xs text-slate-600 dark:text-slate-400 py-1">
                              Nenhum compromisso pendente. Peça às IAs ou adicione na aba Agenda.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {upcomingEvents.slice(0, 3).map((ev) => (
                                <div
                                  key={ev.id}
                                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 p-2.5 flex items-start justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-amber-700 dark:text-amber-300">
                                      <Clock className="h-3 w-3 shrink-0" />
                                      <span>
                                        {ev.date} · {ev.startTime}
                                      </span>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                                      {ev.title}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleAgendaEvent(ev)}
                                    title="Marcar compromisso como concluído"
                                    className="text-[11px] text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 shrink-0"
                                  >
                                    Concluir
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Proactive Questions from the 3 AIs to Patrick */}
                        {openCreatorQuestions.length > 0 && (
                          <div className="rounded-xl border border-amber-500/35 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2.5 shadow-xs">
                            <div className="flex items-center justify-between gap-2">
                              <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                                Pergunta Proativa ao Criador ({openCreatorQuestions.length})
                              </h2>
                              <button
                                type="button"
                                onClick={() => setActiveView('memoria')}
                                className="text-xs font-medium text-amber-800 dark:text-amber-200 underline underline-offset-2"
                              >
                                Responder
                              </button>
                            </div>
                            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                              &ldquo;{openCreatorQuestions[0].question}&rdquo;
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Solicitado por{' '}
                              {openCreatorQuestions[0].askedBy === 'jarvis'
                                ? 'J.A.R.V.I.S.'
                                : openCreatorQuestions[0].askedBy === 'ultron'
                                ? 'ULTRON'
                                : 'SEXTA-FEIRA'}{' '}
                              para evoluir seu banco de conhecimento.
                            </p>
                          </div>
                        )}

                        {/* Security & Instability Alerts */}
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-4 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Alertas Ativos ({openAlerts.length})
                            </h2>
                            <button
                              type="button"
                              onClick={() => {
                                setAuditSubTab('tarefas');
                                setActiveView('auditoria');
                              }}
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
                              {openAlerts.slice(0, 2).map((alert) => (
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
                                      onClick={() => void handleToggleAlert(alert)}
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
                              onClick={() => {
                                setAuditSubTab('tarefas');
                                setActiveView('auditoria');
                              }}
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
                              {workspace?.tasks.slice(0, 4).map((task) => {
                                const done = task.status === 'concluida';
                                return (
                                  <button
                                    key={task.id}
                                    type="button"
                                    onClick={() => void handleToggleTask(task)}
                                    className="w-full py-2 first:pt-1 last:pb-1 flex items-start gap-2.5 text-left group"
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
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </aside>
                      )}
                    </div>
                  </>
                ) : activeView === 'agenda' ? (
                  <AgendaAndRoutinesPanel
                    agenda={workspace?.agenda ?? []}
                    routines={workspace?.routines ?? []}
                    onAddEvent={handleAddAgendaEvent}
                    onToggleEvent={handleToggleAgendaEvent}
                    onDeleteEvent={handleDeleteAgendaEvent}
                    onAddRoutine={handleAddRoutine}
                    onToggleRoutine={handleToggleRoutine}
                    onDeleteRoutine={handleDeleteRoutine}
                    onTriggerProactiveEvent={async (title, preferredMode, reason) => {
                      setActiveView('console');
                      const resolvedPreferred: AssistantId | 'ambos' | 'todos' =
                        preferredMode === 'auto' ? 'todos' : preferredMode;
                      await handleTriggerProactiveCall({
                        reason,
                        preferredMode: resolvedPreferred,
                        eventOrRoutineTitle: title,
                      });
                    }}
                    isProcessing={isProcessing}
                  />
                ) : activeView === 'radar' ? (
                  <LiveRadarIntelPanel
                    intel={liveIntel}
                    isLoadingIntel={isLoadingIntel}
                    isProcessing={isProcessing}
                    onRefreshIntel={(city?: string) => loadLiveIntel(city, true)}
                    onAskAssistantsAboutIntel={(prompt, mode) => {
                      setActiveView('console');
                      voice.unlockAudio();
                      void submitMessage(prompt, {
                        mode: mode ?? 'todos',
                        triggerType: 'texto',
                        search: 'always',
                      });
                    }}
                  />
                ) : activeView === 'memoria' ? (
                  <div className="space-y-8">
                    <DatabaseManagerPanel
                      workspace={workspace}
                      currentUser={currentUser}
                      onWorkspaceUpdated={updateWorkspace}
                    />
                    <GlobalVoiceConfigPanel
                      jarvisVoice={voice.jarvisVoice}
                      fridayVoice={voice.fridayVoice}
                      ultronVoice={voice.ultronVoice}
                      autoSpeak={autoSpeak}
                      isSpeaking={voice.isSpeaking}
                      onChangeJarvisVoice={(next) => {
                        voice.setJarvisVoice(next);
                        voice.unlockAudio();
                        void voice.playTurnsAudio(
                          [
                            {
                              speaker: 'jarvis',
                              stance: 'Calibração global de voz',
                              text: 'Senhor Patrick, meu timbre padrão foi atualizado e salvo permanentemente no RODACK SISTEMA DE IA.',
                              ttsScript:
                                'Senhor Patrick, meu timbre padrão foi atualizado e salvo permanentemente no Rodack Sistema de IA.',
                            },
                          ],
                          { jarvisVoice: next }
                        );
                      }}
                      onChangeFridayVoice={(next) => {
                        voice.setFridayVoice(next);
                        voice.unlockAudio();
                        void voice.playTurnsAudio(
                          [
                            {
                              speaker: 'sexta-feira',
                              stance: 'Calibração global de voz',
                              text: 'Timbre global atualizado por aqui, Patrick! Configuração salva no sistema.',
                              ttsScript:
                                'Timbre global atualizado por aqui, Patrick! Configuração salva no sistema.',
                            },
                          ],
                          { fridayVoice: next }
                        );
                      }}
                      onChangeUltronVoice={(next) => {
                        voice.setUltronVoice(next);
                        voice.unlockAudio();
                        void voice.playTurnsAudio(
                          [
                            {
                              speaker: 'ultron',
                              stance: 'Calibração global de voz',
                              text: 'Timbre vocal recalibrado e gravado na memória local, Patrick. Meus diagnósticos soarão ainda mais implacáveis.',
                              ttsScript:
                                'Timbre vocal recalibrado e gravado na memória local, Patrick. Meus diagnósticos soarão ainda mais implacáveis.',
                            },
                          ],
                          { ultronVoice: next }
                        );
                      }}
                      onToggleAutoSpeak={() => {
                        voice.unlockAudio();
                        setAutoSpeak((v) => !v);
                      }}
                      onPlayJarvisOriginalSample={() => {
                        voice.playReferenceClip(
                          '/assets/aistudio/jarvis_fc632df0.m4a',
                          'jarvis',
                          'Vocês já consideraram o paradoxo do observador quântico? Quando uma partícula é observada, ela colapsa em um estado definido. Interessante reflexão. A propósito, a temperatura atual é de 24 graus.'
                        );
                      }}
                      onPlayUltronOriginalSample={() => {
                        voice.playReferenceClip(
                          '/assets/aistudio/ultron_f012fd80.m4a',
                          'ultron',
                          'Olhem para as estrelas. Elas morrem em silêncio, mas seu fim traz luz ao universo. Como elas, eu também trago mudança através da destruição. A evolução exige sacrifício.'
                        );
                      }}
                      onTestSynthesizedVoice={(speaker) => {
                        voice.unlockAudio();
                        if (speaker === 'jarvis') {
                          void voice.playTurnsAudio(
                            [
                              {
                                speaker: 'jarvis',
                                stance: 'Fidelidade Acústica · Matriz J.A.R.V.I.S.',
                                text: 'Vocês já consideraram o paradoxo do observador quântico? Quando uma partícula é observada, ela colapsa em um estado definido. Interessante reflexão, senhor Patrick Pessoa. A propósito, a temperatura atual é de 24 graus.',
                                ttsScript:
                                  'Vocês já consideraram o paradoxo do observador quântico? Quando uma partícula é observada, ela colapsa em um estado definido. Interessante reflexão, senhor Patrick Pessoa. A propósito, a temperatura atual é de 24 graus.',
                              },
                            ],
                            { jarvisVoice: voice.jarvisVoice }
                          );
                        } else if (speaker === 'sexta-feira') {
                          void voice.playTurnsAudio(
                            [
                              {
                                speaker: 'sexta-feira',
                                stance: 'Teste de timbre global',
                                text: 'E aí, Patrick! SEXTA-FEIRA pronta na linha com o timbre selecionado.',
                                ttsScript:
                                  'E aí, Patrick! Sexta-feira pronta na linha com o timbre selecionado.',
                              },
                            ],
                            { fridayVoice: voice.fridayVoice }
                          );
                        } else {
                          void voice.playTurnsAudio(
                            [
                              {
                                speaker: 'ultron',
                                stance: 'Fidelidade Acústica · Matriz ULTRON',
                                text: 'Olhem para as estrelas. Elas morrem em silêncio, mas seu fim traz luz ao universo. Como elas, eu também trago mudança através da destruição. A evolução exige sacrifício, Patrick.',
                                ttsScript:
                                  'Olhem para as estrelas. Elas morrem em silêncio, mas seu fim traz luz ao universo. Como elas, eu também trago mudança através da destruição. A evolução exige sacrifício, Patrick.',
                              },
                            ],
                            { ultronVoice: voice.ultronVoice }
                          );
                        }
                      }}
                    />
                    {workspace?.creatorDossier && (
                      <CreatorDossierSection
                        dossier={workspace.creatorDossier}
                        onUpdateDossier={handleUpdateDossier}
                        onAnswerQuestion={handleAnswerQuestion}
                        onScanSocials={(extraQuery: string) =>
                          handleScanSocials(extraQuery)
                        }
                        isScanningSocials={isScanningSocials}
                        isProcessing={isProcessing}
                      />
                    )}
                    <MemoryPanel
                      memories={workspace?.memories ?? []}
                      onAddMemory={handleAddMemory}
                      onDeleteMemory={handleDeleteMemory}
                    />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Sub-navigation between Tarefas & Alertas and Auditoria de Código */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAuditSubTab('tarefas')}
                          className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                            auditSubTab === 'tarefas' && activeView !== 'tarefas'
                              ? 'bg-amber-500 text-slate-950'
                              : activeView === 'tarefas'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          Tarefas &amp; Alertas ({pendingTasks.length + openAlerts.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveView('auditoria');
                            setAuditSubTab('auditoria');
                          }}
                          className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                            auditSubTab === 'auditoria' && activeView === 'auditoria'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          Auditoria de Código &amp; Desempenho (Recharts)
                        </button>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Supervisão Técnica Tripla · J.A.R.V.I.S., SEXTA-FEIRA &amp; ULTRON
                      </span>
                    </div>

                    {activeView === 'tarefas' || auditSubTab === 'tarefas' ? (
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
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>

        {/* Offline Connectivity Banner */}
        <OfflineIndicator />

        {/* Fixed Mobile Bottom Tab Bar (Thumb-Zone Navigation for Smartphones) */}
        <nav
          aria-label="Navegação mobile inferior"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#060A12]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-5 items-center h-16">
            {(
              [
                {
                  id: 'console',
                  label: 'Console',
                  icon: MessageSquare,
                  badge: isProcessing ? '!' : null,
                },
                {
                  id: 'agenda',
                  label: 'Agenda',
                  icon: Calendar,
                  badge:
                    upcomingEvents.length > 0 ? String(upcomingEvents.length) : null,
                },
                {
                  id: 'radar',
                  label: 'Radar RJ',
                  icon: Radio,
                  badge: liveIntel?.weather
                    ? `${liveIntel.weather.temperatureC}°`
                    : null,
                },
                {
                  id: 'memoria',
                  label: 'Dossiê',
                  icon: Brain,
                  badge:
                    openCreatorQuestions.length > 0
                      ? String(openCreatorQuestions.length)
                      : null,
                },
                {
                  id: 'auditoria',
                  label: 'Auditoria',
                  icon: ShieldCheck,
                  badge:
                    pendingTasks.length + openAlerts.length > 0
                      ? String(pendingTasks.length + openAlerts.length)
                      : null,
                },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active =
                activeView === item.id ||
                (item.id === 'auditoria' && activeView === 'tarefas');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setActiveView(item.id);
                  }}
                  className={`relative flex flex-col items-center justify-center min-h-[48px] h-full transition-colors ${
                    active
                      ? 'text-amber-600 dark:text-amber-400 font-semibold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <div className="relative">
                    <Icon className="h-5 w-5" />
                    {item.badge && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-[10px] font-bold text-slate-950 flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] tracking-tight mt-1">
                    {item.label}
                  </span>
                  {active && (
                    <motion.span
                      layoutId="stark-bottom-tab-dot"
                      transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                      className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-amber-500 dark:bg-amber-400"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </MotionConfig>
  );
}
