import {
  Activity,
  Cpu,
  HardDrive,
  Layers,
  Radio,
  RefreshCw,
  RotateCcw,
  Wifi,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { UsePerformanceMonitorReturn } from '../hooks/usePerformanceMonitor';
import type { AudioRingBufferStats } from '../utils/audioRingBuffer';

interface PerformanceAuditChartsProps {
  monitor: UsePerformanceMonitorReturn;
  ringBufferStats?: AudioRingBufferStats;
  isDark?: boolean;
}

export function PerformanceAuditCharts({
  monitor,
  ringBufferStats,
  isDark = true,
}: PerformanceAuditChartsProps) {
  const { snapshot, history, captureNow, resetHistory } = monitor;
  const ring = ringBufferStats ?? snapshot.ringBuffer;

  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisTick = isDark ? '#94a3b8' : '#475569';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
    borderRadius: '0.6rem',
    fontSize: '11px',
    color: isDark ? '#f1f5f9' : '#0f172a',
  };

  const ringTierColor =
    ring?.networkTier === 'alta'
      ? 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10'
      : ring?.networkTier === 'moderada'
      ? 'text-amber-600 dark:text-amber-300 border-amber-500/30 bg-amber-500/10'
      : 'text-emerald-600 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10';

  const ringTierLabel =
    ring?.networkTier === 'alta'
      ? 'Latência Alta · Buffer Expandido'
      : ring?.networkTier === 'moderada'
      ? 'Latência Moderada · Balanceado'
      : 'Latência Baixa · Buffer Compacto';

  const bufferedKb = Math.round(((ring?.bufferedBytes ?? 0) / 1024) * 10) / 10;
  const budgetMb = Math.round(((ring?.maxBudgetBytes ?? 2.5 * 1024 * 1024) / (1024 * 1024)) * 10) / 10;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Activity className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Monitoramento de Memória, Renderização &amp; Ring Buffer de Áudio
              </h2>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                {snapshot.sampleCount} amostras · 2s
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Medição ao vivo do heap JS, latência de renderização do{' '}
              <span className="font-mono text-amber-600 dark:text-amber-300">
                SpeakingHologramOverlay
              </span>{' '}
              e{' '}
              <span className="font-mono text-cyan-600 dark:text-cyan-300">DialogueStream</span>, e
              adaptação dinâmica do buffer circular de áudio para J.A.R.V.I.S., SEXTA-FEIRA e
              ULTRON.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={captureNow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500/50 hover:text-cyan-600 dark:hover:text-cyan-300 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Capturar</span>
          </button>
          <button
            type="button"
            onClick={resetHistory}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Limpar Série</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* KPI 1: Memory */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">Memória JS / Heap</span>
            <HardDrive className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5 font-mono">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {snapshot.heapUsedMb.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              MB / {snapshot.heapTotalMb.toFixed(0)} MB
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(4, snapshot.heapUsagePct))}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {snapshot.memorySource === 'js_heap'
              ? `Heap V8 ao vivo (${snapshot.heapUsagePct.toFixed(1)}% do limite)`
              : 'Estimativa por buffers rastreados (browser sem API V8)'}
          </p>
        </div>

        {/* KPI 2: SpeakingHologramOverlay Latency */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium font-mono">SpeakingHologramOverlay</span>
            <Cpu className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5 font-mono">
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-300 tabular-nums">
              {snapshot.hologram.avgDurationMs.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">ms médio</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400">
            <span>Pico: {snapshot.hologram.peakDurationMs.toFixed(2)} ms</span>
            <span>{snapshot.hologram.renderCount} commits</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {snapshot.hologram.slowFramesCount === 0
              ? '100% abaixo de 16.6ms (60 FPS)'
              : `${snapshot.hologram.slowFramesCount} frames > 16.6ms`}
          </p>
        </div>

        {/* KPI 3: DialogueStream Latency */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium font-mono">DialogueStream</span>
            <Layers className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5 font-mono">
            <span className="text-2xl font-bold text-cyan-600 dark:text-cyan-300 tabular-nums">
              {snapshot.dialogue.avgDurationMs.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">ms médio</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400">
            <span>Pico: {snapshot.dialogue.peakDurationMs.toFixed(2)} ms</span>
            <span>{snapshot.dialogue.renderCount} commits</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {snapshot.dialogue.slowFramesCount === 0
              ? 'Fluxo estável sem bloqueios'
              : `${snapshot.dialogue.slowFramesCount} commits > 16.6ms`}
          </p>
        </div>

        {/* KPI 4: Adaptive Audio Ring Buffer */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">Ring Buffer de Áudio</span>
            <Wifi className="h-4 w-4 text-rose-500 dark:text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5 font-mono">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {ring?.occupiedSlots ?? 0}/{ring?.capacitySlots ?? 2}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              slots · Prefetch +{ring?.prefetchAhead ?? 1}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400">
            <span>RTT: {ring?.ewmaRttMs ?? 260} ms</span>
            <span>
              {bufferedKb} KB / {budgetMb} MB
            </span>
          </div>
          <div className="mt-1.5">
            <span
              className={`inline-block text-[10px] font-mono px-2 py-0.5 rounded border ${ringTierColor}`}
            >
              {ringTierLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Charts Row 1: Memory & Render Latency */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Chart 1: Memory & Audio Ring Buffer */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Uso de Memória (MB) &amp; Buffer Circular de Voz (KB)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Validação da reciclagem imediata de chunks após reprodução
              </p>
            </div>
            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
              {ring?.recycledChunksTotal ?? 0} reciclados
            </span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={history} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="heapGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="ringGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ fill: axisTick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: gridStroke }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: axisTick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  unit=" MB"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: axisTick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  unit=" KB"
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="heapUsedMb"
                  name="Heap JS (MB)"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#heapGrad)"
                  isAnimationActive={false}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="ringBufferKb"
                  name="Ring Buffer Áudio (KB)"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fill="url(#ringGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Render Latency SpeakingHologramOverlay vs DialogueStream */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Latência de Renderização (ms) — Profiler React
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Comparativo SpeakingHologramOverlay vs DialogueStream (alvo &lt; 16.6ms)
              </p>
            </div>
            <span className="font-mono text-[11px] text-amber-600 dark:text-amber-300">
              Alvo 60 FPS
            </span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={history} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ fill: axisTick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: gridStroke }}
                />
                <YAxis
                  tick={{ fill: axisTick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  unit=" ms"
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <ReferenceLine
                  y={16.67}
                  stroke="#f43f5e"
                  strokeDasharray="4 4"
                  label={{
                    value: '16.6ms',
                    fill: '#f43f5e',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="hologramAvgMs"
                  name="Hologram Média (ms)"
                  stroke="#f59e0b"
                  strokeWidth={2.2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="hologramPeakMs"
                  name="Hologram Pico (ms)"
                  stroke="#fb923c"
                  strokeWidth={1.3}
                  strokeDasharray="3 3"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="dialogueAvgMs"
                  name="DialogueStream Média (ms)"
                  stroke="#38bdf8"
                  strokeWidth={2.2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="dialoguePeakMs"
                  name="DialogueStream Pico (ms)"
                  stroke="#818cf8"
                  strokeWidth={1.3}
                  strokeDasharray="3 3"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Chart Row 2: Network Latency vs Dynamic Ring Buffer Adaptation + Per-Assistant Counters */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Adaptação Dinâmica do Ring Buffer vs Latência de Rede (RTT)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Redimensionamento automático de slots (2–6) e prefetch (+1 a +3 chunks) conforme RTT
                medido
              </p>
            </div>
            <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-300">
              Prefetches: {ring?.prefetchedChunksTotal ?? 0}
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <ComposedChart data={history} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ fill: axisTick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: gridStroke }}
                />
                <YAxis
                  yAxisId="rtt"
                  tick={{ fill: axisTick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  unit=" ms"
                />
                <YAxis
                  yAxisId="slots"
                  orientation="right"
                  domain={[0, 7]}
                  tick={{ fill: axisTick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  yAxisId="slots"
                  dataKey="ringCapacitySlots"
                  name="Capacidade Ring (slots)"
                  fill={isDark ? '#1e3a8a' : '#bfdbfe'}
                  radius={[4, 4, 0, 0]}
                  barSize={14}
                  isAnimationActive={false}
                />
                <Bar
                  yAxisId="slots"
                  dataKey="ringOccupiedSlots"
                  name="Slots Ocupados"
                  fill="#06b6d4"
                  radius={[4, 4, 0, 0]}
                  barSize={10}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="rtt"
                  type="monotone"
                  dataKey="networkRttMs"
                  name="RTT Rede EWMA (ms)"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Per-Assistant Audio Pipeline Diagnostics */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Radio className="h-4 w-4 text-amber-500" />
              <span>Fluxos de Áudio por Assistente</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Chunks segmentados por frase e reciclados via buffer circular
            </p>
          </div>

          <div className="space-y-2.5">
            {(
              [
                {
                  id: 'jarvis' as const,
                  label: 'J.A.R.V.I.S.',
                  sub: '104.3 Hz · Matriz Dourada',
                  accent: 'text-amber-600 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
                },
                {
                  id: 'sexta-feira' as const,
                  label: 'SEXTA-FEIRA',
                  sub: 'Kore / Zephyr · Tática',
                  accent: 'text-cyan-600 dark:text-cyan-300 border-cyan-500/30 bg-cyan-500/10',
                },
                {
                  id: 'ultron' as const,
                  label: 'ULTRON',
                  sub: '90.2 Hz · Grave Metálico',
                  accent: 'text-rose-600 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
                },
              ] as const
            ).map((item) => {
              const played = ring?.speakerChunksPlayed?.[item.id] ?? 0;
              const isActive = ring?.activeSpeaker === item.id;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-3 py-2.5"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {item.label}
                      </span>
                      {isActive && (
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {item.sub}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xs font-semibold px-2 py-0.5 rounded border tabular-nums ${item.accent}`}
                  >
                    {played} chunks
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-center font-mono">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {ring?.cacheHitCount ?? 0}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Cache Hits</div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {ring?.evictedByBudgetTotal ?? 0}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Despejos Cap</div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {ring?.underrunCount ?? 0}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Underruns</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
