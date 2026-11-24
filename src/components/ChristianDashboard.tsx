import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Search,
  Volume2,
  X,
} from 'lucide-react';
import {
  BIBLIA_MENSAGEM_DAILY_VERSES,
  getTodayVerseIndex,
  type DailyBibleVerse,
} from '../data/bibliaMensagemVerses';
import type { AssistantTurn } from '../types/assistant';
import { safeFetchJson } from '../utils/apiClient';

interface ChristianHeadlineItem {
  id: string;
  title: string;
  uri: string;
  snippet: string;
  publishedAt?: string;
  sourceType: string;
  sourceDomain?: 'escolabiblicadominical.org' | 'bibliaon.com';
}

interface ChristianDashboardFeedResponse {
  updatedAt: string;
  queryDate: string;
  sourceName: string;
  sourceUrl: string;
  liveFetched: boolean;
  headlines: ChristianHeadlineItem[];
}

interface ChristianDashboardProps {
  isStarkRoomTheme?: boolean;
  isProcessing?: boolean;
  onAskJarvis: (prompt: string) => void;
  onSpeakVerse: (turn: AssistantTurn) => void;
  onHideSection: () => void;
}

type SourceFilter = 'all' | 'bibliaon.com' | 'escolabiblicadominical.org';

function resolveItemDomain(
  item: ChristianHeadlineItem
): 'bibliaon.com' | 'escolabiblicadominical.org' {
  if (item.sourceDomain) return item.sourceDomain;
  return item.uri.toLowerCase().includes('bibliaon.com')
    ? 'bibliaon.com'
    : 'escolabiblicadominical.org';
}

function formatHeadlineDate(raw?: string): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw.length <= 40 ? raw : null;
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function formatTodayPtBr(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date());
}

export function ChristianDashboard({
  isStarkRoomTheme = false,
  isProcessing = false,
  onAskJarvis,
  onSpeakVerse,
  onHideSection,
}: ChristianDashboardProps) {
  const todayIndex = useMemo(() => getTodayVerseIndex(), []);
  const [verseIndex, setVerseIndex] = useState<number>(todayIndex);
  const [feed, setFeed] = useState<ChristianDashboardFeedResponse | null>(null);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  const activeVerse: DailyBibleVerse =
    BIBLIA_MENSAGEM_DAILY_VERSES[verseIndex] ?? BIBLIA_MENSAGEM_DAILY_VERSES[0];
  const isTodaySelected = verseIndex === todayIndex;

  const loadChristianHeadlines = useCallback(async (forceRefresh = false) => {
    setIsLoadingFeed(true);
    setFeedError(null);
    const url = forceRefresh
      ? '/api/intel/christian-dashboard?refresh=1'
      : '/api/intel/christian-dashboard';
    const result = await safeFetchJson<ChristianDashboardFeedResponse>(url);
    if (result.ok && result.data) {
      setFeed(result.data);
    } else {
      setFeedError(
        result.errorMessage ||
          'Não foi possível sincronizar os estudos de bibliaon.com e escolabiblicadominical.org.'
      );
    }
    setIsLoadingFeed(false);
  }, []);

  useEffect(() => {
    void loadChristianHeadlines(false);
  }, [loadChristianHeadlines]);

  const filteredHeadlines = useMemo(() => {
    const items = feed?.headlines ?? [];
    const term = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      const domain = resolveItemDomain(item);
      if (sourceFilter !== 'all' && domain !== sourceFilter) return false;
      if (!term) return true;
      return (
        item.title.toLowerCase().includes(term) ||
        item.snippet.toLowerCase().includes(term) ||
        domain.includes(term)
      );
    });
  }, [feed?.headlines, searchTerm, sourceFilter]);

  const handlePrevVerse = () => {
    setVerseIndex(
      (prev) =>
        (prev - 1 + BIBLIA_MENSAGEM_DAILY_VERSES.length) % BIBLIA_MENSAGEM_DAILY_VERSES.length
    );
  };

  const handleNextVerse = () => {
    setVerseIndex((prev) => (prev + 1) % BIBLIA_MENSAGEM_DAILY_VERSES.length);
  };

  const handleListenVerse = () => {
    const spoken = `Senhor Patrick, compartilho com você a palavra selecionada da Bíblia A Mensagem em ${activeVerse.reference}: ${activeVerse.text} ${activeVerse.jarvisReflection}`;
    onSpeakVerse({
      speaker: 'jarvis',
      stance: `Devocional Diário · ${activeVerse.reference}`,
      text: spoken,
      ttsScript: spoken,
    });
  };

  const todayFormatted = useMemo(() => formatTodayPtBr(), []);

  return (
    <section
      aria-label="Dashboard Cristão"
      className={`mt-4 rounded-xl p-5 sm:p-6 shadow-xs transition-colors ${
        isStarkRoomTheme
          ? 'stark-room-panel'
          : 'border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/75'
      }`}
    >
      {/* Top Section Header — Clean typography, zero-pill metadata, functional controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Dashboard Cristão
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Bíblia A Mensagem</span>
            <span aria-hidden="true">·</span>
            <span>bibliaon.com</span>
            <span aria-hidden="true">·</span>
            <span>escolabiblicadominical.org</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{todayFormatted}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadChristianHeadlines(true)}
            disabled={isLoadingFeed}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/70 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingFeed ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={onHideSection}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors whitespace-nowrap shrink-0"
            title="Ocultar seção opcional Dashboard Cristão"
          >
            <X className="h-3.5 w-3.5" />
            <span>Ocultar</span>
          </button>
        </div>
      </div>

      {/* Balanced 2-Column Content Split — Whitespace & hairline divider, no nested card boxes */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        {/* Column 1: Versículo Diário — Bíblia A Mensagem */}
        <div className="lg:col-span-6 flex flex-col justify-between lg:pr-6 lg:border-r lg:border-slate-200/80 dark:lg:border-slate-800/80">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  {isTodaySelected ? 'Versículo de Hoje' : 'Seleção Devocional'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeVerse.theme}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {String(verseIndex + 1).padStart(2, '0')}/
                  {String(BIBLIA_MENSAGEM_DAILY_VERSES.length).padStart(2, '0')}
                </span>
              </div>

              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevVerse}
                  aria-label="Versículo anterior"
                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {!isTodaySelected && (
                  <button
                    type="button"
                    onClick={() => setVerseIndex(todayIndex)}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                  >
                    Hoje
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNextVerse}
                  aria-label="Próximo versículo"
                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <blockquote className="space-y-3">
              <p className="text-base sm:text-lg leading-relaxed text-slate-900 dark:text-slate-100 font-medium text-balance">
                &ldquo;{activeVerse.text}&rdquo;
              </p>
              <footer className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">
                <cite className="not-italic font-semibold text-amber-700 dark:text-amber-300">
                  {activeVerse.reference}
                </cite>
                <span aria-hidden="true">·</span>
                <span>Bíblia de Estudos A Mensagem</span>
              </footer>
            </blockquote>

            <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Reflexão de J.A.R.V.I.S.
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {activeVerse.jarvisReflection}
              </p>
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleListenVerse}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors whitespace-nowrap shrink-0"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>Ouvir com J.A.R.V.I.S.</span>
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => onAskJarvis(activeVerse.studyPrompt)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Aprofundar no Console</span>
            </button>
          </div>
        </div>

        {/* Column 2: Manchetes Espirituais & Devocionais — bibliaon.com & escolabiblicadominical.org */}
        <div className="lg:col-span-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Estudos &amp; Devocionais
                </span>
                <span aria-hidden="true">·</span>
                <a
                  href="https://www.bibliaon.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 hover:underline underline-offset-2"
                >
                  <span>bibliaon.com</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <span aria-hidden="true">/</span>
                <a
                  href="https://escolabiblicadominical.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 hover:underline underline-offset-2"
                >
                  <span>escolabiblicadominical.org</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {feed?.updatedAt && (
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {new Intl.DateTimeFormat('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(feed.updatedAt))}
                </span>
              )}
            </div>

            {/* Interactive Source Filter + Client-side Search */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Filtrar fonte bíblica"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800 shrink-0"
              >
                {(
                  [
                    { id: 'all', label: 'Todas' },
                    { id: 'bibliaon.com', label: 'bibliaon.com' },
                    { id: 'escolabiblicadominical.org', label: 'EBD' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSourceFilter(opt.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      sourceFilter === opt.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[180px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar versículos, devocionais e estudos..."
                  aria-label="Filtrar estudos espirituais"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
                />
              </div>
            </div>

            {/* Loading State */}
            {isLoadingFeed ? (
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="py-3 space-y-2 animate-pulse">
                    <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
                  </div>
                ))}
              </div>
            ) : feedError ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">{feedError}</p>
                <button
                  type="button"
                  onClick={() => void loadChristianHeadlines(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Tentar novamente</span>
                </button>
              </div>
            ) : filteredHeadlines.length === 0 ? (
              <div className="py-6 text-center space-y-2.5">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Nenhum estudo encontrado para o filtro atual.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSourceFilter('all');
                  }}
                  className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline underline-offset-2"
                >
                  Limpar filtros
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80 max-h-[300px] overflow-y-auto pr-1">
                {filteredHeadlines.slice(0, 8).map((item) => {
                  const formattedDate = formatHeadlineDate(item.publishedAt);
                  const domain = resolveItemDomain(item);
                  return (
                    <article key={item.id} className="py-3 first:pt-1 last:pb-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <a
                          href={item.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-amber-700 dark:hover:text-amber-300 leading-snug transition-colors line-clamp-2"
                        >
                          {item.title}
                        </a>
                        <a
                          href={item.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir ${item.title}`}
                          className="text-slate-400 hover:text-amber-600 dark:hover:text-amber-300 shrink-0 mt-0.5"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>

                      {item.snippet && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {item.snippet}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <span>{domain}</span>
                          {formattedDate && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{formattedDate}</span>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() =>
                            onAskJarvis(
                              `Jarvis, resuma e aplique de forma cristocêntrica e sábia o conteúdo "${item.title}" de ${domain} (${item.uri}), conectando com a Bíblia A Mensagem.`
                            )
                          }
                          className="font-medium text-amber-700 dark:text-amber-300 hover:underline underline-offset-2 whitespace-nowrap disabled:opacity-50"
                        >
                          Estudar com J.A.R.V.I.S.
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
