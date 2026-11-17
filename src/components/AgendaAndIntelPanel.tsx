import { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  CloudRain,
  ExternalLink,
  Globe,
  MessageSquarePlus,
  Newspaper,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Sun,
  Trash2,
  UserCheck,
  Volume2,
  Wind,
} from 'lucide-react';
import type {
  AgendaCategory,
  AgendaEventItem,
  AssistantId,
  CreatorDossier,
  InteractionMode,
  LiveIntelBriefing,
  RoutineRuleItem,
} from '../types/assistant';
import { triggerHaptic } from '../utils/haptics';

const AGENDA_CATEGORY_LABELS: Record<AgendaCategory, string> = {
  reuniao: 'Reunião',
  foco_dev: 'Foco de Código',
  rotina: 'Rotina Diária',
  entrega: 'Entrega / Prazo',
  pessoal: 'Pessoal',
};

function getTodayIsoDate(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

interface AgendaAndRoutinesPanelProps {
  agenda: AgendaEventItem[];
  routines: RoutineRuleItem[];
  isProcessing: boolean;
  onAddEvent: (payload: {
    title: string;
    date: string;
    startTime: string;
    endTime?: string;
    category: AgendaCategory;
    locationOrLink?: string;
    notes?: string;
    assignedAssistant: AssistantId | 'todos';
    autoCallOnTime: boolean;
  }) => Promise<void>;
  onToggleEvent: (event: AgendaEventItem) => Promise<void>;
  onDeleteEvent: (id: string) => Promise<void>;
  onAddRoutine: (payload: {
    title: string;
    time: string;
    frequencyLabel: string;
    leadAssistant: AssistantId | 'todos';
    instructions: string;
  }) => Promise<void>;
  onToggleRoutine: (routine: RoutineRuleItem) => Promise<void>;
  onDeleteRoutine: (id: string) => Promise<void>;
  onTriggerProactiveEvent: (
    title: string,
    preferredMode: InteractionMode,
    reason: string
  ) => Promise<void>;
}

export function AgendaAndRoutinesPanel({
  agenda,
  routines,
  isProcessing,
  onAddEvent,
  onToggleEvent,
  onDeleteEvent,
  onAddRoutine,
  onToggleRoutine,
  onDeleteRoutine,
  onTriggerProactiveEvent,
}: AgendaAndRoutinesPanelProps) {
  const todayIso = getTodayIsoDate();
  const [dateFilter, setDateFilter] = useState<'hoje' | 'todos'>('todos');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('11:00');
  const [endTime, setEndTime] = useState('12:00');
  const [category, setCategory] = useState<AgendaCategory>('foco_dev');
  const [assignedAssistant, setAssignedAssistant] = useState<AssistantId | 'todos'>('todos');
  const [notes, setNotes] = useState('');
  const [autoCallOnTime, setAutoCallOnTime] = useState(true);

  const [routineTitle, setRoutineTitle] = useState('');
  const [routineTime, setRoutineTime] = useState('16:00');
  const [routineFreq, setRoutineFreq] = useState('Diário');
  const [routineLead, setRoutineLead] = useState<AssistantId | 'todos'>('sexta-feira');
  const [routineInstructions, setRoutineInstructions] = useState('');

  const filteredEvents = agenda.filter((ev) =>
    dateFilter === 'hoje' ? ev.date === todayIso : true
  );

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date || !startTime) return;
    triggerHaptic('success');
    await onAddEvent({
      title: title.trim(),
      date,
      startTime,
      endTime: endTime || undefined,
      category,
      notes: notes.trim() || undefined,
      assignedAssistant,
      autoCallOnTime,
    });
    setTitle('');
    setNotes('');
  }

  async function handleCreateRoutine(e: React.FormEvent) {
    e.preventDefault();
    if (!routineTitle.trim() || !routineTime) return;
    triggerHaptic('success');
    await onAddRoutine({
      title: routineTitle.trim(),
      time: routineTime,
      frequencyLabel: routineFreq,
      leadAssistant: routineLead,
      instructions:
        routineInstructions.trim() ||
        'Chamar Patrick Pessoa por voz para acompanhar a evolução do trabalho.',
    });
    setRoutineTitle('');
    setRoutineInstructions('');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 columns: Interactive Calendar & Schedule Events */}
      <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/75 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Calendário, Horários &amp; Eventos de Patrick Pessoa
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Compromissos monitorados em segundo plano. No horário programado, a IA responsável chama você automaticamente por voz.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 self-start">
            <button
              type="button"
              onClick={() => setDateFilter('hoje')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                dateFilter === 'hoje'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Hoje ({todayIso.slice(5)})
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('todos')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                dateFilter === 'todos'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Todos ({agenda.length})
            </button>
          </div>
        </div>

        {/* Add Event Form */}
        <form
          onSubmit={handleCreateEvent}
          className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Novo compromisso, reunião, entrega ou bloco de código..."
              className="sm:col-span-6 rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="sm:col-span-3 rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
            />
            <div className="sm:col-span-3 grid grid-cols-2 gap-1.5">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-label="Horário inicial"
                className="rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                aria-label="Horário final"
                className="rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AgendaCategory)}
              className="sm:col-span-3 rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              {Object.entries(AGENDA_CATEGORY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={assignedAssistant}
              onChange={(e) =>
                setAssignedAssistant(e.target.value as AssistantId | 'todos')
              }
              className="sm:col-span-3 rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="todos">Conselho (3 IAs)</option>
              <option value="jarvis">J.A.R.V.I.S.</option>
              <option value="sexta-feira">SEXTA-FEIRA</option>
              <option value="ultron">ULTRON</option>
            </select>

            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações ou pauta para a IA cobrar..."
              className="sm:col-span-6 rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoCallOnTime}
                onChange={(e) => setAutoCallOnTime(e.target.checked)}
                className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
              />
              <span>Chamar Patrick automaticamente por voz e notificação no horário</span>
            </label>

            <button
              type="submit"
              disabled={!title.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agendar Compromisso</span>
            </button>
          </div>
        </form>

        {/* Events Timeline List */}
        {filteredEvents.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhum evento programado para este filtro. Adicione um horário acima ou peça por voz aos assistentes.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {filteredEvents.map((ev) => {
              const assistantLabel =
                ev.assignedAssistant === 'todos'
                  ? '3 IAs (Conselho)'
                  : ev.assignedAssistant === 'jarvis'
                  ? 'J.A.R.V.I.S.'
                  : ev.assignedAssistant === 'ultron'
                  ? 'ULTRON'
                  : 'SEXTA-FEIRA';

              return (
                <div
                  key={ev.id}
                  className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onToggleEvent(ev)}
                      className="mt-0.5 text-slate-400 hover:text-emerald-500 transition-colors shrink-0"
                      aria-label={`Marcar evento ${ev.title}`}
                    >
                      {ev.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          {ev.date} · {ev.startTime}
                          {ev.endTime ? `–${ev.endTime}` : ''}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans">
                          {AGENDA_CATEGORY_LABELS[ev.category]}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-sans font-medium ${
                            ev.assignedAssistant === 'ultron'
                              ? 'text-red-600 dark:text-red-400'
                              : ev.assignedAssistant === 'jarvis'
                              ? 'text-amber-700 dark:text-amber-300'
                              : ev.assignedAssistant === 'sexta-feira'
                              ? 'text-sky-700 dark:text-sky-300'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          Responsável: {assistantLabel}
                        </span>
                        {ev.autoCallOnTime && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-sans text-emerald-700 dark:text-emerald-400">
                              Alerta Vocal Ativo
                            </span>
                          </>
                        )}
                      </div>

                      <h3
                        className={`text-sm font-semibold ${
                          ev.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {ev.title}
                      </h3>

                      {ev.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {ev.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => {
                        triggerHaptic('tap');
                        void onTriggerProactiveEvent(
                          ev.title,
                          ev.assignedAssistant,
                          `Briefing de compromisso agendado (${ev.startTime}): ${ev.title}`
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      <span>Ouvir Briefing IA</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteEvent(ev.id)}
                      aria-label={`Remover ${ev.title}`}
                      className="rounded-lg p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Right 5 columns: Autonomous Daily Routines & Proactive Daemon Rules */}
      <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/75 p-5 space-y-5">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Rotinas Autônomas em Segundo Plano
            </h2>
            <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Gatilhos de horário em que J.A.R.V.I.S., SEXTA-FEIRA e ULTRON assumem a iniciativa e chamam você durante o expediente no computador ou celular.
          </p>
        </div>

        <form
          onSubmit={handleCreateRoutine}
          className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-4"
        >
          <input
            type="text"
            value={routineTitle}
            onChange={(e) => setRoutineTitle(e.target.value)}
            placeholder="Nome da rotina (ex: Revisão de Pull Requests & Clima)"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="time"
              value={routineTime}
              onChange={(e) => setRoutineTime(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
            />
            <select
              value={routineFreq}
              onChange={(e) => setRoutineFreq(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="Diário">Diário</option>
              <option value="Seg a Sex">Seg a Sex</option>
              <option value="Manhã">Manhã</option>
              <option value="Noite">Noite</option>
            </select>
            <select
              value={routineLead}
              onChange={(e) =>
                setRoutineLead(e.target.value as AssistantId | 'todos')
              }
              className="rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="jarvis">J.A.R.V.I.S.</option>
              <option value="sexta-feira">SEXTA-FEIRA</option>
              <option value="ultron">ULTRON</option>
              <option value="todos">Todos (3 IAs)</option>
            </select>
          </div>

          <input
            type="text"
            value={routineInstructions}
            onChange={(e) => setRoutineInstructions(e.target.value)}
            placeholder="Diretriz para a IA executar ao chamar Patrick..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />

          <button
            type="submit"
            disabled={!routineTitle.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Adicionar Rotina Autônoma</span>
          </button>
        </form>

        <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
          {routines.map((r) => (
            <div key={r.id} className="py-3.5 first:pt-1 last:pb-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-sky-700 dark:text-sky-300">
                      {r.time}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans">{r.frequencyLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-sans font-medium ${
                        r.leadAssistant === 'ultron'
                          ? 'text-red-600 dark:text-red-400'
                          : r.leadAssistant === 'jarvis'
                          ? 'text-amber-700 dark:text-amber-300'
                          : r.leadAssistant === 'sexta-feira'
                          ? 'text-sky-700 dark:text-sky-300'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {r.leadAssistant === 'todos'
                        ? '3 IAs'
                        : r.leadAssistant.toUpperCase()}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {r.title}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleRoutine(r)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${
                      r.enabled
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-300 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    {r.enabled ? 'Ativa' : 'Pausada'}
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      triggerHaptic('tap');
                      void onTriggerProactiveEvent(
                        r.title,
                        r.leadAssistant,
                        `Execução imediata da rotina: ${r.title} — ${r.instructions}`
                      );
                    }}
                    title="Executar esta rotina agora com voz"
                    className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-amber-500"
                  >
                    Testar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRoutine(r.id)}
                    aria-label={`Excluir rotina ${r.title}`}
                    className="rounded-md p-1 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {r.instructions}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

interface LiveRadarIntelPanelProps {
  intel: LiveIntelBriefing | null;
  isLoadingIntel: boolean;
  isProcessing: boolean;
  onRefreshIntel: (city?: string) => Promise<void>;
  onAskAssistantsAboutIntel: (prompt: string, mode?: InteractionMode) => void;
}

export function LiveRadarIntelPanel({
  intel,
  isLoadingIntel,
  isProcessing,
  onRefreshIntel,
  onAskAssistantsAboutIntel,
}: LiveRadarIntelPanelProps) {
  const [cityInput, setCityInput] = useState('Rio de Janeiro, RJ');
  const [activeNewsTab, setActiveNewsTab] = useState<'todas' | 'rio' | 'brasil' | 'mundo'>(
    'todas'
  );

  const weather = intel?.weather;

  function handleCitySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cityInput.trim()) return;
    triggerHaptic('tap');
    void onRefreshIntel(cityInput.trim());
  }

  return (
    <div className="space-y-6">
      {/* Top Row: Live Rio de Janeiro Weather Station + Quick AI Briefing Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/75 p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs text-sky-700 dark:text-sky-300 font-medium">
                {weather?.isDay !== false ? (
                  <Sun className="h-4 w-4 shrink-0" />
                ) : (
                  <CloudRain className="h-4 w-4 shrink-0" />
                )}
                <span>Meteorologia em Tempo Real · Open-Meteo</span>
              </div>
              <h2 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                {weather?.city ?? 'Rio de Janeiro, RJ'}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onRefreshIntel(cityInput)}
              disabled={isLoadingIntel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoadingIntel ? 'animate-spin' : ''}`}
              />
              <span>Atualizar</span>
            </button>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-4 py-2 border-y border-slate-200 dark:border-slate-800">
            <div>
              <div className="font-display text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 tabular-nums">
                {weather ? `${weather.temperatureC}°C` : '--°C'}
              </div>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                {weather?.conditionLabel ?? 'Sincronizando estação meteorológica...'}
              </p>
            </div>

            <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              <div>
                Sensação térmica:{' '}
                <strong className="text-slate-900 dark:text-slate-200">
                  {weather ? `${weather.apparentTemperatureC}°C` : '--'}
                </strong>
              </div>
              <div>
                Umidade relativa:{' '}
                <strong className="text-slate-900 dark:text-slate-200">
                  {weather ? `${weather.humidityPercent}%` : '--'}
                </strong>
              </div>
              <div className="flex items-center gap-1">
                <Wind className="h-3.5 w-3.5 text-sky-500" />
                <span>
                  Vento:{' '}
                  <strong className="text-slate-900 dark:text-slate-200">
                    {weather ? `${weather.windSpeedKmh} km/h` : '--'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleCitySubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder="Consultar outra cidade (ex: Niterói, São Paulo)..."
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-amber-500 whitespace-nowrap shrink-0"
            >
              Mudar Cidade
            </button>
          </form>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() =>
              onAskAssistantsAboutIntel(
                `Analisem a previsão do tempo atual em ${
                  weather?.city ?? 'Rio de Janeiro'
                } (${weather?.temperatureC ?? 26}°C, ${
                  weather?.conditionLabel ?? ''
                }) e as principais notícias de hoje do Rio de Janeiro, do Brasil e do mundo, destacando o que impacta minha rotina hoje.`,
                'todos'
              )
            }
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            <Volume2 className="h-4 w-4" />
            <span>Ouvir Briefing Completo (Clima RJ + Notícias) pelas 3 IAs</span>
          </button>
        </section>

        {/* Right 7 columns: 4-Day Forecast Table + Tactical News Synthesis */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/75 p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Previsão de 4 Dias &amp; Janelas de Deslocamento
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              SEXTA-FEIRA e J.A.R.V.I.S. cruzam a probabilidade de chuva com os seus compromissos externos no Rio de Janeiro.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Condição Prevista</th>
                  <th className="py-2 font-medium text-right">Mín / Máx</th>
                  <th className="py-2 font-medium text-right">Prob. Chuva</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-mono tabular-nums">
                {(weather?.forecast ?? []).map((day) => (
                  <tr key={day.date} className="hover:bg-slate-50/80 dark:hover:bg-slate-950/40">
                    <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {day.date}
                    </td>
                    <td className="py-2.5 font-sans text-slate-700 dark:text-slate-300">
                      {day.conditionLabel}
                    </td>
                    <td className="py-2.5 text-right text-slate-800 dark:text-slate-200">
                      {day.tempMinC}°C / {day.tempMaxC}°C
                    </td>
                    <td
                      className={`py-2.5 text-right font-semibold ${
                        day.precipitationProb >= 50
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-sky-600 dark:text-sky-400'
                      }`}
                    >
                      {day.precipitationProb}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Acione qualquer especialista para comentar o cenário:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  onAskAssistantsAboutIntel(
                    'Jarvis, faça um resumo executivo das principais notícias do Rio de Janeiro e do Brasil agora e como devo organizar meu dia.',
                    'jarvis'
                  )
                }
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 transition-colors"
              >
                Resumo J.A.R.V.I.S.
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  onAskAssistantsAboutIntel(
                    'Sexta-feira, como está o clima e o panorama do Rio de Janeiro agora para minha rotina de hoje?',
                    'sexta-feira'
                  )
                }
                className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-800 dark:text-sky-200 hover:bg-sky-500/20 transition-colors"
              >
                Giro Rápido SEXTA-FEIRA
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  onAskAssistantsAboutIntel(
                    'Ultron, faça uma análise implacável e preditiva das notícias do Brasil e do mundo hoje e aponte riscos estratégicos.',
                    'ultron'
                  )
                }
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-500/20 transition-colors"
              >
                Diagnóstico Global ULTRON
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Bottom Section: Real-Time News Feeds (Rio de Janeiro · Brasil · Mundo) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/75 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Newspaper className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Central de Inteligência Jornalística · Rio de Janeiro, Brasil &amp; Mundo
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Manchetes verificadas em tempo real. Clique em qualquer notícia para que J.A.R.V.I.S., SEXTA-FEIRA ou ULTRON analisem em voz alta.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 self-start">
            {(
              [
                { id: 'todas', label: 'Visão Tripla' },
                { id: 'rio', label: 'Rio de Janeiro' },
                { id: 'brasil', label: 'Brasil' },
                { id: 'mundo', label: 'Mundo & Tech' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveNewsTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeNewsTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`grid grid-cols-1 ${
            activeNewsTab === 'todas' ? 'lg:grid-cols-3' : 'lg:grid-cols-1'
          } gap-6`}
        >
          {(
            [
              {
                key: 'rio',
                title: 'Rio de Janeiro · Capital & Estado',
                items: intel?.news.rio ?? [],
              },
              {
                key: 'brasil',
                title: 'Brasil · Economia, Política & Cidades',
                items: intel?.news.brasil ?? [],
              },
              {
                key: 'mundo',
                title: 'Mundo · Geopolítica, Ciência & Tecnologia',
                items: intel?.news.mundo ?? [],
              },
            ] as const
          )
            .filter((col) => activeNewsTab === 'todas' || activeNewsTab === col.key)
            .map((col) => (
              <div key={col.key} className="space-y-3">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
                  {col.title}
                </h3>

                {col.items.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    Carregando manchetes atualizadas...
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
                    {col.items.map((item) => (
                      <article key={item.id} className="py-3 first:pt-1 last:pb-1 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-amber-700 dark:text-amber-300">
                            {item.source}
                          </span>
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:text-sky-600 dark:hover:text-sky-300"
                          >
                            <span>Fonte</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>

                        <h4 className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                          {item.title}
                        </h4>

                        <div className="pt-0.5">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() =>
                              onAskAssistantsAboutIntel(
                                `Analisem e comentem esta notícia (${item.source}): "${item.title}"`,
                                'todos'
                              )
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 dark:text-sky-300 hover:underline underline-offset-2"
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                            <span>Debater com as 3 IAs</span>
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

interface CreatorDossierSectionProps {
  dossier: CreatorDossier | undefined;
  isScanningSocials: boolean;
  isProcessing: boolean;
  onScanSocials: (extraQuery: string) => Promise<void>;
  onAnswerQuestion: (questionId: string, answerText: string) => Promise<void>;
  onUpdateDossier: (patch: Partial<CreatorDossier>) => Promise<void>;
}

export function CreatorDossierSection({
  dossier,
  isScanningSocials,
  isProcessing,
  onScanSocials,
  onAnswerQuestion,
  onUpdateDossier,
}: CreatorDossierSectionProps) {
  const [extraQuery, setExtraQuery] = useState('');
  const [answersById, setAnswersById] = useState<Record<string, string>>({});
  const [newPlatform, setNewPlatform] =
    useState<CreatorDossier['socialProfiles'][number]['platform']>('GitHub');
  const [newHandle, setNewHandle] = useState('');

  if (!dossier) return null;

  const openQuestions = dossier.openQuestions.filter((q) => !q.answered);

  async function handleAddSocialProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!newHandle.trim() || !dossier) return;
    triggerHaptic('success');
    const nextProfiles = [
      ...dossier.socialProfiles,
      {
        id: `soc-${Date.now()}`,
        platform: newPlatform,
        handleOrUrl: newHandle.trim(),
        verifiedNotes: 'Adicionado por Patrick Pessoa para monitoramento dos assistentes.',
      },
    ];
    await onUpdateDossier({ socialProfiles: nextProfiles });
    setNewHandle('');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mb-6">
      {/* Left 6 cols: Proactive Questions from the 3 Assistants to Patrick Pessoa */}
      <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/75 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Entrevista Ativa &amp; Evolução de Conhecimento</span>
            </div>
            <h2 className="mt-0.5 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Perguntas das IAs para Patrick Pessoa ({openQuestions.length})
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Os assistentes formulam perguntas sempre que identificam lacunas sobre sua rotina, prioridades ou preferências.
            </p>
          </div>
        </div>

        {openQuestions.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Todas as perguntas atuais foram respondidas! As IAs gerarão novas perguntas conforme acompanharem seu trabalho.
          </div>
        ) : (
          <div className="space-y-3">
            {openQuestions.map((q) => (
              <div
                key={q.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span
                    className={`font-semibold ${
                      q.askedBy === 'ultron'
                        ? 'text-red-600 dark:text-red-400'
                        : q.askedBy === 'jarvis'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-sky-700 dark:text-sky-300'
                    }`}
                  >
                    Pergunta de{' '}
                    {q.askedBy === 'jarvis'
                      ? 'J.A.R.V.I.S.'
                      : q.askedBy === 'ultron'
                      ? 'ULTRON'
                      : 'SEXTA-FEIRA'}
                  </span>
                  <span>Objetivo: {q.contextReason}</span>
                </div>

                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                  “{q.question}”
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={answersById[q.id] ?? ''}
                    onChange={(e) =>
                      setAnswersById((prev) => ({
                        ...prev,
                        [q.id]: e.target.value,
                      }))
                    }
                    placeholder="Responda para ensinar aos assistentes..."
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    disabled={isProcessing || !(answersById[q.id] ?? '').trim()}
                    onClick={async () => {
                      const val = (answersById[q.id] ?? '').trim();
                      if (!val) return;
                      triggerHaptic('success');
                      setAnswersById((prev) => ({ ...prev, [q.id]: '' }));
                      await onAnswerQuestion(q.id, val);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Send className="h-3 w-3" />
                    <span>Responder</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Right 6 cols: Creator Dossier & Online Social Network Scanner */}
      <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/75 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-sky-700 dark:text-sky-300">
              <UserCheck className="h-3.5 w-3.5" />
              <span>Banco de Informações do Desenvolvedor</span>
            </div>
            <h2 className="mt-0.5 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Dossiê {dossier.fullName} &amp; Redes Sociais Online
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {dossier.email} · {dossier.city}, {dossier.stateCountry} · {dossier.workHours}
            </p>
          </div>
        </div>

        {/* Social profiles list */}
        <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
          {dossier.socialProfiles.map((prof) => (
            <div
              key={prof.id}
              className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {prof.platform}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="font-mono text-sky-700 dark:text-sky-300 truncate">
                    {prof.handleOrUrl}
                  </span>
                </div>
                {prof.verifiedNotes && (
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {prof.verifiedNotes}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add social link */}
        <form onSubmit={handleAddSocialProfile} className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <select
            value={newPlatform}
            onChange={(e) =>
              setNewPlatform(
                e.target.value as CreatorDossier['socialProfiles'][number]['platform']
              )
            }
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
          >
            <option value="GitHub">GitHub</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Instagram">Instagram</option>
            <option value="X / Twitter">X / Twitter</option>
            <option value="YouTube">YouTube</option>
            <option value="Portfólio / Web">Portfólio / Web</option>
          </select>
          <input
            type="text"
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            placeholder="Adicionar @usuario ou URL da rede social..."
            className="flex-1 min-w-[180px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={!newHandle.trim()}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-amber-500 whitespace-nowrap shrink-0"
          >
            Vincular Rede
          </button>
        </form>

        {/* Online Social & Web Discovery Trigger */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={extraQuery}
              onChange={(e) => setExtraQuery(e.target.value)}
              placeholder="Foco extra de busca sobre você (ex: projetos, empresa, artigos)..."
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              disabled={isScanningSocials || isProcessing}
              onClick={() => {
                triggerHaptic('tap');
                void onScanSocials(extraQuery.trim());
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {isScanningSocials ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              <span>
                {isScanningSocials
                  ? 'Vasculhando Redes...'
                  : 'Vasculhar Redes Sociais & Web'}
              </span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Globe className="h-3 w-3 text-sky-500 shrink-0" />
            <span>
              Consulta pública em tempo real (GitHub, LinkedIn, Instagram, X e Web) para alimentar o banco de conhecimento de J.A.R.V.I.S., SEXTA-FEIRA e ULTRON.
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}

interface BackgroundStatusTrayBarProps {
  isDaemonActive: boolean;
  onToggleDaemon: () => void;
  proactiveIntervalMin: number;
  onChangeIntervalMin: (min: number) => void;
  notificationsGranted: boolean;
  onRequestNotifications: () => void;
  wakeLockActive: boolean;
  nextScheduledLabel: string;
  weatherSummary: string;
  isProcessing: boolean;
  onTriggerImmediateProactive: () => void;
}

export function BackgroundStatusTrayBar({
  isDaemonActive,
  onToggleDaemon,
  proactiveIntervalMin,
  onChangeIntervalMin,
  notificationsGranted,
  onRequestNotifications,
  wakeLockActive,
  nextScheduledLabel,
  weatherSummary,
  isProcessing,
  onTriggerImmediateProactive,
}: BackgroundStatusTrayBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-slate-600 dark:text-slate-400">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('toggle');
            onToggleDaemon();
          }}
          title="Alternar execução contínua em segundo plano do RODACK SISTEMA DE IA"
          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 min-h-[34px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
            isDaemonActive
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
          }`}
        >
          <Radio
            className={`h-3.5 w-3.5 ${
              isDaemonActive ? 'text-emerald-500 animate-spin' : 'text-slate-400'
            }`}
          />
          <span>
            {isDaemonActive
              ? 'Status: RODACK ONLINE (2º Plano Ativo)'
              : 'Status: 2º Plano Pausado'}
          </span>
        </button>

        <span aria-hidden="true" className="hidden md:inline text-slate-400">
          ·
        </span>

        <span className="hidden md:inline font-mono tabular-nums text-slate-700 dark:text-slate-300">
          {weatherSummary}
        </span>

        <span aria-hidden="true" className="hidden xl:inline text-slate-400">
          ·
        </span>

        <span className="hidden xl:inline font-mono tabular-nums text-slate-600 dark:text-slate-400">
          {nextScheduledLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 min-h-[34px]">
          <span className="text-slate-500 dark:text-slate-400">Iniciativa IA:</span>
          <select
            value={proactiveIntervalMin}
            onChange={(e) => onChangeIntervalMin(Number(e.target.value))}
            aria-label="Intervalo de iniciativa autônoma das IAs"
            className="bg-transparent font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-300 focus:outline-none"
          >
            <option value={5}>a cada 5 min</option>
            <option value={10}>a cada 10 min</option>
            <option value={15}>a cada 15 min</option>
            <option value={30}>a cada 30 min</option>
            <option value={0}>Só nos horários da agenda</option>
          </select>
        </div>

        <button
          type="button"
          disabled={isProcessing}
          onClick={() => {
            triggerHaptic('tap');
            onTriggerImmediateProactive();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/45 bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1.5 min-h-[34px] font-semibold text-amber-800 dark:text-amber-200 transition-colors whitespace-nowrap shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Chamar Iniciativa IA</span>
        </button>

        {!notificationsGranted ? (
          <button
            type="button"
            onClick={onRequestNotifications}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1.5 min-h-[34px] font-medium text-sky-800 dark:text-sky-200 transition-colors whitespace-nowrap shrink-0"
          >
            <span>Ativar Ícone &amp; Alertas do Sistema</span>
          </button>
        ) : (
          <span className="hidden lg:inline text-emerald-700 dark:text-emerald-400 font-medium">
            Alertas Desktop Ativos{wakeLockActive ? ' · WakeLock ON' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
