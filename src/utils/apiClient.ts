import type { WorkspaceState } from '../types/assistant';

const WORKSPACE_CACHE_KEY = 'stark_workspace_cache_v1';

export function createClientSeedWorkspace(): WorkspaceState {
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
    window.localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(workspace));
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
      const res = await fetch(url, init);
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
        await new Promise((r) => setTimeout(r, 550 * attempt));
        continue;
      }

      const cleanError =
        parsed?.error ||
        (res.status === 404
          ? 'O serviço de backend está sincronizando. Tente novamente em alguns instantes.'
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
        await new Promise((r) => setTimeout(r, 550 * attempt));
        continue;
      }
      return {
        ok: false,
        status: 0,
        data: null,
        errorMessage:
          'Conexão com o servidor local oscilou. Verifique sua conexão e tente novamente.',
      };
    }
  }
}
