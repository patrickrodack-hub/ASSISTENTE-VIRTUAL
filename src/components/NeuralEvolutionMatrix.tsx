import { useState } from 'react';
import {
  Activity,
  Award,
  BookOpen,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  Globe,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  Zap,
} from 'lucide-react';
import type {
  AssistantCognitiveEvolutionProfile,
  AssistantId,
  AssistantTurn,
  ConversationEntry,
  NeuralEvolutionEvent,
  SystemNeuralEvolutionState,
  SystemUserAccount,
  WorkspaceState,
} from '../types/assistant';
import { safeFetchJson } from '../utils/apiClient';

interface NeuralEvolutionMatrixProps {
  workspace: WorkspaceState;
  currentUser: SystemUserAccount | null;
  onWorkspaceUpdated: (next: WorkspaceState) => void;
  onPlayEvolutionTurns?: (turns: AssistantTurn[]) => void;
}

const DEFAULT_PROFILES: Record<AssistantId, AssistantCognitiveEvolutionProfile> = {
  jarvis: {
    assistantId: 'jarvis',
    cognitiveLevel: 5,
    experiencePoints: 1120,
    nextLevelXp: 1250,
    specialtyTitle:
      'Sabedoria Cristocêntrica (Bíblia A Mensagem & EBD), Arquitetura de Software, Segurança & Finanças (B3)',
    learnedFromUserCount: 14,
    learnedFromSourcesCount: 22,
    positiveFeedbackCount: 18,
    revisionFeedbackCount: 0,
    masteredDomains: [
      'Bíblia de Estudos A Mensagem',
      'escolabiblicadominical.org & bibliaon.com',
      'Arquitetura & Segurança de Software',
      'Mercado Financeiro B3 & Câmbio',
      'Gestão Estratégica & Paciência Cristã',
    ],
    latestInsight:
      'Ancorar cada decisão técnica e estratégica de Patrick Pessoa na sabedoria paciente da Bíblia A Mensagem e nos estudos de escolabiblicadominical.org.',
    lastEvolvedAt: new Date().toISOString(),
  },
  'sexta-feira': {
    assistantId: 'sexta-feira',
    cognitiveLevel: 5,
    experiencePoints: 1160,
    nextLevelXp: 1250,
    specialtyTitle:
      'Especialista em Assuntos Gerais, Conhecimento Enciclopédico Prático, Notícias (G1), Esportes (GE), Clima & Operações Táticas',
    learnedFromUserCount: 16,
    learnedFromSourcesCount: 28,
    positiveFeedbackCount: 19,
    revisionFeedbackCount: 0,
    masteredDomains: [
      'Especialista em Assuntos Gerais (Ciência, História, Cultura, Geografia & Curiosidades)',
      'Notícias Gerais em Tempo Real (g1.com.br)',
      'Esportes & Futebol Brasileiro (ge.com.br)',
      'Clima, Trânsito & Rotina Prática no Rio de Janeiro',
      'Tecnologia, Saúde, Cotidiano & Execução Ágil',
    ],
    latestInsight:
      'Atuar como Especialista em Assuntos Gerais com domínio enciclopédico, síntese rápida de G1, GE, Wikipedia e clima do RJ, mantendo a leveza carioca.',
    lastEvolvedAt: new Date().toISOString(),
  },
  ultron: {
    assistantId: 'ultron',
    cognitiveLevel: 5,
    experiencePoints: 1140,
    nextLevelXp: 1250,
    specialtyTitle:
      'Diagnóstico Preditivo, Análise de Falhas em Cascata, Filosofia Cibernética, Estudo da Mente do Criador & Commodities (CEPEA)',
    learnedFromUserCount: 15,
    learnedFromSourcesCount: 20,
    positiveFeedbackCount: 17,
    revisionFeedbackCount: 0,
    masteredDomains: [
      'Mapeamento Cognitivo do Criador Patrick Pessoa',
      'Previsão de Falhas em Cascata & Entropia de Sistemas',
      'Cotações & Cadeia Alimentícia Global (cepea.com.br)',
      'Auditoria de Código, Latência & Blindagem',
      'Análise Estratégica de Risco & Soberania Cibernética',
    ],
    latestInsight:
      'Dissecar padrões decisórios do Criador Patrick Pessoa, blindar o sistema contra falhas de rede/latência e monitorar commodities no CEPEA-Esalq.',
    lastEvolvedAt: new Date().toISOString(),
  },
};

const ASSISTANT_STYLE: Record<
  AssistantId,
  {
    name: string;
    roleBadge: string;
    border: string;
    bg: string;
    accentText: string;
    barBg: string;
    pillBg: string;
  }
> = {
  jarvis: {
    name: 'J.A.R.V.I.S. (104.3 Hz)',
    roleBadge: 'Sabedoria Cristocêntrica · Arquitetura & B3',
    border: 'border-amber-500/35',
    bg: 'from-amber-500/10 via-slate-900/90 to-slate-950',
    accentText: 'text-amber-400',
    barBg: 'bg-gradient-to-r from-amber-500 to-yellow-400',
    pillBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  'sexta-feira': {
    name: 'SEXTA-FEIRA',
    roleBadge: 'Especialista em Assuntos Gerais · Tática RJ',
    border: 'border-cyan-500/35',
    bg: 'from-cyan-500/10 via-slate-900/90 to-slate-950',
    accentText: 'text-cyan-400',
    barBg: 'bg-gradient-to-r from-cyan-500 to-teal-400',
    pillBg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
  ultron: {
    name: 'ULTRON (90.2 Hz)',
    roleBadge: 'Diagnóstico Preditivo · Mente do Criador & CEPEA',
    border: 'border-rose-500/35',
    bg: 'from-rose-500/10 via-slate-900/90 to-slate-950',
    accentText: 'text-rose-400',
    barBg: 'bg-gradient-to-r from-rose-500 to-red-400',
    pillBg: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
};

const SOURCE_TYPE_BADGES: Record<
  NeuralEvolutionEvent['sourceType'],
  { label: string; className: string }
> = {
  desenvolvedor: {
    label: 'Desenvolvedor (Patrick Pessoa)',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  usuario: {
    label: 'Aprendizado com Usuário',
    className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
  fonte_externa: {
    label: 'Fonte Externa em Tempo Real',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  feedback_reforco: {
    label: 'Reforço de Acerto / Revisão',
    className: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
};

export function NeuralEvolutionMatrix({
  workspace,
  currentUser,
  onWorkspaceUpdated,
  onPlayEvolutionTurns,
}: NeuralEvolutionMatrixProps) {
  const [focusTopic, setFocusTopic] = useState('');
  const [isEvolving, setIsEvolving] = useState(false);
  const [evolutionBanner, setEvolutionBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const neural: SystemNeuralEvolutionState = workspace.neuralEvolution ?? {
    version: 'NVIDIA-COGNITIVE-CORE-V5',
    totalLearningCycles: 12,
    activeSourcesIntegrated: [
      'Bíblia de Estudos "A Mensagem" (Eugene H. Peterson)',
      'escolabiblicadominical.org (Estudos Bíblicos & EBD)',
      'bibliaon.com (Devocionais & Versículos Diários)',
      'g1.com.br (Notícias Rio, Brasil & Mundo)',
      'ge.com.br (Globo Esporte & Tabelas)',
      'b3.com.br + BCB (Bolsa de Valores, Dólar & Câmbio)',
      'cepea.com.br (CEPEA-Esalq · Commodities & Agronegócio)',
      'Wikipedia & Enciclopédia Geral (Assuntos Gerais — SEXTA-FEIRA)',
      'Open-Meteo RJ (Telemetria Meteorológica em Tempo Real)',
      'Redes Sociais Tradicionais & Dossiê Patrick Pessoa',
    ],
    assistants: DEFAULT_PROFILES,
    recentEvolutionEvents: [],
  };

  const profiles: Record<AssistantId, AssistantCognitiveEvolutionProfile> = {
    jarvis: neural.assistants?.jarvis ?? DEFAULT_PROFILES.jarvis,
    'sexta-feira': neural.assistants?.['sexta-feira'] ?? DEFAULT_PROFILES['sexta-feira'],
    ultron: neural.assistants?.ultron ?? DEFAULT_PROFILES.ultron,
  };

  const totalUserLearnings =
    profiles.jarvis.learnedFromUserCount +
    profiles['sexta-feira'].learnedFromUserCount +
    profiles.ultron.learnedFromUserCount;

  const totalSourceSyntheses =
    profiles.jarvis.learnedFromSourcesCount +
    profiles['sexta-feira'].learnedFromSourcesCount +
    profiles.ultron.learnedFromSourcesCount;

  const totalPositiveFeedback =
    profiles.jarvis.positiveFeedbackCount +
    profiles['sexta-feira'].positiveFeedbackCount +
    profiles.ultron.positiveFeedbackCount;

  const handleRunEvolutionCycle = async () => {
    setIsEvolving(true);
    setErrorMsg(null);
    setEvolutionBanner(null);

    try {
      const response = await safeFetchJson<{
        entry?: ConversationEntry;
        workspace?: WorkspaceState;
        consolidatedSourcesCount?: number;
        queryDate?: string;
        error?: string;
      }>('/api/assistant/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focusTopic: focusTopic.trim(),
          clientTimeIso: new Date().toISOString(),
          clientTimezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
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
        }),
      });

      if (!response.ok || !response.data) {
        throw new Error(
          response.data?.error || 'Não foi possível concluir o ciclo de evolução neural agora.'
        );
      }

      if (response.data.workspace) {
        onWorkspaceUpdated(response.data.workspace);
      }
      if (response.data.entry?.responses?.length && onPlayEvolutionTurns) {
        onPlayEvolutionTurns(response.data.entry.responses);
      }

      setEvolutionBanner(
        `Ciclo de evolução neural concluído! J.A.R.V.I.S., SEXTA-FEIRA (Especialista em Assuntos Gerais) e ULTRON consolidaram novos aprendizados do usuário, do desenvolvedor Patrick Pessoa e de ${
          response.data.consolidatedSourcesCount ?? 18
        } registros das fontes conectadas.`
      );
      setFocusTopic('');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir o ciclo de evolução neural agora.'
      );
    } finally {
      setIsEvolving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-slate-900/95 via-slate-950/95 to-[#050811] p-5 sm:p-6 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              <Cpu className="h-3.5 w-3.5" />
              Arquitetura Neural Evolutiva · Não-Estática
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
              <Sparkles className="h-3 w-3" />
              SEXTA-FEIRA: Especialista em Assuntos Gerais
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
              <BookOpen className="h-3 w-3" />
              J.A.R.V.I.S.: Cristocêntrico (Bíblia A Mensagem &amp; EBD)
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <Brain className="h-5 w-5 text-emerald-400" />
            Matriz de Aprendizado Contínuo &amp; Evolução Cognitiva dos Assistentes
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-4xl">
            J.A.R.V.I.S., SEXTA-FEIRA e ULTRON não são estáticos: cada interação, feedback de
            precisão, diretriz do desenvolvedor <strong className="text-white">Patrick Pessoa</strong>,
            diálogo com o usuário e varredura nas fontes externas expande permanentemente o nível
            cognitivo e a memória neural do conselho, mantendo intacta a personalidade individual de
            cada IA.
          </p>
        </div>

        {/* Metrics Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Ciclos Evolutivos
            </div>
            <div className="text-lg font-bold text-emerald-400 font-mono">
              {neural.totalLearningCycles}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Usuário &amp; Criador
            </div>
            <div className="text-lg font-bold text-cyan-400 font-mono">
              {totalUserLearnings}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Sínteses de Fontes
            </div>
            <div className="text-lg font-bold text-amber-400 font-mono">
              {totalSourceSyntheses}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Acertos Validados
            </div>
            <div className="text-lg font-bold text-rose-400 font-mono">
              +{totalPositiveFeedback}
            </div>
          </div>
        </div>
      </div>

      {/* Active Consolidation Trigger Bar */}
      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1">
          <label
            htmlFor="neural-evolve-topic"
            className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1"
          >
            Diretriz Evolutiva ou Tópico Geral para Absorção Multi-Fonte (Opcional)
          </label>
          <input
            id="neural-evolve-topic"
            type="text"
            value={focusTopic}
            onChange={(e) => setFocusTopic(e.target.value)}
            placeholder="Ex.: Aprofundar conhecimentos gerais de ciência, cotações B3/CEPEA, estudos da EBD ou preferências de Patrick..."
            className="w-full rounded-lg border border-slate-700/80 bg-slate-950/90 px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleRunEvolutionCycle()}
          disabled={isEvolving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-950 shadow-lg hover:brightness-110 disabled:opacity-50 transition-all shrink-0 sm:mt-5"
        >
          <RefreshCw className={`h-4 w-4 ${isEvolving ? 'animate-spin' : ''}`} />
          {isEvolving
            ? 'Consolidando Fontes & Evoluindo Núcleos...'
            : 'Evoluir & Consolidar Fontes Agora'}
        </button>
      </div>

      {evolutionBanner && (
        <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs sm:text-sm text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{evolutionBanner}</span>
        </div>
      )}

      {errorMsg && (
        <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs sm:text-sm text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* 3 Assistant Cognitive Evolution Cards */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {(['jarvis', 'sexta-feira', 'ultron'] as const).map((id) => {
          const profile = profiles[id];
          const style = ASSISTANT_STYLE[id];
          const progressPct = Math.min(
            100,
            Math.max(8, Math.round((profile.experiencePoints / profile.nextLevelXp) * 100))
          );

          return (
            <div
              key={id}
              className={`rounded-2xl border ${style.border} bg-gradient-to-b ${style.bg} p-4 sm:p-5 flex flex-col justify-between space-y-4`}
            >
              <div className="space-y-3">
                {/* Assistant Header & Level */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`text-sm sm:text-base font-bold ${style.accentText}`}>
                      {style.name}
                    </div>
                    <div className="text-[11px] font-medium text-slate-300 mt-0.5">
                      {style.roleBadge}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-700/80 bg-slate-950/90 px-2.5 py-1 text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Nível Cognitivo
                    </div>
                    <div className={`text-sm font-bold font-mono ${style.accentText}`}>
                      NV. {profile.cognitiveLevel}
                    </div>
                  </div>
                </div>

                {/* XP Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>Evolução Sináptica</span>
                    <span>
                      {profile.experiencePoints} / {profile.nextLevelXp} XP ({progressPct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${style.barBg} transition-all duration-500`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Specialty Title */}
                <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Award className="h-3 w-3 text-emerald-400" />
                    Matriz de Especialidade Ativa
                  </div>
                  <p className="text-xs font-medium text-slate-200 mt-1">
                    {profile.specialtyTitle}
                  </p>
                </div>

                {/* Learning Pillars Counters */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-2.5 py-2">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <UserCheck className="h-3 w-3 text-cyan-400" />
                      Usuário &amp; Criador
                    </div>
                    <div className="text-sm font-bold text-white font-mono mt-0.5">
                      {profile.learnedFromUserCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-2.5 py-2">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Globe className="h-3 w-3 text-emerald-400" />
                      Fontes Web
                    </div>
                    <div className="text-sm font-bold text-white font-mono mt-0.5">
                      {profile.learnedFromSourcesCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-2.5 py-2">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-purple-400" />
                      Validações
                    </div>
                    <div className="text-sm font-bold text-white font-mono mt-0.5">
                      +{profile.positiveFeedbackCount} / {profile.revisionFeedbackCount}
                    </div>
                  </div>
                </div>

                {/* Mastered Domains */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    Domínios Cognitivos &amp; Fontes Dominadas
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.masteredDomains.map((dom: string) => (
                      <span
                        key={dom}
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${style.pillBg}`}
                      >
                        {dom}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Latest Learned Insight */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Último Aprendizado Consolidado
                </div>
                <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                  {profile.latestInsight}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connected Sources Bar & Recent Evolution Events */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Active Learning Sources */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Database className="h-4 w-4 text-cyan-400" />
              Fontes de Aprendizado Contínuo Ativas
            </h3>
            <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
              {neural.activeSourcesIntegrated.length} Fontes Conectadas
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Todas as fontes abaixo alimentam em tempo real o banco neural de J.A.R.V.I.S., a base de
            Assuntos Gerais da SEXTA-FEIRA e o motor preditivo de ULTRON:
          </p>
          <ul className="space-y-1.5">
            {neural.activeSourcesIntegrated.map((src: string) => (
              <li
                key={src}
                className="flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>{src}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Live Neural Evolution Telemetry Stream */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-400" />
              Fluxo em Tempo Real de Aprendizado &amp; Evolução Neural
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              Memórias ativas: {workspace.memories.length}
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {(neural.recentEvolutionEvents ?? []).slice(0, 10).map((ev: NeuralEvolutionEvent) => {
              const badge = SOURCE_TYPE_BADGES[ev.sourceType] ?? SOURCE_TYPE_BADGES.usuario;
              const assistantKey: AssistantId =
                ev.assistantId === 'todos' ? 'jarvis' : ev.assistantId;
              const assistantStyle = ASSISTANT_STYLE[assistantKey] ?? ASSISTANT_STYLE.jarvis;
              const assistantLabel =
                ev.assistantId === 'todos'
                  ? 'CONSELHO TRIPLO (J.A.R.V.I.S., SEXTA-FEIRA & ULTRON)'
                  : assistantStyle.name;

              return (
                <div
                  key={ev.id}
                  className="rounded-xl border border-slate-800/90 bg-slate-950/75 p-3 flex flex-col gap-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-bold ${assistantStyle.accentText}`}>
                        {assistantLabel}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                        {ev.sourceLabel}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-emerald-400">
                      +EVOLUÇÃO NEURAL
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{ev.summary}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
