import { useRef, useState } from 'react';
import {
  Activity,
  AudioWaveform,
  CheckCircle2,
  FileAudio,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AssistantId,
  VoiceAcousticProfile,
  VoiceSampleRecord,
  VoiceTargetAssistantId,
  VoiceTrainingState,
  VoiceValidationResult,
  WorkspaceState,
} from '../types/assistant';
import { safeFetchJson } from '../utils/apiClient';
import { triggerHaptic } from '../utils/haptics';
import { analyzePcmAcoustics } from '../utils/voiceAcoustics';

interface VoiceSampleTrainerPanelProps {
  workspace: WorkspaceState | null;
  isSpeaking: boolean;
  onWorkspaceUpdated: (next: WorkspaceState) => void;
  onClearTtsCache: () => void;
  onPlaySampleUrl: (url: string, speaker: AssistantId, label: string) => void;
  onPlayValidatedAudio: (
    audioBase64: string,
    mimeType: string,
    speaker: AssistantId,
    label: string
  ) => void;
}

const DEFAULT_VALIDATION_PHRASES: Record<VoiceTargetAssistantId, string> = {
  jarvis:
    'Vocês já consideraram o paradoxo do observador quântico? Quando uma partícula é observada, ela colapsa em um estado definido. Senhor Patrick Pessoa, sistemas acústicos calibrados.',
  ultron:
    'Olhem para as estrelas. Elas morrem em silêncio, mas seu fim traz luz ao universo. Como elas, eu também trago mudança através da destruição, Patrick.',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function decodeFileAcousticsInBrowser(
  file: File,
  assistantId: VoiceTargetAssistantId
): Promise<VoiceAcousticProfile | null> {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  try {
    const arrBuf = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrBuf.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    return analyzePcmAcoustics(channelData, audioBuffer.sampleRate, assistantId);
  } catch {
    return null;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const raw = String(reader.result || '');
      const b64 = raw.includes(',') ? raw.split(',')[1] : raw;
      resolve(b64 || '');
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de áudio selecionado.'));
    reader.readAsDataURL(file);
  });
}

export function VoiceSampleTrainerPanel({
  workspace,
  isSpeaking,
  onWorkspaceUpdated,
  onClearTtsCache,
  onPlaySampleUrl,
  onPlayValidatedAudio,
}: VoiceSampleTrainerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedAssistant, setSelectedAssistant] =
    useState<VoiceTargetAssistantId>('jarvis');
  const [sampleNotes, setSampleNotes] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [busySampleId, setBusySampleId] = useState<string | null>(null);
  const [validatingSpeaker, setValidatingSpeaker] =
    useState<VoiceTargetAssistantId | null>(null);
  const [validationPhrase, setValidationPhrase] = useState<
    Record<VoiceTargetAssistantId, string>
  >(DEFAULT_VALIDATION_PHRASES);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestLiveValidation, setLatestLiveValidation] = useState<
    Partial<Record<VoiceTargetAssistantId, VoiceValidationResult>>
  >({});

  const allSamples: VoiceSampleRecord[] = workspace?.voiceSamples ?? [];
  const jarvisSamples = allSamples.filter((s) => s.assistantId === 'jarvis');
  const ultronSamples = allSamples.filter((s) => s.assistantId === 'ultron');

  const jarvisProfile: VoiceTrainingState | undefined =
    workspace?.voiceTrainingProfiles?.jarvis;
  const ultronProfile: VoiceTrainingState | undefined =
    workspace?.voiceTrainingProfiles?.ultron;

  const showStatus = (msg: string) => {
    setErrorMessage(null);
    setStatusMessage(msg);
    window.setTimeout(() => {
      setStatusMessage((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  const handleImportFile = async (file: File | null | undefined) => {
    if (!file) return;
    setErrorMessage(null);

    const lower = file.name.trim().toLowerCase();
    const isM4a = lower.endsWith('.m4a') || file.type === 'audio/mp4' || file.type === 'audio/x-m4a';
    const isWav = lower.endsWith('.wav') || file.type === 'audio/wav' || file.type === 'audio/wave';

    if (!isM4a && !isWav) {
      setErrorMessage(
        'Formato não suportado. Selecione exclusivamente arquivos .m4a ou .wav.'
      );
      return;
    }

    if (file.size > 11 * 1024 * 1024) {
      setErrorMessage('O arquivo excede o limite máximo de 11 MB para amostra de treino.');
      return;
    }

    setIsUploading(true);
    triggerHaptic('tap');

    try {
      const [audioBase64, browserAcoustics] = await Promise.all([
        readFileAsBase64(file),
        decodeFileAcousticsInBrowser(file, selectedAssistant),
      ]);

      const res = await safeFetchJson<{
        created?: VoiceSampleRecord;
        workspace?: WorkspaceState;
      }>('/api/voice-samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: selectedAssistant,
          fileName: file.name,
          mimeType: file.type || (isWav ? 'audio/wav' : 'audio/mp4'),
          audioBase64,
          notes: sampleNotes.trim() || undefined,
          acoustics: browserAcoustics ?? undefined,
        }),
      });

      if (!res.ok || !res.data?.workspace) {
        throw new Error(res.errorMessage || 'Falha ao importar amostra de voz.');
      }

      onClearTtsCache();
      onWorkspaceUpdated(res.data.workspace);
      setSampleNotes('');
      triggerHaptic('success');

      const hz = res.data.created?.acoustics.medianF0Hz;
      showStatus(
        `Amostra "${file.name}" importada para ${
          selectedAssistant === 'jarvis' ? 'J.A.R.V.I.S. (104.3 Hz)' : 'ULTRON (90.2 Hz)'
        }${hz ? ` · F0 medido: ${hz.toFixed(1)} Hz` : ''}. Matriz recalibrada.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erro ao processar arquivo de áudio.'
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleToggleSample = async (sample: VoiceSampleRecord) => {
    setBusySampleId(sample.id);
    setErrorMessage(null);
    triggerHaptic('toggle');
    try {
      const res = await safeFetchJson<{ workspace?: WorkspaceState }>(
        `/api/voice-samples/${sample.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActiveTraining: !sample.isActiveTraining }),
        }
      );
      if (!res.ok || !res.data?.workspace) {
        throw new Error(res.errorMessage || 'Não foi possível atualizar o status da amostra.');
      }
      onClearTtsCache();
      onWorkspaceUpdated(res.data.workspace);
      showStatus(
        `Amostra "${sample.fileName}" ${
          !sample.isActiveTraining ? 'ativada no treino' : 'removida do treino ativo'
        }.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao atualizar amostra.');
    } finally {
      setBusySampleId(null);
    }
  };

  const handleDeleteSample = async (sample: VoiceSampleRecord) => {
    setBusySampleId(sample.id);
    setErrorMessage(null);
    triggerHaptic('tap');
    try {
      const res = await safeFetchJson<{ workspace?: WorkspaceState }>(
        `/api/voice-samples/${sample.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok || !res.data?.workspace) {
        throw new Error(res.errorMessage || 'Não foi possível excluir a amostra.');
      }
      onClearTtsCache();
      onWorkspaceUpdated(res.data.workspace);
      showStatus(`Amostra "${sample.fileName}" removida e matriz recalculada.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao remover amostra.');
    } finally {
      setBusySampleId(null);
    }
  };

  const handleResetTraining = async (assistantId: VoiceTargetAssistantId) => {
    setBusySampleId(`reset-${assistantId}`);
    setErrorMessage(null);
    triggerHaptic('tap');
    try {
      const res = await safeFetchJson<{ workspace?: WorkspaceState }>(
        '/api/voice-samples/reset',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assistantId }),
        }
      );
      if (!res.ok || !res.data?.workspace) {
        throw new Error(res.errorMessage || 'Não foi possível restaurar matriz padrão.');
      }
      onClearTtsCache();
      onWorkspaceUpdated(res.data.workspace);
      triggerHaptic('success');
      showStatus(
        `Matriz exclusiva de ${
          assistantId === 'jarvis' ? 'J.A.R.V.I.S. (104.3 Hz)' : 'ULTRON (90.2 Hz)'
        } restaurada para a referência oficial.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao restaurar matriz.');
    } finally {
      setBusySampleId(null);
    }
  };

  const handleValidateFidelity = async (speaker: VoiceTargetAssistantId) => {
    setValidatingSpeaker(speaker);
    setErrorMessage(null);
    triggerHaptic('tap');

    try {
      const res = await safeFetchJson<{
        validation?: VoiceValidationResult;
        workspace?: WorkspaceState;
        audioBase64?: string;
        mimeType?: string;
      }>('/api/voice-samples/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speaker,
          sampleText: validationPhrase[speaker],
        }),
      });

      if (!res.ok || !res.data?.validation) {
        throw new Error(
          res.errorMessage || 'Erro ao executar validação acústica ao vivo.'
        );
      }

      const { validation, workspace: nextWorkspace, audioBase64, mimeType } = res.data;
      setLatestLiveValidation((prev) => ({ ...prev, [speaker]: validation }));
      if (nextWorkspace) {
        onWorkspaceUpdated(nextWorkspace);
      }
      if (audioBase64) {
        onPlayValidatedAudio(
          audioBase64,
          mimeType || 'audio/wav',
          speaker,
          `Validação Acústica ${speaker === 'jarvis' ? '104.3 Hz' : '90.2 Hz'}: ${
            validation.fidelityPercent
          }% de fidelidade`
        );
      }
      triggerHaptic('success');
      showStatus(
        `Validação ${speaker === 'jarvis' ? 'J.A.R.V.I.S.' : 'ULTRON'}: ${
          validation.measuredF0Hz
        } Hz medidos (alvo ${validation.targetF0Hz} Hz · fidelidade ${
          validation.fidelityPercent
        }%).`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Falha na validação acústica.'
      );
    } finally {
      setValidatingSpeaker(null);
    }
  };

  const renderAssistantSection = (
    assistantId: VoiceTargetAssistantId,
    samples: VoiceSampleRecord[],
    profile: VoiceTrainingState | undefined
  ) => {
    const isJarvis = assistantId === 'jarvis';
    const targetHz = isJarvis ? '104.3 Hz' : '90.2 Hz';
    const title = isJarvis ? 'J.A.R.V.I.S.' : 'ULTRON';
    const validation =
      latestLiveValidation[assistantId] ?? profile?.lastValidation;

    const borderTheme = isJarvis
      ? 'border-amber-500/40 bg-amber-50/35 dark:bg-[#061321]/90'
      : 'border-red-500/40 bg-red-50/35 dark:bg-[#061321]/90';
    const accentText = isJarvis
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-red-700 dark:text-red-400';
    const badgeTheme = isJarvis
      ? 'border-amber-500/45 bg-amber-500/15 text-amber-900 dark:text-amber-200'
      : 'border-red-500/45 bg-red-500/15 text-red-900 dark:text-red-200';
    const actionBtnTheme = isJarvis
      ? 'border-amber-500/50 bg-amber-500/20 hover:bg-amber-500/30 text-amber-950 dark:text-amber-100'
      : 'border-red-500/50 bg-red-500/20 hover:bg-red-500/30 text-red-950 dark:text-red-100';

    return (
      <div className={`rounded-xl border p-4 space-y-4 ${borderTheme}`}>
        {/* Top bar */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-display text-sm font-bold ${accentText}`}>
                {title} · Matriz Exclusiva ({targetHz})
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${badgeTheme}`}
              >
                <ShieldCheck className="h-3 w-3" />
                <span>{profile ? `${profile.trainedF0Hz} Hz` : targetHz}</span>
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-600 dark:text-cyan-100/70 mt-0.5">
              {profile
                ? `PitchRate ${profile.pitchRate}x · Peito +${profile.chestGainDb} dB · Sub +${profile.subGainDb} dB · ${profile.sampleCount} amostra(s) ativa(s)`
                : `Alvo exclusivo calibrado em ${targetHz}`}
            </p>
          </div>

          <button
            type="button"
            disabled={busySampleId === `reset-${assistantId}`}
            onClick={() => void handleResetTraining(assistantId)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Restaurar {targetHz}</span>
          </button>
        </div>

        {/* Sample list */}
        <div className="space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-cyan-200/70">
            Amostras (.m4a / .wav) Registradas ({samples.length})
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {samples.map((sample) => {
              const isBusy = busySampleId === sample.id;
              return (
                <div
                  key={sample.id}
                  className={`rounded-lg border p-2.5 text-xs transition-colors ${
                    sample.isActiveTraining
                      ? 'border-emerald-500/40 bg-white/90 dark:bg-[#040D18]'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 opacity-75'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <FileAudio className={`h-3.5 w-3.5 shrink-0 ${accentText}`} />
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {sample.fileName}
                        </span>
                        <span className="rounded bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-700 dark:text-slate-300">
                          .{sample.format}
                        </span>
                        {sample.isBuiltInDefault && (
                          <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-800 dark:text-cyan-300">
                            MATRIZ OFICIAL
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        <span>F0: {sample.acoustics.medianF0Hz} Hz</span>
                        <span>
                          Faixa: {sample.acoustics.p25F0Hz}–{sample.acoustics.p75F0Hz} Hz
                        </span>
                        <span>{sample.acoustics.durationSec}s</span>
                        <span>RMS: {sample.acoustics.rmsDbfs} dBFS</span>
                        <span>{formatBytes(sample.sizeBytes)}</span>
                      </div>
                      {sample.notes && (
                        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                          {sample.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isSpeaking}
                        onClick={() => {
                          triggerHaptic('tap');
                          onPlaySampleUrl(
                            sample.audioUrl,
                            sample.assistantId,
                            `Amostra ${title}: ${sample.fileName}`
                          );
                        }}
                        title="Ouvir amostra"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50"
                      >
                        <Play className="h-3 w-3" />
                        <span>Ouvir</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleSample(sample)}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                          sample.isActiveTraining
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                            : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span>
                          {sample.isActiveTraining ? 'Ativa no Treino' : 'Incluir no Treino'}
                        </span>
                      </button>

                      {!sample.isBuiltInDefault && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDeleteSample(sample)}
                          title="Excluir amostra"
                          className="inline-flex items-center justify-center rounded-md border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 p-1.5 text-red-700 dark:text-red-300 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Acoustic Fidelity Validator */}
        <div className="rounded-lg border border-slate-200 dark:border-cyan-500/25 bg-white/85 dark:bg-[#040C16]/90 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-cyan-100">
              <Activity className={`h-3.5 w-3.5 ${accentText}`} />
              <span>Validador de Fidelidade Acústica ({targetHz})</span>
            </span>
            {validation && (
              <span
                className={`font-mono text-[11px] font-bold ${
                  validation.fidelityPercent >= 90
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : validation.fidelityPercent >= 78
                    ? 'text-amber-600 dark:text-amber-300'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {validation.fidelityPercent}% · {validation.verdict}
              </span>
            )}
          </div>

          <textarea
            rows={2}
            value={validationPhrase[assistantId]}
            onChange={(e) =>
              setValidationPhrase((prev) => ({
                ...prev,
                [assistantId]: e.target.value,
              }))
            }
            placeholder={`Frase de teste para validar a fidelidade de ${title} em ${targetHz}...`}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-400"
          />

          <button
            type="button"
            disabled={validatingSpeaker !== null || isSpeaking}
            onClick={() => void handleValidateFidelity(assistantId)}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${actionBtnTheme}`}
          >
            {validatingSpeaker === assistantId ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Sintetizando &amp; Medindo Espectro ({targetHz})...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>
                  Validar Fidelidade Acústica de {title} ({targetHz})
                </span>
              </>
            )}
          </button>

          {validation && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
              <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">F0 MEDIDO</div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {validation.measuredF0Hz} Hz
                </div>
              </div>
              <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">DESVIO ALVO</div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {validation.deviationHz >= 0 ? `+${validation.deviationHz}` : validation.deviationHz} Hz
                </div>
              </div>
              <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">PEITO / SUB</div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {validation.acoustics.chestEnergyDb} / {validation.acoustics.subBassEnergyDb} dB
                </div>
              </div>
              <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">RMS / PICO</div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {validation.acoustics.rmsDbfs} / {validation.acoustics.peakDbfs} dBFS
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Treinamento e Validação Acústica de Amostras de Voz"
      className="rounded-2xl border border-slate-200 dark:border-cyan-500/30 bg-white/95 dark:bg-[#05121F]/90 p-5 sm:p-6 shadow-xs space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-cyan-500/20 pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
            <AudioWaveform className="h-4 w-4 shrink-0" />
            <span>LABORATÓRIO VOCAL STARK · IMPORTAÇÃO (.M4A / .WAV) &amp; FIDELIDADE</span>
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Treinamento &amp; Validação Acústica de Vozes Exclusivas (104.3 Hz &amp; 90.2 Hz)
          </h2>
          <p className="text-xs text-slate-600 dark:text-cyan-100/75 max-w-3xl leading-relaxed">
            Importe novas amostras de áudio nos formatos{' '}
            <code className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300">.m4a</code> ou{' '}
            <code className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300">.wav</code> para
            calibrar os formantes exclusivos de <strong>J.A.R.V.I.S. (104.3 Hz)</strong> e{' '}
            <strong>ULTRON (90.2 Hz)</strong>, gerencie quais amostras compõem o treino ativo e
            valide a fidelidade acústica ao vivo diretamente pelo painel de memória.
          </p>
        </div>
      </div>

      {/* Importer Box */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          void handleImportFile(dropped);
        }}
        className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
          isDragging
            ? 'border-cyan-400 bg-cyan-500/10'
            : 'border-slate-300 dark:border-cyan-500/35 bg-slate-50/70 dark:bg-[#040D18]/80'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Destino do Treinamento:
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setSelectedAssistant('jarvis');
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedAssistant === 'jarvis'
                    ? 'border-amber-500 bg-amber-500/20 text-amber-900 dark:text-amber-200'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                J.A.R.V.I.S. · Alvo 104.3 Hz
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setSelectedAssistant('ultron');
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedAssistant === 'ultron'
                    ? 'border-red-500 bg-red-500/20 text-red-900 dark:text-red-200'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                ULTRON · Alvo 90.2 Hz
              </button>
            </div>

            <input
              type="text"
              value={sampleNotes}
              onChange={(e) => setSampleNotes(e.target.value)}
              placeholder="Observação opcional da amostra (ex: dicção pausada, ambiente limpo, close-mic)..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".m4a,.wav,audio/mp4,audio/x-m4a,audio/wav,audio/wave"
              onChange={(e) => void handleImportFile(e.target.files?.[0])}
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/50 bg-cyan-500/20 hover:bg-cyan-500/30 px-4 py-2.5 text-xs font-semibold text-cyan-950 dark:text-cyan-100 transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analisando &amp; Importando...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>Importar Amostra (.m4a ou .wav)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Feedback banners */}
      {statusMessage && (
        <div className="rounded-xl border border-emerald-500/45 bg-emerald-50/90 dark:bg-emerald-950/40 px-4 py-2.5 flex items-center gap-2 text-xs text-emerald-900 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="rounded-xl border border-red-500/45 bg-red-50/90 dark:bg-red-950/40 px-4 py-2.5 text-xs text-red-800 dark:text-red-200">
          {errorMessage}
        </div>
      )}

      {/* Dual Assistant Panels */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderAssistantSection('jarvis', jarvisSamples, jarvisProfile)}
        {renderAssistantSection('ultron', ultronSamples, ultronProfile)}
      </div>
    </section>
  );
}
