import { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import type {
  AlertItem,
  AssistantId,
  MemoryCategory,
  MemoryItem,
  TaskItem,
  TurnFeedback,
  WorkspaceState,
} from '../types/assistant';
import { AuditTelemetryPanel } from './AuditTelemetryPanel';
import { triggerHaptic } from '../utils/haptics';

interface MemoryPanelProps {
  memories: MemoryItem[];
  onAddMemory: (payload: {
    title: string;
    content: string;
    category: MemoryCategory;
    sourceAssistant: AssistantId | 'ambos' | 'todos';
    importance: 'alta' | 'media' | 'normal';
  }) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
}

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  arquitetura: 'Arquitetura',
  seguranca: 'Segurança',
  preferencia: 'Preferência',
  projeto: 'Projeto',
  aprendizado: 'Aprendizado',
};

export function MemoryPanel({
  memories,
  onAddMemory,
  onDeleteMemory,
}: MemoryPanelProps) {
  const [filter, setFilter] = useState<'todas' | MemoryCategory>('todas');
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<MemoryCategory>('projeto');
  const [importance, setImportance] = useState<'alta' | 'media' | 'normal'>('alta');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filtered = memories.filter((m) => {
    const matchCategory = filter === 'todas' || m.category === filter;
    const q = search.trim().toLowerCase();
    const matchQuery =
      !q ||
      m.title.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q);
    return matchCategory && matchQuery;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    triggerHaptic('success');
    setIsSubmitting(true);
    try {
      await onAddMemory({
        title: title.trim(),
        content: content.trim(),
        category,
        sourceAssistant: 'todos',
        importance,
      });
      setTitle('');
      setContent('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <section className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-amber-600 dark:text-amber-300 shrink-0" />
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Ensinar Nova Informação
          </h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Registre padrões do seu trabalho, decisões de arquitetura ou preferências de Patrick Pessoa. J.A.R.V.I.S., SEXTA-FEIRA e ULTRON consultam esta memória em cada conversa.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Título da memória
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Padrão de banco de dados do projeto"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MemoryCategory)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Importância
              </label>
              <select
                value={importance}
                onChange={(e) =>
                  setImportance(e.target.value as 'alta' | 'media' | 'normal')
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
              >
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="normal">Normal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Detalhes de contexto
            </label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Descreva regras, ferramentas, metas ou aprendizados para J.A.R.V.I.S., SEXTA-FEIRA e ULTRON..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !title.trim() || !content.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>{isSubmitting ? 'Salvando...' : 'Salvar na Memória'}</span>
          </button>
        </form>
      </section>

      <section className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Base de Conhecimento de Trabalho ({memories.length})
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Aprendizados extraídos das conversas e registros manuais de Patrick Pessoa.
            </p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar memórias..."
            className="w-full sm:w-60 rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-500 dark:focus:border-sky-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          {(['todas', 'projeto', 'arquitetura', 'seguranca', 'preferencia', 'aprendizado'] as const).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  filter === tab
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'todas' ? 'Todas' : CATEGORY_LABELS[tab]}
              </button>
            )
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhuma memória encontrada para esse filtro.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {filtered.map((mem) => (
              <div key={mem.id} className="py-4 first:pt-1 last:pb-1 flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-amber-700 dark:text-amber-300">
                      {CATEGORY_LABELS[mem.category]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Importância {mem.importance}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Fonte:{' '}
                      <span
                        className={
                          mem.sourceAssistant === 'ultron'
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : mem.sourceAssistant === 'jarvis'
                            ? 'text-amber-700 dark:text-amber-300 font-medium'
                            : mem.sourceAssistant === 'sexta-feira'
                            ? 'text-sky-700 dark:text-sky-300 font-medium'
                            : 'text-slate-700 dark:text-slate-300'
                        }
                      >
                        {mem.sourceAssistant === 'todos'
                          ? 'Conselho Completo'
                          : mem.sourceAssistant === 'ambos'
                          ? 'J.A.R.V.I.S. & SEXTA-FEIRA'
                          : mem.sourceAssistant === 'jarvis'
                          ? 'J.A.R.V.I.S.'
                          : mem.sourceAssistant === 'ultron'
                          ? 'ULTRON'
                          : 'SEXTA-FEIRA'}
                      </span>
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {mem.title}
                  </h3>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {mem.content}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteMemory(mem.id)}
                  aria-label={`Excluir memória ${mem.title}`}
                  className="rounded-lg p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface TasksAndAlertsPanelProps {
  tasks: TaskItem[];
  alerts: AlertItem[];
  onAddTask: (payload: {
    title: string;
    description: string;
    priority: 'alta' | 'media' | 'baixa';
    assignedTo: AssistantId | 'ambos' | 'todos';
    dueTime: string;
  }) => Promise<void>;
  onToggleTask: (task: TaskItem) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onToggleAlert: (alert: AlertItem) => Promise<void>;
  onDeleteAlert: (id: string) => Promise<void>;
}

export function TasksAndAlertsPanel({
  tasks,
  alerts,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onToggleAlert,
  onDeleteAlert,
}: TasksAndAlertsPanelProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'alta' | 'media' | 'baixa'>('media');
  const [assignedTo, setAssignedTo] = useState<AssistantId | 'ambos' | 'todos'>('todos');
  const [alertFilter, setAlertFilter] = useState<'abertos' | 'todos'>('abertos');

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    triggerHaptic('success');
    await onAddTask({
      title: title.trim(),
      description: description.trim(),
      priority,
      assignedTo,
      dueTime: 'Hoje',
    });
    setTitle('');
    setDescription('');
  }

  const displayedAlerts = alerts.filter((a) =>
    alertFilter === 'abertos' ? !a.resolved : true
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Tasks */}
      <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-5 space-y-5">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Tarefas do Dia ({tasks.filter((t) => t.status !== 'concluida').length} pendentes)
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Atividades acompanhadas por J.A.R.V.I.S., SEXTA-FEIRA e ULTRON para Patrick Pessoa.
          </p>
        </div>

        <form onSubmit={handleCreateTask} className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-5">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nova tarefa de desenvolvimento ou rotina..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-500 dark:focus:border-sky-400"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes (opcional)"
              className="sm:col-span-1 rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-500 dark:focus:border-sky-400"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'alta' | 'media' | 'baixa')}
              className="rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500 dark:focus:border-sky-400"
            >
              <option value="alta">Prioridade Alta</option>
              <option value="media">Prioridade Média</option>
              <option value="baixa">Prioridade Baixa</option>
            </select>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value as AssistantId | 'ambos' | 'todos')}
              className="rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500 dark:focus:border-sky-400"
            >
              <option value="todos">Todos (3 IAs)</option>
              <option value="ambos">J.A.R.V.I.S. &amp; SEXTA</option>
              <option value="jarvis">J.A.R.V.I.S.</option>
              <option value="sexta-feira">SEXTA-FEIRA</option>
              <option value="ultron">ULTRON</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={!title.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Adicionar Tarefa</span>
          </button>
        </form>

        <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
          {tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhuma tarefa registrada ainda.
            </p>
          ) : (
            tasks.map((task) => {
              const done = task.status === 'concluida';
              return (
                <div key={task.id} className="py-3.5 flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onToggleTask(task)}
                    className="flex items-start gap-3 text-left min-w-0 flex-1 group"
                  >
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-400 dark:text-slate-500 group-hover:text-sky-600 dark:group-hover:text-sky-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          done
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span
                          className={
                            task.priority === 'alta'
                              ? 'text-amber-700 dark:text-amber-300 font-medium'
                              : task.priority === 'media'
                              ? 'text-sky-700 dark:text-sky-300 font-medium'
                              : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          Prioridade {task.priority}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Apoio:{' '}
                          {task.assignedTo === 'todos'
                            ? 'Todos (3 IAs)'
                            : task.assignedTo === 'ambos'
                            ? 'Equipe dupla'
                            : task.assignedTo === 'jarvis'
                            ? 'J.A.R.V.I.S.'
                            : task.assignedTo === 'ultron'
                            ? 'ULTRON'
                            : 'SEXTA-FEIRA'}
                        </span>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    aria-label={`Excluir tarefa ${task.title}`}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Security & Instability Alerts */}
      <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Monitor de Segurança, Instabilidade &amp; Bem-Estar
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Alertas proativos emitidos pelos assistentes durante análises e diálogos.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setAlertFilter('abertos')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                alertFilter === 'abertos'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Abertos
            </button>
            <button
              type="button"
              onClick={() => setAlertFilter('todos')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                alertFilter === 'todos'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Todos
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {displayedAlerts.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhum alerta aberto no momento. Ambiente estável.
            </div>
          ) : (
            displayedAlerts.map((alert) => {
              const isCritical = alert.severity === 'critico';
              const isWarn = alert.severity === 'aviso';
              return (
                <div
                  key={alert.id}
                  className={`rounded-xl border p-4 space-y-2 ${
                    alert.resolved
                      ? 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-950/50'
                      : isCritical
                      ? 'border-red-500/45 bg-red-50/70 dark:border-red-500/40 dark:bg-red-950/15'
                      : isWarn
                      ? 'border-amber-500/45 bg-amber-50/70 dark:border-amber-500/35 dark:bg-amber-950/15'
                      : 'border-sky-500/40 bg-sky-50/70 dark:border-sky-500/30 dark:bg-sky-950/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {isCritical ? (
                        <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                      ) : isWarn ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300 shrink-0" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-300 shrink-0" />
                      )}
                      <span
                        className={
                          isCritical
                            ? 'text-red-700 dark:text-red-300'
                            : isWarn
                            ? 'text-amber-800 dark:text-amber-300'
                            : 'text-sky-800 dark:text-sky-300'
                        }
                      >
                        {isCritical ? 'Crítico' : isWarn ? 'Aviso' : 'Informativo'}
                      </span>
                      <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
                        ·
                      </span>
                      <span
                        className={
                          alert.raisedBy === 'ultron'
                            ? 'text-red-600 dark:text-red-400'
                            : alert.raisedBy === 'jarvis'
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-sky-700 dark:text-sky-300'
                        }
                      >
                        {alert.raisedBy === 'jarvis'
                          ? 'J.A.R.V.I.S.'
                          : alert.raisedBy === 'ultron'
                          ? 'ULTRON'
                          : 'SEXTA-FEIRA'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleAlert(alert)}
                        className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        {alert.resolved ? 'Reabrir' : 'Resolver'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteAlert(alert.id)}
                        aria-label={`Remover alerta ${alert.title}`}
                        className="rounded-md p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {alert.title}
                  </h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {alert.detail}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ação recomendada: {alert.suggestedAction}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

interface AuditPanelProps {
  workspace: WorkspaceState | null;
  isDark?: boolean;
  isAuditing: boolean;
  onRunAudit: (codeOrSpec: string, contextNote: string) => Promise<void>;
  onRateTurn: (
    entryId: string,
    speaker: AssistantId,
    feedback: TurnFeedback | null
  ) => Promise<void>;
}

export function AuditPanel({
  workspace,
  isDark = true,
  isAuditing,
  onRunAudit,
  onRateTurn,
}: AuditPanelProps) {
  const [contextNote, setContextNote] = useState('');
  const [codeOrSpec, setCodeOrSpec] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codeOrSpec.trim()) return;
    triggerHaptic('tap');
    await onRunAudit(codeOrSpec.trim(), contextNote.trim());
  }

  return (
    <div className="space-y-6">
      <AuditTelemetryPanel workspace={workspace} isDark={isDark} onRateTurn={onRateTurn} />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/70 p-6 space-y-5">
        <div className="flex items-start gap-3">
          <Terminal className="h-5 w-5 text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Auditoria Tripla de Código, Segurança &amp; Previsão de Falhas
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Cole um trecho de código, consulta SQL, rota de API ou desenho de arquitetura. J.A.R.V.I.S. analisa arquitetura e segurança, SEXTA-FEIRA busca instabilidades práticas e ULTRON executa diagnóstico de falhas em cascata e previsões de colapso no Console Principal.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Contexto do módulo ou objetivo (opcional)
            </label>
            <input
              type="text"
              value={contextNote}
              onChange={(e) => setContextNote(e.target.value)}
              placeholder="Ex: Endpoint de autenticação de usuários em Express + PostgreSQL"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Código, log de erro ou especificação técnica
            </label>
            <textarea
              rows={10}
              value={codeOrSpec}
              onChange={(e) => setCodeOrSpec(e.target.value)}
              placeholder="Cole aqui o código ou especificação para revisão conjunta..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 px-3.5 py-3 font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400 leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={isAuditing || !codeOrSpec.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ShieldAlert className="h-4 w-4" />
              <span>
                {isAuditing
                  ? 'Analisando com J.A.R.V.I.S., SEXTA-FEIRA & ULTRON...'
                  : 'Executar Auditoria Tripla'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
