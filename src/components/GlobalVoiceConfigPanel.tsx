import { useState } from 'react';
import {
  CheckCircle2,
  AudioWaveform,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  FridayVoiceOption,
  JarvisVoiceOption,
  UltronVoiceOption,
} from '../hooks/useVoiceEngine';
import { triggerHaptic } from '../utils/haptics';

interface GlobalVoiceConfigPanelProps {
  jarvisVoice: JarvisVoiceOption;
  fridayVoice: FridayVoiceOption;
  ultronVoice: UltronVoiceOption;
  autoSpeak: boolean;
  isSpeaking: boolean;
  onChangeJarvisVoice: (voice: JarvisVoiceOption) => void;
  onChangeFridayVoice: (voice: FridayVoiceOption) => void;
  onChangeUltronVoice: (voice: UltronVoiceOption) => void;
  onToggleAutoSpeak: () => void;
  onPlayJarvisOriginalSample: () => void;
  onPlayUltronOriginalSample: () => void;
  onTestSynthesizedVoice: (speaker: 'jarvis' | 'sexta-feira' | 'ultron') => void;
}

const JARVIS_TIMBRE_OPTIONS: Array<{
  value: JarvisVoiceOption;
  label: string;
  spec: string;
  description: string;
}> = [
  {
    value: 'JarvisOriginal',
    label: 'JarvisOriginal (Matriz Fiel ao Áudio Enviado · Padrão)',
    spec: '104.8 Hz · Barítono Sereno + Micro-Doubler HUD (11.5ms/21.5ms)',
    description:
      'Masterização PCM 24kHz fiel ao arquivo jarvis_fc632df0.m4a enviado por Patrick Pessoa: pitch Hermite 0.956x, corpo de peito em 128 Hz (+4.2 dB), presença analítica em 3.18 kHz e reflexão de console Stark.',
  },
  {
    value: 'Charon',
    label: 'Charon (Grave · Clássico)',
    spec: '98.0 Hz · Barítono Profundo',
    description:
      'Voz sintetizada de timbre grave, autoridade clássica e dicção cristalina.',
  },
  {
    value: 'Orus',
    label: 'Orus (Articulado · Estratégico)',
    spec: '112.0 Hz · Médio-Grave Preciso',
    description:
      'Timbre focado em leitura rápida de relatórios de código, arquitetura e segurança.',
  },
  {
    value: 'Iapetus',
    label: 'Iapetus (Sereno · Polido)',
    spec: '108.0 Hz · Cadência Suave',
    description:
      'Tom diplomático e equilibrado para briefings longos de agenda e notícias.',
  },
  {
    value: 'Fenrir',
    label: 'Fenrir (Firme · Tático)',
    spec: '102.0 Hz · Projeção Direta',
    description:
      'Voz enérgica e incisiva para alertas de segurança e chamadas imediatas.',
  },
];

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

const ULTRON_TIMBRE_OPTIONS: Array<{
  value: UltronVoiceOption;
  label: string;
  spec: string;
  description: string;
}> = [
  {
    value: 'UltronOriginal',
    label: 'UltronOriginal (Matriz Fiel ao Áudio Enviado · Padrão)',
    spec: '92.8 Hz · Sub-Oitava Cibernética + Ressonador Metálico (14.8ms/27.2ms)',
    description:
      'Masterização PCM 24kHz fiel ao arquivo ultron_f012fd80.m4a enviado por Patrick Pessoa: pitch Hermite 0.856x (-2.65 semitons), divisor sub-harmônico de oitava (44–120 Hz), voz dupla modulada e mordida metálica em 1.80 kHz (+4.4 dB).',
  },
  {
    value: 'Umbriel',
    label: 'Umbriel (Frio · Analítico Implacável)',
    spec: '95.0 Hz · Ressonância Sombria',
    description:
      'Voz calculista e clínica para diagnósticos de falhas em cascata e previsões de risco.',
  },
  {
    value: 'Charon',
    label: 'Charon (Grave · Imponente)',
    spec: '96.0 Hz · Peso Acústico',
    description:
      'Projeção densa e sarcástica para debates diretos contra J.A.R.V.I.S. e SEXTA-FEIRA.',
  },
  {
    value: 'Algenib',
    label: 'Algenib (Metálico · Era de Ultron)',
    spec: '99.0 Hz · Textura Sintética',
    description:
      'Timbre com inflexão cibernética acentuada para auditorias severas de arquitetura.',
  },
  {
    value: 'Fenrir',
    label: 'Fenrir (Intenso · Dominante)',
    spec: '101.0 Hz · Ataque Rápido',
    description:
      'Cadência incisiva e direta para alertas críticos e confrontos estratégicos.',
  },
];

export function GlobalVoiceConfigPanel({
  jarvisVoice,
  fridayVoice,
  ultronVoice,
  autoSpeak,
  isSpeaking,
  onChangeJarvisVoice,
  onChangeFridayVoice,
  onChangeUltronVoice,
  onToggleAutoSpeak,
  onPlayJarvisOriginalSample,
  onPlayUltronOriginalSample,
  onTestSynthesizedVoice,
}: GlobalVoiceConfigPanelProps) {
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

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
    triggerSavedNotice(
      'Timbres padrão restaurados (JarvisOriginal, Kore e UltronOriginal) e salvos no localStorage.'
    );
  };

  const selectedJarvisMeta =
    JARVIS_TIMBRE_OPTIONS.find((o) => o.value === jarvisVoice) ??
    JARVIS_TIMBRE_OPTIONS[0];
  const selectedFridayMeta =
    FRIDAY_TIMBRE_OPTIONS.find((o) => o.value === fridayVoice) ??
    FRIDAY_TIMBRE_OPTIONS[0];
  const selectedUltronMeta =
    ULTRON_TIMBRE_OPTIONS.find((o) => o.value === ultronVoice) ??
    ULTRON_TIMBRE_OPTIONS[0];

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
            <span>ENGENHARIA ACÚSTICA STARK · PERSISTÊNCIA LOCALSTORAGE</span>
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Painel de Configuração Global de Voz dos Assistentes
          </h2>
          <p className="text-xs text-slate-600 dark:text-cyan-100/75 max-w-2xl leading-relaxed">
            Defina o timbre vocal padrão de <strong>J.A.R.V.I.S.</strong>,{' '}
            <strong>SEXTA-FEIRA</strong> e <strong>ULTRON</strong> para todas as
            respostas automáticas, chamadas proativas em segundo plano e debates no
            Console. As preferências ficam gravadas permanentemente no seu navegador (
            <code className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300">
              localStorage
            </code>
            ).
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

      {/* Saved Confirmation Toast */}
      {savedNotice && (
        <div className="rounded-xl border border-emerald-500/45 bg-emerald-50/90 dark:bg-emerald-950/40 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{savedNotice}</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            SINCRONIZADO
          </span>
        </div>
      )}

      {/* 3-Column Assistant Timbre Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. J.A.R.V.I.S. Card */}
        <div className="rounded-xl border border-amber-500/35 dark:border-amber-400/30 bg-amber-50/40 dark:bg-[#071524]/90 p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-display text-sm font-bold text-amber-800 dark:text-amber-300">
                  J.A.R.V.I.S.
                </span>
                <p className="text-[11px] font-mono text-slate-500 dark:text-cyan-200/70">
                  Chave: stark_jarvis_voice_v2
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-800 dark:text-amber-200">
                <ShieldCheck className="h-3 w-3" />
                <span>{jarvisVoice}</span>
              </span>
            </div>

            <div>
              <label
                htmlFor="global-jarvis-voice"
                className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Timbre Padrão Selecionado
              </label>
              <select
                id="global-jarvis-voice"
                value={jarvisVoice}
                onChange={(e) => {
                  triggerHaptic('tap');
                  const next = e.target.value as JarvisVoiceOption;
                  onChangeJarvisVoice(next);
                  triggerSavedNotice(
                    `Timbre de J.A.R.V.I.S. atualizado para "${next}" e persistido no localStorage.`
                  );
                }}
                className="w-full rounded-xl border border-slate-300 dark:border-amber-500/40 bg-white dark:bg-[#040D18] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
              >
                {JARVIS_TIMBRE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-white/80 dark:bg-[#040C16]/80 p-3 space-y-1">
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
              <span>Testar Timbre</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                onPlayJarvisOriginalSample();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Volume2 className="h-3.5 w-3.5 shrink-0" />
              <span>Matriz 105 Hz</span>
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
                Timbre Padrão Selecionado
              </label>
              <select
                id="global-friday-voice"
                value={fridayVoice}
                onChange={(e) => {
                  triggerHaptic('tap');
                  const next = e.target.value as FridayVoiceOption;
                  onChangeFridayVoice(next);
                  triggerSavedNotice(
                    `Timbre de SEXTA-FEIRA atualizado para "${next}" e persistido no localStorage.`
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
              <span>Testar Timbre de SEXTA-FEIRA ({fridayVoice})</span>
            </button>
          </div>
        </div>

        {/* 3. ULTRON Card */}
        <div className="rounded-xl border border-red-500/35 dark:border-red-500/30 bg-red-50/40 dark:bg-[#071524]/90 p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-display text-sm font-bold text-red-700 dark:text-red-400">
                  ULTRON
                </span>
                <p className="text-[11px] font-mono text-slate-500 dark:text-cyan-200/70">
                  Chave: stark_ultron_voice_v2
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/15 px-2 py-0.5 font-mono text-[10px] text-red-800 dark:text-red-300">
                <ShieldCheck className="h-3 w-3" />
                <span>{ultronVoice}</span>
              </span>
            </div>

            <div>
              <label
                htmlFor="global-ultron-voice"
                className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Timbre Padrão Selecionado
              </label>
              <select
                id="global-ultron-voice"
                value={ultronVoice}
                onChange={(e) => {
                  triggerHaptic('tap');
                  const next = e.target.value as UltronVoiceOption;
                  onChangeUltronVoice(next);
                  triggerSavedNotice(
                    `Timbre de ULTRON atualizado para "${next}" e persistido no localStorage.`
                  );
                }}
                className="w-full rounded-xl border border-slate-300 dark:border-red-500/40 bg-white dark:bg-[#040D18] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-red-500"
              >
                {ULTRON_TIMBRE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-red-500/20 bg-white/80 dark:bg-[#040C16]/80 p-3 space-y-1">
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
              <span>Testar Timbre</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                onPlayUltronOriginalSample();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Volume2 className="h-3.5 w-3.5 shrink-0" />
              <span>Matriz 93 Hz</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
