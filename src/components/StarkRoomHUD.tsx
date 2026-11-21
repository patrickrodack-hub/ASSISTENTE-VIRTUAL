import { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Mic,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Star,
  Volume2,
} from 'lucide-react';
import type {
  AssistantId,
  AssistantTurn,
  InteractionMode,
  LiveIntelBriefing,
  WebSearchMode,
  WorkspaceState,
} from '../types/assistant';
import type { AudioTelemetryBuffer } from '../hooks/useVoiceEngine';
import type { UsePerformanceMonitorReturn } from '../hooks/usePerformanceMonitor';
import type { AudioRingBufferStats } from '../utils/audioRingBuffer';
import { StarkRoomGlobeCanvas } from './StarkRoomGlobeCanvas';
import { triggerHaptic } from '../utils/haptics';

interface BroadcastItem {
  id: string;
  channel: string;
  badge: string;
  title: string;
  detail: string;
  source: string;
  link?: string;
  timestamp?: string;
  suggestedPrompt: string;
  preferredAssistant: AssistantId;
}

interface StarkRoomHUDProps {
  workspace: WorkspaceState | null;
  liveIntel: LiveIntelBriefing | null;
  isLoadingIntel: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  speakingSpeaker: AssistantId | 'ambos' | 'todos' | null;
  isStandbyActive: boolean;
  audioTelemetryRef: RefObject<AudioTelemetryBuffer>;
  ringBufferStats: AudioRingBufferStats;
  performanceMonitor: UsePerformanceMonitorReturn;
  useWebSearch: WebSearchMode;
  onChangeWebSearch: (mode: WebSearchMode) => void;
  onRefreshIntel: () => void;
  onAskAssistant: (prompt: string, mode: InteractionMode) => void;
  onSpeakHeadline: (turn: AssistantTurn) => void;
  onOpenHologram: (speaker: AssistantId) => void;
  onFocusConsole: () => void;
  onToggleStandby: () => void;
  onOpenView: (view: 'agenda' | 'radar' | 'memoria' | 'auditoria') => void;
}

type DataChannelId = 'local' | 'online' | 'cloud';

const MONTH_NAMES_PT = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

function buildMonitorFeeds(
  liveIntel: LiveIntelBriefing | null,
  workspace: WorkspaceState | null
): {
  marketFeed: BroadcastItem[];
  mainNewsFeed: BroadcastItem[];
  sportsWorldFeed: BroadcastItem[];
} {
  const snapshots = workspace?.dailyIntelFeed ?? [];
  const marketSnaps = snapshots.filter(
    (s) => s.sourceKey === 'b3' || s.sourceKey === 'cepea' || s.sourceKey === 'redes_sociais'
  );
  const g1Snaps = snapshots.filter((s) => s.sourceKey === 'g1');
  const geSnaps = snapshots.filter((s) => s.sourceKey === 'ge');

  // Monitor 1: B3 · CEPEA · Mercado & Redes Sociais
  const marketFeed: BroadcastItem[] = [];
  for (const snap of marketSnaps) {
    if (snap.items.length > 0) {
      for (const item of snap.items.slice(0, 3)) {
        marketFeed.push({
          id: `${snap.id}-${item.title.slice(0, 18)}`,
          channel: snap.sourceKey.toUpperCase(),
          badge: snap.domainUrl.replace(/^https?:\/\//, ''),
          title: item.title,
          detail: item.detail || snap.headlineSummary,
          source: snap.sourceLabel,
          link: item.uri,
          timestamp: snap.queryDate,
          suggestedPrompt: `J.A.R.V.I.S., atualize os indicadores de ${snap.sourceLabel} sobre: ${item.title}`,
          preferredAssistant: 'jarvis',
        });
      }
    } else if (snap.headlineSummary) {
      marketFeed.push({
        id: snap.id,
        channel: snap.sourceKey.toUpperCase(),
        badge: snap.domainUrl.replace(/^https?:\/\//, ''),
        title: snap.headlineSummary,
        detail: `Consulta registrada em ${snap.queryDate} · Base atualizada`,
        source: snap.sourceLabel,
        timestamp: snap.queryDate,
        suggestedPrompt: `J.A.R.V.I.S., consulte agora cotações atualizadas na b3.com.br e cepea.com.br.`,
        preferredAssistant: 'jarvis',
      });
    }
  }
  if (marketFeed.length === 0) {
    // Fallback to live Brasil/Mundo headlines + direct B3/CEPEA prompt cards
    const brasilFallback = liveIntel?.news?.brasil ?? [];
    for (const n of brasilFallback.slice(0, 4)) {
      marketFeed.push({
        id: `mkt-${n.id}`,
        channel: 'MERCADO · BR',
        badge: n.source || 'G1 / B3',
        title: n.title,
        detail: 'Monitor financeiro conectado ao roteador B3.com.br e CEPEA.com.br.',
        source: n.source || 'Brasil',
        link: n.link,
        timestamp: n.pubDate,
        suggestedPrompt: `J.A.R.V.I.S., analise o impacto econômico e cotações na B3 e CEPEA relacionadas a: ${n.title}`,
        preferredAssistant: 'jarvis',
      });
    }
  }
  if (marketFeed.length === 0) {
    marketFeed.push({
      id: 'mkt-default',
      channel: 'B3 · CEPEA',
      badge: 'b3.com.br · cepea.com.br',
      title: 'Monitor Financeiro & Commodities pronto para varredura ao vivo',
      detail: 'Acione J.A.R.V.I.S. para puxar Ibovespa, dólar e indicadores agropecuários do dia.',
      source: 'Roteador B3 / CEPEA',
      suggestedPrompt: 'J.A.R.V.I.S., busque agora as cotações de hoje na b3.com.br e cepea.com.br.',
      preferredAssistant: 'jarvis',
    });
  }

  // Monitor 2 (Hero Broadcast Monitor): G1 · Rio de Janeiro & Brasil
  const mainNewsFeed: BroadcastItem[] = [];
  for (const n of liveIntel?.news?.rio ?? []) {
    mainNewsFeed.push({
      id: `rio-${n.id}`,
      channel: 'RIO DE JANEIRO · AO VIVO',
      badge: 'G1 · RJ',
      title: n.title,
      detail: liveIntel?.weather
        ? `Rio ${liveIntel.weather.temperatureC}°C (${liveIntel.weather.conditionLabel}) · Fonte: ${n.source}`
        : `Fonte verificada: ${n.source}`,
      source: n.source || 'G1 Rio',
      link: n.link,
      timestamp: n.pubDate,
      suggestedPrompt: `J.A.R.V.I.S. e SEXTA-FEIRA, resumam esta notícia do Rio no g1.com.br: ${n.title}`,
      preferredAssistant: 'jarvis',
    });
  }
  for (const snap of g1Snaps) {
    for (const item of snap.items.slice(0, 3)) {
      mainNewsFeed.push({
        id: `g1-${snap.id}-${item.title.slice(0, 14)}`,
        channel: 'G1 · BUSCA DIÁRIA',
        badge: 'g1.com.br',
        title: item.title,
        detail: item.detail || snap.headlineSummary,
        source: 'G1 Globo',
        link: item.uri,
        timestamp: snap.queryDate,
        suggestedPrompt: `J.A.R.V.I.S., aprofunde os fatos no g1.com.br sobre: ${item.title}`,
        preferredAssistant: 'jarvis',
      });
    }
  }
  for (const n of liveIntel?.news?.brasil ?? []) {
    mainNewsFeed.push({
      id: `br-${n.id}`,
      channel: 'BRASIL · URGENTE',
      badge: 'G1 · BRASIL',
      title: n.title,
      detail: `Cobertura nacional sincronizada · ${n.source}`,
      source: n.source || 'G1 Brasil',
      link: n.link,
      timestamp: n.pubDate,
      suggestedPrompt: `SEXTA-FEIRA, verifique atualizações sobre: ${n.title}`,
      preferredAssistant: 'sexta-feira',
    });
  }
  if (mainNewsFeed.length === 0) {
    mainNewsFeed.push({
      id: 'main-default',
      channel: 'G1 · RIO & BRASIL',
      badge: 'g1.com.br',
      title: 'Sincronizando manchetes em tempo real do Rio de Janeiro e Brasil',
      detail: 'Clique em Sincronizar ou peça a J.A.R.V.I.S. um boletim de notícias do g1.com.br.',
      source: 'Radar RODACK',
      suggestedPrompt: 'J.A.R.V.I.S., busque as principais notícias de hoje no g1.com.br.',
      preferredAssistant: 'jarvis',
    });
  }

  // Monitor 3: GE Esportes & Mundo
  const sportsWorldFeed: BroadcastItem[] = [];
  for (const snap of geSnaps) {
    for (const item of snap.items.slice(0, 3)) {
      sportsWorldFeed.push({
        id: `ge-${snap.id}-${item.title.slice(0, 14)}`,
        channel: 'GE · ESPORTES',
        badge: 'ge.com.br',
        title: item.title,
        detail: item.detail || snap.headlineSummary,
        source: 'GE Globo',
        link: item.uri,
        timestamp: snap.queryDate,
        suggestedPrompt: `SEXTA-FEIRA, traga os últimos lances e placares no ge.com.br sobre: ${item.title}`,
        preferredAssistant: 'sexta-feira',
      });
    }
  }
  for (const n of liveIntel?.news?.mundo ?? []) {
    sportsWorldFeed.push({
      id: `world-${n.id}`,
      channel: 'MUNDO · GEOPOLÍTICA',
      badge: n.source || 'GLOBAL',
      title: n.title,
      detail: `Monitor internacional ativo · Análise tática disponível via ULTRON`,
      source: n.source || 'Internacional',
      link: n.link,
      timestamp: n.pubDate,
      suggestedPrompt: `ULTRON, faça uma leitura estratégica e de riscos globais sobre: ${n.title}`,
      preferredAssistant: 'ultron',
    });
  }
  if (sportsWorldFeed.length === 0) {
    sportsWorldFeed.push({
      id: 'ge-default',
      channel: 'GE · ESPORTES & MUNDO',
      badge: 'ge.com.br',
      title: 'Monitor de Esportes (GE) e Cenário Internacional pronto',
      detail: 'Acione SEXTA-FEIRA para placares do ge.com.br ou ULTRON para radar global.',
      source: 'GE / Radar Global',
      suggestedPrompt: 'SEXTA-FEIRA, busque os principais destaques esportivos de hoje no ge.com.br.',
      preferredAssistant: 'sexta-feira',
    });
  }

  return { marketFeed, mainNewsFeed, sportsWorldFeed };
}

export function StarkRoomHUD({
  workspace,
  liveIntel,
  isLoadingIntel,
  isProcessing,
  isSpeaking,
  speakingSpeaker,
  isStandbyActive,
  audioTelemetryRef,
  ringBufferStats,
  performanceMonitor,
  useWebSearch,
  onChangeWebSearch,
  onRefreshIntel,
  onAskAssistant,
  onSpeakHeadline,
  onOpenHologram,
  onFocusConsole,
  onToggleStandby,
  onOpenView,
}: StarkRoomHUDProps) {
  const [clockText, setClockText] = useState({ hhmmss: '00:00:00', cs: '00', dateStr: '', monthLabel: '' });
  const [activeChannel, setActiveChannel] = useState<DataChannelId>(
    useWebSearch === 'off' ? 'local' : 'online'
  );
  const [isAutoRotate, setIsAutoRotate] = useState(true);
  const [marketIdx, setMarketIdx] = useState(0);
  const [mainIdx, setMainIdx] = useState(0);
  const [worldIdx, setWorldIdx] = useState(0);

  // Live Rio de Janeiro high-precision clock (matches bottom-right 16:56.26^471 readout)
  useEffect(() => {
    const updateClock = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const cs = String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0');
      setClockText({
        hhmmss: `${hh}:${min}.${ss}`,
        cs,
        dateStr: `${dd}.${mm}.${yyyy}`,
        monthLabel: MONTH_NAMES_PT[now.getMonth()] ?? '',
      });
    };
    updateClock();
    const id = window.setInterval(updateClock, 150);
    return () => window.clearInterval(id);
  }, []);

  const { marketFeed, mainNewsFeed, sportsWorldFeed } = useMemo(
    () => buildMonitorFeeds(liveIntel, workspace),
    [liveIntel, workspace]
  );

  // Auto-cycle news across all 3 broadcast monitors every 8 seconds (pauses on hidden tab or user pause)
  useEffect(() => {
    if (!isAutoRotate) return;
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setMainIdx((v) => (v + 1) % Math.max(1, mainNewsFeed.length));
      setMarketIdx((v) => (v + 1) % Math.max(1, marketFeed.length));
      setWorldIdx((v) => (v + 1) % Math.max(1, sportsWorldFeed.length));
    }, 8500);
    return () => window.clearInterval(id);
  }, [isAutoRotate, mainNewsFeed.length, marketFeed.length, sportsWorldFeed.length]);

  const currentMarket = marketFeed[marketIdx % marketFeed.length];
  const currentMain = mainNewsFeed[mainIdx % mainNewsFeed.length];
  const currentWorld = sportsWorldFeed[worldIdx % sportsWorldFeed.length];

  // Real current month calendar matrix (Top-Left HUD Calendar)
  const calendarDays = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const eventDays = new Set<number>();
    for (const ev of workspace?.agenda ?? []) {
      if (ev.date) {
        const [y, m, d] = ev.date.split('-').map(Number);
        if (y === year && m === month + 1 && d) {
          eventDays.add(d);
        }
      }
    }
    return Array.from({ length: Math.min(28, daysInMonth) }, (_, i) => {
      const day = i + 1;
      return { day, isToday: day === today, hasEvent: eventDays.has(day) };
    });
  }, [workspace?.agenda]);

  const openAlerts = (workspace?.alerts ?? []).filter((a) => !a.resolved);
  const pendingTasks = (workspace?.tasks ?? []).filter((t) => t.status !== 'concluida');
  const totalRecordsCount =
    (workspace?.memories?.length ?? 0) +
    (workspace?.conversations?.length ?? 0) +
    (workspace?.dailyIntelFeed?.length ?? 0) +
    (liveIntel?.news?.rio?.length ?? 0) +
    (liveIntel?.news?.brasil?.length ?? 0) +
    (liveIntel?.news?.mundo?.length ?? 0);

  // Sparkline SVG points from real performanceMonitor history
  const sparklinePath = useMemo(() => {
    const pts = performanceMonitor.history.slice(-14);
    if (pts.length < 2) return 'M 0 24 L 100 24';
    const maxVal = Math.max(40, ...pts.map((p) => p.heapUsedMb));
    const minVal = Math.min(...pts.map((p) => p.heapUsedMb)) * 0.9;
    const span = Math.max(1, maxVal - minVal);
    return pts
      .map((p, idx) => {
        const x = (idx / (pts.length - 1)) * 100;
        const y = 26 - ((p.heapUsedMb - minVal) / span) * 22;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [performanceMonitor.history]);

  const handleSelectChannel = (ch: DataChannelId) => {
    triggerHaptic('toggle');
    setActiveChannel(ch);
    if (ch === 'online') {
      onChangeWebSearch('always');
    } else if (ch === 'local') {
      onChangeWebSearch('auto');
    } else {
      onChangeWebSearch('auto');
      onRefreshIntel();
    }
  };

  const handleSpeakMonitorItem = (item: BroadcastItem) => {
    triggerHaptic('tap');
    onSpeakHeadline({
      speaker: item.preferredAssistant,
      stance: `Monitor Sala Stark · ${item.channel}`,
      text: `${item.title}. ${item.detail}`,
      ttsScript: `Boletim da Sala Stark, canal ${item.source}. ${item.title}.`,
    });
  };

  const snap = performanceMonitor.snapshot;
  const ringFillPct = Math.min(
    100,
    Math.round(((ringBufferStats.occupiedSlots || 0) / Math.max(1, ringBufferStats.capacitySlots)) * 100)
  );
  const tempPct = liveIntel?.weather
    ? Math.min(100, Math.max(10, Math.round((liveIntel.weather.temperatureC / 45) * 100)))
    : 52;

  return (
    <section
      aria-label="Sala Stark — Painel Tático Global"
      className="mb-3 rounded-xl stark-room-panel p-2.5 sm:p-3.5 relative overflow-hidden w-full"
    >
      {/* Subtle reference frame header rule */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-sky-400/80 via-orange-500/80 to-sky-400/80"
      />

      {/* Fluid Full-Width Command Room Grid adapting cleanly to resize & wide viewports */}
      <div className="grid grid-cols-1 lg:grid-cols-12 xl:grid-cols-[minmax(390px,5.1fr)_minmax(360px,5.1fr)_minmax(195px,1.8fr)] gap-3 items-stretch lg:min-h-[clamp(480px,calc(100dvh-148px),780px)]">
        {/* LEFT COLUMN: Top Telemetry + 3 Stacked LIVE DATA TRANSFER Monitors + Bottom Radar & 22/23/24 Selector */}
        <div className="lg:col-span-5 xl:col-span-1 flex flex-col justify-between gap-2.5 min-w-0">
          {/* Top-Left Block: Star Crest + Date + Mini Calendar + Global Control + Sparkline */}
          <div className="grid grid-cols-12 gap-2.5 items-center border-b border-sky-500/20 pb-2.5">
            <div className="col-span-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onOpenView('agenda')}
                title="Abrir Agenda & Rotinas"
                className="h-11 w-11 rounded-lg border border-sky-400/35 bg-sky-500/10 flex items-center justify-center shrink-0 hover:bg-sky-500/20 transition-colors"
              >
                <Star className="h-6 w-6 text-sky-100 fill-sky-100/90" />
              </button>
              <div className="min-w-0">
                <div className="font-mono text-sm sm:text-base font-bold tracking-wider text-sky-50 tabular-nums leading-tight">
                  {clockText.dateStr}
                </div>
                <div className="font-mono text-[10px] tracking-widest text-sky-300/75 uppercase">
                  {clockText.monthLabel} · SALA STARK
                </div>
                <div className="mt-1 font-mono text-[10px] text-orange-300/90 tabular-nums">
                  CONTROLE GLOBAL · {String(totalRecordsCount).padStart(4, '0')}
                </div>
              </div>
            </div>

            {/* Real Current-Month Mini Calendar */}
            <button
              type="button"
              onClick={() => onOpenView('agenda')}
              title="Calendário ao vivo — clique para gerenciar Agenda & Rotinas"
              className="col-span-4 grid grid-cols-7 gap-0.5 rounded border border-sky-500/25 bg-slate-950/70 p-1.5 text-center hover:border-sky-400/60 transition-colors"
            >
              {calendarDays.map((d) => (
                <span
                  key={d.day}
                  className={`font-mono text-[9px] leading-tight rounded-xs tabular-nums ${
                    d.isToday
                      ? 'bg-sky-400 text-slate-950 font-bold'
                      : d.hasEvent
                      ? 'bg-orange-500/35 text-orange-200 font-semibold'
                      : 'text-sky-200/60'
                  }`}
                >
                  {d.day}
                </span>
              ))}
            </button>

            {/* Live Memory / Buffer Transactions Sparkline */}
            <div className="col-span-3 flex flex-col justify-between h-full rounded border border-sky-500/20 bg-slate-950/60 p-1.5">
              <div className="flex items-center justify-between font-mono text-[9px] text-sky-300/75">
                <span>HEAP</span>
                <span className="tabular-nums text-sky-100">{snap.heapUsedMb.toFixed(0)}MB</span>
              </div>
              <svg viewBox="0 0 100 28" className="w-full h-7 overflow-visible">
                <path
                  d={`${sparklinePath} L 100 28 L 0 28 Z`}
                  fill="rgba(56, 189, 248, 0.22)"
                />
                <path
                  d={sparklinePath}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.8"
                />
              </svg>
            </div>
          </div>

          {/* MONITOR 1 (Top Compact — Cyan Header: B3 · CEPEA · Mercado) */}
          <div className="stark-room-monitor rounded-md overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-2.5 py-1 bg-gradient-to-r from-sky-600/90 via-sky-500/80 to-sky-900/40 text-[10px] font-mono font-bold text-slate-950">
              <span className="truncate uppercase tracking-wider">
                LIVE DATA TRANSFER · {currentMarket.channel}
              </span>
              <span className="text-sky-100/95 shrink-0">{currentMarket.badge}</span>
            </div>
            <div className="relative p-2.5 stark-scanlines bg-gradient-to-br from-[#0c2742]/90 via-[#07182a]/95 to-[#040d18]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-sky-50 leading-snug line-clamp-2">
                    {currentMarket.title}
                  </div>
                  <p className="mt-1 text-[11px] text-sky-200/75 line-clamp-1">
                    {currentMarket.detail}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSpeakMonitorItem(currentMarket)}
                    title="Ouvir manchete com voz neural"
                    className="p-1.5 rounded border border-sky-400/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/30 transition-colors"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onAskAssistant(currentMarket.suggestedPrompt, currentMarket.preferredAssistant)
                    }
                    title="Consultar mercado ao vivo via J.A.R.V.I.S."
                    className="px-1.5 py-0.5 rounded border border-orange-400/50 bg-orange-500/20 text-[9px] font-mono text-orange-200 hover:bg-orange-500/35 transition-colors"
                  >
                    IA
                  </button>
                </div>
              </div>

              {/* Broadcast transport bar */}
              <div className="mt-2 pt-1.5 border-t border-sky-500/20 flex items-center justify-between gap-2 text-[10px] font-mono text-sky-300/80">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setMarketIdx((v) => (v - 1 + marketFeed.length) % marketFeed.length)
                    }
                    aria-label="Notícia anterior de mercado"
                    className="p-0.5 hover:text-white"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAutoRotate((v) => !v)}
                    aria-label={isAutoRotate ? 'Pausar rotação dos monitores' : 'Retomar rotação'}
                    className="p-0.5 text-orange-400 hover:text-orange-300"
                  >
                    {isAutoRotate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketIdx((v) => (v + 1) % marketFeed.length)}
                    aria-label="Próxima notícia de mercado"
                    className="p-0.5 hover:text-white"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <span className="ml-1 tabular-nums">
                    {(marketIdx % marketFeed.length) + 1}/{marketFeed.length}
                  </span>
                </div>
                {currentMarket.link && (
                  <a
                    href={currentMarket.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-100"
                  >
                    <span>Fonte</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* MONITOR 2 (Main Hero Broadcast Monitor — Stark Orange Header: G1 Rio & Brasil) */}
          <div className="stark-room-monitor rounded-md overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500/80 text-[11px] font-mono font-bold text-slate-950">
              <span className="truncate uppercase tracking-wider">
                LIVE DATA TRANSFER · {currentMain.channel}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] bg-slate-950/80 text-orange-300 px-1.5 py-0.5 rounded-xs">
                  {currentMain.badge}
                </span>
                <button
                  type="button"
                  onClick={onRefreshIntel}
                  disabled={isLoadingIntel}
                  title="Sincronizar notícias G1, Rio e Brasil agora"
                  className="p-0.5 rounded hover:bg-slate-950/20 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingIntel ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="relative p-2.5 sm:p-3 stark-scanlines bg-gradient-to-br from-[#0e2d3b]/95 via-[#081a28]/98 to-[#050f19] min-h-[124px] flex-1 flex flex-col justify-between">
              {/* Top broadcast metadata row */}
              <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-sky-300/80">
                <span>FONTE: {currentMain.source.toUpperCase()}</span>
                <span className="tabular-nums text-orange-300">
                  {liveIntel?.weather
                    ? `RJ ${liveIntel.weather.temperatureC}°C · UMID ${liveIntel.weather.humidityPercent}%`
                    : 'FEED ATIVO'}
                </span>
              </div>

              {/* Headline */}
              <div className="my-2">
                <h3 className="font-display text-sm sm:text-base font-bold text-white leading-snug line-clamp-3">
                  {currentMain.title}
                </h3>
                <p className="mt-1 text-xs text-sky-100/75 line-clamp-2">{currentMain.detail}</p>
              </div>

              {/* Classic Broadcast Lower-Third News Chyron (matches CNN/Reuters strip in image) */}
              <div className="rounded-xs overflow-hidden border border-sky-400/35 bg-sky-950/85">
                <div className="flex items-center justify-between gap-2 px-2 py-1 bg-sky-400/90 text-slate-950 font-mono text-[10px] font-bold">
                  <span className="truncate">
                    EM TEMPO REAL · {currentMain.badge} · RODACK NEWS FEED
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {(mainIdx % mainNewsFeed.length) + 1}/{mainNewsFeed.length}
                  </span>
                </div>
                <div className="px-2 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setMainIdx((v) => (v - 1 + mainNewsFeed.length) % mainNewsFeed.length)
                      }
                      aria-label="Manchete anterior"
                      className="p-0.5 text-sky-200 hover:text-white"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAutoRotate((v) => !v)}
                      aria-label="Alternar reprodução automática de notícias"
                      className="px-1.5 py-0.5 rounded-xs bg-red-600 text-white hover:bg-red-500 transition-colors"
                    >
                      {isAutoRotate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMainIdx((v) => (v + 1) % mainNewsFeed.length)}
                      aria-label="Próxima manchete"
                      className="p-0.5 text-sky-200 hover:text-white"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSpeakMonitorItem(currentMain)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border border-amber-400/50 bg-amber-500/20 text-amber-200 hover:bg-amber-500/35 transition-colors"
                    >
                      <Volume2 className="h-3 w-3" />
                      <span>Ouvir Boletim</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onAskAssistant(currentMain.suggestedPrompt, currentMain.preferredAssistant)
                      }
                      className="px-2 py-0.5 rounded-xs border border-sky-400/50 bg-sky-500/20 text-sky-100 hover:bg-sky-500/35 transition-colors"
                    >
                      Analisar
                    </button>
                    {currentMain.link && (
                      <a
                        href={currentMain.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-sky-300 hover:text-white"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* MONITOR 3 (Bottom Broadcast Monitor — GE Esportes & Mundo) */}
          <div className="stark-room-monitor rounded-md overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-2.5 py-1 bg-gradient-to-r from-orange-600/90 via-orange-500/80 to-orange-950/40 text-[10px] font-mono font-bold text-slate-950">
              <span className="truncate uppercase tracking-wider">
                LIVE DATA TRANSFER · {currentWorld.channel}
              </span>
              <span className="text-orange-100 shrink-0">{currentWorld.badge}</span>
            </div>
            <div className="p-2.5 stark-scanlines bg-gradient-to-br from-[#0b1f33]/95 via-[#071422]/98 to-[#040b14]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-sky-50 leading-snug line-clamp-2">
                    {currentWorld.title}
                  </div>
                  <p className="mt-1 text-[11px] text-sky-200/70 line-clamp-1">
                    {currentWorld.detail}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSpeakMonitorItem(currentWorld)}
                    title="Ouvir boletim esportivo/internacional"
                    className="p-1.5 rounded border border-orange-400/40 bg-orange-500/15 text-orange-200 hover:bg-orange-500/30 transition-colors"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onAskAssistant(currentWorld.suggestedPrompt, currentWorld.preferredAssistant)
                    }
                    title="Pedir análise aos assistentes"
                    className="px-1.5 py-0.5 rounded border border-rose-400/50 bg-rose-500/20 text-[9px] font-mono text-rose-200 hover:bg-rose-500/35 transition-colors"
                  >
                    IA
                  </button>
                </div>
              </div>
              <div className="mt-2 pt-1.5 border-t border-sky-500/20 flex items-center justify-between gap-2 text-[10px] font-mono text-sky-300/80">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setWorldIdx(
                        (v) => (v - 1 + sportsWorldFeed.length) % sportsWorldFeed.length
                      )
                    }
                    aria-label="Manchete esportiva anterior"
                    className="p-0.5 hover:text-white"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorldIdx((v) => (v + 1) % sportsWorldFeed.length)}
                    aria-label="Próxima manchete esportiva"
                    className="p-0.5 hover:text-white"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <span className="ml-1 tabular-nums">
                    {(worldIdx % sportsWorldFeed.length) + 1}/{sportsWorldFeed.length}
                  </span>
                </div>
                {currentWorld.link && (
                  <a
                    href={currentWorld.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-100"
                  >
                    <span>Abrir</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* BOTTOM-LEFT SUB-ROW: Red Polar Radar + 22 / 23 / 24 Angled Data Tabs + POI Telemetry */}
          <div className="grid grid-cols-12 gap-2.5 items-stretch pt-1">
            {/* Crimson Circular Tactical Radar */}
            <button
              type="button"
              onClick={() => onOpenView('radar')}
              title="Radar RJ — Clima, Alertas e Notícias ao Vivo"
              className="col-span-4 rounded-lg border border-rose-500/35 bg-slate-950/80 p-2 flex flex-col items-center justify-between hover:border-rose-400/70 transition-colors"
            >
              <div className="w-full flex items-center justify-between font-mono text-[9px] text-rose-300">
                <span>RADAR RJ</span>
                <span className="tabular-nums">{openAlerts.length} AL</span>
              </div>
              <div className="relative my-1 h-20 w-20 rounded-full border border-rose-500/60 bg-rose-950/50 overflow-hidden flex items-center justify-center">
                {/* Concentric rings & crosshairs */}
                <div className="absolute inset-2 rounded-full border border-rose-500/35" />
                <div className="absolute inset-5 rounded-full border border-rose-500/35" />
                <div className="absolute inset-x-0 top-1/2 h-px bg-rose-500/35" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-rose-500/35" />
                {/* Rotating radar beam */}
                <div
                  className="absolute inset-0 stark-radar-sweep"
                  style={{
                    background:
                      'conic-gradient(from 0deg, rgba(244,63,94,0.55) 0deg, rgba(244,63,94,0.12) 48deg, transparent 70deg)',
                  }}
                />
                {/* Live blips for Rio / alerts / tasks */}
                <span className="absolute top-4 left-5 h-1.5 w-1.5 rounded-full bg-rose-300 shadow-[0_0_6px_#fb7185]" />
                {openAlerts.length > 0 && (
                  <span className="absolute bottom-4 right-5 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
                )}
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
              </div>
              <div className="font-mono text-[9px] text-sky-200/80 tabular-nums">
                {liveIntel?.weather ? `${liveIntel.weather.windSpeedKmh} km/h` : 'VARREDURA'}
              </div>
            </button>

            {/* Slanted 22 / 23 / 24 Data Mode Selector + Live Telemetry Table */}
            <div className="col-span-8 flex flex-col justify-between gap-2">
              <div className="grid grid-cols-1 gap-1">
                {(
                  [
                    {
                      id: 'local' as const,
                      num: '22.',
                      label: 'LOCAL DATA',
                      meta: `${workspace?.memories?.length ?? 0} mem · ${pendingTasks.length} tar`,
                    },
                    {
                      id: 'online' as const,
                      num: '23.',
                      label: 'ONLINE DATA',
                      meta: 'G1 · GE · B3 · CEPEA',
                    },
                    {
                      id: 'cloud' as const,
                      num: '24.',
                      label: 'CLOUD DATA',
                      meta: `${workspace?.dailyIntelFeed?.length ?? 0} feeds · sync`,
                    },
                  ] as const
                ).map((tab) => {
                  const active = activeChannel === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleSelectChannel(tab.id)}
                      className={`flex items-center justify-between px-2.5 py-1 rounded-xs border font-mono text-[10px] transition-all ${
                        active
                          ? 'bg-gradient-to-r from-sky-500/90 to-cyan-400/75 border-sky-300 text-slate-950 font-bold shadow-[0_0_16px_rgba(56,189,248,0.45)]'
                          : 'bg-slate-950/75 border-sky-500/25 text-sky-200/80 hover:border-sky-400/55 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="font-bold">{tab.num}</span>
                        <span>{tab.label}</span>
                      </span>
                      <span className="text-[9px] opacity-85 tabular-nums">{tab.meta}</span>
                    </button>
                  );
                })}
              </div>

              {/* Compact POI Telemetry Readout */}
              <div className="rounded border border-sky-500/20 bg-slate-950/75 px-2.5 py-1.5 font-mono text-[10px] space-y-0.5">
                <div className="flex items-center justify-between text-sky-300/80">
                  <span>Hologram / Dialogue</span>
                  <span className="tabular-nums text-sky-100">
                    {snap.hologram.avgDurationMs.toFixed(1)}ms /{' '}
                    {snap.dialogue.avgDurationMs.toFixed(1)}ms
                  </span>
                </div>
                <div className="flex items-center justify-between text-sky-300/80">
                  <span>Ring Buffer Voz</span>
                  <span className="tabular-nums text-orange-300">
                    {ringBufferStats.occupiedSlots}/{ringBufferStats.capacitySlots} slots · +
                    {ringBufferStats.prefetchAhead} pref
                  </span>
                </div>
                {openAlerts.length > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-300 pt-0.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {openAlerts.length} alerta(s) ativo(s): {openAlerts[0].title}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CENTER-RIGHT COLUMN: Dominant Holographic Orbital Earth Monitor + Docked Speaking Hologram Window */}
        <div className="relative overflow-hidden lg:col-span-5 xl:col-span-1 rounded-lg border border-sky-500/25 bg-slate-950/55 p-3 flex flex-col justify-between min-w-0">
          <StarkRoomGlobeCanvas
            audioTelemetryRef={audioTelemetryRef}
            activeSpeaker={speakingSpeaker}
            isSpeaking={isSpeaking}
            isProcessing={isProcessing}
            weather={liveIntel?.weather}
            totalSignals={totalRecordsCount}
            ringRttMs={ringBufferStats.ewmaRttMs}
            onSelectAssistant={onOpenHologram}
            onInspectNode={(nodeId) => {
              if (nodeId === 'b3' || nodeId === 'cepea') {
                setMarketIdx((v) => (v + 1) % marketFeed.length);
              } else if (nodeId === 'rio') {
                setMainIdx((v) => (v + 1) % mainNewsFeed.length);
              } else {
                setWorldIdx((v) => (v + 1) % sportsWorldFeed.length);
              }
            }}
          />
          {/* Portal target where SpeakingHologramOverlay renders when resized/docked in Sala Stark theme */}
          <div
            id="stark-room-hologram-dock"
            className="pointer-events-none absolute inset-0 z-20"
          />
        </div>

        {/* FAR-RIGHT COLUMN: 021 Index + Vertical Telemetry Ruler + Live Clock + 3 Action Bars */}
        <div className="lg:col-span-2 xl:col-span-1 flex flex-col justify-between gap-2.5 min-w-0">
          {/* Top-Right Big Index Counter ("021." style) */}
          <div className="rounded-lg border border-sky-500/25 bg-slate-950/75 p-2.5 text-right">
            <div className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-sky-100 tabular-nums leading-none">
              {String(Math.min(999, totalRecordsCount)).padStart(3, '0')}.
            </div>
            <div className="mt-1 inline-block rounded-xs bg-orange-500/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-950 tracking-wider">
              SINAIS ATIVOS
            </div>
          </div>

          {/* Vertical Calibrated Telemetry Ruler */}
          <div className="flex-1 rounded-lg border border-sky-500/20 bg-slate-950/65 p-2.5 flex flex-col justify-between gap-2.5 min-h-[160px]">
            <div className="font-mono text-[9px] text-sky-300/75 uppercase tracking-wider flex items-center justify-between">
              <span>ESCALA TÁTICA</span>
              <Radio className="h-3 w-3 text-orange-400" />
            </div>

            {(
              [
                {
                  label: 'RING BUFFER',
                  val: `${ringBufferStats.occupiedSlots}/${ringBufferStats.capacitySlots}`,
                  pct: Math.max(12, ringFillPct),
                  barCls: 'bg-cyan-400',
                },
                {
                  label: 'HEAP MEM',
                  val: `${snap.heapUsedMb.toFixed(0)}MB`,
                  pct: Math.min(100, Math.max(14, Math.round(snap.heapUsagePct || 28))),
                  barCls: 'bg-emerald-400',
                },
                {
                  label: 'CLIMA RJ',
                  val: liveIntel?.weather ? `${liveIntel.weather.temperatureC}°C` : '--',
                  pct: tempPct,
                  barCls: 'bg-orange-400',
                },
                {
                  label: 'RTT REDE',
                  val: `${ringBufferStats.ewmaRttMs}ms`,
                  pct: Math.min(100, Math.max(12, Math.round((ringBufferStats.ewmaRttMs / 1200) * 100))),
                  barCls: 'bg-rose-400',
                },
              ] as const
            ).map((metric) => (
              <div key={metric.label} className="space-y-1">
                <div className="flex items-center justify-between font-mono text-[9px]">
                  <span className="text-sky-200/75">{metric.label}</span>
                  <span className="text-sky-50 tabular-nums font-semibold">{metric.val}</span>
                </div>
                <div className="h-1.5 w-full rounded-xs bg-slate-800/90 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${metric.barCls}`}
                    style={{ width: `${metric.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom-Right High-Precision Clock + 3 Iconic Stark Action Bars */}
          <div className="space-y-2">
            <div className="rounded-lg border border-sky-500/25 bg-slate-950/80 px-2.5 py-2 text-right font-mono">
              <div className="flex items-baseline justify-end gap-0.5 tabular-nums">
                <span className="text-xl font-bold text-white tracking-tight">
                  {clockText.hhmmss}
                </span>
                <span className="text-[10px] text-orange-300 font-semibold">{clockText.cs}</span>
              </div>
              <div className="text-[9px] text-sky-300/70 tracking-widest uppercase">
                TIME · RIO DE JANEIRO
              </div>
            </div>

            {/* 3 Iconic Action Bars: COMMUNICATION / VOICE & CAM SETTINGS / SOFTWARE DETAILS */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  onFocusConsole();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xs bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-500 hover:to-rose-500 text-white font-mono text-[10px] font-bold tracking-wider transition-colors whitespace-nowrap truncate"
              >
                + COMUNICAÇÃO IA
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('toggle');
                  onToggleStandby();
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-xs border font-mono text-[10px] font-semibold tracking-wider transition-colors flex items-center justify-between gap-1 ${
                  isStandbyActive
                    ? 'bg-sky-500/25 border-sky-300 text-sky-100'
                    : 'bg-slate-950/85 border-sky-500/35 text-sky-200 hover:border-sky-300 hover:text-white'
                }`}
              >
                <span className="truncate">+ VOZ &amp; ESCUTA</span>
                <Mic className="h-3 w-3 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  onOpenView('auditoria');
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xs border border-sky-500/35 bg-slate-950/85 hover:border-orange-400/70 text-sky-200 hover:text-orange-200 font-mono text-[10px] font-semibold tracking-wider transition-colors whitespace-nowrap truncate"
              >
                + DETALHES SISTEMA
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
