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
    label: 'JarvisOriginal (Voz Única, Exclusiva & Padrão Oficial do Sistema)',
    spec: '104.3 Hz F0 · Barítono Aveludado Close-Mic (Matriz Exclusiva jarvis_fc632df0.m4a)',
    description:
      'Assinatura vocal única, exclusiva e imutável de J.A.R.V.I.S. extraída de jarvis_fc632df0.m4a: F0 mediano em 104.3 Hz (91.6–115.9 Hz), corpo aveludado em 180–250 Hz (+4.8 dB), recuo sedoso em 2.38 kHz (-3.4 dB) e dicção britânica contemplativa sem efeito metálico.',
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
    label: 'UltronOriginal (Voz Única, Exclusiva & Padrão Oficial do Sistema)',
    spec: '90.2 Hz F0 · Baixo-Barítono Cibernético (Matriz Exclusiva ultron_f012fd80.m4a)',
    description:
      'Assinatura vocal única, exclusiva e imutável de ULTRON extraída de ultron_f012fd80.m4a: F0 mediano em 90.2 Hz (79.7–104.8 Hz), shift Hermite 0.838x, divisor sub-harmônico de oitava (44–120 Hz), ressonador metálico (14.8ms/27.2ms), recuo de -5.2 dB em 480 Hz e mordida metálica em 1.80 kHz.',
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
      'Matrizes exclusivas JarvisOriginal (104.3 Hz) e UltronOriginal (90.2 Hz) confirmadas, com SEXTA-FEIRA restaurada para Kore no localStorage.'
    );
  };

  const selectedJarvisMeta = JARVIS_TIMBRE_OPTIONS[0];
  const selectedFridayMeta =
    FRIDAY_TIMBRE_OPTIONS.find((o) => o.value === fridayVoice) ??
    FRIDAY_TIMBRE_OPTIONS[0];
  const selectedUltronMeta = ULTRON_TIMBRE_OPTIONS[0];

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
            <span>ENGENHARIA ACÚSTICA STARK · MATRIZES EXCLUSIVAS J.A.R.V.I.S. &amp; ULTRON</span>
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Painel de Configuração Global de Voz dos Assistentes
          </h2>
          <p className="text-xs text-slate-600 dark:text-cyan-100/75 max-w-2xl leading-relaxed">
            <strong>J.A.R.V.I.S.</strong> (
            <code className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
              104.3 Hz
            </code>
            ) e <strong>ULTRON</strong> (
            <code className="font-mono text-[11px] text-red-700 dark:text-red-300">
              90.2 Hz
            </code>
            ) operam com suas{' '}
            <strong>vozes únicas, exclusivas e padrão oficial do sistema</strong> extraídas dos
            áudios enviados por Patrick Pessoa, enquanto <strong>SEXTA-FEIRA</strong> mantém seu
            timbre salvo no{' '}
            <code className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300">
              localStorage
            </code>
            .
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
        {/* 1. J.A.R.V.I.S. Card — Exclusive & Immutable System Voice */}
        <div className="rounded-xl border border-amber-500/45 dark:border-amber-400/40 bg-amber-50/40 dark:bg-[#071524]/90 p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-display text-sm font-bold text-amber-800 dark:text-amber-300">
                  J.A.R.V.I.S.
                </span>
                <p className="text-[11px] font-mono text-slate-500 dark:text-cyan-200/70">
                  Voz Oficial Fixada · Exclusiva do Sistema
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                <ShieldCheck className="h-3 w-3" />
                <span>EXCLUSIVA · {jarvisVoice}</span>
              </span>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Timbre Único &amp; Exclusivo (Bloqueado por Diretriz do Criador)
              </span>
              <div className="w-full rounded-xl border border-amber-500/45 bg-amber-500/10 dark:bg-[#040D18] px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
                <span className="truncate">
                  JarvisOriginal · Áudio Oficial (104.3 Hz)
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  FIXO
                </span>
              </div>
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
              <span>Testar Voz Exclusiva</span>
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
              <span>Áudio Matriz (104 Hz)</span>
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

        {/* 3. ULTRON Card — Exclusive & Immutable System Voice */}
        <div className="rounded-xl border border-red-500/45 dark:border-red-500/40 bg-red-50/40 dark:bg-[#071524]/90 p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-display text-sm font-bold text-red-700 dark:text-red-400">
                  ULTRON
                </span>
                <p className="text-[11px] font-mono text-slate-500 dark:text-cyan-200/70">
                  Voz Oficial Fixada · Exclusiva do Sistema
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-red-500/50 bg-red-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-red-900 dark:text-red-200">
                <ShieldCheck className="h-3 w-3" />
                <span>EXCLUSIVA · {ultronVoice}</span>
              </span>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Timbre Único &amp; Exclusivo (Bloqueado por Diretriz do Criador)
              </span>
              <div className="w-full rounded-xl border border-red-500/45 bg-red-500/10 dark:bg-[#040D18] px-3 py-2 text-xs font-semibold text-red-900 dark:text-red-200 flex items-center justify-between gap-2">
                <span className="truncate">
                  UltronOriginal · Áudio Oficial (90.2 Hz)
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-red-700 dark:text-red-300">
                  FIXO
                </span>
              </div>
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
              <span>Testar Voz Exclusiva</span>
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
              <span>Áudio Matriz (90 Hz)</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
