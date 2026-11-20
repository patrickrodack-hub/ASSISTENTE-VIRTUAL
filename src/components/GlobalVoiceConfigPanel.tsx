import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  AudioWaveform,
  Clock,
  FlaskConical,
  Globe,
  Moon,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AssistantId } from '../types/assistant';
import {
  DEFAULT_VOICE_TUNING,
  FACTORY_DEFAULT_VOICES,
  JARVIS_VOICE_OPTIONS,
  ULTRON_VOICE_OPTIONS,
  type AssistantVoiceTuning,
  type FridayVoiceOption,
  type JarvisVoiceOption,
  type LabAmbienceLevel,
  type StartupDefaultVoices,
  type UltronVoiceOption,
  type VoiceTuningMap,
} from '../hooks/useVoiceEngine';
import {
  DEFAULT_AUTO_THEME_SCHEDULE,
  formatHourLabel,
  getAutoThemeTransitionInfo,
  type AutoThemeSchedule,
  type ResolvedThemeMode,
  type ThemeMode,
} from '../utils/themeSchedule';
import { triggerHaptic } from '../utils/haptics';

export type GlobalVoiceConfigTab = 'vozes' | 'afinacao' | 'tema';

interface GlobalVoiceConfigPanelProps {
  jarvisVoice: JarvisVoiceOption;
  fridayVoice: FridayVoiceOption;
  ultronVoice: UltronVoiceOption;
  autoSpeak: boolean;
  isSpeaking: boolean;
  adoptMatrixOnListen: boolean;
  voiceTuning: VoiceTuningMap;
  labAmbienceEnabled?: boolean;
  labAmbienceLevel?: LabAmbienceLevel;
  startupDefaultVoices?: StartupDefaultVoices;
  hasCustomStartupDefaults?: boolean;
  activeTab?: GlobalVoiceConfigTab;
  onTabChange?: (tab: GlobalVoiceConfigTab) => void;
  themeMode?: ThemeMode;
  resolvedTheme?: ResolvedThemeMode;
  autoThemeSchedule?: AutoThemeSchedule;
  currentTime?: Date;
  onChangeThemeMode?: (mode: ThemeMode) => void;
  onChangeAutoThemeSchedule?: (schedule: AutoThemeSchedule) => void;
  onChangeJarvisVoice: (voice: JarvisVoiceOption) => void;
  onChangeFridayVoice: (voice: FridayVoiceOption) => void;
  onChangeUltronVoice: (voice: UltronVoiceOption) => void;
  onToggleLabAmbience?: (next: boolean) => void;
  onChangeLabAmbienceLevel?: (level: LabAmbienceLevel) => void;
  onSaveStartupDefaultVoices?: (
    next: StartupDefaultVoices,
    applyImmediately?: boolean
  ) => void;
  onResetStartupDefaultVoices?: () => void;
  onToggleAdoptMatrixOnListen: (next: boolean) => void;
  onUpdateVoiceTuning: (speaker: AssistantId, patch: Partial<AssistantVoiceTuning>) => void;
  onApplyTunedVoice?: (speaker: AssistantId, tuning: AssistantVoiceTuning) => void;
  onResetVoiceTuning: (speaker?: AssistantId) => void;
  onToggleAutoSpeak: () => void;
  onPlayJarvisOriginalSample: () => void;
  onPlayUltronOriginalSample: () => void;
  onTestSynthesizedVoice: (
    speaker: 'jarvis' | 'sexta-feira' | 'ultron',
    previewTuning?: AssistantVoiceTuning
  ) => void;
}

const FRIDAY_TIMBRE_OPTIONS: Array<{
  value: FridayVoiceOption;
  label: string;
  spec: string;
  description: string;
}> = [
  {
    value: 'Kore',
    label: 'Kore (Feminina · Tática & Ágil — Padrão)',
    spec: '210.4 Hz · Clareza Operacional',
    description:
      'Timbre feminino ágil, direto e natural para controle de rotinas, clima do Rio de Janeiro e execução rápida.',
  },
  {
    value: 'Zephyr',
    label: 'Zephyr (Feminina · Calorosa & Empática)',
    spec: '224.0 Hz · Presença Humana Suave',
    description:
      'Voz acolhedora e fluida para acompanhamento de jornada de trabalho e bem-estar do desenvolvedor.',
  },
];

const ASSISTANT_TUNING_META: Array<{
  id: AssistantId;
  name: string;
  subtitle: string;
  modLabel: string;
  cardClass: string;
  titleClass: string;
  badgeClass: string;
  sliderClass: string;
  testBtnClass: string;
  presets: Array<{ label: string; values: AssistantVoiceTuning }>;
}> = [
  {
    id: 'jarvis',
    name: 'J.A.R.V.I.S.',
    subtitle: 'Barítono Estratégico · Micro-ressonância Stark',
    modLabel: 'Ressonância Holográfica Stark',
    cardClass: 'border-amber-500/45 dark:border-amber-400/40 bg-amber-50/40 dark:bg-[#071524]/90',
    titleClass: 'text-amber-800 dark:text-amber-300',
    badgeClass: 'border-amber-500/50 bg-amber-500/20 text-amber-900 dark:text-amber-200',
    sliderClass: 'accent-amber-500',
    testBtnClass:
      'border-amber-500/45 bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200',
    presets: [
      { label: 'Padrão', values: DEFAULT_VOICE_TUNING.jarvis },
      { label: 'Grave Clássico', values: { pitchSemitones: -1.5, speed: 0.95, modulation: 20 } },
      { label: 'Holograma HUD', values: { pitchSemitones: 0, speed: 1.0, modulation: 60 } },
    ],
  },
  {
    id: 'sexta-feira',
    name: 'SEXTA-FEIRA',
    subtitle: 'Assistente Tática · Brilho de Comunicação',
    modLabel: 'Modulação Comms Orbital',
    cardClass: 'border-sky-500/35 dark:border-cyan-400/35 bg-sky-50/40 dark:bg-[#071524]/90',
    titleClass: 'text-sky-800 dark:text-cyan-300',
    badgeClass: 'border-sky-500/45 bg-sky-500/15 text-sky-800 dark:text-cyan-200',
    sliderClass: 'accent-sky-500',
    testBtnClass:
      'border-sky-500/45 bg-sky-500/15 hover:bg-sky-500/25 text-sky-900 dark:text-cyan-200',
    presets: [
      { label: 'Padrão', values: DEFAULT_VOICE_TUNING['sexta-feira'] },
      { label: 'Ágil 1.15x', values: { pitchSemitones: 0.5, speed: 1.15, modulation: 10 } },
      { label: 'Comms Tático', values: { pitchSemitones: 0, speed: 1.05, modulation: 50 } },
    ],
  },
  {
    id: 'ultron',
    name: 'ULTRON',
    subtitle: 'Baixo-Barítono Cibernético · Câmara Metálica',
    modLabel: 'Modulação Metálica + Reverb Câmara',
    cardClass: 'border-red-500/45 dark:border-red-500/40 bg-red-50/40 dark:bg-[#071524]/90',
    titleClass: 'text-red-700 dark:text-red-400',
    badgeClass: 'border-red-500/50 bg-red-500/20 text-red-900 dark:text-red-200',
    sliderClass: 'accent-red-500',
    testBtnClass:
      'border-red-500/45 bg-red-500/15 hover:bg-red-500/25 text-red-900 dark:text-red-200',
    presets: [
      { label: 'Padrão', values: DEFAULT_VOICE_TUNING.ultron },
      { label: 'Abissal', values: { pitchSemitones: -2.5, speed: 0.9, modulation: 75 } },
      { label: 'Frio Limpo', values: { pitchSemitones: -0.5, speed: 0.95, modulation: 15 } },
    ],
  },
];

export function GlobalVoiceConfigPanel({
  jarvisVoice,
  fridayVoice,
  ultronVoice,
  autoSpeak,
  isSpeaking,
  adoptMatrixOnListen,
  voiceTuning,
  labAmbienceEnabled = false,
  labAmbienceLevel = 'sutil',
  startupDefaultVoices = FACTORY_DEFAULT_VOICES,
  hasCustomStartupDefaults = false,
  activeTab: controlledTab,
  onTabChange,
  themeMode = 'sala-stark',
  resolvedTheme = 'sala-stark',
  autoThemeSchedule = DEFAULT_AUTO_THEME_SCHEDULE,
  currentTime,
  onChangeThemeMode,
  onChangeAutoThemeSchedule,
  onChangeJarvisVoice,
  onChangeFridayVoice,
  onChangeUltronVoice,
  onToggleLabAmbience,
  onChangeLabAmbienceLevel,
  onSaveStartupDefaultVoices,
  onResetStartupDefaultVoices,
  onToggleAdoptMatrixOnListen,
  onUpdateVoiceTuning,
  onApplyTunedVoice,
  onResetVoiceTuning,
  onToggleAutoSpeak,
  onPlayJarvisOriginalSample,
  onPlayUltronOriginalSample,
  onTestSynthesizedVoice,
}: GlobalVoiceConfigPanelProps) {
  const [internalTab, setInternalTab] = useState<GlobalVoiceConfigTab>('vozes');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [draftStartupVoices, setDraftStartupVoices] = useState<StartupDefaultVoices>(() => ({
    ...startupDefaultVoices,
  }));

  useEffect(() => {
    setDraftStartupVoices({ ...startupDefaultVoices });
  }, [startupDefaultVoices]);

  const isStartupDefaultsDirty =
    draftStartupVoices.jarvis !== startupDefaultVoices.jarvis ||
    draftStartupVoices['sexta-feira'] !== startupDefaultVoices['sexta-feira'] ||
    draftStartupVoices.ultron !== startupDefaultVoices.ultron;
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

  const getActiveBaseVoiceLabel = (speaker: AssistantId): string => {
    if (speaker === 'jarvis') return jarvisVoice;
    if (speaker === 'sexta-feira') return fridayVoice;
    return ultronVoice;
  };

  const handleApplyAssistantTuning = (speaker: AssistantId, name: string) => {
    const next = draftTuning[speaker];
    triggerHaptic('success');
    if (onApplyTunedVoice) {
      onApplyTunedVoice(speaker, next);
    } else {
      onUpdateVoiceTuning(speaker, next);
    }
    const pitchStr =
      next.pitchSemitones > 0
        ? `+${next.pitchSemitones.toFixed(1)} st`
        : `${next.pitchSemitones.toFixed(1)} st`;
    triggerSavedNotice(
      `Voz afinada aplicada para ${name} (${getActiveBaseVoiceLabel(
        speaker
      )} · ${pitchStr} · ${next.speed.toFixed(2)}x · Mod ${next.modulation}%). O sistema assumiu esta voz.`
    );
  };

  const nowDate = currentTime ?? new Date();
  const autoThemeInfo = getAutoThemeTransitionInfo(nowDate, autoThemeSchedule);
  const isAutoThemeActive = themeMode === 'auto';
  const hourOptions = Array.from({ length: 24 }, (_, idx) => idx);

  const currentTab = controlledTab ?? internalTab;
  const setCurrentTab = (next: GlobalVoiceConfigTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

  const triggerSavedNotice = (label: string) => {
    setSavedNotice(label);
    window.setTimeout(() => {
      setSavedNotice((prev) => (prev === label ? null : prev));
    }, 3200);
  };

  const handleResetDefaults = () => {
    triggerHaptic('success');
    onChangeJarvisVoice('JarvisOriginal');
    onChangeFridayVoice('Kore');
    onChangeUltronVoice('UltronOriginal');
    onResetVoiceTuning();
    triggerSavedNotice(
      'Vozes e afinação vocal restauradas para o padrão original (Tom 0.0 st, Velocidade 1.00x e modulação calibrada).'
    );
  };

  const selectedJarvisMeta =
    JARVIS_VOICE_OPTIONS.find((o) => o.value === jarvisVoice) ??
    JARVIS_VOICE_OPTIONS[0];
  const selectedFridayMeta =
    FRIDAY_TIMBRE_OPTIONS.find((o) => o.value === fridayVoice) ??
    FRIDAY_TIMBRE_OPTIONS[0];
  const selectedUltronMeta =
    ULTRON_VOICE_OPTIONS.find((o) => o.value === ultronVoice) ??
    ULTRON_VOICE_OPTIONS[0];

  return (
    <section
      aria-label="Painel de Configuração Global de Voz"
      className="rounded-2xl border border-slate-200 dark:border-cyan-500/30 bg-white/95 dark:bg-[#05121F]/90 p-5 sm:p-6 shadow-xs space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-cyan-500/20 pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
            <AudioWaveform className="h-4 w-4 shrink-0" />
            <span>ENGENHARIA ACÚSTICA STARK · SELEÇÃO ATIVA DE VOZES</span>
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Painel de Configuração Global de Voz dos Assistentes
          </h2>
          <p className="text-xs text-slate-600 dark:text-cyan-100/75 max-w-2xl leading-relaxed">
            Selecione o timbre de <strong>J.A.R.V.I.S.</strong>, <strong>SEXTA-FEIRA</strong> e{' '}
            <strong>ULTRON</strong>. Assim que você escolhe uma voz, o sistema ativa, salva no{' '}
            <code className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300">
              localStorage
            </code>{' '}
            e passa a responder imediatamente na voz selecionada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('toggle');
              onToggleAutoSpeak();
              triggerSavedNotice(
                `Resposta automática em voz ${!autoSpeak ? 'ATIVADA' : 'DESATIVADA'} no localStorage.`
              );
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
              autoSpeak
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
            }`}
          >
            {autoSpeak ? (
              <Volume2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
            <span>Voz Automática: {autoSpeak ? 'Ativa' : 'Pausada'}</span>
          </button>

          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-cyan-500/35 bg-white dark:bg-[#071A2C] hover:bg-slate-100 dark:hover:bg-cyan-950/70 px-3 py-2 text-xs font-medium text-slate-700 dark:text-cyan-100 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restaurar Padrão Original</span>
          </button>
        </div>
      </div>

      {/* Settings Tabs: Seleção de Vozes vs Afinação Vocal Independente */}
      <div
        role="tablist"
        aria-label="Abas de configuração vocal"
        className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-cyan-500/20 pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={currentTab === 'vozes'}
          onClick={() => {
            triggerHaptic('toggle');
            setCurrentTab('vozes');
          }}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
            currentTab === 'vozes'
              ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-900 dark:text-cyan-200'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Volume2 className="h-3.5 w-3.5 shrink-0" />
          <span>Seleção de Vozes</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={currentTab === 'afinacao'}
          onClick={() => {
            triggerHaptic('toggle');
            setCurrentTab('afinacao');
          }}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
            currentTab === 'afinacao'
              ? 'border-amber-500/60 bg-amber-500/15 text-amber-900 dark:text-amber-200'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          <span>Afinação Vocal (Tom · Velocidade · Modulação)</span>
        </button>

        {onChangeThemeMode && (
          <button
            type="button"
            role="tab"
            aria-selected={currentTab === 'tema'}
            onClick={() => {
              triggerHaptic('toggle');
              setCurrentTab('tema');
            }}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
              currentTab === 'tema'
                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Tema Automático &amp; Ambiente</span>
            {isAutoThemeActive && (
              <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-emerald-800 dark:text-emerald-200">
                AUTO
              </span>
            )}
          </button>
        )}
      </div>

      {/* Saved Confirmation Toast */}
      {savedNotice && (
        <div className="rounded-xl border border-emerald-500/45 bg-emerald-50/90 dark:bg-emerald-950/40 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{savedNotice}</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            ATIVA NO MOTOR
          </span>
        </div>
      )}

      {currentTab === 'tema' && onChangeThemeMode ? (
        <div className="space-y-5">
          {/* Primary Auto-Theme Toggle Card */}
          <div className="rounded-xl border border-cyan-500/35 bg-gradient-to-br from-amber-500/10 via-slate-50 to-cyan-500/10 dark:from-orange-500/10 dark:via-[#061524] dark:to-cyan-500/15 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>CICLO DINÂMICO DE AMBIENTE DE COMANDO</span>
                </div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Tema Automático (Sala Stark ↔ Holográfico)
                </h3>
                <p className="text-xs text-slate-600 dark:text-cyan-100/80 max-w-2xl leading-relaxed">
                  Alterna automaticamente entre <strong>Sala Stark</strong> durante o dia e{' '}
                  <strong>Holográfico</strong> no período noturno conforme o horário local do sistema.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isAutoThemeActive}
                onClick={() => {
                  triggerHaptic('toggle');
                  if (isAutoThemeActive) {
                    onChangeThemeMode(resolvedTheme);
                    triggerSavedNotice(
                      `Tema Automático desativado. Ambiente fixado em "${
                        resolvedTheme === 'sala-stark' ? 'Sala Stark' : 'Holográfico'
                      }".`
                    );
                  } else {
                    onChangeThemeMode('auto');
                    triggerSavedNotice(
                      `Tema Automático ATIVADO: agora em "${autoThemeInfo.activeThemeLabel}" · próxima troca para "${autoThemeInfo.nextThemeLabel}" às ${autoThemeInfo.nextSwitchHourLabel}.`
                    );
                  }
                }}
                className={`inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all shrink-0 self-start sm:self-auto ${
                  isAutoThemeActive
                    ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.2)]'
                    : 'border-slate-300 dark:border-cyan-500/35 bg-white dark:bg-[#040E1A] text-slate-700 dark:text-cyan-100 hover:bg-slate-100 dark:hover:bg-cyan-950/60'
                }`}
              >
                <span
                  className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
                    isAutoThemeActive
                      ? 'bg-emerald-500 justify-end'
                      : 'bg-slate-300 dark:bg-slate-700 justify-start'
                  }`}
                >
                  <span className="h-4 w-4 rounded-full bg-white shadow-xs" />
                </span>
                <span>{isAutoThemeActive ? 'Tema Automático: ATIVO' : 'Ativar Tema Automático'}</span>
              </button>
            </div>

            {/* Live Clock & Transition Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="rounded-lg border border-slate-200/80 dark:border-cyan-500/25 bg-white/80 dark:bg-[#040E1A]/85 px-3.5 py-2.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Horário Local Detectado
                </div>
                <div className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
                  {nowDate.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200/80 dark:border-cyan-500/25 bg-white/80 dark:bg-[#040E1A]/85 px-3.5 py-2.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Ambiente em Execução
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-display text-sm font-bold text-amber-700 dark:text-cyan-300">
                  {resolvedTheme === 'sala-stark' ? (
                    <Globe className="h-4 w-4 text-orange-500 shrink-0" />
                  ) : resolvedTheme === 'hologram' ? (
                    <Sparkles className="h-4 w-4 text-cyan-400 shrink-0" />
                  ) : resolvedTheme === 'dark' ? (
                    <Moon className="h-4 w-4 text-amber-400 shrink-0" />
                  ) : (
                    <Sun className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  <span>
                    {resolvedTheme === 'sala-stark'
                      ? 'Sala Stark'
                      : resolvedTheme === 'hologram'
                      ? 'Holográfico'
                      : resolvedTheme === 'dark'
                      ? 'Escuro'
                      : 'Claro'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200/80 dark:border-cyan-500/25 bg-white/80 dark:bg-[#040E1A]/85 px-3.5 py-2.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Próxima Alternância Automática
                </div>
                <div className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-cyan-100">
                  {autoThemeInfo.nextThemeLabel} às{' '}
                  <span className="font-mono">{autoThemeInfo.nextSwitchHourLabel}</span>{' '}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    ({autoThemeInfo.remainingText})
                  </span>
                </div>
              </div>
            </div>

            {/* Schedule Controls */}
            {onChangeAutoThemeSchedule && (
              <div className="rounded-xl border border-slate-200/80 dark:border-cyan-500/20 bg-white/80 dark:bg-[#040D18]/80 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    Janelas de Horário (Sala Stark Diurno · Holográfico Noturno)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap');
                      onChangeAutoThemeSchedule(DEFAULT_AUTO_THEME_SCHEDULE);
                      triggerSavedNotice(
                        'Horários do Tema Automático restaurados para 06:00 (Sala Stark) e 18:00 (Holográfico).'
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Padrão (06:00 / 18:00)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="auto-theme-day-start"
                      className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-orange-300 mb-1.5"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span>Ativar Sala Stark (Diurno) a partir de:</span>
                    </label>
                    <select
                      id="auto-theme-day-start"
                      value={autoThemeSchedule.dayStartHour}
                      onChange={(e) => {
                        const nextDay = parseInt(e.target.value, 10);
                        if (nextDay === autoThemeSchedule.nightStartHour) return;
                        triggerHaptic('tap');
                        onChangeAutoThemeSchedule({
                          ...autoThemeSchedule,
                          dayStartHour: nextDay,
                        });
                        triggerSavedNotice(
                          `Horário diurno (Sala Stark) atualizado para ${formatHourLabel(nextDay)}.`
                        );
                      }}
                      className="w-full rounded-lg border border-orange-500/40 bg-white dark:bg-[#05101D] px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-400"
                    >
                      {hourOptions.map((h) => (
                        <option
                          key={h}
                          value={h}
                          disabled={h === autoThemeSchedule.nightStartHour}
                        >
                          {formatHourLabel(h)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="auto-theme-night-start"
                      className="flex items-center gap-1.5 text-xs font-medium text-cyan-800 dark:text-cyan-300 mb-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Ativar Holográfico (Noturno) a partir de:</span>
                    </label>
                    <select
                      id="auto-theme-night-start"
                      value={autoThemeSchedule.nightStartHour}
                      onChange={(e) => {
                        const nextNight = parseInt(e.target.value, 10);
                        if (nextNight === autoThemeSchedule.dayStartHour) return;
                        triggerHaptic('tap');
                        onChangeAutoThemeSchedule({
                          ...autoThemeSchedule,
                          nightStartHour: nextNight,
                        });
                        triggerSavedNotice(
                          `Horário noturno (Holográfico) atualizado para ${formatHourLabel(nextNight)}.`
                        );
                      }}
                      className="w-full rounded-lg border border-cyan-500/40 bg-white dark:bg-[#05101D] px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-400"
                    >
                      {hourOptions.map((h) => (
                        <option
                          key={h}
                          value={h}
                          disabled={h === autoThemeSchedule.dayStartHour}
                        >
                          {formatHourLabel(h)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 24h Visual Cycle Bar */}
                <div className="space-y-1 pt-1">
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-cyan-950/80 border border-cyan-500/30 flex">
                    {hourOptions.map((h) => {
                      const isDay =
                        autoThemeSchedule.dayStartHour < autoThemeSchedule.nightStartHour
                          ? h >= autoThemeSchedule.dayStartHour &&
                            h < autoThemeSchedule.nightStartHour
                          : h >= autoThemeSchedule.dayStartHour ||
                            h < autoThemeSchedule.nightStartHour;
                      const isNowHour = h === nowDate.getHours();
                      return (
                        <div
                          key={h}
                          title={`${formatHourLabel(h)} · ${isDay ? 'Sala Stark' : 'Holográfico'}`}
                          className={`flex-1 h-full transition-colors ${
                            isDay
                              ? 'bg-gradient-to-b from-orange-400 to-amber-500'
                              : 'bg-gradient-to-b from-cyan-500/80 to-sky-700/90'
                          } ${isNowHour ? 'ring-2 ring-white z-10' : ''}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    <span>00:00</span>
                    <span>
                      Sala Stark: {formatHourLabel(autoThemeSchedule.dayStartHour)} –{' '}
                      {formatHourLabel(autoThemeSchedule.nightStartHour)}
                    </span>
                    <span>23:00</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Direct Theme Selection Grid */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider font-mono text-slate-500 dark:text-slate-400">
              Seleção Rápida de Modo Visual
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {(
                [
                  {
                    id: 'auto',
                    label: 'Automático',
                    desc: 'Sala Stark (dia) ↔ Holográfico (noite)',
                    icon: Clock,
                    activeClass:
                      'border-emerald-500/70 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200',
                  },
                  {
                    id: 'sala-stark',
                    label: 'Sala Stark',
                    desc: 'Centro de comando tático e monitores ao vivo',
                    icon: Globe,
                    activeClass:
                      'border-orange-500/70 bg-orange-500/15 text-orange-900 dark:text-orange-200',
                  },
                  {
                    id: 'hologram',
                    label: 'Holográfico',
                    desc: 'Laboratório noturno em ciano profundo',
                    icon: Sparkles,
                    activeClass:
                      'border-cyan-500/70 bg-cyan-500/15 text-cyan-900 dark:text-cyan-200',
                  },
                  {
                    id: 'dark',
                    label: 'Escuro',
                    desc: 'Interface limpa de alto contraste escuro',
                    icon: Moon,
                    activeClass:
                      'border-amber-500/60 bg-slate-800/80 text-amber-200',
                  },
                  {
                    id: 'light',
                    label: 'Claro',
                    desc: 'Modo luminoso minimalista para leitura',
                    icon: Sun,
                    activeClass:
                      'border-amber-500/60 bg-amber-50 text-amber-900',
                  },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = themeMode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('toggle');
                      onChangeThemeMode(item.id);
                      triggerSavedNotice(
                        item.id === 'auto'
                          ? `Tema Automático ativado (${autoThemeInfo.activeThemeLabel} agora).`
                          : `Tema visual alterado para "${item.label}".`
                      );
                    }}
                    className={`rounded-xl border p-3 text-left transition-all space-y-1 ${
                      active
                        ? item.activeClass
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-display text-xs font-bold">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {active && (
                        <span className="font-mono text-[9px] uppercase font-semibold">
                          Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] opacity-80 leading-snug">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : currentTab === 'afinacao' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-cyan-500/25 bg-slate-50/90 dark:bg-[#071829]/80 px-4 py-3">
            <p className="text-xs text-slate-600 dark:text-cyan-100/80 max-w-2xl leading-relaxed">
              Ajuste o <strong>Tom (Pitch)</strong>, a <strong>Velocidade</strong> e a{' '}
              <strong>Modulação</strong> de cada assistente, ouça em{' '}
              <strong>Testar Afinação</strong> e clique em{' '}
              <strong className="text-emerald-700 dark:text-emerald-300">
                Aplicar Voz Afinada
              </strong>{' '}
              para que o sistema assuma permanentemente essa voz para cada IA.
            </p>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onToggleLabAmbience && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={labAmbienceEnabled}
                  onClick={() => {
                    const next = !labAmbienceEnabled;
                    triggerHaptic('toggle');
                    onToggleLabAmbience(next);
                    triggerSavedNotice(
                      next
                        ? `Ambiente de Laboratório ATIVADO (${labAmbienceLevel}): reverberação espacial aplicada a todas as IAs.`
                        : 'Ambiente de Laboratório DESATIVADO.'
                    );
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    labAmbienceEnabled
                      ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-900 dark:text-cyan-200'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  <span>
                    Ambiente de Laboratório: {labAmbienceEnabled ? 'Ativo' : 'Off'}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  onResetVoiceTuning();
                  triggerSavedNotice(
                    'Afinação vocal de J.A.R.V.I.S., SEXTA-FEIRA e ULTRON restaurada para o padrão.'
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-cyan-500/35 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-cyan-100 transition-colors shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Zerar Todas as Afinações</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {ASSISTANT_TUNING_META.map((meta) => {
              const t = draftTuning[meta.id];
              const dirty = isTuningDirty(meta.id);
              const baseVoice = getActiveBaseVoiceLabel(meta.id);
              const pitchDisplay =
                t.pitchSemitones > 0
                  ? `+${t.pitchSemitones.toFixed(1)} st`
                  : `${t.pitchSemitones.toFixed(1)} st`;
              return (
                <div
                  key={meta.id}
                  className={`rounded-xl border p-4 flex flex-col justify-between space-y-4 ${meta.cardClass}`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-display text-sm font-bold ${meta.titleClass}`}>
                            {meta.name}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold border ${
                              dirty
                                ? 'border-amber-500/60 bg-amber-500/20 text-amber-900 dark:text-amber-200'
                                : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                            }`}
                          >
                            {dirty ? 'Ajuste pendente' : 'Ativa no sistema'}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-cyan-200/70 mt-0.5">
                          Voz base: <strong>{baseVoice}</strong> · {meta.subtitle}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold shrink-0 ${meta.badgeClass}`}
                      >
                        {t.speed.toFixed(2)}x · {pitchDisplay}
                      </span>
                    </div>

                    {/* Pitch Slider */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label
                          htmlFor={`tuning-pitch-${meta.id}`}
                          className="font-medium text-slate-700 dark:text-slate-200"
                        >
                          Tom (Pitch)
                        </label>
                        <span className={`font-mono text-xs font-semibold tabular-nums ${meta.titleClass}`}>
                          {pitchDisplay}
                        </span>
                      </div>
                      <input
                        id={`tuning-pitch-${meta.id}`}
                        type="range"
                        min={-6}
                        max={6}
                        step={0.5}
                        value={t.pitchSemitones}
                        onChange={(e) =>
                          updateDraftTuning(meta.id, {
                            pitchSemitones: parseFloat(e.target.value),
                          })
                        }
                        className={`w-full cursor-pointer ${meta.sliderClass}`}
                      />
                      <div className="flex justify-between font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        <span>-6.0 st (Grave)</span>
                        <span>0.0 st</span>
                        <span>+6.0 st (Agudo)</span>
                      </div>
                    </div>

                    {/* Speed Slider */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label
                          htmlFor={`tuning-speed-${meta.id}`}
                          className="font-medium text-slate-700 dark:text-slate-200"
                        >
                          Velocidade da Fala
                        </label>
                        <span className={`font-mono text-xs font-semibold tabular-nums ${meta.titleClass}`}>
                          {t.speed.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        id={`tuning-speed-${meta.id}`}
                        type="range"
                        min={0.75}
                        max={1.35}
                        step={0.05}
                        value={t.speed}
                        onChange={(e) =>
                          updateDraftTuning(meta.id, {
                            speed: parseFloat(e.target.value),
                          })
                        }
                        className={`w-full cursor-pointer ${meta.sliderClass}`}
                      />
                      <div className="flex justify-between font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        <span>0.75x (Lento)</span>
                        <span>1.00x</span>
                        <span>1.35x (Ágil)</span>
                      </div>
                    </div>

                    {/* Modulation Slider */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label
                          htmlFor={`tuning-mod-${meta.id}`}
                          className="font-medium text-slate-700 dark:text-slate-200"
                        >
                          Modulação
                        </label>
                        <span className={`font-mono text-xs font-semibold tabular-nums ${meta.titleClass}`}>
                          {t.modulation}%
                        </span>
                      </div>
                      <input
                        id={`tuning-mod-${meta.id}`}
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={t.modulation}
                        onChange={(e) =>
                          updateDraftTuning(meta.id, {
                            modulation: parseInt(e.target.value, 10),
                          })
                        }
                        className={`w-full cursor-pointer ${meta.sliderClass}`}
                      />
                      <div className="flex justify-between font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        <span>0% (Seco)</span>
                        <span className="truncate px-1">{meta.modLabel}</span>
                        <span>100%</span>
                      </div>
                    </div>

                    {/* Presets */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Perfis Rápidos
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {meta.presets.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              triggerHaptic('tap');
                              updateDraftTuning(meta.id, preset.values);
                            }}
                            className="rounded-lg border border-slate-300/80 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors truncate"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Primary Side-by-Side Actions: Testar Afinação + Aplicar Voz Afinada */}
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isSpeaking}
                        onClick={() => {
                          triggerHaptic('tap');
                          onTestSynthesizedVoice(meta.id, t);
                        }}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${meta.testBtnClass}`}
                      >
                        <Sparkles className="h-3.5 w-3.5 shrink-0" />
                        <span>Testar Afinação</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyAssistantTuning(meta.id, meta.name)}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all ${
                          dirty
                            ? 'border-emerald-500 bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.4)]'
                            : 'border-emerald-500/55 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-900 dark:text-emerald-200'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        <span>Aplicar Voz Afinada</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        onResetVoiceTuning(meta.id);
                        triggerSavedNotice(`Afinação de ${meta.name} restaurada para o padrão.`);
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3 shrink-0" />
                      <span>Restaurar Padrão ({meta.name})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {/* Global Acoustic Modulation: Ambiente de Laboratório (Light Room Reverb) */}
          {onToggleLabAmbience && (
            <div className="rounded-xl border border-cyan-500/35 bg-gradient-to-r from-cyan-500/10 via-slate-50 to-sky-500/10 dark:from-cyan-500/10 dark:via-[#061626] dark:to-sky-500/10 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                    <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                    <span>MODULAÇÃO ACÚSTICA ESPACIAL · CONVOLVER WEBAUDIO</span>
                  </div>
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Ambiente de Laboratório (Reverberação Leve nas Respostas)
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-cyan-100/75 max-w-2xl leading-relaxed">
                    Aplica uma reverberação sutil de sala tecnológica com reflexões iniciais limpas e
                    micro-modulação espacial em todas as respostas de áudio de{' '}
                    <strong>J.A.R.V.I.S.</strong>, <strong>SEXTA-FEIRA</strong> e{' '}
                    <strong>ULTRON</strong>.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={labAmbienceEnabled}
                  onClick={() => {
                    const next = !labAmbienceEnabled;
                    triggerHaptic('toggle');
                    onToggleLabAmbience(next);
                    triggerSavedNotice(
                      next
                        ? `Efeito "Ambiente de Laboratório" ATIVADO (nível ${labAmbienceLevel}) para J.A.R.V.I.S., SEXTA-FEIRA e ULTRON.`
                        : 'Efeito "Ambiente de Laboratório" DESATIVADO. Áudio restaurado ao modo direto.'
                    );
                  }}
                  className={`inline-flex items-center gap-2.5 rounded-xl border px-4 py-2 text-xs font-semibold transition-all shrink-0 self-start sm:self-auto ${
                    labAmbienceEnabled
                      ? 'border-cyan-500/70 bg-cyan-500/20 text-cyan-900 dark:text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.22)]'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#040E1A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
                      labAmbienceEnabled
                        ? 'bg-cyan-500 justify-end'
                        : 'bg-slate-300 dark:bg-slate-700 justify-start'
                    }`}
                  >
                    <span className="h-4 w-4 rounded-full bg-white shadow-xs" />
                  </span>
                  <span>
                    {labAmbienceEnabled
                      ? 'Ambiente de Laboratório: ATIVO'
                      : 'Ativar Ambiente de Laboratório'}
                  </span>
                </button>
              </div>

              {onChangeLabAmbienceLevel && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-cyan-500/20">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mr-1">
                      Intensidade da Reverberação:
                    </span>
                    {(
                      [
                        { id: 'sutil', label: 'Sutil (Leve)' },
                        { id: 'equilibrado', label: 'Equilibrado' },
                        { id: 'imersivo', label: 'Imersivo' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('tap');
                          if (!labAmbienceEnabled) {
                            onToggleLabAmbience(true);
                          }
                          onChangeLabAmbienceLevel(opt.id);
                          triggerSavedNotice(
                            `Reverberação do Ambiente de Laboratório ajustada para "${opt.label}".`
                          );
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          labAmbienceLevel === opt.id && labAmbienceEnabled
                            ? 'border-cyan-500 bg-cyan-500/20 text-cyan-900 dark:text-cyan-200'
                            : 'border-slate-300/80 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:border-cyan-500/40'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={isSpeaking}
                    onClick={() => {
                      triggerHaptic('tap');
                      if (!labAmbienceEnabled) {
                        onToggleLabAmbience(true);
                      }
                      onTestSynthesizedVoice('jarvis');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/45 bg-cyan-500/15 hover:bg-cyan-500/25 px-3 py-1.5 text-[11px] font-semibold text-cyan-900 dark:text-cyan-200 transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span>Ouvir Efeito no Laboratório</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Global Startup Default Voices Selector */}
          {onSaveStartupDefaultVoices && (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-50/40 dark:bg-[#061822]/90 p-4 space-y-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>SELETOR GLOBAL DE INICIALIZAÇÃO AUTOMÁTICA</span>
                    <span
                      className={`rounded px-1.5 py-0.5 border text-[9px] font-semibold ${
                        hasCustomStartupDefaults
                          ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {hasCustomStartupDefaults ? 'Padrão Personalizado Ativo' : 'Padrão de Fábrica'}
                    </span>
                  </div>
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Vozes Padrão de Inicialização do Sistema
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                    Defina aqui a voz padrão de cada IA que o <strong>RODACK SISTEMA DE IA</strong>{' '}
                    carregará automaticamente toda vez que o sistema for inicializado.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap');
                      setDraftStartupVoices({
                        jarvis: jarvisVoice,
                        'sexta-feira': fridayVoice,
                        ultron: ultronVoice,
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    <span>Usar Vozes Atuais</span>
                  </button>
                  {onResetStartupDefaultVoices && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        onResetStartupDefaultVoices();
                        triggerSavedNotice(
                          'Vozes padrão de inicialização restauradas para o padrão de fábrica (JarvisOriginal · Kore · UltronOriginal).'
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Padrão de Fábrica</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="startup-default-jarvis"
                    className="block text-[11px] font-semibold text-amber-800 dark:text-amber-300 mb-1"
                  >
                    Voz Padrão · J.A.R.V.I.S.
                  </label>
                  <select
                    id="startup-default-jarvis"
                    value={draftStartupVoices.jarvis}
                    onChange={(e) =>
                      setDraftStartupVoices((prev) => ({
                        ...prev,
                        jarvis: e.target.value as JarvisVoiceOption,
                      }))
                    }
                    className="w-full rounded-lg border border-amber-500/45 bg-white dark:bg-[#040D18] px-2.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-400"
                  >
                    {JARVIS_VOICE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="startup-default-friday"
                    className="block text-[11px] font-semibold text-sky-800 dark:text-cyan-300 mb-1"
                  >
                    Voz Padrão · SEXTA-FEIRA
                  </label>
                  <select
                    id="startup-default-friday"
                    value={draftStartupVoices['sexta-feira']}
                    onChange={(e) =>
                      setDraftStartupVoices((prev) => ({
                        ...prev,
                        'sexta-feira': e.target.value as FridayVoiceOption,
                      }))
                    }
                    className="w-full rounded-lg border border-sky-500/45 bg-white dark:bg-[#040D18] px-2.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    {FRIDAY_TIMBRE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="startup-default-ultron"
                    className="block text-[11px] font-semibold text-red-700 dark:text-red-400 mb-1"
                  >
                    Voz Padrão · ULTRON
                  </label>
                  <select
                    id="startup-default-ultron"
                    value={draftStartupVoices.ultron}
                    onChange={(e) =>
                      setDraftStartupVoices((prev) => ({
                        ...prev,
                        ultron: e.target.value as UltronVoiceOption,
                      }))
                    }
                    className="w-full rounded-lg border border-red-500/45 bg-white dark:bg-[#040D18] px-2.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-red-400"
                  >
                    {ULTRON_VOICE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  Carregamento automático ao iniciar:{' '}
                  <strong className="text-slate-900 dark:text-emerald-300">
                    {startupDefaultVoices.jarvis} · {startupDefaultVoices['sexta-feira']} ·{' '}
                    {startupDefaultVoices.ultron}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('success');
                    onSaveStartupDefaultVoices(draftStartupVoices, true);
                    triggerSavedNotice(
                      `Vozes padrão de inicialização salvas e ativadas: J.A.R.V.I.S. (${draftStartupVoices.jarvis}), SEXTA-FEIRA (${draftStartupVoices['sexta-feira']}) e ULTRON (${draftStartupVoices.ultron}).`
                    );
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                    isStartupDefaultsDirty
                      ? 'border-emerald-500 bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.4)]'
                      : 'border-emerald-500/55 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-900 dark:text-emerald-200'
                  }`}
                >
                  <Save className="h-3.5 w-3.5 shrink-0" />
                  <span>Salvar &amp; Ativar Padrão de Inicialização</span>
                </button>
              </div>
            </div>
          )}

          {/* Selectable option: assume Exclusive Matrix voice when clicking "Ouvir Matriz Exclusiva" */}
          <label className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 dark:border-cyan-500/30 bg-slate-50/90 dark:bg-[#071829]/85 px-4 py-2.5 cursor-pointer select-none">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={adoptMatrixOnListen}
                onChange={(e) => {
                  triggerHaptic('toggle');
                  onToggleAdoptMatrixOnListen(e.target.checked);
                  triggerSavedNotice(
                    e.target.checked
                      ? 'Opção ativada: ao clicar em "Ouvir Matriz Exclusiva", a IA assume automaticamente essa voz.'
                      : 'Modo prévia: "Ouvir Matriz Exclusiva" apenas reproduz o áudio sem alterar a voz selecionada.'
                  );
                }}
                className="h-4 w-4 rounded border-slate-400 dark:border-cyan-500/60 accent-amber-500 dark:accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-800 dark:text-slate-100">
                Assumir automaticamente a voz da <strong>Matriz Exclusiva</strong> para a IA ao clicar em{' '}
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  “Ouvir Matriz Exclusiva”
                </span>
              </span>
            </div>
            <span
              className={`shrink-0 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                adoptMatrixOnListen
                  ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400'
              }`}
            >
              {adoptMatrixOnListen ? 'Ativo' : 'Somente prévia'}
            </span>
          </label>

          {/* 3-Column Assistant Timbre Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. J.A.R.V.I.S. Card */}
        <div className="rounded-xl border border-amber-500/45 dark:border-amber-400/40 bg-amber-50/40 dark:bg-[#071524]/90 p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-display text-sm font-bold text-amber-800 dark:text-amber-300">
                  J.A.R.V.I.S.
                </span>
                <p className="text-[11px] font-mono text-slate-500 dark:text-cyan-200/70">
                  Chave: stark_jarvis_voice_v4
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                <ShieldCheck className="h-3 w-3" />
                <span>{jarvisVoice}</span>
              </span>
            </div>

            <div>
              <label
                htmlFor="global-jarvis-voice"
                className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Voz Ativa de J.A.R.V.I.S.
              </label>
              <select
                id="global-jarvis-voice"
                value={jarvisVoice}
                onChange={(e) => {
                  triggerHaptic('tap');
                  const next = e.target.value as JarvisVoiceOption;
                  onChangeJarvisVoice(next);
                  triggerSavedNotice(
                    `Voz de J.A.R.V.I.S. ativada para "${next}" e sincronizada no motor de síntese.`
                  );
                }}
                className="w-full rounded-xl border border-amber-500/45 bg-white dark:bg-[#040D18] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-400"
              >
                {JARVIS_VOICE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-amber-500/25 bg-white/80 dark:bg-[#040C16]/80 p-3 space-y-1">
              <div className="font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                {selectedJarvisMeta.spec}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {selectedJarvisMeta.description}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              disabled={isSpeaking}
              onClick={() => {
                triggerHaptic('tap');
                onTestSynthesizedVoice('jarvis');
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/45 bg-amber-500/15 hover:bg-amber-500/25 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 transition-colors disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>Testar ({jarvisVoice})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                onPlayJarvisOriginalSample();
                if (adoptMatrixOnListen) {
                  triggerSavedNotice(
                    'Matriz Exclusiva (104.3 Hz) assumida para J.A.R.V.I.S. e ativa em todas as respostas.'
                  );
                }
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                jarvisVoice === 'JarvisOriginal'
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-900 dark:text-amber-100'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <Volume2 className="h-3.5 w-3.5 shrink-0" />
              <span>
                {adoptMatrixOnListen
                  ? 'Ouvir e Assumir Matriz (104.3 Hz)'
                  : 'Ouvir Matriz Exclusiva (104.3 Hz)'}
              </span>
            </button>
          </div>
        </div>

        {/* 2. SEXTA-FEIRA Card */}
        <div className="rounded-xl border border-sky-500/35 dark:border-cyan-400/30 bg-sky-50/40 dark:bg-[#071524]/90 p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-display text-sm font-bold text-sky-800 dark:text-cyan-300">
                  SEXTA-FEIRA
                </span>
                <p className="text-[11px] font-mono text-slate-500 dark:text-cyan-200/70">
                  Chave: stark_friday_voice
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 font-mono text-[10px] text-sky-800 dark:text-cyan-200">
                <ShieldCheck className="h-3 w-3" />
                <span>{fridayVoice}</span>
              </span>
            </div>

            <div>
              <label
                htmlFor="global-friday-voice"
                className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Voz Ativa de SEXTA-FEIRA
              </label>
              <select
                id="global-friday-voice"
                value={fridayVoice}
                onChange={(e) => {
                  triggerHaptic('tap');
                  const next = e.target.value as FridayVoiceOption;
                  onChangeFridayVoice(next);
                  triggerSavedNotice(
                    `Voz de SEXTA-FEIRA ativada para "${next}" e sincronizada no motor de síntese.`
                  );
                }}
                className="w-full rounded-xl border border-slate-300 dark:border-cyan-500/40 bg-white dark:bg-[#040D18] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                {FRIDAY_TIMBRE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-sky-500/20 bg-white/80 dark:bg-[#040C16]/80 p-3 space-y-1">
              <div className="font-mono text-[11px] font-semibold text-sky-700 dark:text-cyan-300">
                {selectedFridayMeta.spec}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {selectedFridayMeta.description}
              </p>
            </div>
          </div>

          <div className="pt-1">
            <button
              type="button"
              disabled={isSpeaking}
              onClick={() => {
                triggerHaptic('tap');
                onTestSynthesizedVoice('sexta-feira');
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/45 bg-sky-500/15 hover:bg-sky-500/25 px-3 py-2 text-xs font-semibold text-sky-900 dark:text-cyan-200 transition-colors disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>Testar ({fridayVoice})</span>
            </button>
          </div>
        </div>

        {/* 3. ULTRON Card */}
        <div className="rounded-xl border border-red-500/45 dark:border-red-500/40 bg-red-50/40 dark:bg-[#071524]/90 p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-display text-sm font-bold text-red-700 dark:text-red-400">
                  ULTRON
                </span>
                <p className="text-[11px] font-mono text-slate-500 dark:text-cyan-200/70">
                  Chave: stark_ultron_voice_v4
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-red-500/50 bg-red-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-red-900 dark:text-red-200">
                <ShieldCheck className="h-3 w-3" />
                <span>{ultronVoice}</span>
              </span>
            </div>

            <div>
              <label
                htmlFor="global-ultron-voice"
                className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Voz Ativa de ULTRON
              </label>
              <select
                id="global-ultron-voice"
                value={ultronVoice}
                onChange={(e) => {
                  triggerHaptic('tap');
                  const next = e.target.value as UltronVoiceOption;
                  onChangeUltronVoice(next);
                  triggerSavedNotice(
                    `Voz de ULTRON ativada para "${next}" com reverb de câmara e sincronizada no motor.`
                  );
                }}
                className="w-full rounded-xl border border-red-500/45 bg-white dark:bg-[#040D18] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-red-400"
              >
                {ULTRON_VOICE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-red-500/25 bg-white/80 dark:bg-[#040C16]/80 p-3 space-y-1">
              <div className="font-mono text-[11px] font-semibold text-red-700 dark:text-red-400">
                {selectedUltronMeta.spec}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {selectedUltronMeta.description}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              disabled={isSpeaking}
              onClick={() => {
                triggerHaptic('tap');
                onTestSynthesizedVoice('ultron');
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/45 bg-red-500/15 hover:bg-red-500/25 px-3 py-2 text-xs font-semibold text-red-900 dark:text-red-200 transition-colors disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>Testar ({ultronVoice})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                onPlayUltronOriginalSample();
                if (adoptMatrixOnListen) {
                  triggerSavedNotice(
                    'Matriz Exclusiva (90.2 Hz + Reverb) assumida para ULTRON e ativa em todas as respostas.'
                  );
                }
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                ultronVoice === 'UltronOriginal'
                  ? 'border-red-500/60 bg-red-500/20 text-red-900 dark:text-red-100'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <Volume2 className="h-3.5 w-3.5 shrink-0" />
              <span>
                {adoptMatrixOnListen
                  ? 'Ouvir e Assumir Matriz (90.2 Hz)'
                  : 'Ouvir Matriz Exclusiva (90.2 Hz)'}
              </span>
            </button>
          </div>
        </div>
      </div>
        </>
      )}
    </section>
  );
}
