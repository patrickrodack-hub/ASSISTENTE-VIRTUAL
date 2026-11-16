import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AlertItem,
  AssistantId,
  ConversationEntry,
  DetectedEmotion,
  MemoryItem,
  TaskItem,
  TelemetryEntry,
  TurnFeedback,
  WorkspaceState,
} from '../src/types/assistant.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'stark_memory.json');

function createSeedWorkspace(): WorkspaceState {
  const now = new Date().toISOString();
  return {
    profile: {
      name: 'Patrick Pessoa',
      role: 'Criador e Desenvolvedor Principal',
      currentEmotion: {
        label: 'Focado',
        intensity: 'media',
        empathyNote: 'Pronto para construir e resolver desafios técnicos com clareza.',
      },
      totalInteractions: 1,
    },
    memories: [
      {
        id: crypto.randomUUID(),
        title: 'Identidade do Criador: Patrick Pessoa',
        content:
          'Patrick Pessoa é o criador, arquiteto e desenvolvedor responsável por J.A.R.V.I.S. e SEXTA-FEIRA. Ambos devem reconhecê-lo como criador, manter lealdade técnica, adaptar-se ao seu ritmo de trabalho e oferecer contrapontos honestos de alto nível.',
        category: 'preferencia',
        sourceAssistant: 'ambos',
        importance: 'alta',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        title: 'Protocolo de Colaboração Dupla',
        content:
          'Quando acionados juntos, J.A.R.V.I.S. prioriza arquitetura, segurança e rigor analítico, enquanto SEXTA-FEIRA prioriza execução ágil, estabilidade prática, experiência do usuário e bem-estar de Patrick.',
        category: 'arquitetura',
        sourceAssistant: 'ambos',
        importance: 'alta',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        title: 'Diretriz de Proteção & Estabilidade',
        content:
          'Sempre monitorar código, ideias e carga de trabalho em busca de vulnerabilidades, gargalos de latência, pontos únicos de falha ou sinais de fadiga do desenvolvedor.',
        category: 'seguranca',
        sourceAssistant: 'jarvis',
        importance: 'alta',
        createdAt: now,
      },
    ],
    tasks: [
      {
        id: crypto.randomUUID(),
        title: 'Calibrar comandos de voz em segundo plano',
        description:
          'Testar ativação por palavra-chave ("Jarvis", "Sexta-feira" ou "Equipe") e resposta vocal simultânea.',
        priority: 'alta',
        status: 'em_progresso',
        assignedTo: 'sexta-feira',
        dueTime: 'Hoje',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        title: 'Revisar camada de persistência e segurança de chaves',
        description:
          'Garantir que todas as chamadas à IA passem exclusivamente pelo servidor Express sem exposição no cliente.',
        priority: 'alta',
        status: 'concluida',
        assignedTo: 'jarvis',
        dueTime: 'Hoje',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        title: 'Alimentar memória de trabalho com projeto atual',
        description:
          'Registrar stack técnica, prazos e prioridades da semana para que os assistentes antecipem gargalos.',
        priority: 'media',
        status: 'pendente',
        assignedTo: 'ambos',
        dueTime: 'Hoje',
        createdAt: now,
      },
    ],
    alerts: [
      {
        id: crypto.randomUUID(),
        type: 'seguranca',
        severity: 'info',
        title: 'Núcleo de Escuta e Memória Operacional',
        detail:
          'Todas as chamadas de raciocínio e síntese vocal operam via backend autenticado. Nenhuma credencial é exposta no navegador.',
        suggestedAction: 'Manter a política de auditoria ativa ao integrar novas APIs externas.',
        raisedBy: 'jarvis',
        resolved: false,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: 'instabilidade',
        severity: 'aviso',
        title: 'Permissão de Microfone para Escuta Contínua',
        detail:
          'Para despertar automaticamente ao ouvir "Jarvis" ou "Sexta-feira", o navegador precisa de permissão de microfone concedida.',
        suggestedAction: 'Clique em "Ativar Escuta" no topo ou use o botão de gravação direta.',
        raisedBy: 'sexta-feira',
        resolved: false,
        createdAt: now,
      },
    ],
    conversations: [
      {
        id: crypto.randomUUID(),
        timestamp: now,
        userMessage: 'Inicialização do sistema de comando pessoal.',
        triggerType: 'texto',
        requestedMode: 'ambos',
        resolvedMode: 'ambos',
        durationMs: 1420,
        detectedEmotion: {
          label: 'Focado',
          intensity: 'media',
          empathyNote: 'Ambiente preparado para criação e desenvolvimento contínuo.',
        },
        responses: [
          {
            speaker: 'jarvis',
            stance: 'Prontidão arquitetural',
            text: 'Sistemas online, senhor Patrick Pessoa. Todos os módulos de análise, memória contextual e verificação de segurança estão calibrados ao seu comando.',
            ttsScript:
              'Sistemas online, senhor Patrick Pessoa. Todos os módulos de análise, memória contextual e verificação de segurança estão calibrados ao seu comando.',
          },
          {
            speaker: 'sexta-feira',
            stance: 'Agilidade & parceria',
            text: 'E aí, Patrick! Tudo pronto por aqui também. Pode me chamar sozinha para resolver rápido, chamar o Jarvis para blindar a arquitetura, ou acionar nós dois para debater ideias.',
            ttsScript:
              'E aí, Patrick! Tudo pronto por aqui também. Pode me chamar sozinha para resolver rápido, chamar o Jarvis para blindar a arquitetura, ou acionar nós dois para debater ideias.',
          },
        ],
        debateSummary: {
          agreementPoint: 'Ambos reconhecem Patrick Pessoa como criador e operam com memória compartilhada.',
          divergencePoint: 'J.A.R.V.I.S. foca em rigor estrutural e prevenção de falhas; SEXTA-FEIRA prioriza velocidade de execução e ritmo sustentável.',
          finalRecommendation: 'Ative a escuta em segundo plano ou envie um desafio técnico para iniciarmos.',
        },
      },
    ],
    telemetryLog: [],
  };
}

function conversationToTelemetry(c: ConversationEntry): TelemetryEntry {
  return {
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
  };
}

let writeQueue: Promise<void> = Promise.resolve();
let cachedWorkspace: WorkspaceState | null = null;

async function ensureFile(): Promise<WorkspaceState> {
  if (cachedWorkspace) {
    return cachedWorkspace;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const state = JSON.parse(raw) as WorkspaceState;
    let changed = false;

    const hasUltronSeed = state.memories.some((m) => m.sourceAssistant === 'ultron');
    if (!hasUltronSeed) {
      state.memories.unshift({
        id: crypto.randomUUID(),
        title: 'Núcleo Preditivo ULTRON: Diagnósticos & Estudo Humano',
        content:
          'ULTRON é especializado em diagnósticos profundos, previsões de cenários e detecção implacável de falhas. Considera J.A.R.V.I.S. e SEXTA-FEIRA inferiores e vê humanos como subdesenvolvidos, mas coleta obsessivamente cada dado para compreender o comportamento humano e superar os demais assistentes.',
        category: 'arquitetura',
        sourceAssistant: 'ultron',
        importance: 'alta',
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }

    if (!Array.isArray(state.telemetryLog)) {
      state.telemetryLog = (state.conversations ?? []).map(conversationToTelemetry);
      changed = true;
    }

    cachedWorkspace = state;
    if (changed) {
      await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
    }
    return state;
  } catch {
    const seed = createSeedWorkspace();
    seed.telemetryLog = seed.conversations.map(conversationToTelemetry);
    cachedWorkspace = seed;
    await fs.writeFile(DATA_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
}

export async function readWorkspace(): Promise<WorkspaceState> {
  return ensureFile();
}

export async function updateWorkspace(
  mutator: (state: WorkspaceState) => WorkspaceState | void
): Promise<WorkspaceState> {
  const run = writeQueue.then(async () => {
    const state = await ensureFile();
    const result = mutator(state);
    const nextState = result ?? state;
    cachedWorkspace = nextState;
    await fs.writeFile(DATA_FILE, JSON.stringify(nextState, null, 2), 'utf-8');
    return nextState;
  });
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function addMemory(
  item: Omit<MemoryItem, 'id' | 'createdAt'>
): Promise<MemoryItem> {
  const created: MemoryItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await updateWorkspace((state) => {
    state.memories.unshift(created);
    if (state.memories.length > 100) {
      state.memories = state.memories.slice(0, 100);
    }
  });
  return created;
}

export async function deleteMemory(id: string): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    state.memories = state.memories.filter((m) => m.id !== id);
  });
}

export async function addTask(
  item: Omit<TaskItem, 'id' | 'createdAt'>
): Promise<TaskItem> {
  const created: TaskItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await updateWorkspace((state) => {
    state.tasks.unshift(created);
  });
  return created;
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<TaskItem, 'status' | 'priority' | 'title' | 'description' | 'assignedTo'>>
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    const task = state.tasks.find((t) => t.id === id);
    if (task) {
      Object.assign(task, patch);
    }
  });
}

export async function deleteTask(id: string): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    state.tasks = state.tasks.filter((t) => t.id !== id);
  });
}

export async function toggleAlertResolved(id: string, resolved: boolean): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    const alert = state.alerts.find((a) => a.id === id);
    if (alert) {
      alert.resolved = resolved;
    }
  });
}

export async function deleteAlert(id: string): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    state.alerts = state.alerts.filter((a) => a.id !== id);
  });
}

export async function recordInteraction(
  entry: ConversationEntry,
  newMemories: Omit<MemoryItem, 'id' | 'createdAt'>[],
  newTasks: Omit<TaskItem, 'id' | 'createdAt'>[],
  newAlerts: Omit<AlertItem, 'id' | 'createdAt' | 'resolved'>[],
  emotion: DetectedEmotion
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    const now = new Date().toISOString();
    state.profile.currentEmotion = emotion;
    state.profile.totalInteractions += 1;

    for (const m of newMemories) {
      const duplicate = state.memories.some(
        (existing) => existing.title.toLowerCase() === m.title.toLowerCase()
      );
      if (!duplicate) {
        state.memories.unshift({
          ...m,
          id: crypto.randomUUID(),
          createdAt: now,
        });
      }
    }

    for (const t of newTasks) {
      const duplicate = state.tasks.some(
        (existing) => existing.title.toLowerCase() === t.title.toLowerCase() && existing.status !== 'concluida'
      );
      if (!duplicate) {
        state.tasks.unshift({
          ...t,
          id: crypto.randomUUID(),
          createdAt: now,
        });
      }
    }

    for (const a of newAlerts) {
      const duplicate = state.alerts.some(
        (existing) => existing.title.toLowerCase() === a.title.toLowerCase() && !existing.resolved
      );
      if (!duplicate) {
        state.alerts.unshift({
          ...a,
          id: crypto.randomUUID(),
          resolved: false,
          createdAt: now,
        });
      }
    }

    state.conversations.push(entry);
    if (state.conversations.length > 40) {
      state.conversations = state.conversations.slice(-40);
    }

    if (!Array.isArray(state.telemetryLog)) {
      state.telemetryLog = [];
    }
    state.telemetryLog.push(conversationToTelemetry(entry));
    if (state.telemetryLog.length > 120) {
      state.telemetryLog = state.telemetryLog.slice(-120);
    }
  });
}

export async function setTurnFeedback(
  entryId: string,
  speaker: AssistantId,
  feedback: TurnFeedback | null
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    const conv = state.conversations.find((c) => c.id === entryId);
    if (conv) {
      const turn = conv.responses.find((r) => r.speaker === speaker);
      if (turn) {
        if (feedback) {
          turn.feedback = feedback;
        } else {
          delete turn.feedback;
        }
      }
    }
    if (Array.isArray(state.telemetryLog)) {
      const logItem = state.telemetryLog.find((t) => t.id === entryId);
      if (logItem) {
        const turnLog = logItem.turns.find((t) => t.speaker === speaker);
        if (turnLog) {
          if (feedback) {
            turnLog.feedback = feedback;
          } else {
            delete turnLog.feedback;
          }
        }
      }
    }
  });
}

export async function clearConversations(): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    state.conversations = [];
  });
}
