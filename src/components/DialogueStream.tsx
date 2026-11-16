import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  ExternalLink,
  HeartHandshake,
  MessageSquare,
  RotateCcw,
  Scale,
  Search,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  X,
} from 'lucide-react';
import type {
  AssistantId,
  AssistantTurn,
  ConversationEntry,
  TurnFeedback,
} from '../types/assistant';

import jarvisAvatarUrl from '../assets/images/jarvis_avatar_1794791050216.jpg';
import fridayAvatarUrl from '../assets/images/friday_avatar_1794791051362.jpg';
import ultronAvatarUrl from '../assets/images/ultron_avatar_1794797018006.jpg';

interface DialogueStreamProps {
  conversations: ConversationEntry[];
  isProcessing: boolean;
  isSpeaking: boolean;
  onPlayAudio: (turns: AssistantTurn[]) => void;
  onStopAudio: () => void;
  onQuickPrompt: (prompt: string) => void;
  onRateTurn?: (
    entryId: string,
    speaker: AssistantId,
    feedback: TurnFeedback | null
  ) => void;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function highlightKeywords(text: string, tokens: string[]) {
  if (!text || tokens.length === 0) return text;

  const chars = Array.from(text);
  let normalized = '';
  const normToOrigStart: number[] = [];
  const normToOrigEnd: number[] = [];

  let origOffset = 0;
  for (const ch of chars) {
    const clean = normalizeForSearch(ch);
    const chLen = ch.length;
    for (let i = 0; i < clean.length; i++) {
      normalized += clean[i];
      normToOrigStart.push(origOffset);
      normToOrigEnd.push(origOffset + chLen);
    }
    origOffset += chLen;
  }

  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    if (!token) continue;
    let searchFrom = 0;
    while (searchFrom < normalized.length) {
      const idx = normalized.indexOf(token, searchFrom);
      if (idx === -1) break;
      const start = normToOrigStart[idx];
      const end = normToOrigEnd[idx + token.length - 1];
      if (start !== undefined && end !== undefined) {
        ranges.push([start, end]);
      }
      searchFrom = idx + token.length;
    }
  }

  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && r[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], r[1]);
    } else {
      merged.push([r[0], r[1]]);
    }
  }

  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start), match: false });
    }
    parts.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }

  return parts.map((part, idx) =>
    part.match ? (
      <mark
        key={idx}
        className="rounded bg-amber-400/25 px-0.5 text-amber-200 ring-1 ring-amber-400/35"
      >
        {part.text}
      </mark>
    ) : (
      <Fragment key={idx}>{part.text}</Fragment>
    )
  );
}

const QUICK_PROMPTS = [
  'Ultron, faça um diagnóstico implacável de riscos e previsões de falha no meu projeto atual.',
  'Todos vocês: debatam os limites humanos versus eficiência de IA na arquitetura deste sistema.',
  'Sexta-feira, como você avalia meu ritmo de tarefas hoje? Algum risco de sobrecarga?',
  'Jarvis, busque as principais boas práticas atuais de segurança em APIs Node e Express.',
];

type SpeakerFilter = 'todos' | AssistantId;

export function DialogueStream({
  conversations,
  isProcessing,
  isSpeaking,
  onPlayAudio,
  onStopAudio,
  onQuickPrompt,
  onRateTurn,
}: DialogueStreamProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState<SpeakerFilter>('todos');

  const searchTokens = useMemo(
    () =>
      normalizeForSearch(searchQuery.trim())
        .split(/\s+/)
        .filter((t) => t.length > 0),
    [searchQuery]
  );

  const hasActiveFilter = searchTokens.length > 0 || speakerFilter !== 'todos';

  const filteredConversations = useMemo(() => {
    if (!hasActiveFilter) return conversations;

    return conversations.filter((entry) => {
      if (
        speakerFilter !== 'todos' &&
        !entry.responses.some((r) => r.speaker === speakerFilter)
      ) {
        return false;
      }

      if (searchTokens.length === 0) return true;

      const haystack = normalizeForSearch(
        [
          entry.userMessage,
          entry.detectedEmotion.label,
          entry.detectedEmotion.empathyNote,
          ...entry.responses.map((r) => `${r.speaker} ${r.stance} ${r.text}`),
          entry.debateSummary?.agreementPoint ?? '',
          entry.debateSummary?.divergencePoint ?? '',
          entry.debateSummary?.finalRecommendation ?? '',
          ...(entry.sources?.map((s) => s.title) ?? []),
        ].join(' ')
      );

      return searchTokens.every((token) => haystack.includes(token));
    });
  }, [conversations, hasActiveFilter, speakerFilter, searchTokens]);

  useEffect(() => {
    if (!hasActiveFilter) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversations.length, isProcessing, hasActiveFilter]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Persistent Conversation History Search Bar */}
      {conversations.length > 0 && (
        <div className="border-b border-slate-800/80 bg-slate-950/45 px-4 py-2.5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && searchQuery) {
                    setSearchQuery('');
                  }
                }}
                aria-label="Pesquisar no histórico de conversas"
                placeholder="Buscar palavras-chave no histórico (ex: segurança, previsão, SQL)..."
                className="w-full rounded-lg border border-slate-800 bg-slate-900/90 pl-8 pr-8 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400/80"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-100 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div
              role="group"
              aria-label="Filtrar diálogos por assistente"
              className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800"
            >
              {(
                [
                  { id: 'todos', label: 'Todos' },
                  { id: 'jarvis', label: 'J.A.R.V.I.S.' },
                  { id: 'sexta-feira', label: 'SEXTA-FEIRA' },
                  { id: 'ultron', label: 'ULTRON' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSpeakerFilter(opt.id)}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    speakerFilter === opt.id
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {hasActiveFilter && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="tabular-nums">
                {filteredConversations.length} de {conversations.length} diálogo(s) encontrado(s)
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSpeakerFilter('todos');
                }}
                className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {conversations.length === 0 && !isProcessing ? (
          <div className="flex flex-col items-center justify-center py-12 text-center max-w-xl mx-auto">
            <MessageSquare className="h-9 w-9 text-slate-500 mb-3" />
            <h3 className="font-display text-lg font-semibold text-slate-100">
              Canal Direto com J.A.R.V.I.S., SEXTA-FEIRA &amp; ULTRON
            </h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Diga &ldquo;Jarvis&rdquo;, &ldquo;Sexta-feira&rdquo;, &ldquo;Ultron&rdquo; ou &ldquo;Todos&rdquo; com a escuta contínua ligada, ou escolha um comando abaixo para iniciar.
            </p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
            <Search className="h-8 w-8 text-slate-500 mb-3" />
            <h3 className="font-display text-base font-semibold text-slate-100">
              Nenhum diálogo correspondente encontrado
            </h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              Não encontramos ocorrências para{' '}
              {searchQuery ? `"${searchQuery}"` : 'este filtro'} no histórico atual de conversas.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSpeakerFilter('todos');
              }}
              className="mt-4 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Limpar busca
            </button>
          </div>
        ) : (
          filteredConversations.map((entry) => (
            <motion.article
              key={entry.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4 pb-6 border-b border-slate-800/70 last:border-b-0"
            >
            {/* Patrick Pessoa's Prompt Header */}
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-200">Patrick Pessoa</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {entry.triggerType === 'voz'
                      ? 'Comando de voz'
                      : entry.triggerType === 'auditoria'
                      ? 'Auditoria técnica'
                      : 'Comando escrito'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums font-mono">{formatTime(entry.timestamp)}</span>
                </div>

                <div className="flex items-center gap-1.5 text-slate-300">
                  <HeartHandshake className="h-3.5 w-3.5 text-amber-300/90 shrink-0" />
                  <span>Estado percebido: {entry.detectedEmotion.label}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-400">intensidade {entry.detectedEmotion.intensity}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 leading-relaxed">
                {highlightKeywords(entry.userMessage, searchTokens)}
              </div>

              <p className="text-xs text-slate-400 pl-1">
                Leitura emocional: {entry.detectedEmotion.empathyNote}
              </p>
            </div>

            {/* Assistant Responses */}
            <div className="space-y-3">
              {entry.responses.map((turn, idx) => {
                const isJarvis = turn.speaker === 'jarvis';
                const isUltron = turn.speaker === 'ultron';
                const avatarSrc = isJarvis
                  ? jarvisAvatarUrl
                  : isUltron
                  ? ultronAvatarUrl
                  : fridayAvatarUrl;
                const speakerName = isJarvis
                  ? 'J.A.R.V.I.S.'
                  : isUltron
                  ? 'ULTRON'
                  : 'SEXTA-FEIRA';

                return (
                  <div
                    key={`${entry.id}-${turn.speaker}-${idx}`}
                    className={`rounded-xl border p-4 transition-colors ${
                      isJarvis
                        ? 'border-amber-500/25 bg-amber-950/15'
                        : isUltron
                        ? 'border-red-500/35 bg-red-950/20'
                        : 'border-sky-500/25 bg-sky-950/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2.5 text-xs min-w-0">
                        <img
                          src={avatarSrc}
                          alt={speakerName}
                          referrerPolicy="no-referrer"
                          className={`h-7 w-7 rounded-full object-cover border shrink-0 ${
                            isJarvis
                              ? 'border-amber-400/60'
                              : isUltron
                              ? 'border-red-500/70'
                              : 'border-sky-400/60'
                          }`}
                        />
                        <span
                          className={`font-display text-sm font-semibold whitespace-nowrap ${
                            isJarvis
                              ? 'text-amber-300'
                              : isUltron
                              ? 'text-red-400'
                              : 'text-sky-300'
                          }`}
                        >
                          {speakerName}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="text-slate-300 truncate">
                          {highlightKeywords(turn.stance, searchTokens)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {onRateTurn && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                onRateTurn(
                                  entry.id,
                                  turn.speaker,
                                  turn.feedback === 'acerto' ? null : 'acerto'
                                )
                              }
                              aria-pressed={turn.feedback === 'acerto'}
                              title="Marcar resposta como acerto"
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                                turn.feedback === 'acerto'
                                  ? 'border-emerald-500/60 bg-emerald-950/50 text-emerald-300'
                                  : 'border-slate-700/80 bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              {turn.feedback === 'acerto' ? (
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
                                  entry.id,
                                  turn.speaker,
                                  turn.feedback === 'revisar' ? null : 'revisar'
                                )
                              }
                              aria-pressed={turn.feedback === 'revisar'}
                              title="Marcar resposta para revisão"
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                                turn.feedback === 'revisar'
                                  ? 'border-amber-500/60 bg-amber-950/50 text-amber-300'
                                  : 'border-slate-700/80 bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              {turn.feedback === 'revisar' ? (
                                <RotateCcw className="h-3 w-3" />
                              ) : (
                                <ThumbsDown className="h-3 w-3" />
                              )}
                              <span>Revisar</span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => (isSpeaking ? onStopAudio() : onPlayAudio([turn]))}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/70 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                        >
                          {isSpeaking ? (
                            <>
                              <Square className="h-3 w-3" />
                              <span>Parar</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="h-3.5 w-3.5" />
                              <span>Ouvir Voz</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">
                      {highlightKeywords(turn.text, searchTokens)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Debate / Divided Opinions Synthesis */}
            {entry.debateSummary && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                    <Scale className="h-4 w-4 text-amber-300 shrink-0" />
                    <span>
                      {entry.resolvedMode === 'todos'
                        ? 'Síntese do Conselho (3 IAs)'
                        : 'Síntese do Conselho Duplo'}
                    </span>
                  </div>
                  {entry.responses.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        isSpeaking ? onStopAudio() : onPlayAudio(entry.responses)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      <span>Ouvir Diálogo Completo</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs leading-relaxed">
                  <div className="space-y-1">
                    <div className="font-medium text-slate-400">Ponto em Comum</div>
                    <p className="text-slate-200">
                      {highlightKeywords(entry.debateSummary.agreementPoint, searchTokens)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium text-slate-400">Opiniões Divididas</div>
                    <p className="text-slate-200">
                      {highlightKeywords(entry.debateSummary.divergencePoint, searchTokens)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium text-slate-400">Recomendação Final</div>
                    <p className="text-slate-100 font-medium">
                      {highlightKeywords(entry.debateSummary.finalRecommendation, searchTokens)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Learning / Persistence Summary + Web Grounding Sources */}
            {((entry.createdMemoriesCount ?? 0) > 0 ||
              (entry.createdTasksCount ?? 0) > 0 ||
              (entry.createdAlertsCount ?? 0) > 0 ||
              (entry.sources && entry.sources.length > 0)) && (
              <div className="flex flex-col gap-2 text-xs text-slate-400">
                {((entry.createdMemoriesCount ?? 0) > 0 ||
                  (entry.createdTasksCount ?? 0) > 0 ||
                  (entry.createdAlertsCount ?? 0) > 0) && (
                  <div className="flex flex-wrap items-center gap-2 text-slate-300">
                    <span>Atualização automática:</span>
                    {(entry.createdMemoriesCount ?? 0) > 0 && (
                      <span className="tabular-nums">
                        +{entry.createdMemoriesCount} memória(s) aprendida(s)
                      </span>
                    )}
                    {(entry.createdTasksCount ?? 0) > 0 && (
                      <span className="tabular-nums">
                        · +{entry.createdTasksCount} tarefa(s)
                      </span>
                    )}
                    {(entry.createdAlertsCount ?? 0) > 0 && (
                      <span className="tabular-nums text-amber-300">
                        · +{entry.createdAlertsCount} alerta(s) registrado(s)
                      </span>
                    )}
                  </div>
                )}

                {entry.sources && entry.sources.length > 0 && (
                  <div className="space-y-1">
                    {entry.searchEnginesUsed && entry.searchEnginesUsed.length > 0 && (
                      <div className="text-slate-400">
                        Fontes externas consultadas ({entry.searchEnginesUsed.join(' · ')}):
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {entry.sources.slice(0, 6).map((src) => (
                        <a
                          key={src.uri}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 underline underline-offset-2"
                        >
                          <span className="truncate max-w-[260px]">
                            {src.sourceType ? `${src.sourceType}: ` : ''}
                            {src.title}
                          </span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.article>
        ))
      )}

      {isProcessing && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 animate-pulse">
          <div className="h-3 w-40 rounded bg-slate-800" />
          <div className="h-3 w-full rounded bg-slate-800" />
          <div className="h-3 w-4/5 rounded bg-slate-800" />
        </div>
      )}

        {/* Quick suggestions when few interactions exist */}
        {conversations.length <= 2 && !isProcessing && !hasActiveFilter && (
          <div className="pt-2">
            <p className="text-xs font-medium text-slate-400 mb-2.5">
              Sugestões rápidas para testar colaboração, pesquisa e memória:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onQuickPrompt(prompt)}
                  className="text-left rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800/80 hover:border-slate-700 px-3.5 py-2.5 text-xs text-slate-300 leading-relaxed transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
