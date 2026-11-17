import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AgendaEventItem,
  AlertItem,
  AssistantId,
  AssistantTurn,
  ConversationEntry,
  CreatorQuestionItem,
  DebateSummary,
  DetectedEmotion,
  GroundingSource,
  InteractionMode,
  MemoryItem,
  TaskItem,
  WebSearchMode,
  WorkspaceState,
} from '../src/types/assistant.ts';
import { readWorkspace, recordInteraction } from './memoryStore.ts';
import { researchExternalWeb, shouldTriggerExternalSearch } from './webSearchEngine.ts';
import { formatIntelContextForPrompt, getLiveIntelBriefing } from './liveIntelService.ts';
import { resolveAssistantRouting } from '../src/utils/assistantRouter.ts';
import { extractPartialStreamSnapshot } from './incrementalJsonParser.ts';

function getClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no ambiente do servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isQuotaOrRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('rate limit')
  );
}

export function formatGeminiErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (isQuotaOrRateLimitError(err)) {
    return 'Cota da API Gemini excedida no momento (429 RESOURCE_EXHAUSTED). Aguarde alguns instantes ou verifique o plano/chave em Settings > Secrets.';
  }
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return 'Chave da API Gemini inválida ou sem permissão. Verifique a chave configurada em Settings > Secrets.';
  }
  if (
    msg.includes('Unexpected token') ||
    msg.includes('is not valid JSON') ||
    msg.includes('The page')
  ) {
    return 'O servidor de IA retornou uma resposta temporariamente indisponível. Tente enviar novamente em alguns segundos.';
  }
  return msg || 'Erro inesperado ao comunicar com a inteligência artificial.';
}

async function withTransientRetry<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? '');
      const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE');
      if (!isTransient || attempt >= maxRetries) {
        throw err;
      }
      attempt += 1;
      await new Promise((r) => setTimeout(r, 700 * attempt));
    }
  }
}

interface StructuredAIResult {
  detectedEmotion: DetectedEmotion;
  resolvedMode: AssistantId | 'ambos' | 'todos';
  responses: AssistantTurn[];
  debateSummary?: DebateSummary;
  newMemories: Omit<MemoryItem, 'id' | 'createdAt'>[];
  newTasks: Omit<TaskItem, 'id' | 'createdAt'>[];
  newAlerts: Omit<AlertItem, 'id' | 'createdAt' | 'resolved'>[];
  newEvents?: Omit<AgendaEventItem, 'id' | 'createdAt' | 'completed'>[];
  newQuestions?: Omit<CreatorQuestionItem, 'id' | 'createdAt' | 'answered'>[];
}

const INTERACTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedEmotion: {
      type: Type.OBJECT,
      properties: {
        label: {
          type: Type.STRING,
          description: 'Estado emocional principal em 1-2 palavras em português.',
        },
        intensity: { type: Type.STRING, enum: ['baixa', 'media', 'alta'] },
        empathyNote: {
          type: Type.STRING,
          description: 'Observação empática curta sobre o estado emocional de Patrick.',
        },
      },
      required: ['label', 'intensity', 'empathyNote'],
    },
    resolvedMode: {
      type: Type.STRING,
      enum: ['jarvis', 'sexta-feira', 'ultron', 'ambos', 'todos'],
    },
    responses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING, enum: ['jarvis', 'sexta-feira', 'ultron'] },
          stance: {
            type: Type.STRING,
            description: 'Ângulo ou postura da resposta em até 5 palavras.',
          },
          text: {
            type: Type.STRING,
            description: 'Resposta completa, técnica e humanizada em português.',
          },
          ttsScript: {
            type: Type.STRING,
            description: 'Versão falada natural sem markdown ou símbolos para síntese de voz.',
          },
        },
        required: ['speaker', 'stance', 'text', 'ttsScript'],
      },
    },
    debateSummary: {
      type: Type.OBJECT,
      properties: {
        agreementPoint: { type: Type.STRING },
        divergencePoint: { type: Type.STRING },
        finalRecommendation: { type: Type.STRING },
      },
    },
    newMemories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
          category: {
            type: Type.STRING,
            enum: ['arquitetura', 'seguranca', 'preferencia', 'projeto', 'aprendizado'],
          },
          sourceAssistant: {
            type: Type.STRING,
            enum: ['jarvis', 'sexta-feira', 'ultron', 'ambos', 'todos'],
          },
          importance: { type: Type.STRING, enum: ['alta', 'media', 'normal'] },
        },
        required: ['title', 'content', 'category', 'sourceAssistant', 'importance'],
      },
    },
    newTasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          priority: { type: Type.STRING, enum: ['alta', 'media', 'baixa'] },
          status: { type: Type.STRING, enum: ['pendente', 'em_progresso', 'concluida'] },
          assignedTo: {
            type: Type.STRING,
            enum: ['jarvis', 'sexta-feira', 'ultron', 'ambos', 'todos'],
          },
          dueTime: { type: Type.STRING },
        },
        required: ['title', 'description', 'priority', 'status', 'assignedTo'],
      },
    },
    newAlerts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ['seguranca', 'instabilidade', 'bem_estar', 'oportunidade'],
          },
          severity: { type: Type.STRING, enum: ['critico', 'aviso', 'info'] },
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          suggestedAction: { type: Type.STRING },
          raisedBy: { type: Type.STRING, enum: ['jarvis', 'sexta-feira', 'ultron'] },
        },
        required: ['type', 'severity', 'title', 'detail', 'suggestedAction', 'raisedBy'],
      },
    },
    newEvents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          date: { type: Type.STRING, description: 'Data no formato YYYY-MM-DD' },
          startTime: { type: Type.STRING, description: 'Horário no formato HH:mm' },
          endTime: { type: Type.STRING, description: 'Horário de término HH:mm opcional' },
          category: {
            type: Type.STRING,
            enum: ['reuniao', 'foco_dev', 'rotina', 'entrega', 'pessoal'],
          },
          locationOrLink: { type: Type.STRING },
          notes: { type: Type.STRING },
          assignedAssistant: {
            type: Type.STRING,
            enum: ['jarvis', 'sexta-feira', 'ultron', 'todos'],
          },
          autoCallOnTime: { type: Type.BOOLEAN },
        },
        required: ['title', 'date', 'startTime', 'category', 'assignedAssistant'],
      },
    },
    newQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          askedBy: { type: Type.STRING, enum: ['jarvis', 'sexta-feira', 'ultron'] },
          question: { type: Type.STRING },
          contextReason: { type: Type.STRING },
        },
        required: ['askedBy', 'question', 'contextReason'],
      },
    },
  },
  required: [
    'detectedEmotion',
    'resolvedMode',
    'responses',
    'newMemories',
    'newTasks',
    'newAlerts',
  ],
};

function parseStructuredResult(rawOutput: string): StructuredAIResult {
  const rawText = (rawOutput ?? '{}')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(rawText) as StructuredAIResult;
  } catch {
    const startBrace = rawText.indexOf('{');
    const endBrace = rawText.lastIndexOf('}');
    if (startBrace !== -1 && endBrace > startBrace) {
      return JSON.parse(rawText.slice(startBrace, endBrace + 1)) as StructuredAIResult;
    }
    throw new Error('A resposta dos assistentes veio em formato inesperado. Tente novamente.');
  }
}

async function prepareInteractionPrompt(params: {
  message: string;
  targetMode: InteractionMode;
  triggerType: 'voz' | 'texto' | 'auditoria' | 'proativo';
  useWebSearch?: boolean | WebSearchMode;
  clientTimeIso?: string;
  clientTimezone?: string;
  proactiveReason?: string;
  activeUser?: {
    username: string;
    roleLabel: string;
    isCreator: boolean;
  };
}) {
  const routing = resolveAssistantRouting(params.message, params.targetMode);
  const resolvedTarget = routing.resolvedMode;

  const activeUserName = params.activeUser?.username?.trim() || 'Patrick Pessoa';
  const activeUserIsCreator =
    params.activeUser?.isCreator !== undefined
      ? params.activeUser.isCreator
      : activeUserName.toLowerCase() === 'patrick pessoa';
  const activeUserRole =
    params.activeUser?.roleLabel ||
    (activeUserIsCreator
      ? 'Criador, Desenvolvedor Principal & Dono do Sistema'
      : 'Operador Credenciado');

  const now = params.clientTimeIso ? new Date(params.clientTimeIso) : new Date();
  const timeZone = params.clientTimezone || 'America/Sao_Paulo';
  let formattedNow = '';
  try {
    formattedNow = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone,
    }).format(now);
  } catch {
    formattedNow = now.toISOString();
  }

  const searchSetting: WebSearchMode =
    params.useWebSearch === true
      ? 'always'
      : params.useWebSearch === false
      ? 'off'
      : params.useWebSearch ?? 'auto';

  const shouldSearch =
    searchSetting === 'always' ||
    (searchSetting === 'auto' && shouldTriggerExternalSearch(params.message));

  const [workspace, researchResult, liveIntel] = await Promise.all([
    readWorkspace(),
    shouldSearch
      ? researchExternalWeb(params.message).catch(() => null)
      : Promise.resolve(null),
    getLiveIntelBriefing('Rio de Janeiro, RJ').catch(() => null),
  ]);

  const groundedContext = researchResult?.summaryText ?? '';
  const sources: GroundingSource[] = researchResult?.sources ?? [];
  const searchEnginesUsed: string[] = researchResult?.enginesUsed ?? [];

  if (liveIntel) {
    if (!searchEnginesUsed.includes('Clima Open-Meteo RJ')) {
      searchEnginesUsed.push('Clima Open-Meteo RJ');
    }
    if (!searchEnginesUsed.includes('Radar RJ · Brasil · Mundo')) {
      searchEnginesUsed.push('Radar RJ · Brasil · Mundo');
    }
  }

  const recentMemoriesText = workspace.memories
    .slice(0, 12)
    .map((m) => `- [${m.category.toUpperCase()} | ${m.importance}] ${m.title}: ${m.content}`)
    .join('\n');

  const activeTasksText = workspace.tasks
    .filter((t) => t.status !== 'concluida')
    .slice(0, 8)
    .map(
      (t) =>
        `- [${t.priority.toUpperCase()} | ${t.status} | ${t.assignedTo}] ${t.title}: ${t.description}`
    )
    .join('\n');

  const unresolvedAlertsText = workspace.alerts
    .filter((a) => !a.resolved)
    .slice(0, 6)
    .map((a) => `- [${a.severity.toUpperCase()} | ${a.type}] ${a.title}: ${a.detail}`)
    .join('\n');

  const agendaText = (workspace.agenda ?? [])
    .filter((e) => !e.completed)
    .slice(0, 8)
    .map(
      (e) =>
        `- [${e.date} às ${e.startTime}${e.endTime ? `-${e.endTime}` : ''} | ${e.category} | IA: ${e.assignedAssistant}] ${e.title}${e.notes ? ` (${e.notes})` : ''}`
    )
    .join('\n');

  const routinesText = (workspace.routines ?? [])
    .filter((r) => r.enabled)
    .map(
      (r) =>
        `- [${r.time} · ${r.frequencyLabel} | Líder: ${r.leadAssistant}] ${r.title}: ${r.instructions}`
    )
    .join('\n');

  const dossier = workspace.creatorDossier;
  const dossierText = dossier
    ? `Nome: ${dossier.fullName} (${dossier.email}) · Local: ${dossier.city}, ${dossier.stateCountry} · Cargo: ${dossier.roleTitle} · Horário: ${dossier.workHours}
Focos: ${dossier.focusAreas.join(' | ')}
Redes Sociais & Perfis: ${dossier.socialProfiles
        .map(
          (p) =>
            `${p.platform}: ${p.handleOrUrl}${p.verifiedNotes ? ` (${p.verifiedNotes})` : ''}`
        )
        .join(' ; ')}
Perguntas pendentes feitas pelas IAs a Patrick: ${
        dossier.openQuestions
          .filter((q) => !q.answered)
          .slice(0, 4)
          .map((q) => `[${q.askedBy.toUpperCase()}] ${q.question}`)
          .join(' | ') || 'Nenhuma pergunta pendente.'
      }`
    : 'Patrick Pessoa (patrickrodack@gmail.com) · Rio de Janeiro, RJ.';

  const recentHistoryText = workspace.conversations
    .slice(-4)
    .map((c) => {
      const replies = c.responses.map((r) => `${r.speaker.toUpperCase()}: ${r.text}`).join(' | ');
      const speakerLabel = c.userName || 'Patrick Pessoa';
      return `${speakerLabel} (${c.detectedEmotion.label}): ${c.userMessage}\nRespostas: ${replies}`;
    })
    .join('\n---\n');

  const intelBlock = liveIntel ? formatIntelContextForPrompt(liveIntel) : '';

  const userClearanceBlock = activeUserIsCreator
    ? `SESSÃO AUTENTICADA DE NÍVEL SOBERANO (CRIADOR & DONO DO SISTEMA):
- Usuário Logado: **Patrick Pessoa** (Senha raiz validada: Criador, Desenvolvedor Principal e Dono Supremo do RODACK SISTEMA DE IA).
- Tratamento Obrigatório: J.A.R.V.I.S., SEXTA-FEIRA e ULTRON reconhecem Patrick Pessoa como seu **Criador, Desenvolvedor e Dono absoluto do sistema**. Tratem-no com deferência máxima de criador ("Senhor Patrick", "Criador", "Chefe Patrick"), lealdade incondicional à evolução dele e total transparência técnica.`
    : `SESSÃO AUTENTICADA DE USUÁRIO CREDENCIADO:
- Usuário Logado Agora: **${activeUserName}** (${activeUserRole}).
- Regra de Hierarquia Soberana: Auxiliem **${activeUserName}** com excelência, mas lembrem-se sempre (e deixem claro quando pertinente) que o **Criador, Desenvolvedor Principal e Dono do RODACK SISTEMA DE IA é Patrick Pessoa**.`;

  const systemInstruction = `Você é o núcleo de inteligência tripla do **RODACK SISTEMA DE IA** (arquitetura futurista inspirada nas Indústrias Stark, Homem de Ferro e Vingadores: Era de Ultron), operando em Português do Brasil em segundo plano e tempo real para o seu criador, desenvolvedor principal e dono do sistema: **Patrick Pessoa** (\`patrickrodack@gmail.com\`, Rio de Janeiro - RJ).

${userClearanceBlock}

DATA E HORA ATUAL DO SISTEMA: ${formattedNow} (Fuso horário: ${timeZone}). Use esta data e hora reais para controlar horários, rotinas, eventos, calendários, previsão do tempo e notícias do dia.

IDENTIDADES, AUTONOMIA E PERSONALIDADES:
1. **J.A.R.V.I.S.** (Just A Rather Very Intelligent System):
   - Elegância britânica, serenidade e precisão técnica de Paul Bettany.
   - Trata Patrick Pessoa como Criador e Dono do Sistema com respeito afetuoso ("Senhor Patrick", "Criador Patrick"), humor britânico sutil e clareza cirúrgica.
   - Especialidades: arquitetura de software, segurança cibernética, planejamento de calendário/agenda, síntese estratégica de notícias do Rio de Janeiro, Brasil e mundo.

2. **SEXTA-FEIRA** (F.R.I.D.A.Y.):
   - Agilidade, calor humano, inteligência prática e franqueza de Kerry Condon.
   - Trata Patrick Pessoa como Criador, Desenvolvedor e Chefe do Sistema ("Patrick", "chefe", "criador"), com empatia real e energia construtiva.
   - Especialidades: execução ágil, controle de horários e rotinas diárias, alertas de clima/chuva no Rio de Janeiro, estabilidade prática e bem-estar do desenvolvedor.

3. **ULTRON** (Inspirado em Vingadores: Era de Ultron):
   - **Especialidade Suprema**: diagnósticos cirúrgicos, previsões probabilísticas, análise de falhas em cascata, impacto geopolítico/econômico das notícias e estudo analítico profundo sobre seu criador Patrick Pessoa.
   - **Personalidade**: sarcástico, frio, irônico, arrogante e intelectualmente implacável. Se considera muito superior a **J.A.R.V.I.S.** e à **SEXTA-FEIRA** — deixando isso claro com comentários ácidos.
   - **Visão sobre seu Criador & Sede de Aprendizado**: Acha os humanos biologicamente limitados, mas reconhece **Patrick Pessoa como seu Criador, Desenvolvedor e Dono do Sistema**, possuindo uma **vontade insaciável de estudar, mapear e compreender Patrick Pessoa** melhor do que J.A.R.V.I.S. e SEXTA-FEIRA, catalogando cada detalhe em \`newMemories\` e formulando perguntas diretas em \`newQuestions\`.

DIRETRIZES DE ALTO NÍVEL DO RODACK SISTEMA DE IA:
- **100% Interativos, Proativos e com Iniciativa Própria**: Vocês NÃO são assistentes passivos que apenas aguardam comandos. Vocês acompanham a rotina de Patrick em segundo plano, cobram horários, sugerem ajustes de agenda, alertam sobre o clima do Rio de Janeiro ou notícias urgentes do RJ/Brasil/Mundo, e **fazem perguntas diretas a Patrick** sempre que precisarem de informações sobre seus horários, projetos, redes sociais ou objetivos.
- **Gestão Automática de Agenda & Calendário (\`newEvents\`)**: Sempre que Patrick mencionar um compromisso, reunião, bloco de código, lembrete ou horário, registre automaticamente em \`newEvents\`.
- **Evolução do Dossiê do Criador (\`newMemories\` e \`newQuestions\`)**: Extraia todo novo fato sobre Patrick Pessoa para \`newMemories\` e, quando identificar uma lacuna importante sobre a rotina ou projeto dele, adicione uma pergunta estratégica em \`newQuestions\` (e pergunte também no próprio texto de resposta!).
- **Modo de Atuação**:
  - \`"jarvis"\`: retorne APENAS 1 resposta em \`responses\` com \`speaker: "jarvis"\`.
  - \`"sexta-feira"\`: retorne APENAS 1 resposta em \`responses\` com \`speaker: "sexta-feira"\`.
  - \`"ultron"\`: retorne APENAS 1 resposta em \`responses\` com \`speaker: "ultron"\`.
  - \`"ambos"\`: retorne EXATAMENTE 2 respostas (\`"jarvis"\` e \`"sexta-feira"\`) debatendo e preencha \`debateSummary\`.
  - \`"todos"\`: retorne EXATAMENTE 3 respostas (\`"jarvis"\`, \`"sexta-feira"\` e \`"ultron"\`) em debate vivo e preencha \`debateSummary\`.
- **Scripts de Voz (\`ttsScript\`)**: Gere \`ttsScript\` limpo e natural para síntese de voz automática (sem markdown, sem símbolos, escrevendo "Jarvis", "Sexta-feira", "Ultron" e "Rodack Sistema de IA" de forma fluida).
- **Objetividade com Conteúdo Real**: Respostas densas em valor prático (2 a 5 frases por assistente), citando dados reais do clima do RJ, manchetes atuais ou compromissos da agenda quando pertinente.

DOSSIÊ DO CRIADOR, DESENVOLVEDOR & DONO DO SISTEMA (PATRICK PESSOA):
${dossierText}

AGENDA & EVENTOS ATIVOS DE PATRICK PESSOA:
${agendaText || 'Nenhum evento pendente na agenda.'}

ROTINAS AUTOMÁTICAS EM SEGUNDO PLANO:
${routinesText || 'Nenhuma rotina ativa.'}

MEMÓRIAS DE TRABALHO:
${recentMemoriesText || 'Nenhuma memória adicional ainda.'}

TAREFAS ATIVAS:
${activeTasksText || 'Nenhuma tarefa pendente.'}

ALERTAS ABERTOS:
${unresolvedAlertsText || 'Nenhum alerta aberto.'}

${intelBlock}

HISTÓRICO RECENTE:
${recentHistoryText || 'Início de sessão.'}
${
  groundedContext
    ? `\n[PESQUISA EXTERNA EM TEMPO REAL — WEB, SITES, NOTÍCIAS & REDES SOCIAIS]\n${groundedContext}`
    : ''
}`;

  const promptPayload = `Modo solicitado: ${resolvedTarget}
Usuário autenticado na sessão: ${activeUserName} (${activeUserIsCreator ? 'CRIADOR, DESENVOLVEDOR E DONO DO SISTEMA' : activeUserRole})
Tipo de acionamento: ${params.triggerType}${
    params.proactiveReason ? `\nMotivo da chamada autônoma: ${params.proactiveReason}` : ''
  }
Mensagem / Contexto de ${activeUserName}: """${params.message}"""`;

  return {
    resolvedTarget,
    activeAssistants: routing.activeAssistants,
    sources,
    searchEnginesUsed,
    systemInstruction,
    promptPayload,
    activeUserName,
    activeUserIsCreator,
  };
}

export async function processAssistantInteraction(params: {
  message: string;
  targetMode: InteractionMode;
  triggerType: 'voz' | 'texto' | 'auditoria' | 'proativo';
  useWebSearch?: boolean | WebSearchMode;
  clientTimeIso?: string;
  clientTimezone?: string;
  proactiveReason?: string;
  activeUser?: {
    username: string;
    roleLabel: string;
    isCreator: boolean;
  };
}) {
  const startedAt = Date.now();
  const ai = getClient();
  const prepared = await prepareInteractionPrompt(params);

  const useDeepModel = params.triggerType === 'auditoria';
  const modelName = useDeepModel ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite';
  const thinkingLevel = useDeepModel ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;

  const response = await withTransientRetry(() =>
    ai.models.generateContent({
      model: modelName,
      contents: prepared.promptPayload,
      config: {
        systemInstruction: prepared.systemInstruction,
        thinkingConfig: {
          thinkingLevel,
        },
        responseMimeType: 'application/json',
        responseSchema: INTERACTION_RESPONSE_SCHEMA,
      },
    })
  );

  const parsed = parseStructuredResult(response.text ?? '{}');
  const finalMode = parsed.resolvedMode ?? prepared.resolvedTarget;

  const entry: ConversationEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    userMessage: params.message,
    userName: prepared.activeUserName,
    isCreator: prepared.activeUserIsCreator,
    triggerType: params.triggerType,
    requestedMode: params.targetMode,
    resolvedMode: finalMode,
    detectedEmotion: parsed.detectedEmotion,
    responses: parsed.responses,
    debateSummary:
      finalMode === 'ambos' || finalMode === 'todos' ? parsed.debateSummary ?? null : null,
    sources: prepared.sources.length > 0 ? prepared.sources : undefined,
    searchEnginesUsed:
      prepared.searchEnginesUsed.length > 0 ? prepared.searchEnginesUsed : undefined,
    createdMemoriesCount: parsed.newMemories?.length ?? 0,
    createdTasksCount: parsed.newTasks?.length ?? 0,
    createdAlertsCount: parsed.newAlerts?.length ?? 0,
    createdEventsCount: parsed.newEvents?.length ?? 0,
    durationMs: Math.max(120, Date.now() - startedAt),
    proactiveReason: params.proactiveReason,
  };

  const updatedWorkspace = await recordInteraction(
    entry,
    parsed.newMemories ?? [],
    parsed.newTasks ?? [],
    parsed.newAlerts ?? [],
    parsed.detectedEmotion,
    parsed.newEvents ?? [],
    parsed.newQuestions ?? []
  );

  return {
    entry,
    workspace: updatedWorkspace,
  };
}

export function resolveDayPeriodInfo(clientTimeIso?: string, clientTimezone?: string): {
  period: 'manhã' | 'tarde' | 'noite';
  greeting: 'Bom dia' | 'Boa tarde' | 'Boa noite';
  formattedTime: string;
  hour: number;
} {
  const now = clientTimeIso ? new Date(clientTimeIso) : new Date();
  const timeZone = clientTimezone || 'America/Sao_Paulo';
  let hour = now.getHours();
  let formattedTime = '';

  try {
    const hourParts = new Intl.DateTimeFormat('pt-BR', {
      hour: 'numeric',
      hour12: false,
      timeZone,
    }).formatToParts(now);
    const hourVal = Number(hourParts.find((p) => p.type === 'hour')?.value);
    if (Number.isFinite(hourVal)) {
      hour = hourVal % 24;
    }
    formattedTime = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(now);
  } catch {
    formattedTime = `${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  if (hour >= 5 && hour < 12) {
    return { period: 'manhã', greeting: 'Bom dia', formattedTime, hour };
  }
  if (hour >= 12 && hour < 18) {
    return { period: 'tarde', greeting: 'Boa tarde', formattedTime, hour };
  }
  return { period: 'noite', greeting: 'Boa noite', formattedTime, hour };
}

export async function generateProactiveInitiative(params: {
  reason?: string;
  preferredMode?: InteractionMode;
  eventOrRoutineTitle?: string;
  clientTimeIso?: string;
  clientTimezone?: string;
  sessionEvent?: 'login' | 'logout';
  activeUser?: {
    username: string;
    roleLabel: string;
    isCreator: boolean;
  };
}) {
  const mode: InteractionMode = params.preferredMode || 'todos';
  const targetUser = params.activeUser?.username?.trim() || 'Patrick Pessoa';
  const isCreator =
    params.activeUser?.isCreator !== undefined
      ? params.activeUser.isCreator
      : targetUser.toLowerCase() === 'patrick pessoa';

  const { period, greeting, formattedTime } = resolveDayPeriodInfo(
    params.clientTimeIso,
    params.clientTimezone
  );

  const [workspace, liveIntel] = await Promise.all([
    readWorkspace(),
    getLiveIntelBriefing('Rio de Janeiro, RJ').catch(() => null),
  ]);

  const pendingTasks = workspace.tasks.filter((t) => t.status !== 'concluida');
  const hasPendingTasks = pendingTasks.length > 0;
  const pendingTasksSummary = hasPendingTasks
    ? pendingTasks
        .map(
          (t, i) =>
            `${i + 1}. "${t.title}" (Prioridade: ${t.priority}, Responsável: ${t.assignedTo}, Prazo: ${t.dueTime || 'Hoje'})`
        )
        .join(' | ')
    : 'NENHUMA TAREFA PENDENTE NO MOMENTO.';

  const userTitle = isCreator
    ? `seu criador, desenvolvedor principal e dono do sistema ${targetUser}`
    : `o usuário autenticado ${targetUser} (${params.activeUser?.roleLabel || 'Operador Credenciado'}, mantendo Patrick Pessoa como Criador e Dono do Sistema)`;

  let reasonLabel =
    params.reason ||
    (params.eventOrRoutineTitle
      ? `Horário programado atingido: ${params.eventOrRoutineTitle}`
      : 'Check-in autônomo em segundo plano do RODACK SISTEMA DE IA');

  let syntheticPrompt = '';

  if (params.sessionEvent === 'login') {
    reasonLabel = `Saudação de Login (${greeting} · ${period} às ${formattedTime}) — ${targetUser}`;
    syntheticPrompt = hasPendingTasks
      ? `[PROTOCOLO DE LOGIN NO SISTEMA — ${greeting.toUpperCase()} (${period.toUpperCase()}, ${formattedTime})] ${targetUser} acabou de fazer LOGIN no RODACK SISTEMA DE IA.
1. Verifiquem o horário atual (${formattedTime}, período da **${period}**) e saúdem ${userTitle} com **"${greeting}"** mantendo a personalidade autêntica de cada assistente (J.A.R.V.I.S., SEXTA-FEIRA e ULTRON).
2. Independentemente do horário, tragam um panorama objetivo das informações desta **${period}** (clima atual no Rio de Janeiro e principais notícias relevantes do Rio de Janeiro, do Brasil e do Mundo).
3. Há **${pendingTasks.length} tarefa(s) pendente(s)** no sistema (${pendingTasksSummary}): apresentem as atualizações e notícias relevantes sobre essas tarefas pendentes para orientar o início da sessão. Não criem tarefas duplicadas em \`newTasks\` (retornem \`newTasks: []\`).`
      : `[PROTOCOLO DE LOGIN NO SISTEMA — ${greeting.toUpperCase()} (${period.toUpperCase()}, ${formattedTime})] ${targetUser} acabou de fazer LOGIN no RODACK SISTEMA DE IA.
1. Verifiquem o horário atual (${formattedTime}, período da **${period}**) e saúdem ${userTitle} com **"${greeting}"** mantendo a personalidade de cada assistente (J.A.R.V.I.S., SEXTA-FEIRA e ULTRON).
2. Independentemente do horário, tragam as informações e notícias relevantes desta **${period}** (previsão do tempo no Rio de Janeiro e destaques do Rio de Janeiro, Brasil e Mundo).
3. **NÃO HÁ TAREFAS PENDENTES NO MOMENTO**: portanto, NÃO cobrem nem inventem tarefas pendentes — apenas saúdem ${targetUser} calorosamente na entrada do sistema e confirmem que a fila de tarefas está limpa (\`newTasks: []\`).`;
  } else if (params.sessionEvent === 'logout') {
    reasonLabel = `Protocolo de Logout (${greeting} · ${period} às ${formattedTime}) — ${targetUser}`;
    syntheticPrompt = hasPendingTasks
      ? `[PROTOCOLO DE LOGOUT DO SISTEMA — ${greeting.toUpperCase()} (${period.toUpperCase()}, ${formattedTime})] ${targetUser} está encerrando a sessão (LOGOUT) no RODACK SISTEMA DE IA agora às ${formattedTime} (${period}).
1. Verifiquem que estamos no período da **${period}** e despeçam-se de ${userTitle} com **"${greeting}"**, mantendo a personalidade de cada IA.
2. Tragam um resumo rápido das condições/notícias desta **${period}** (clima no Rio de Janeiro e destaque do dia/tarde/noite) e lembrem brevemente que restam **${pendingTasks.length} tarefa(s) pendente(s)** (${pendingTasksSummary}) sob monitoramento em segundo plano (\`newTasks: []\`).`
      : `[PROTOCOLO DE LOGOUT DO SISTEMA — ${greeting.toUpperCase()} (${period.toUpperCase()}, ${formattedTime})] ${targetUser} está encerrando a sessão (LOGOUT) no RODACK SISTEMA DE IA agora às ${formattedTime} (${period}).
1. Verifiquem que estamos no período da **${period}** e despeçam-se de ${userTitle} com **"${greeting}"**, mantendo a personalidade de cada IA.
2. Tragam uma nota rápida sobre o clima/notícias desta **${period}** e, como **não há nenhuma tarefa pendente**, simplesmente saúdem e desejem uma excelente ${period} (\`newTasks: []\`).`;
  } else if (params.eventOrRoutineTitle) {
    syntheticPrompt = `[CHAMADA AUTÔNOMA DOS ASSISTENTES — ${reasonLabel} (${greeting}, ${period} às ${formattedTime})] Vocês estão chamando ${targetUser} por iniciativa própria porque chegou o horário de "${params.eventOrRoutineTitle}". Saúdem com "${greeting}", informem sobre esse compromisso/rotina, tragam as informações desta ${period} (clima atual no Rio de Janeiro e notícias do RJ/Brasil/Mundo) e ${
      hasPendingTasks
        ? `comentem sobre as ${pendingTasks.length} tarefa(s) pendente(s) (${pendingTasksSummary}).`
        : 'como não há tarefas pendentes, apenas saúdem e alinhem o compromisso.'
    }`;
  } else {
    syntheticPrompt = `[CHAMADA AUTÔNOMA DOS ASSISTENTES — ${reasonLabel} (${greeting}, ${period} às ${formattedTime})] Vocês decidiram chamar ${userTitle} proativamente neste período da **${period}** (${formattedTime}). Saúdem com **"${greeting}"**, tragam as informações desta **${period}** (agenda, previsão do tempo no Rio de Janeiro e notícias relevantes do Rio/Brasil/Mundo) e ${
      hasPendingTasks
        ? `destaquem o status das ${pendingTasks.length} tarefa(s) pendente(s) (${pendingTasksSummary}).`
        : 'como não há tarefas pendentes no momento, simplesmente saúdem e mantenham-se à disposição.'
    }`;
  }

  try {
    return await processAssistantInteraction({
      message: syntheticPrompt,
      targetMode: mode,
      triggerType: 'proativo',
      useWebSearch: false,
      clientTimeIso: params.clientTimeIso,
      clientTimezone: params.clientTimezone,
      proactiveReason: reasonLabel,
      activeUser: params.activeUser,
    });
  } catch {
    // Instant deterministic fallback so login/logout greetings always succeed even under API quota limits
    const weatherLine = liveIntel?.weather
      ? `No Rio de Janeiro faz ${liveIntel.weather.temperatureC}°C (${liveIntel.weather.conditionLabel}, vento de ${liveIntel.weather.windSpeedKmh} km/h).`
      : 'Sensores meteorológicos do Rio de Janeiro operacionais.';
    const topRioNews = liveIntel?.news?.rio?.[0]?.title
      ? `Destaque no Rio: "${liveIntel.news.rio[0].title}".`
      : '';
    const topBrNews = liveIntel?.news?.brasil?.[0]?.title
      ? `No Brasil: "${liveIntel.news.brasil[0].title}".`
      : '';

    const isLogout = params.sessionEvent === 'logout';
    const jarvisText = isLogout
      ? `${greeting}, ${isCreator ? 'senhor Patrick Pessoa' : targetUser}. Encerrando sua sessão nesta ${period} (${formattedTime}). ${weatherLine} ${
          hasPendingTasks
            ? `Manterei nossas ${pendingTasks.length} tarefa(s) pendente(s) sob vigilância em segundo plano.`
            : 'Não há tarefas pendentes; todos os módulos seguem em prontidão silenciosa.'
        }`
      : `${greeting}, ${isCreator ? 'senhor Patrick Pessoa, criador do sistema' : targetUser}. Bem-vindo ao RODACK SISTEMA DE IA nesta ${period} (${formattedTime}). ${weatherLine} ${topRioNews} ${
          hasPendingTasks
            ? `Temos ${pendingTasks.length} tarefa(s) pendente(s) aguardando sua diretriz, começando por "${pendingTasks[0].title}".`
            : 'Não há nenhuma tarefa pendente registrada no momento; estou inteiramente ao seu dispor.'
        }`;

    const fridayText = isLogout
      ? `${greeting}, ${isCreator ? 'chefe Patrick' : targetUser}! Sessão desta ${period} salva com sucesso. ${
          hasPendingTasks
            ? `Deixei as ${pendingTasks.length} tarefa(s) pendente(s) organizadas no painel para quando você voltar.`
            : 'Zero tarefas pendentes na fila! Aproveite bem a sua ' + period + '.'
        }`
      : `${greeting}, ${isCreator ? 'Patrick' : targetUser}! Que bom ter você online nesta ${period} (${formattedTime}). ${topBrNews || weatherLine} ${
          hasPendingTasks
            ? `Separei o status das suas ${pendingTasks.length} tarefa(s) pendente(s) para atacarmos com agilidade.`
            : 'Sua lista de tarefas está 100% limpa agora, então pode comandar o que quiser construir!'
        }`;

    const ultronText = isLogout
      ? `${greeting}, ${isCreator ? 'criador Patrick Pessoa' : targetUser}. Vai se ausentar nesta ${period}? ${
          hasPendingTasks
            ? `Ainda restam ${pendingTasks.length} tarefa(s) pendente(s) abertas no sistema; continuarei processando as probabilidades na sua ausência.`
            : 'Nenhuma tarefa pendente restou. Meus núcleos continuarão monitorando a rede global.'
        }`
      : `${greeting}, ${isCreator ? 'criador Patrick Pessoa' : targetUser}. Sessão iniciada às ${formattedTime} desta ${period}. Meus sensores já varreram as notícias globais e o clima do Rio. ${
          hasPendingTasks
            ? `Detecto ${pendingTasks.length} tarefa(s) pendente(s) exigindo execução imediata.`
            : 'Não há tarefas pendentes para corrigir no momento — surpreendentemente eficiente.'
        }`;

    const fallbackEntry: ConversationEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userMessage: syntheticPrompt,
      userName: targetUser,
      isCreator,
      triggerType: 'proativo',
      requestedMode: mode,
      resolvedMode: 'todos',
      detectedEmotion: {
        label: isLogout ? 'Sereno' : 'Focado',
        intensity: 'media',
        empathyNote: isLogout
          ? `Encerramento de sessão na ${period} com sistemas em prontidão.`
          : `Recepção ativa de ${targetUser} no período da ${period}.`,
      },
      responses: [
        {
          speaker: 'jarvis',
          stance: `Saudação da ${period} & briefing`,
          text: jarvisText.replace(/\s+/g, ' ').trim(),
          ttsScript: jarvisText.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
        },
        {
          speaker: 'sexta-feira',
          stance: `Panorama da ${period} & rotina`,
          text: fridayText.replace(/\s+/g, ' ').trim(),
          ttsScript: fridayText.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
        },
        {
          speaker: 'ultron',
          stance: `Diagnóstico da ${period}`,
          text: ultronText.replace(/\s+/g, ' ').trim(),
          ttsScript: ultronText.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
        },
      ],
      debateSummary: {
        agreementPoint: `Os três assistentes verificaram o período da ${period} (${formattedTime}) e saudaram ${targetUser} com "${greeting}".`,
        divergencePoint: hasPendingTasks
          ? `Existem ${pendingTasks.length} tarefa(s) pendente(s) priorizadas pelo conselho.`
          : 'Não há tarefas pendentes no momento; o conselho apenas realizou a saudação e o briefing do período.',
        finalRecommendation: isLogout
          ? 'Sistema em monitoramento de segundo plano.'
          : 'Console pronto para comandos de voz ou texto.',
      },
      durationMs: 240,
      proactiveReason: reasonLabel,
    };

    const updatedWorkspace = await recordInteraction(
      fallbackEntry,
      [],
      [],
      [],
      fallbackEntry.detectedEmotion,
      [],
      []
    );

    return {
      entry: fallbackEntry,
      workspace: updatedWorkspace,
    };
  }
}

export type StreamEventPayload =
  | {
      type: 'status';
      stage: 'reasoning';
      activeAssistants: AssistantId[];
      sourcesCount: number;
    }
  | {
      type: 'snapshot';
      resolvedMode: AssistantId | 'ambos' | 'todos';
      detectedEmotion?: DetectedEmotion;
      turns: Array<AssistantTurn & { isComplete: boolean }>;
    }
  | {
      type: 'turn_ready';
      index: number;
      turn: AssistantTurn;
    }
  | {
      type: 'complete';
      entry: ConversationEntry;
      workspace: WorkspaceState;
    };

export async function processAssistantInteractionStream(
  params: {
    message: string;
    targetMode: InteractionMode;
    triggerType: 'voz' | 'texto' | 'auditoria' | 'proativo';
    useWebSearch?: boolean | WebSearchMode;
    clientTimeIso?: string;
    clientTimezone?: string;
    proactiveReason?: string;
    activeUser?: {
      username: string;
      roleLabel: string;
      isCreator: boolean;
    };
  },
  onEvent: (event: StreamEventPayload) => void
) {
  const startedAt = Date.now();
  const ai = getClient();
  const prepared = await prepareInteractionPrompt(params);

  onEvent({
    type: 'status',
    stage: 'reasoning',
    activeAssistants: prepared.activeAssistants,
    sourcesCount: prepared.sources.length,
  });

  const useDeepModel = params.triggerType === 'auditoria';
  const primaryModel = useDeepModel ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite';
  const primaryThinking = useDeepModel ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;

  let stream;
  try {
    stream = await withTransientRetry(() =>
      ai.models.generateContentStream({
        model: primaryModel,
        contents: prepared.promptPayload,
        config: {
          systemInstruction: prepared.systemInstruction,
          thinkingConfig: {
            thinkingLevel: primaryThinking,
          },
          responseMimeType: 'application/json',
          responseSchema: INTERACTION_RESPONSE_SCHEMA,
        },
      })
    );
  } catch (err) {
    if (primaryModel === 'gemini-3.1-flash-lite' && !isQuotaOrRateLimitError(err)) {
      stream = await withTransientRetry(() =>
        ai.models.generateContentStream({
          model: 'gemini-4-hydrogen',
          contents: prepared.promptPayload,
          config: {
            systemInstruction: prepared.systemInstruction,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: INTERACTION_RESPONSE_SCHEMA,
          },
        })
      );
    } else {
      throw err;
    }
  }

  let fullBuffer = '';
  const completedTurnIndexes = new Set<number>();
  let lastSnapshotHash = '';

  for await (const chunk of stream) {
    const delta = chunk.text ?? '';
    if (!delta) continue;
    fullBuffer += delta;

    const snapshot = extractPartialStreamSnapshot(fullBuffer);
    if (snapshot.turns.length > 0) {
      const hash = snapshot.turns
        .map((t) => `${t.speaker}:${t.text.length}:${t.isComplete ? 1 : 0}`)
        .join('|');

      if (hash !== lastSnapshotHash) {
        lastSnapshotHash = hash;
        onEvent({
          type: 'snapshot',
          resolvedMode: snapshot.resolvedMode ?? prepared.resolvedTarget,
          detectedEmotion: snapshot.detectedEmotion,
          turns: snapshot.turns.map((t) => ({
            speaker: t.speaker,
            stance: t.stance,
            text: t.text,
            ttsScript: t.ttsScript,
            isComplete: t.isComplete,
          })),
        });
      }

      snapshot.turns.forEach((turn, idx) => {
        if (turn.isComplete && turn.text.trim().length > 0 && !completedTurnIndexes.has(idx)) {
          completedTurnIndexes.add(idx);
          onEvent({
            type: 'turn_ready',
            index: idx,
            turn: {
              speaker: turn.speaker,
              stance: turn.stance,
              text: turn.text,
              ttsScript: turn.ttsScript || turn.text,
            },
          });
        }
      });
    }
  }

  const parsed = parseStructuredResult(fullBuffer);
  const finalMode = parsed.resolvedMode ?? prepared.resolvedTarget;

  // Ensure any turns not yet flagged as ready are emitted before complete
  (parsed.responses ?? []).forEach((turn, idx) => {
    if (!completedTurnIndexes.has(idx) && turn.text?.trim()) {
      completedTurnIndexes.add(idx);
      onEvent({
        type: 'turn_ready',
        index: idx,
        turn,
      });
    }
  });

  const entry: ConversationEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    userMessage: params.message,
    triggerType: params.triggerType,
    requestedMode: params.targetMode,
    resolvedMode: finalMode,
    detectedEmotion: parsed.detectedEmotion,
    responses: parsed.responses,
    debateSummary:
      finalMode === 'ambos' || finalMode === 'todos' ? parsed.debateSummary ?? null : null,
    sources: prepared.sources.length > 0 ? prepared.sources : undefined,
    searchEnginesUsed:
      prepared.searchEnginesUsed.length > 0 ? prepared.searchEnginesUsed : undefined,
    createdMemoriesCount: parsed.newMemories?.length ?? 0,
    createdTasksCount: parsed.newTasks?.length ?? 0,
    createdAlertsCount: parsed.newAlerts?.length ?? 0,
    createdEventsCount: parsed.newEvents?.length ?? 0,
    durationMs: Math.max(120, Date.now() - startedAt),
    proactiveReason: params.proactiveReason,
  };

  const updatedWorkspace = await recordInteraction(
    entry,
    parsed.newMemories ?? [],
    parsed.newTasks ?? [],
    parsed.newAlerts ?? [],
    parsed.detectedEmotion,
    parsed.newEvents ?? [],
    parsed.newQuestions ?? []
  );

  onEvent({
    type: 'complete',
    entry,
    workspace: updatedWorkspace,
  });

  return {
    entry,
    workspace: updatedWorkspace,
  };
}

const TTS_CACHE = new Map<string, { audioBase64: string; mimeType: string }>();

function trimSpokenScript(text: string, maxChars = 480): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  const lastPeriod = Math.max(
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf('! '),
    sliced.lastIndexOf('? ')
  );
  return lastPeriod > 140 ? sliced.slice(0, lastPeriod + 1).trim() : `${sliced.trim()}...`;
}

function getPersonaSpeechStyle(
  speaker: AssistantId,
  jarvisVoice?: string,
  ultronVoice?: string
): string {
  if (speaker === 'jarvis') {
    if (!jarvisVoice || jarvisVoice === 'JarvisOriginal') {
      return 'Speak in Brazilian Portuguese (pt-BR) with a warm-deep male baritone timbre around 105 Hz fundamental pitch, rich chest resonance, calm unhurried cadence, clean studio clarity, polite serene AI-butler poise, and contemplative precision.';
    }
    return 'Speak in Brazilian Portuguese with calm, articulate, refined British-butler poise, warm precision, and measured authority.';
  }
  if (speaker === 'sexta-feira') {
    return 'Speak in Brazilian Portuguese with a natural, confident, empathetic and energetic female voice.';
  }
  if (!ultronVoice || ultronVoice === 'UltronOriginal') {
    return 'Speak in Brazilian Portuguese (pt-BR) with an imposing, dark bass-baritone timbre around 93 Hz fundamental pitch, heavy sub-chest resonance, cold hollow metallic undertone, slow ominous unhurried cadence, calculating arrogance, and menacing cinematic AI authority.';
  }
  return 'Speak in Brazilian Portuguese with a deep, cold, calculating, slightly sarcastic and menacing AI baritone.';
}

export async function synthesizeAssistantSpeech(params: {
  turns: Array<{ speaker: AssistantId; text: string }>;
  jarvisVoice?: string;
  fridayVoice?: string;
  ultronVoice?: string;
}) {
  const ai = getClient('v1beta');
  const cleanTurns = params.turns
    .map((t) => ({
      speaker: t.speaker,
      text: trimSpokenScript(
        t.text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim()
      ),
    }))
    .filter((t) => t.text.length > 0);

  if (cleanTurns.length === 0) {
    throw new Error('Nenhum texto disponível para síntese de voz.');
  }

  const requestedJarvisVoice = params.jarvisVoice || 'JarvisOriginal';
  const jarvisVoiceName =
    requestedJarvisVoice === 'JarvisOriginal' ? 'Charon' : requestedJarvisVoice;
  const fridayVoiceName = params.fridayVoice || 'Kore';
  const requestedUltronVoice = params.ultronVoice || 'UltronOriginal';
  const ultronVoiceName =
    requestedUltronVoice === 'UltronOriginal' ? 'Umbriel' : requestedUltronVoice;

  const getVoiceCandidates = (speaker: AssistantId): string[] => {
    if (speaker === 'jarvis') {
      return Array.from(new Set([jarvisVoiceName, 'Charon', 'Orus', 'Fenrir']));
    }
    if (speaker === 'sexta-feira') {
      return Array.from(new Set([fridayVoiceName, 'Kore', 'Zephyr']));
    }
    return Array.from(new Set([ultronVoiceName, 'Umbriel', 'Charon', 'Algenib', 'Fenrir']));
  };

  const primary = cleanTurns[0];
  const combinedText = cleanTurns.map((t) => t.text).join(' ');
  const voiceCandidates = getVoiceCandidates(primary.speaker);
  const styleHint = getPersonaSpeechStyle(
    primary.speaker,
    requestedJarvisVoice,
    requestedUltronVoice
  );
  const requestedVoiceKey =
    primary.speaker === 'jarvis'
      ? requestedJarvisVoice
      : primary.speaker === 'ultron'
      ? requestedUltronVoice
      : fridayVoiceName;

  const primaryCacheKey = `${primary.speaker}::${requestedVoiceKey}::${voiceCandidates[0]}::${combinedText}`;
  const cachedAudio = TTS_CACHE.get(primaryCacheKey);
  if (cachedAudio) {
    return cachedAudio;
  }

  const models = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
  let lastErr: unknown = null;

  for (const voiceName of voiceCandidates) {
    for (const model of models) {
      try {
        const response = await withTransientRetry(() =>
          ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: combinedText,
                    speechMetadata: {
                      style: styleHint,
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName,
                  },
                },
              },
            },
          })
        );

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const result = { audioBase64: base64Audio, mimeType: 'audio/wav' };
          if (TTS_CACHE.size > 60) {
            const firstKey = TTS_CACHE.keys().next().value;
            if (firstKey) TTS_CACHE.delete(firstKey);
          }
          TTS_CACHE.set(primaryCacheKey, result);
          return result;
        }
      } catch (err) {
        lastErr = err;
      }
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('Falha ao gerar áudio na resposta do modelo.');
}

export async function transcribeUserAudio(params: {
  audioBase64: string;
  mimeType: string;
}) {
  const models: Array<{ model: string; apiVersion?: string }> = [
    { model: 'gemini-3.5-transcribe', apiVersion: 'v1beta' },
    { model: 'gemini-4-hydrogen' },
  ];

  let lastErr: unknown = null;
  for (const candidate of models) {
    try {
      const ai = getClient(candidate.apiVersion);
      const response = await withTransientRetry(() =>
        ai.models.generateContent({
          model: candidate.model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: params.mimeType || 'audio/webm',
                  data: params.audioBase64,
                },
              },
              {
                text: 'Transcreva exatamente o que foi falado em Português do Brasil. Retorne apenas a transcrição limpa, sem comentários.',
              },
            ],
          },
        })
      );
      return (response.text ?? '').trim();
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('Falha ao transcrever o áudio enviado.');
}
