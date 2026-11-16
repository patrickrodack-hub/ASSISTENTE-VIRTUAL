import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Check, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import type {
  AssistantId,
  TelemetryEntry,
  TurnFeedback,
  WorkspaceState,
} from '../types/assistant';

interface AuditTelemetryPanelProps {
  workspace: WorkspaceState | null;
  onRateTurn: (
    entryId: string,
    speaker: AssistantId,
    feedback: TurnFeedback | null
  ) => Promise<void>;
}

const ASSISTANT_META: Record<
  AssistantId,
  { name: string; color: string; stroke: string; textClass: string }
> = {
  jarvis: {
    name: 'J.A.R.V.I.S.',
    color: '#F59E0B',
    stroke: '#FBBF24',
    textClass: 'text-amber-300',
  },
  'sexta-feira': {
    name: 'SEXTA-FEIRA',
    color: '#38BDF8',
    stroke: '#7DD3FC',
    textClass: 'text-sky-300',
  },
  ultron: {
    name: 'ULTRON',
    color: '#EF4444',
    stroke: '#F87171',
    textClass: 'text-red-400',
  },
};

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function AuditTelemetryPanel({
  workspace,
  onRateTurn,
}: AuditTelemetryPanelProps) {
  const [scopeFilter, setScopeFilter] = useState<'todas' | 'auditoria'>('todas');
  const [timelineMetric, setTimelineMetric] = useState<'acerto' | 'latencia'>('acerto');

  const telemetryItems: TelemetryEntry[] = useMemo(() => {
    if (!workspace) return [];
    const base: TelemetryEntry[] =
      workspace.telemetryLog && workspace.telemetryLog.length > 0
        ? workspace.telemetryLog
        : workspace.conversations.map((c) => ({
            id: c.id,
            timestamp: c.timestamp,
            triggerType: c.triggerType,
            resolvedMode: c.resolvedMode,
            durationMs: c.durationMs ?? 0,
            promptPreview: c.userMessage.slice(0, 90),
            turns: c.responses.map((r) => ({
              speaker: r.speaker,
              feedback: r.feedback,
            })),
          }));

    if (scopeFilter === 'auditoria') {
      return base.filter((item) => item.triggerType === 'auditoria');
    }
    return base;
  }, [workspace, scopeFilter]);

  const summary = useMemo(() => {
    const ids: AssistantId[] = ['jarvis', 'sexta-feira', 'ultron'];
    const tasks = workspace?.tasks ?? [];
    const alerts = workspace?.alerts ?? [];
    const memories = workspace?.memories ?? [];

    const perAssistant = ids.map((id) => {
      let participations = 0;
      let auditsCount = 0;
      let acertos = 0;
      let revisoes = 0;
      let latencySum = 0;
      let latencyCount = 0;

      for (const item of telemetryItems) {
        const matched = item.turns.filter((t) => t.speaker === id);
        if (matched.length > 0) {
          participations += matched.length;
          if (item.triggerType === 'auditoria') auditsCount += matched.length;
          if (item.durationMs > 0) {
            latencySum += item.durationMs;
            latencyCount += 1;
          }
          for (const turn of matched) {
            if (turn.feedback === 'acerto') acertos += 1;
            else if (turn.feedback === 'revisar') revisoes += 1;
          }
        }
      }

      const assignedTasks = tasks.filter(
        (t) =>
          t.assignedTo === id ||
          t.assignedTo === 'todos' ||
          (t.assignedTo === 'ambos' && (id === 'jarvis' || id === 'sexta-feira'))
      );
      const completedTasks = assignedTasks.filter((t) => t.status === 'concluida').length;

      const raisedAlerts = alerts.filter((a) => a.raisedBy === id);
      const resolvedAlerts = raisedAlerts.filter((a) => a.resolved).length;

      const learnedMemories = memories.filter(
        (m) =>
          m.sourceAssistant === id ||
          m.sourceAssistant === 'todos' ||
          (m.sourceAssistant === 'ambos' && (id === 'jarvis' || id === 'sexta-feira'))
      );

      const ratedTotal = acertos + revisoes;
      const operationalDenominator = assignedTasks.length + raisedAlerts.length;
      const operationalResolved = completedTasks + resolvedAlerts;

      let hitRate: number | null = null;
      let hitRateSource: 'validada' | 'operacional' | 'sem-dados' = 'sem-dados';

      if (ratedTotal > 0) {
        hitRate = Math.round((acertos / ratedTotal) * 100);
        hitRateSource = 'validada';
      } else if (operationalDenominator > 0 || participations > 0) {
        const baseScore =
          operationalDenominator > 0
            ? (operationalResolved / operationalDenominator) * 100
            : 0;
        hitRate = Math.round(baseScore);
        hitRateSource = 'operacional';
      }

      const avgLatencyMs = latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0;

      return {
        id,
        name: ASSISTANT_META[id].name,
        color: ASSISTANT_META[id].color,
        textClass: ASSISTANT_META[id].textClass,
        participations,
        auditsCount,
        acertos,
        revisoes,
        ratedTotal,
        tasksTotal: assignedTasks.length,
        completedTasks,
        alertsTotal: raisedAlerts.length,
        resolvedAlerts,
        memoriesCount: learnedMemories.length,
        hitRate,
        hitRateDisplay: hitRate ?? 0,
        hitRateSource,
        avgLatencyMs,
        avgLatencySec: avgLatencyMs > 0 ? Number((avgLatencyMs / 1000).toFixed(2)) : 0,
      };
    });

    const allRated = perAssistant.reduce((acc, a) => acc + a.ratedTotal, 0);
    const allAcertos = perAssistant.reduce((acc, a) => acc + a.acertos, 0);
    const timedItems = telemetryItems.filter((t) => t.durationMs > 0);
    const overallAvgMs =
      timedItems.length > 0
        ? Math.round(timedItems.reduce((s, t) => s + t.durationMs, 0) / timedItems.length)
        : 0;
    const totalAlerts = alerts.length;
    const totalResolvedAlerts = alerts.filter((a) => a.resolved).length;

    const overallHitRate =
      allRated > 0
        ? Math.round((allAcertos / allRated) * 100)
        : totalAlerts + tasks.length > 0
        ? Math.round(
            ((totalResolvedAlerts + tasks.filter((t) => t.status === 'concluida').length) /
              (totalAlerts + tasks.length)) *
              100
          )
        : null;

    return {
      perAssistant,
      allRated,
      allAcertos,
      overallHitRate,
      overallAvgMs,
      totalInteractionsLogged: telemetryItems.length,
      totalAlerts,
      totalResolvedAlerts,
    };
  }, [workspace, telemetryItems]);

  const timelineData = useMemo(() => {
    const running: Record<AssistantId, { acertos: number; total: number; participations: number }> = {
      jarvis: { acertos: 0, total: 0, participations: 0 },
      'sexta-feira': { acertos: 0, total: 0, participations: 0 },
      ultron: { acertos: 0, total: 0, participations: 0 },
    };

    return telemetryItems.map((entry, idx) => {
      for (const turn of entry.turns) {
        running[turn.speaker].participations += 1;
        if (turn.feedback === 'acerto') {
          running[turn.speaker].acertos += 1;
          running[turn.speaker].total += 1;
        } else if (turn.feedback === 'revisar') {
          running[turn.speaker].total += 1;
        }
      }

      const calcRate = (id: AssistantId): number | null => {
        const stat = running[id];
        if (stat.total > 0) return Math.round((stat.acertos / stat.total) * 100);
        return null;
      };

      return {
        indexLabel: `#${idx + 1}`,
        timeLabel: formatShortTime(entry.timestamp),
        promptPreview: entry.promptPreview || 'Interação registrada',
        triggerType: entry.triggerType,
        jarvisRate: calcRate('jarvis'),
        fridayRate: calcRate('sexta-feira'),
        ultronRate: calcRate('ultron'),
        jarvisTurns: running.jarvis.participations,
        fridayTurns: running['sexta-feira'].participations,
        ultronTurns: running.ultron.participations,
        durationSec:
          entry.durationMs > 0 ? Number((entry.durationMs / 1000).toFixed(2)) : null,
      };
    });
  }, [telemetryItems]);

  const radarData = useMemo(() => {
    const memories = workspace?.memories ?? [];
    const alerts = workspace?.alerts ?? [];

    const scoreFor = (
      id: AssistantId,
      axis: 'Arquitetura' | 'Segurança' | 'Execução' | 'Previsão' | 'Precisão'
    ) => {
      const assistantStat = summary.perAssistant.find((p) => p.id === id);
      if (axis === 'Arquitetura') {
        const count = memories.filter(
          (m) =>
            m.category === 'arquitetura' &&
            (m.sourceAssistant === id || m.sourceAssistant === 'todos' || m.sourceAssistant === 'ambos')
        ).length;
        return Math.min(100, count * 25 + (assistantStat?.auditsCount ?? 0) * 20);
      }
      if (axis === 'Segurança') {
        const memCount = memories.filter(
          (m) =>
            m.category === 'seguranca' &&
            (m.sourceAssistant === id || m.sourceAssistant === 'todos')
        ).length;
        const alertCount = alerts.filter(
          (a) => a.type === 'seguranca' && a.raisedBy === id
        ).length;
        return Math.min(100, (memCount + alertCount) * 30);
      }
      if (axis === 'Execução') {
        const total = assistantStat?.tasksTotal ?? 0;
        const done = assistantStat?.completedTasks ?? 0;
        if (total === 0) return (assistantStat?.participations ?? 0) * 15;
        return Math.min(100, Math.round((done / total) * 70 + total * 10));
      }
      if (axis === 'Previsão') {
        const predAlerts = alerts.filter(
          (a) => a.type === 'instabilidade' && a.raisedBy === id
        ).length;
        return Math.min(100, predAlerts * 35 + (assistantStat?.memoriesCount ?? 0) * 8);
      }
      return assistantStat?.hitRate ?? 0;
    };

    const axes: Array<'Arquitetura' | 'Segurança' | 'Execução' | 'Previsão' | 'Precisão'> = [
      'Arquitetura',
      'Segurança',
      'Execução',
      'Previsão',
      'Precisão',
    ];

    return axes.map((axis) => ({
      axis,
      jarvis: scoreFor('jarvis', axis),
      friday: scoreFor('sexta-feira', axis),
      ultron: scoreFor('ultron', axis),
    }));
  }, [workspace, summary.perAssistant]);

  const recentEvaluatableTurns = useMemo(() => {
    const convs = workspace?.conversations ?? [];
    const list: Array<{
      entryId: string;
      speaker: AssistantId;
      stance: string;
      snippet: string;
      feedback?: TurnFeedback;
    }> = [];
    for (let i = convs.length - 1; i >= 0 && list.length < 4; i--) {
      const c = convs[i];
      for (const r of c.responses) {
        if (list.length < 4) {
          list.push({
            entryId: c.id,
            speaker: r.speaker,
            stance: r.stance,
            snippet: r.text.slice(0, 120),
            feedback: r.feedback,
          });
        }
      }
    }
    return list;
  }, [workspace?.conversations]);

  const hasRatedTimeline = timelineData.some(
    (d) => d.jarvisRate !== null || d.fridayRate !== null || d.ultronRate !== null
  );

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Activity className="h-4 w-4 text-amber-300 shrink-0" />
              <span>Telemetria de Desempenho</span>
              <span aria-hidden="true">·</span>
              <span>Patrick Pessoa</span>
            </div>
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Desempenho &amp; Taxa de Acerto dos Assistentes
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              Métricas reais calculadas a partir das suas validações de resposta (Acerto vs Revisar), resolução de tarefas, alertas mitigados e tempo de processamento.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setScopeFilter('todas')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                scopeFilter === 'todas'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todas as Interações
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('auditoria')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                scopeFilter === 'auditoria'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Somente Auditorias
            </button>
          </div>
        </div>

        {/* 4-Column Tabular KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-slate-800/80 pb-6">
          <div className="space-y-1">
            <p className="text-xs text-slate-400">Taxa de Acerto Global</p>
            <p className="font-mono tabular-nums text-2xl font-semibold text-slate-50">
              {summary.overallHitRate !== null ? `${summary.overallHitRate}%` : '—'}
            </p>
            <p className="text-xs text-slate-400 tabular-nums">
              {summary.allRated > 0
                ? `${summary.allAcertos} de ${summary.allRated} respostas validadas`
                : 'Base operacional de alertas e tarefas'}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-400">Interações Registradas</p>
            <p className="font-mono tabular-nums text-2xl font-semibold text-slate-50">
              {summary.totalInteractionsLogged}
            </p>
            <p className="text-xs text-slate-400 tabular-nums">
              Total histórico: {workspace?.profile.totalInteractions ?? 0}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-400">Latência Média de Resposta</p>
            <p className="font-mono tabular-nums text-2xl font-semibold text-slate-50">
              {formatDuration(summary.overallAvgMs)}
            </p>
            <p className="text-xs text-slate-400">Tempo médio de análise do conselho</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-400">Alertas Mitigados</p>
            <p className="font-mono tabular-nums text-2xl font-semibold text-slate-50">
              {summary.totalResolvedAlerts}/{summary.totalAlerts}
            </p>
            <p className="text-xs text-slate-400">Riscos de segurança e previsões</p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Chart 1: Hit Rate by Assistant (BarChart) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Taxa de Acerto por Assistente (%)
                </h3>
                <p className="text-xs text-slate-400">
                  Comparativo entre J.A.R.V.I.S., SEXTA-FEIRA e ULTRON
                </p>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={summary.perAssistant}
                  margin={{ top: 12, right: 12, left: -18, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={{ stroke: '#334155' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as (typeof summary.perAssistant)[number];
                      return (
                        <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3.5 py-2.5 text-xs text-slate-200 space-y-1 shadow-lg">
                          <div className={`font-semibold ${item.textClass}`}>{item.name}</div>
                          <div className="font-mono tabular-nums">
                            Taxa de Acerto: {item.hitRate !== null ? `${item.hitRate}%` : 'Sem dados'}
                          </div>
                          <div className="text-slate-400 tabular-nums">
                            {item.ratedTotal > 0
                              ? `Validações: ${item.acertos} acertos · ${item.revisoes} revisões`
                              : `Base operacional: ${item.completedTasks + item.resolvedAlerts}/${item.tasksTotal + item.alertsTotal} concluídos`}
                          </div>
                          <div className="text-slate-400 tabular-nums">
                            Participações: {item.participations} · Memórias: {item.memoriesCount}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="hitRateDisplay" radius={[6, 6, 0, 0]} maxBarSize={54}>
                    {summary.perAssistant.map((entry) => (
                      <Cell key={entry.id} fill={entry.color} fillOpacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Longitudinal Evolution Across Interactions (AreaChart) */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Evolução ao Longo das Interações
                </h3>
                <p className="text-xs text-slate-400">
                  {timelineMetric === 'acerto'
                    ? 'Taxa de acerto acumulada (%) conforme suas avaliações'
                    : 'Participações acumuladas e tempo de resposta (s)'}
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800 self-start">
                <button
                  type="button"
                  onClick={() => setTimelineMetric('acerto')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    timelineMetric === 'acerto'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Acerto (%)
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineMetric('latencia')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    timelineMetric === 'latencia'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Latência &amp; Uso
                </button>
              </div>
            </div>

            {timelineData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 px-6 text-center">
                <p className="text-sm font-medium text-slate-200">
                  Nenhuma interação registrada neste filtro ainda
                </p>
                <p className="mt-1 text-xs text-slate-400 max-w-md">
                  Envie uma solicitação no Console ou execute uma Auditoria Tripla abaixo para gerar a curva longitudinal de desempenho.
                </p>
              </div>
            ) : timelineMetric === 'acerto' && !hasRatedTimeline ? (
              <div className="h-64 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 px-6 text-center">
                <p className="text-sm font-medium text-slate-200">
                  Aguardando suas primeiras validações de acerto
                </p>
                <p className="mt-1 text-xs text-slate-400 max-w-md">
                  Marque qualquer resposta como &ldquo;Acerto&rdquo; ou &ldquo;Revisar&rdquo; abaixo (ou no Console) para traçar a evolução percentual de cada assistente.
                </p>
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={timelineData}
                    margin={{ top: 12, right: 12, left: -18, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="jarvisGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="fridayGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ultronGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                    <XAxis
                      dataKey="indexLabel"
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      axisLine={{ stroke: '#334155' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={timelineMetric === 'acerto' ? [0, 100] : [0, 'auto']}
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      unit={timelineMetric === 'acerto' ? '%' : ''}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as (typeof timelineData)[number];
                        return (
                          <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3.5 py-2.5 text-xs text-slate-200 space-y-1 max-w-xs shadow-lg">
                            <div className="flex items-center justify-between gap-3 text-slate-400">
                              <span>Interação {row.indexLabel}</span>
                              <span className="font-mono tabular-nums">{row.timeLabel}</span>
                            </div>
                            <p className="text-slate-100 line-clamp-2">{row.promptPreview}</p>
                            {timelineMetric === 'acerto' ? (
                              <div className="pt-1 space-y-0.5 font-mono tabular-nums">
                                {row.jarvisRate !== null && (
                                  <div className="text-amber-300">J.A.R.V.I.S.: {row.jarvisRate}%</div>
                                )}
                                {row.fridayRate !== null && (
                                  <div className="text-sky-300">SEXTA-FEIRA: {row.fridayRate}%</div>
                                )}
                                {row.ultronRate !== null && (
                                  <div className="text-red-400">ULTRON: {row.ultronRate}%</div>
                                )}
                              </div>
                            ) : (
                              <div className="pt-1 space-y-0.5 font-mono tabular-nums">
                                <div className="text-slate-200">
                                  Latência: {row.durationSec ? `${row.durationSec}s` : '—'}
                                </div>
                                <div className="text-amber-300">J.A.R.V.I.S.: {row.jarvisTurns} turnos</div>
                                <div className="text-sky-300">SEXTA-FEIRA: {row.fridayTurns} turnos</div>
                                <div className="text-red-400">ULTRON: {row.ultronTurns} turnos</div>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    {timelineMetric === 'acerto' ? (
                      <>
                        <Area
                          type="monotone"
                          dataKey="jarvisRate"
                          name="J.A.R.V.I.S."
                          stroke="#F59E0B"
                          strokeWidth={2}
                          fill="url(#jarvisGrad)"
                          connectNulls
                        />
                        <Area
                          type="monotone"
                          dataKey="fridayRate"
                          name="SEXTA-FEIRA"
                          stroke="#38BDF8"
                          strokeWidth={2}
                          fill="url(#fridayGrad)"
                          connectNulls
                        />
                        <Area
                          type="monotone"
                          dataKey="ultronRate"
                          name="ULTRON"
                          stroke="#EF4444"
                          strokeWidth={2}
                          fill="url(#ultronGrad)"
                          connectNulls
                        />
                      </>
                    ) : (
                      <>
                        <Area
                          type="monotone"
                          dataKey="jarvisTurns"
                          name="J.A.R.V.I.S."
                          stroke="#F59E0B"
                          strokeWidth={2}
                          fill="url(#jarvisGrad)"
                        />
                        <Area
                          type="monotone"
                          dataKey="fridayTurns"
                          name="SEXTA-FEIRA"
                          stroke="#38BDF8"
                          strokeWidth={2}
                          fill="url(#fridayGrad)"
                        />
                        <Area
                          type="monotone"
                          dataKey="ultronTurns"
                          name="ULTRON"
                          stroke="#EF4444"
                          strokeWidth={2}
                          fill="url(#ultronGrad)"
                        />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Second Row: Radar Matrix + Per-Assistant Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start border-t border-slate-800/80 pt-6">
          <div className="lg:col-span-5 space-y-2">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Matriz de Especialidades do Conselho
            </h3>
            <p className="text-xs text-slate-400">
              Distribuição real por arquitetura, segurança, execução, previsão e precisão
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
                  <PolarGrid stroke="#1E293B" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: '#CBD5E1', fontSize: 11 }} />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={false}
                    axisLine={false}
                  />
                  <Radar
                    name="J.A.R.V.I.S."
                    dataKey="jarvis"
                    stroke="#F59E0B"
                    fill="#F59E0B"
                    fillOpacity={0.18}
                  />
                  <Radar
                    name="SEXTA-FEIRA"
                    dataKey="friday"
                    stroke="#38BDF8"
                    fill="#38BDF8"
                    fillOpacity={0.18}
                  />
                  <Radar
                    name="ULTRON"
                    dataKey="ultron"
                    stroke="#EF4444"
                    fill="#EF4444"
                    fillOpacity={0.18}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderColor: '#334155',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                      color: '#F1F5F9',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Placar Técnico Individual
              </h3>
              <p className="text-xs text-slate-400">
                Consolidado de interações, acertos validados, memórias e alertas resolvidos
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Assistente</th>
                    <th className="py-2.5 px-3 font-medium text-right">Turnos</th>
                    <th className="py-2.5 px-3 font-medium text-right">Acertos</th>
                    <th className="py-2.5 px-3 font-medium text-right">Revisões</th>
                    <th className="py-2.5 px-3 font-medium text-right">Taxa</th>
                    <th className="py-2.5 pl-3 font-medium text-right">Latência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {summary.perAssistant.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className={`py-3 pr-3 font-semibold ${row.textClass}`}>
                        {row.name}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                        {row.participations}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-300">
                        {row.acertos}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-300">
                        {row.revisoes}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-100 font-semibold">
                        {row.hitRate !== null ? `${row.hitRate}%` : '—'}
                      </td>
                      <td className="py-3 pl-3 text-right font-mono tabular-nums text-slate-300">
                        {formatDuration(row.avgLatencyMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Quick inline calibration for recent turns */}
            {recentEvaluatableTurns.length > 0 && (
              <div className="pt-2 space-y-2.5 border-t border-slate-800/80">
                <p className="text-xs font-medium text-slate-300">
                  Validar respostas recentes para atualizar a taxa de acerto:
                </p>
                <div className="divide-y divide-slate-800/60">
                  {recentEvaluatableTurns.map((item) => {
                    const meta = ASSISTANT_META[item.speaker];
                    return (
                      <div
                        key={`${item.entryId}-${item.speaker}`}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`font-semibold ${meta.textClass}`}>
                              {meta.name}
                            </span>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span className="text-slate-400 truncate">{item.stance}</span>
                          </div>
                          <p className="text-xs text-slate-300 truncate mt-0.5">
                            {item.snippet}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onRateTurn(
                                item.entryId,
                                item.speaker,
                                item.feedback === 'acerto' ? null : 'acerto'
                              )
                            }
                            aria-pressed={item.feedback === 'acerto'}
                            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                              item.feedback === 'acerto'
                                ? 'border-emerald-500/60 bg-emerald-950/50 text-emerald-300'
                                : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {item.feedback === 'acerto' ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <ThumbsUp className="h-3 w-3" />
                            )}
                            <span>Acerto</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onRateTurn(
                                item.entryId,
                                item.speaker,
                                item.feedback === 'revisar' ? null : 'revisar'
                              )
                            }
                            aria-pressed={item.feedback === 'revisar'}
                            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                              item.feedback === 'revisar'
                                ? 'border-amber-500/60 bg-amber-950/50 text-amber-300'
                                : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {item.feedback === 'revisar' ? (
                              <RotateCcw className="h-3 w-3" />
                            ) : (
                              <ThumbsDown className="h-3 w-3" />
                            )}
                            <span>Revisar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
