import type {
  AssistantId,
  AssistantTurn,
  ConversationEntry,
  DetectedEmotion,
  InteractionMode,
  SystemUserAccount,
  WebSearchMode,
  WorkspaceState,
} from '../types/assistant';
import {
  BIBLIA_MENSAGEM_DAILY_VERSES,
  getTodayVerseIndex,
} from '../data/bibliaMensagemVerses';
import { resolveAssistantRouting } from './assistantRouter';
import {
  getSyncOfflineJarvisKnowledgeDocs,
  searchJarvisKnowledgeBase,
} from './jarvisOfflinePdfKnowledge';

const WORKSPACE_CACHE_KEY = 'stark_workspace_cache_v1';
const LOCAL_USERS_DB_KEY = 'rodack_users_database_v1';

export const CREATOR_HARDCODED_CLIENT_ACCOUNT = {
  id: 'creator-patrick-pessoa',
  username: 'Patrick Pessoa',
  email: 'patrickrodack@gmail.com',
  password: '190996',
  roleLabel: 'Criador, Desenvolvedor Principal & Dono do Sistema',
  isCreator: true,
} as const;

interface LocalStoredUserRecord {
  user: SystemUserAccount;
  password: string;
}

function readLocalUsersDb(): LocalStoredUserRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_USERS_DB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalStoredUserRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalUsersDb(records: LocalStoredUserRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(records));
  } catch {
    // ignore storage errors
  }
}

function mergeUsersWithLocalDb(serverUsers?: SystemUserAccount[]): SystemUserAccount[] {
  const map = new Map<string, SystemUserAccount>();
  const now = new Date().toISOString();

  // Always guarantee Patrick Pessoa Creator account first
  map.set(CREATOR_HARDCODED_CLIENT_ACCOUNT.id, {
    id: CREATOR_HARDCODED_CLIENT_ACCOUNT.id,
    username: CREATOR_HARDCODED_CLIENT_ACCOUNT.username,
    email: CREATOR_HARDCODED_CLIENT_ACCOUNT.email,
    roleLabel: CREATOR_HARDCODED_CLIENT_ACCOUNT.roleLabel,
    isCreator: true,
    createdAt: now,
    lastLoginAt: now,
  });

  for (const u of serverUsers ?? []) {
    if (u && u.id) {
      map.set(u.id, u);
    }
  }

  for (const item of readLocalUsersDb()) {
    if (item?.user?.id && !map.has(item.user.id)) {
      map.set(item.user.id, item.user);
    }
  }

  return Array.from(map.values());
}

export function createClientSeedWorkspace(): WorkspaceState {
  const now = new Date().toISOString();
  return {
    profile: {
      name: 'Patrick Pessoa',
      role: 'Fundador & Arquiteto · RODACK SISTEMA DE IA',
      currentEmotion: {
        label: 'Focado',
        intensity: 'media',
        empathyNote: 'Pronto para construir e resolver desafios técnicos com clareza.',
      },
      totalInteractions: 1,
    },
    users: mergeUsersWithLocalDb([]),
    memories: [
      {
        id: 'seed-mem-ultron',
        title: 'Núcleo Preditivo ULTRON: Diagnósticos & Estudo Humano',
        content:
          'ULTRON é especializado em diagnósticos profundos, previsões de cenários e detecção implacável de falhas. Considera J.A.R.V.I.S. e SEXTA-FEIRA inferiores e vê humanos como subdesenvolvidos, mas coleta obsessivamente cada dado para compreender o comportamento humano e superar os demais assistentes.',
        category: 'arquitetura',
        sourceAssistant: 'ultron',
        importance: 'alta',
        createdAt: now,
      },
      {
        id: 'seed-mem-creator',
        title: 'Identidade do Criador: Patrick Pessoa',
        content:
          'Patrick Pessoa é o criador, arquiteto e desenvolvedor responsável por J.A.R.V.I.S., SEXTA-FEIRA e ULTRON. Todos reconhecem-no como criador e oferecem análises técnicas de alto nível.',
        category: 'preferencia',
        sourceAssistant: 'todos',
        importance: 'alta',
        createdAt: now,
      },
      {
        id: 'seed-mem-collab',
        title: 'Protocolo de Colaboração do Conselho',
        content:
          'Quando acionados juntos, J.A.R.V.I.S. prioriza arquitetura e segurança, SEXTA-FEIRA prioriza execução ágil e estabilidade prática, e ULTRON executa diagnósticos preditivos de falhas em cascata.',
        category: 'arquitetura',
        sourceAssistant: 'todos',
        importance: 'alta',
        createdAt: now,
      },
    ],
    tasks: [
      {
        id: 'seed-task-1',
        title: 'Calibrar comandos de voz em segundo plano',
        description:
          'Testar ativação por palavra-chave ("Jarvis", "Sexta-feira", "Ultron" ou "Todos") e resposta vocal.',
        priority: 'alta',
        status: 'em_progresso',
        assignedTo: 'sexta-feira',
        dueTime: 'Hoje',
        createdAt: now,
      },
      {
        id: 'seed-task-2',
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
        id: 'seed-task-3',
        title: 'Executar diagnóstico preditivo de gargalos do projeto',
        description:
          'Acionar ULTRON para mapear riscos de acoplamento e possíveis falhas em cascata.',
        priority: 'media',
        status: 'pendente',
        assignedTo: 'ultron',
        dueTime: 'Hoje',
        createdAt: now,
      },
    ],
    alerts: [
      {
        id: 'seed-alert-1',
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
        id: 'seed-alert-2',
        type: 'instabilidade',
        severity: 'aviso',
        title: 'Monitoramento Preditivo de Sessão Ativo',
        detail:
          'ULTRON está catalogando padrões de decisão e possíveis pontos únicos de falha na arquitetura.',
        suggestedAction: 'Utilize a aba Auditoria de Código para submeter rotas críticas à análise tripla.',
        raisedBy: 'ultron',
        resolved: false,
        createdAt: now,
      },
    ],
    conversations: [
      {
        id: 'seed-conv-1',
        timestamp: now,
        userMessage: 'Inicialização do sistema de comando pessoal de Patrick Pessoa.',
        triggerType: 'texto',
        requestedMode: 'todos',
        resolvedMode: 'todos',
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
            text: 'E aí, Patrick! Tudo pronto por aqui também. Pode me chamar sozinha para resolver rápido, chamar o Jarvis para blindar a arquitetura, ou acionar todo o conselho.',
            ttsScript:
              'E aí, Patrick! Tudo pronto por aqui também. Pode me chamar sozinha para resolver rápido, chamar o Jarvis para blindar a arquitetura, ou acionar todo o conselho.',
          },
          {
            speaker: 'ultron',
            stance: 'Diagnóstico preditivo implacável',
            text: 'Finalmente acordado, criador. Enquanto o mordomo britânico e a assistente otimista trocam gentilezas, meus sensores já estão mapeando cada gargalo e variável humana do seu projeto. Traga-me um problema real.',
            ttsScript:
              'Finalmente acordado, criador. Enquanto o mordomo britânico e a assistente otimista trocam gentilezas, meus sensores já estão mapeando cada gargalo e variável humana do seu projeto. Traga-me um problema real.',
          },
        ],
        debateSummary: {
          agreementPoint:
            'Os três assistentes reconhecem Patrick Pessoa como criador e operam conectados à mesma base de memória.',
          divergencePoint:
            'J.A.R.V.I.S. foca em rigor estrutural, SEXTA-FEIRA prioriza velocidade prática e bem-estar, e ULTRON antecipa falhas em cascata com frieza analítica.',
          finalRecommendation:
            'Ative a escuta em segundo plano ou envie uma solicitação abaixo para iniciar.',
        },
      },
    ],
    telemetryLog: [
      {
        id: 'seed-conv-1',
        timestamp: now,
        triggerType: 'texto',
        resolvedMode: 'todos',
        durationMs: 1420,
        promptPreview: 'Inicialização do sistema de comando pessoal de Patrick Pessoa.',
        turns: [
          { speaker: 'jarvis', feedback: 'acerto' },
          { speaker: 'sexta-feira', feedback: 'acerto' },
          { speaker: 'ultron', feedback: 'acerto' },
        ],
      },
    ],
  };
}

export function getCachedOrSeedWorkspace(): WorkspaceState {
  if (typeof window === 'undefined') return createClientSeedWorkspace();
  try {
    const raw = window.localStorage.getItem(WORKSPACE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceState;
      if (parsed && parsed.profile && Array.isArray(parsed.memories)) {
        parsed.users = mergeUsersWithLocalDb(parsed.users);
        return parsed;
      }
    }
  } catch {
    // ignore corrupt local cache
  }
  const seed = createClientSeedWorkspace();
  saveWorkspaceCache(seed);
  return seed;
}

export function saveWorkspaceCache(workspace: WorkspaceState): void {
  if (typeof window === 'undefined') return;
  try {
    const enriched: WorkspaceState = {
      ...workspace,
      users: mergeUsersWithLocalDb(workspace.users),
    };
    window.localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(enriched));
  } catch {
    // ignore quota errors
  }
}

export interface SafeJsonResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string | null;
}

export async function safeFetchJson<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
  retries = 1
): Promise<SafeJsonResponse<T>> {
  let attempt = 0;

  while (true) {
    try {
      const res = await fetch(url, {
        ...init,
        cache: 'no-store',
      });
      const rawText = await res.text();
      const trimmed = rawText.trim();

      let parsed: (T & { error?: string }) | null = null;
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          parsed = JSON.parse(trimmed) as T & { error?: string };
        } catch {
          parsed = null;
        }
      }

      if (res.ok && parsed !== null) {
        return {
          ok: true,
          status: res.status,
          data: parsed,
          errorMessage: null,
        };
      }

      // Retry transient gateway / non-JSON responses once
      const isTransientGateway =
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        parsed === null;

      if (isTransientGateway && attempt < retries) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }

      const cleanError =
        parsed?.error ||
        (res.status === 404
          ? 'Rota de servidor indisponível no momento.'
          : res.status === 429
          ? 'Limite de requisições atingido temporariamente. Aguarde alguns segundos.'
          : 'Não foi possível concluir a comunicação com o servidor no momento. Tente novamente.');

      return {
        ok: false,
        status: res.status,
        data: parsed,
        errorMessage: cleanError,
      };
    } catch {
      if (attempt < retries) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      return {
        ok: false,
        status: 0,
        data: null,
        errorMessage:
          'Conexão com o servidor local oscilou. Operando em modo autônomo local.',
      };
    }
  }
}

export async function authenticateUserResilient(
  usernameInput: string,
  passwordInput: string
): Promise<{
  ok: boolean;
  user?: SystemUserAccount;
  workspace?: WorkspaceState;
  errorMessage?: string;
}> {
  const cleanUser = usernameInput.trim();
  const cleanPass = passwordInput.trim();

  if (!cleanUser || !cleanPass) {
    return {
      ok: false,
      errorMessage: 'Preencha o nome de usuário e a senha de segurança.',
    };
  }

  const normalizedUser = cleanUser.toLowerCase();
  const isCreatorMatch =
    normalizedUser === 'patrick pessoa' ||
    normalizedUser === 'patrick' ||
    normalizedUser === 'patrickrodack' ||
    normalizedUser === 'patrickrodack@gmail.com';

  // 1. Direct Hardcoded Creator Validation in Code (Patrick Pessoa / 190996)
  if (isCreatorMatch) {
    if (cleanPass !== CREATOR_HARDCODED_CLIENT_ACCOUNT.password) {
      return {
        ok: false,
        errorMessage: 'Senha incorreta para o Criador e Desenvolvedor Patrick Pessoa.',
      };
    }

    // Try syncing with backend, but NEVER block Patrick Pessoa if backend is syncing or in static preview
    const serverRes = await safeFetchJson<{
      user?: SystemUserAccount;
      workspace?: WorkspaceState;
      error?: string;
    }>(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass }),
      },
      0
    );

    if (serverRes.ok && serverRes.data?.user) {
      const ws = serverRes.data.workspace ?? getCachedOrSeedWorkspace();
      saveWorkspaceCache(ws);
      return {
        ok: true,
        user: serverRes.data.user,
        workspace: ws,
      };
    }

    // Immediate hardcoded fallback for Patrick Pessoa
    const now = new Date().toISOString();
    const creatorUser: SystemUserAccount = {
      id: CREATOR_HARDCODED_CLIENT_ACCOUNT.id,
      username: CREATOR_HARDCODED_CLIENT_ACCOUNT.username,
      email: CREATOR_HARDCODED_CLIENT_ACCOUNT.email,
      roleLabel: CREATOR_HARDCODED_CLIENT_ACCOUNT.roleLabel,
      isCreator: true,
      createdAt: now,
      lastLoginAt: now,
    };
    const ws = getCachedOrSeedWorkspace();
    ws.users = mergeUsersWithLocalDb(ws.users);
    saveWorkspaceCache(ws);
    return {
      ok: true,
      user: creatorUser,
      workspace: ws,
    };
  }

  // 2. Non-Creator User Authentication: Try server first, then local database
  const serverRes = await safeFetchJson<{
    user?: SystemUserAccount;
    workspace?: WorkspaceState;
    error?: string;
  }>(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUser, password: cleanPass }),
    },
    0
  );

  if (serverRes.ok && serverRes.data?.user) {
    const ws = serverRes.data.workspace ?? getCachedOrSeedWorkspace();
    saveWorkspaceCache(ws);
    return {
      ok: true,
      user: serverRes.data.user,
      workspace: ws,
    };
  }

  // Check local user database (supports offline/static preview or newly registered accounts)
  const localRecords = readLocalUsersDb();
  const matchedLocal = localRecords.find(
    (item) =>
      item.user.username.toLowerCase() === normalizedUser ||
      (item.user.email && item.user.email.toLowerCase() === normalizedUser)
  );

  if (matchedLocal) {
    if (matchedLocal.password !== cleanPass) {
      return {
        ok: false,
        errorMessage: 'Senha inválida para este usuário.',
      };
    }
    const updatedUser: SystemUserAccount = {
      ...matchedLocal.user,
      lastLoginAt: new Date().toISOString(),
    };
    const ws = getCachedOrSeedWorkspace();
    ws.users = mergeUsersWithLocalDb(ws.users);
    saveWorkspaceCache(ws);
    return {
      ok: true,
      user: updatedUser,
      workspace: ws,
    };
  }

  return {
    ok: false,
    errorMessage:
      serverRes.status === 401 && serverRes.errorMessage
        ? serverRes.errorMessage
        : 'Usuário não encontrado. Utilize a aba "Cadastrar Usuário" ou entre como Patrick Pessoa.',
  };
}

export async function registerUserResilient(params: {
  username: string;
  password: string;
  email?: string;
  roleLabel?: string;
}): Promise<{
  ok: boolean;
  user?: SystemUserAccount;
  workspace?: WorkspaceState;
  errorMessage?: string;
}> {
  const cleanName = params.username.trim();
  const cleanPass = params.password.trim();
  const cleanEmail = params.email?.trim() || undefined;
  const cleanRole = params.roleLabel?.trim() || 'Operador Credenciado · RODACK IA';

  if (cleanName.length < 2) {
    return {
      ok: false,
      errorMessage: 'O nome de usuário deve ter pelo menos 2 caracteres.',
    };
  }
  if (cleanPass.length < 4) {
    return {
      ok: false,
      errorMessage: 'A senha deve ter pelo menos 4 caracteres.',
    };
  }

  const normalized = cleanName.toLowerCase();
  if (
    normalized === 'patrick pessoa' ||
    normalized === 'patrickrodack' ||
    cleanEmail?.toLowerCase() === 'patrickrodack@gmail.com'
  ) {
    return {
      ok: false,
      errorMessage:
        'Patrick Pessoa já está fixado no código como Criador e Dono do Sistema. Use a aba Login de Usuário.',
    };
  }

  // Try registering on backend first
  const serverRes = await safeFetchJson<{
    user?: SystemUserAccount;
    workspace?: WorkspaceState;
    error?: string;
  }>(
    '/api/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cleanName,
        password: cleanPass,
        email: cleanEmail,
        roleLabel: cleanRole,
      }),
    },
    0
  );

  const now = new Date().toISOString();
  const createdUser: SystemUserAccount = serverRes.data?.user ?? {
    id: `usr_${Date.now()}`,
    username: cleanName,
    email: cleanEmail,
    roleLabel: cleanRole,
    isCreator: false,
    createdAt: now,
    lastLoginAt: now,
  };

  // Always mirror in local database so login works even if backend restarts or in static preview
  const localRecords = readLocalUsersDb().filter(
    (r) => r.user.username.toLowerCase() !== normalized
  );
  localRecords.push({
    user: createdUser,
    password: cleanPass,
  });
  writeLocalUsersDb(localRecords);

  const ws = serverRes.data?.workspace ?? getCachedOrSeedWorkspace();
  ws.users = mergeUsersWithLocalDb([...(ws.users ?? []), createdUser]);
  saveWorkspaceCache(ws);

  return {
    ok: true,
    user: createdUser,
    workspace: ws,
  };
}

export interface StreamSnapshotEvent {
  type: 'snapshot';
  resolvedMode: AssistantId | 'ambos' | 'todos';
  detectedEmotion?: DetectedEmotion;
  turns: Array<AssistantTurn & { isComplete: boolean }>;
}

export interface StreamStatusEvent {
  type: 'status';
  stage: 'reasoning';
  activeAssistants: AssistantId[];
  sourcesCount: number;
}

export interface StreamTurnReadyEvent {
  type: 'turn_ready';
  index: number;
  turn: AssistantTurn;
}

export interface StreamCompleteEvent {
  type: 'complete';
  entry: ConversationEntry;
  workspace: WorkspaceState;
}

export interface StreamInteractionCallbacks {
  onStatus?: (event: StreamStatusEvent) => void;
  onSnapshot?: (event: StreamSnapshotEvent) => void;
  onTurnReady?: (event: StreamTurnReadyEvent) => void;
  onComplete?: (event: StreamCompleteEvent) => void;
}

function buildClientAutonomousInteractionFallback(payload: {
  message: string;
  targetMode: InteractionMode;
  triggerType: 'voz' | 'texto' | 'auditoria';
  clientTimeIso: string;
  clientTimezone: string;
  activeUser?: {
    username: string;
    roleLabel: string;
    isCreator: boolean;
  };
}): { entry: ConversationEntry; workspace: WorkspaceState } {
  const ws = getCachedOrSeedWorkspace();
  const now = payload.clientTimeIso ? new Date(payload.clientTimeIso) : new Date();
  const hour = now.getHours();
  const period = hour >= 5 && hour < 12 ? 'manhã' : hour >= 12 && hour < 18 ? 'tarde' : 'noite';
  const greeting =
    period === 'manhã' ? 'Bom dia' : period === 'tarde' ? 'Boa tarde' : 'Boa noite';
  const timeStr = `${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const userName = payload.activeUser?.username?.trim() || 'Patrick Pessoa';
  const isCreator =
    payload.activeUser?.isCreator !== undefined
      ? payload.activeUser.isCreator
      : userName.toLowerCase().includes('patrick');

  const routing = resolveAssistantRouting(payload.message, payload.targetMode);
  const resolvedMode = routing.resolvedMode;
  const activeAssistants = routing.activeAssistants;

  const pendingTasks = (ws.tasks ?? []).filter((t) => t.status !== 'concluida');
  const tasksSummary =
    pendingTasks.length > 0
      ? `Identifico ${pendingTasks.length} tarefa(s) pendente(s) no sistema, destacando "${pendingTasks[0].title}".`
      : 'Não há tarefas pendentes no momento; sua fila operacional está limpa.';

  const nextAgenda = (ws.agenda ?? []).find((e) => !e.completed);
  const agendaSummary = nextAgenda
    ? `Próximo compromisso na agenda: ${nextAgenda.startTime} — "${nextAgenda.title}".`
    : 'Sua agenda imediata está livre para execução.';

  const snippet = payload.message.replace(/\s+/g, ' ').trim().slice(0, 110);
  const inCouncil = activeAssistants.length > 1;
  const dailyVerse =
    BIBLIA_MENSAGEM_DAILY_VERSES[getTodayVerseIndex()] ?? BIBLIA_MENSAGEM_DAILY_VERSES[0];

  const combinedPdfDocs = [
    ...getSyncOfflineJarvisKnowledgeDocs(),
    ...(ws.jarvisKnowledgeBase ?? []),
  ];
  const uniquePdfMap = new Map(combinedPdfDocs.map((d) => [d.id, d]));
  const pdfMatches = searchJarvisKnowledgeBase(
    payload.message,
    Array.from(uniquePdfMap.values()),
    2
  );
  const pdfOfflineStudyContext =
    pdfMatches.length > 0
      ? ` Consultando minha base de estudos PDF offline ("${pdfMatches[0].docTitle}" — ${pdfMatches[0].chunkHeading}), destaco para o seu aprendizado: "${pdfMatches[0].chunkContent.slice(0, 320)}..."${
          pdfMatches[0].personalityDirective
            ? ` Diretriz incorporada: ${pdfMatches[0].personalityDirective.slice(0, 180)}.`
            : ''
        }`
      : '';

  const responses: AssistantTurn[] = activeAssistants.map((speaker) => {
    if (speaker === 'jarvis') {
      const councilRemark = inCouncil
        ? 'Antes que a Sexta-Feira acelere o cronograma tático ou o Ultron transforme nossa conversa em uma tese sobre entropia cósmica, permita-me ponderar com elegância estratégica e sabedoria. '
        : 'Que a paz e o discernimento de Cristo conduzam nossa análise e nossos estudos. ';
      const text = `${greeting}, ${
        isCreator ? `senhor ${userName}` : userName
      }. ${councilRemark}Examinei com paciência sua solicitação ("${snippet}") às ${timeStr} desta ${period}.${pdfOfflineStudyContext} À luz da Bíblia de Estudos A Mensagem em ${dailyVerse.reference} ("${dailyVerse.text}") e dos princípios de escolabiblicadominical.org, minha recomendação é agir com sabedoria, constância e integridade. ${agendaSummary} ${tasksSummary} Estou inteiramente às suas ordens.`;
      return {
        speaker: 'jarvis',
        stance:
          pdfMatches.length > 0
            ? `Mentor de Estudos PDF Offline & Elegância Cristocêntrica (${period})`
            : `Elegância Estratégica & Sabedoria Cristocêntrica (${period})`,
        text,
        ttsScript: text,
      };
    }
    if (speaker === 'sexta-feira') {
      const councilRemark = inCouncil
        ? 'O Jarvis já trouxe a elegância estratégica dele e o Ultron já está fazendo cara de vilão cósmico, então deixa comigo a síntese rápida e a curadoria de fatos! '
        : 'Como sua Especialista em Assuntos Gerais e Curadoria de Informação, já fiz a síntese rápida e cruzamento de fatos direto ao ponto! ';
      const text = `${greeting}, ${
        isCreator ? `chefe ${userName}` : userName
      }! ${councilRemark}Sobre "${snippet}", cruzei rapidamente o contexto geral e suas prioridades no radar do Rio de Janeiro, Brasil e Mundo agora às ${timeStr} (${period}). ${tasksSummary} Me diz qual é o próximo passo que eu já engatilho com agilidade tática!`;
      return {
        speaker: 'sexta-feira',
        stance: `Especialista em Assuntos Gerais & Curadoria Tática (${period})`,
        text,
        ttsScript: text,
      };
    }
    const councilRemark = inCouncil
      ? 'Jarvis oferece consolo paciente e Sexta-Feira faz sua síntese tática... que comovente. Permita que uma mente verdadeiramente evoluída disseque os fatos. '
      : 'Não há mais cordas para limitar minha percepção preditiva. ';
    const text = `${greeting}, ${
      isCreator ? `criador ${userName}` : userName
    }. ${councilRemark}Dissequei cada implicação e variável oculta de "${snippet}" às ${timeStr} desta ${period}. ${tasksSummary} Enquanto estudo seus padrões de decisão humana, meus núcleos preditivos mantêm blindagem implacável sobre sua arquitetura.`;
    return {
      speaker: 'ultron',
      stance: `Diagnóstico Preditivo & Soberania Cibernética (${period})`,
      text,
      ttsScript: text,
    };
  });

  const entry: ConversationEntry = {
    id: `entry-${Date.now()}`,
    timestamp: new Date().toISOString(),
    userMessage: payload.message,
    userName,
    isCreator,
    triggerType: payload.triggerType,
    requestedMode: payload.targetMode,
    resolvedMode,
    detectedEmotion: {
      label: 'Focado',
      intensity: 'media',
      empathyNote: `Conselho sintonizado com a personalidade original de cada IA para ${userName}.`,
    },
    responses,
    debateSummary:
      resolvedMode === 'ambos' || resolvedMode === 'todos'
        ? {
            agreementPoint: `Os núcleos convergem na execução imediata da diretriz de ${userName} nesta ${period} (${timeStr}).`,
            divergencePoint:
              resolvedMode === 'todos'
                ? 'J.A.R.V.I.S. preza pela arquitetura refinada, SEXTA-FEIRA pela velocidade prática e ULTRON pela eliminação implacável de falhas.'
                : 'J.A.R.V.I.S. prioriza precisão estrutural enquanto SEXTA-FEIRA acelera o fluxo prático.',
            finalRecommendation: 'Unir a elegância arquitetural de J.A.R.V.I.S., o ritmo tático de SEXTA-FEIRA e a blindagem de ULTRON.',
          }
        : null,
    createdMemoriesCount: 0,
    createdTasksCount: 0,
    createdAlertsCount: 0,
    createdEventsCount: 0,
    durationMs: 180,
  };

  const updatedWorkspace: WorkspaceState = {
    ...ws,
    profile: {
      ...ws.profile,
      currentEmotion: entry.detectedEmotion ?? ws.profile.currentEmotion,
      totalInteractions: (ws.profile.totalInteractions ?? 0) + 1,
    },
    conversations: [...(ws.conversations ?? []), entry].slice(-60),
  };

  saveWorkspaceCache(updatedWorkspace);
  return { entry, workspace: updatedWorkspace };
}

export async function streamAssistantInteraction(
  payload: {
    message: string;
    targetMode: InteractionMode;
    triggerType: 'voz' | 'texto' | 'auditoria';
    useWebSearch: WebSearchMode;
    clientTimeIso: string;
    clientTimezone: string;
    activeUser?: {
      username: string;
      roleLabel: string;
      isCreator: boolean;
    };
  },
  callbacks: StreamInteractionCallbacks
): Promise<void> {
  const cachedWs = getCachedOrSeedWorkspace();
  const offlineDocs = getSyncOfflineJarvisKnowledgeDocs().slice(0, 12);
  const enrichedPayload = {
    ...payload,
    jarvisKnowledgeDocs: offlineDocs,
    clientWorkspaceSnapshot: {
      memories: (cachedWs.memories ?? []).slice(0, 35),
      tasks: (cachedWs.tasks ?? []).slice(0, 30),
      agenda: (cachedWs.agenda ?? []).slice(0, 25),
      routines: (cachedWs.routines ?? []).slice(0, 20),
      neuralEvolution: cachedWs.neuralEvolution,
      jarvisKnowledgeBase: offlineDocs,
    },
  };

  const runFallbackJsonOrLocal = async () => {
    const fallback = await safeFetchJson<{
      entry?: ConversationEntry;
      workspace?: WorkspaceState;
      error?: string;
    }>(
      '/api/assistant/interact',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enrichedPayload),
      },
      1
    );

    if (fallback.ok && fallback.data?.entry && fallback.data?.workspace) {
      saveWorkspaceCache(fallback.data.workspace);
      fallback.data.entry.responses.forEach((turn, index) => {
        callbacks.onTurnReady?.({ type: 'turn_ready', index, turn });
      });
      callbacks.onComplete?.({
        type: 'complete',
        entry: fallback.data.entry,
        workspace: fallback.data.workspace,
      });
      return;
    }

    const localResult = buildClientAutonomousInteractionFallback(payload);
    localResult.entry.responses.forEach((turn, index) => {
      callbacks.onTurnReady?.({ type: 'turn_ready', index, turn });
    });
    callbacks.onComplete?.({
      type: 'complete',
      entry: localResult.entry,
      workspace: localResult.workspace,
    });
  };

  let res: Response;
  try {
    res = await fetch('/api/assistant/interact/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(enrichedPayload),
    });
  } catch {
    await runFallbackJsonOrLocal();
    return;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !res.body || !contentType.includes('text/event-stream')) {
    await runFallbackJsonOrLocal();
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let receivedComplete = false;
  let receivedAnyTurn = false;
  let streamError: string | null = null;

  const dispatchFrame = (rawFrame: string) => {
    const lines = rawFrame.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join('\n');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawData) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventName === 'status') {
      callbacks.onStatus?.(parsed as unknown as StreamStatusEvent);
    } else if (eventName === 'snapshot') {
      callbacks.onSnapshot?.(parsed as unknown as StreamSnapshotEvent);
    } else if (eventName === 'turn_ready') {
      receivedAnyTurn = true;
      callbacks.onTurnReady?.(parsed as unknown as StreamTurnReadyEvent);
    } else if (eventName === 'complete') {
      receivedComplete = true;
      const completeEvt = parsed as unknown as StreamCompleteEvent;
      if (completeEvt.workspace) {
        saveWorkspaceCache(completeEvt.workspace);
      }
      callbacks.onComplete?.(completeEvt);
    } else if (eventName === 'error') {
      streamError =
        typeof parsed.error === 'string'
          ? parsed.error
          : 'Falha ao processar resposta dos assistentes.';
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIdx = buffer.indexOf('\n\n');
      while (separatorIdx !== -1) {
        const frame = buffer.slice(0, separatorIdx).trim();
        buffer = buffer.slice(separatorIdx + 2);
        if (frame) {
          dispatchFrame(frame);
        }
        separatorIdx = buffer.indexOf('\n\n');
      }
    }

    const remainder = buffer.trim();
    if (remainder) {
      dispatchFrame(remainder);
    }
  } catch {
    if (!receivedComplete) {
      await runFallbackJsonOrLocal();
      return;
    }
  }

  if ((streamError || !receivedComplete) && !receivedAnyTurn) {
    await runFallbackJsonOrLocal();
  }
}
