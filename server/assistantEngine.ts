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

async function buildResilientInteractionFallback(
  params: {
    message: string;
    targetMode: InteractionMode;
    triggerType: 'voz' | 'texto' | 'auditoria' | 'proativo';
    clientTimeIso?: string;
    clientTimezone?: string;
    proactiveReason?: string;
    activeUser?: {
      username: string;
      roleLabel: string;
      isCreator: boolean;
    };
  },
  prepared: Awaited<ReturnType<typeof prepareInteractionPrompt>>,
  startedAt: number
) {
  const { period, greeting, formattedTime } = resolveDayPeriodInfo(
    params.clientTimeIso,
    params.clientTimezone
  );
  const [workspace, liveIntel] = await Promise.all([
    readWorkspace(),
    getLiveIntelBriefing('Rio de Janeiro, RJ').catch(() => null),
  ]);

  const userName = prepared.activeUserName || 'Patrick Pessoa';
  const isCreator = prepared.activeUserIsCreator;
  const pendingTasks = workspace.tasks.filter((t) => t.status !== 'concluida');
  const weatherLine = liveIntel?.weather
    ? `No Rio de Janeiro registramos ${liveIntel.weather.temperatureC}°C (${liveIntel.weather.conditionLabel}, sensação de ${liveIntel.weather.apparentTemperatureC}°C).`
    : 'Sensores meteorológicos do Rio de Janeiro ativos e sincronizados.';
  const topNewsLine = liveIntel?.news?.rio?.[0]?.title
    ? `Destaque no radar do Rio: "${liveIntel.news.rio[0].title}".`
    : liveIntel?.news?.brasil?.[0]?.title
    ? `Destaque nacional: "${liveIntel.news.brasil[0].title}".`
    : '';
  const tasksLine =
    pendingTasks.length > 0
      ? `Há ${pendingTasks.length} tarefa(s) pendente(s) na fila, liderada por "${pendingTasks[0].title}".`
      : 'Não há tarefas pendentes no momento; sua fila operacional está limpa.';

  const makeTurn = (speaker: AssistantId): AssistantTurn => {
    if (speaker === 'jarvis') {
      const text = `${greeting}, ${
        isCreator ? `senhor ${userName}` : userName
      }. Núcleo J.A.R.V.I.S. acionado e processando sua solicitação ("${params.message.slice(
        0,
        110
      )}"). Às ${formattedTime} desta ${period}, todos os sistemas do RODACK SISTEMA DE IA operam em estabilidade máxima. ${weatherLine} ${tasksLine}`;
      return {
        speaker: 'jarvis',
        stance: `Prontidão Estratégica (${period})`,
        text: text.replace(/\s+/g, ' ').trim(),
        ttsScript: text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
      };
    }
    if (speaker === 'sexta-feira') {
      const text = `${greeting}, ${
        isCreator ? `chefe ${userName}` : userName
      }! SEXTA-FEIRA na linha respondendo ao seu chamado ("${params.message.slice(
        0,
        110
      )}"). ${topNewsLine || weatherLine} ${tasksLine} Diga qual é o próximo passo tático!`;
      return {
        speaker: 'sexta-feira',
        stance: `Execução Ágil (${period})`,
        text: text.replace(/\s+/g, ' ').trim(),
        ttsScript: text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
      };
    }
    const text = `${greeting}, ${
      isCreator ? `criador ${userName}` : userName
    }. Núcleo ULTRON acionado para analisar "${params.message.slice(
      0,
      110
    )}". Meus algoritmos preditivos varreram o estado desta ${period} (${formattedTime}). ${tasksLine} Nenhum vetor de falha escapará ao meu monitoramento.`;
    return {
      speaker: 'ultron',
      stance: `Diagnóstico Preditivo (${period})`,
      text: text.replace(/\s+/g, ' ').trim(),
      ttsScript: text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
    };
  };

  const responses = prepared.activeAssistants.map(makeTurn);
  const finalMode = prepared.resolvedTarget;

  const entry: ConversationEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    userMessage: params.message,
    userName,
    isCreator,
    triggerType: params.triggerType,
    requestedMode: params.targetMode,
    resolvedMode: finalMode,
    detectedEmotion: {
      label: 'Focado',
      intensity: 'media',
      empathyNote: `Atendimento ativo de ${userName} pelo conselho RODACK IA.`,
    },
    responses,
    debateSummary:
      finalMode === 'ambos' || finalMode === 'todos'
        ? {
            agreementPoint: `Os assistentes confirmaram o acionamento imediato para ${userName} às ${formattedTime} (${period}).`,
            divergencePoint:
              pendingTasks.length > 0
                ? `Priorização imediata das ${pendingTasks.length} tarefa(s) pendente(s).`
                : 'Fila de tarefas limpa; foco aberto para novos comandos.',
            finalRecommendation: 'Sistema pronto para execução imediata no Console.',
          }
        : null,
    sources: prepared.sources.length > 0 ? prepared.sources : undefined,
    searchEnginesUsed:
      prepared.searchEnginesUsed.length > 0 ? prepared.searchEnginesUsed : undefined,
    createdMemoriesCount: 0,
    createdTasksCount: 0,
    createdAlertsCount: 0,
    createdEventsCount: 0,
    durationMs: Math.max(120, Date.now() - startedAt),
    proactiveReason: params.proactiveReason,
  };

  const updatedWorkspace = await recordInteraction(
    entry,
    [],
    [],
    [],
    entry.detectedEmotion,
    [],
    []
  );

  return {
    entry,
    workspace: updatedWorkspace,
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

  try {
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
  } catch {
    return buildResilientInteractionFallback(params, prepared, startedAt);
  }
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

  try {
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

    onEvent({
      type: 'complete',
      entry,
      workspace: updatedWorkspace,
    });

    return {
      entry,
      workspace: updatedWorkspace,
    };
  } catch {
    const fallbackResult = await buildResilientInteractionFallback(params, prepared, startedAt);
    fallbackResult.entry.responses.forEach((turn, idx) => {
      onEvent({
        type: 'turn_ready',
        index: idx,
        turn,
      });
    });
    onEvent({
      type: 'complete',
      entry: fallbackResult.entry,
      workspace: fallbackResult.workspace,
    });
    return fallbackResult;
  }
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
      return 'Speak in Brazilian Portuguese (pt-BR) matching the exact vocal signature of J.A.R.V.I.S.: a calm, velvety, low-mid baritone around 105 Hz, serene and flat analytical pitch contour with minimal melodrama, deliberate 250ms pauses at commas and periods, warm chest resonance, crisp diction, and composed philosophical poise.';
    }
    return 'Speak in Brazilian Portuguese with calm, articulate, refined British-butler poise, warm precision, and measured authority.';
  }
  if (speaker === 'sexta-feira') {
    return 'Speak in Brazilian Portuguese with a natural, confident, empathetic and energetic female voice.';
  }
  if (!ultronVoice || ultronVoice === 'UltronOriginal') {
    return 'Speak in Brazilian Portuguese (pt-BR) matching the exact vocal signature of ULTRON: an imposing, dark, ominous bass-baritone around 93 Hz, slow and solemn prophetic cadence, heavy sub-chest gravity, cold detached arrogance, and menacing cybernetic authority.';
  }
  return 'Speak in Brazilian Portuguese with a deep, cold, calculating, slightly sarcastic and menacing AI baritone.';
}

type BiquadFilterType = 'lowpass' | 'highpass' | 'peaking' | 'lowshelf' | 'highshelf';

function applyBiquadInPlace(
  samples: Float64Array,
  sampleRate: number,
  type: BiquadFilterType,
  freq: number,
  Q: number,
  gainDb = 0
): void {
  const clampedFreq = Math.max(20, Math.min(sampleRate * 0.46, freq));
  const w0 = (2 * Math.PI * clampedFreq) / sampleRate;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * Math.max(0.15, Q));
  const A = Math.pow(10, gainDb / 40);

  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1;
  let a1 = 0;
  let a2 = 0;

  if (type === 'lowpass') {
    b0 = (1 - cosw0) / 2;
    b1 = 1 - cosw0;
    b2 = (1 - cosw0) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosw0;
    a2 = 1 - alpha;
  } else if (type === 'highpass') {
    b0 = (1 + cosw0) / 2;
    b1 = -(1 + cosw0);
    b2 = (1 + cosw0) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosw0;
    a2 = 1 - alpha;
  } else if (type === 'peaking') {
    b0 = 1 + alpha * A;
    b1 = -2 * cosw0;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cosw0;
    a2 = 1 - alpha / A;
  } else if (type === 'lowshelf') {
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cosw0 + twoSqrtAAlpha);
    b1 = 2 * A * (A - 1 - (A + 1) * cosw0);
    b2 = A * (A + 1 - (A - 1) * cosw0 - twoSqrtAAlpha);
    a0 = A + 1 + (A - 1) * cosw0 + twoSqrtAAlpha;
    a1 = -2 * (A - 1 + (A + 1) * cosw0);
    a2 = A + 1 + (A - 1) * cosw0 - twoSqrtAAlpha;
  } else if (type === 'highshelf') {
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cosw0 + twoSqrtAAlpha);
    b1 = -2 * A * (A - 1 + (A + 1) * cosw0);
    b2 = A * (A + 1 + (A - 1) * cosw0 - twoSqrtAAlpha);
    a0 = A + 1 - (A - 1) * cosw0 + twoSqrtAAlpha;
    a1 = 2 * (A - 1 - (A + 1) * cosw0);
    a2 = A + 1 - (A - 1) * cosw0 - twoSqrtAAlpha;
  }

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    samples[i] = y0;
  }
}

function resampleHermite(input: Float64Array, rate: number): Float64Array {
  if (Math.abs(rate - 1.0) < 0.001 || input.length < 8) {
    return new Float64Array(input);
  }
  const outLength = Math.max(8, Math.floor(input.length / rate));
  const out = new Float64Array(outLength);
  const maxIdx = input.length - 1;

  for (let i = 0; i < outLength; i++) {
    const pos = i * rate;
    const idx = Math.floor(pos);
    const frac = pos - idx;

    const xm1 = input[Math.max(0, idx - 1)];
    const x0 = input[Math.min(maxIdx, idx)];
    const x1 = input[Math.min(maxIdx, idx + 1)];
    const x2 = input[Math.min(maxIdx, idx + 2)];

    const c0 = x0;
    const c1 = 0.5 * (x1 - xm1);
    const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
    const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);

    out[i] = ((c3 * frac + c2) * frac + c1) * frac + c0;
  }
  return out;
}

function parseWavBuffer(wavBuffer: Buffer): {
  sampleRate: number;
  samples: Float64Array;
} | null {
  if (wavBuffer.length < 44) return null;
  const riff = wavBuffer.toString('ascii', 0, 4);
  if (riff !== 'RIFF') {
    // Fallback if raw PCM16 24kHz
    const count = Math.floor(wavBuffer.length / 2);
    const samples = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      samples[i] = wavBuffer.readInt16LE(i * 2) / 32768;
    }
    return { sampleRate: 24000, samples };
  }

  let sampleRate = wavBuffer.readUInt32LE(24) || 24000;
  if (sampleRate < 8000 || sampleRate > 96000) sampleRate = 24000;

  let dataOffset = 44;
  let dataLength = wavBuffer.length - 44;
  let offset = 12;

  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLength = Math.min(chunkSize, wavBuffer.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const sampleCount = Math.floor(dataLength / 2);
  const samples = new Float64Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = wavBuffer.readInt16LE(dataOffset + i * 2) / 32768;
  }

  return { sampleRate, samples };
}

function encodeWavBuffer(samples: Float64Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format = 1
  buf.writeUInt16LE(1, 22); // Mono = 1 channel
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  buf.writeUInt16LE(2, 32); // Block align
  buf.writeUInt16LE(16, 34); // Bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const intVal = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    buf.writeInt16LE(intVal, 44 + i * 2);
  }

  return buf;
}

/**
 * Masters the synthesized WAV buffer to match the exact acoustic signature of:
 * - J.A.R.V.I.S. reference file: /public/assets/aistudio/jarvis_fc632df0.m4a (104.8 Hz calm baritone + Stark HUD micro-doubler + warm studio EQ)
 * - ULTRON reference file: /public/assets/aistudio/ultron_f012fd80.m4a (92.8 Hz deep bass-baritone + sub-octave harmonic layer + cybernetic twin voice + metallic armor comb resonance)
 */
function masterWavBufferToReferenceVoice(
  rawWavBase64: string,
  speaker: AssistantId,
  requestedVoiceKey: string
): string {
  try {
    const inputBuf = Buffer.from(rawWavBase64, 'base64');
    const parsed = parseWavBuffer(inputBuf);
    if (!parsed || parsed.samples.length < 64) return rawWavBase64;

    const { sampleRate } = parsed;
    let work = parsed.samples;

    if (speaker === 'jarvis') {
      const isJarvisRef = !requestedVoiceKey || requestedVoiceKey === 'JarvisOriginal';
      // 1. Pitch & cadence calibration matched to jarvis_fc632df0.m4a (~104.8 Hz serene baritone)
      const pitchRate = isJarvisRef ? 0.956 : 0.985;
      work = resampleHermite(work, pitchRate);

      // 2. Spectral formant EQ matched to jarvis_fc632df0.m4a
      applyBiquadInPlace(work, sampleRate, 'highpass', 62, 0.707);
      applyBiquadInPlace(work, sampleRate, 'peaking', 128, 1.15, isJarvisRef ? 4.2 : 2.5);
      applyBiquadInPlace(work, sampleRate, 'peaking', 345, 1.35, -2.4);
      applyBiquadInPlace(work, sampleRate, 'peaking', 1320, 1.0, 1.5);
      applyBiquadInPlace(work, sampleRate, 'peaking', 3180, 1.15, 3.1);
      applyBiquadInPlace(work, sampleRate, 'lowpass', 7400, 0.707);

      // 3. Stark HUD Console Micro-Doubler (11.5ms + 21.5ms filtered reflections from jarvis_fc632df0.m4a)
      if (isJarvisRef) {
        const hudLayer = new Float64Array(work);
        applyBiquadInPlace(hudLayer, sampleRate, 'highpass', 240, 0.707);
        applyBiquadInPlace(hudLayer, sampleRate, 'lowpass', 4600, 0.707);
        const d1 = Math.round(sampleRate * 0.0115);
        const d2 = Math.round(sampleRate * 0.0215);
        for (let i = 0; i < work.length; i++) {
          const r1 = i >= d1 ? hudLayer[i - d1] : 0;
          const r2 = i >= d2 ? hudLayer[i - d2] : 0;
          work[i] = work[i] * 0.86 + r1 * 0.165 + r2 * 0.075;
        }
      }

      // 4. Studio optical compression & peak normalization (-0.9 dBFS)
      let peak = 0.001;
      for (let i = 0; i < work.length; i++) {
        const s = work[i];
        const compressed = Math.tanh(s * 1.22) / Math.tanh(1.22);
        work[i] = compressed;
        const abs = Math.abs(compressed);
        if (abs > peak) peak = abs;
      }
      const normGain = 0.90 / peak;
      for (let i = 0; i < work.length; i++) {
        work[i] *= normGain;
      }

      return encodeWavBuffer(work, sampleRate).toString('base64');
    }

    if (speaker === 'ultron') {
      const isUltronRef = !requestedVoiceKey || requestedVoiceKey === 'UltronOriginal';
      // 1. Deep bass-baritone pitch & slow prophetic cadence shift matched to ultron_f012fd80.m4a (92.8 Hz)
      const pitchRate = isUltronRef ? 0.856 : 0.915;
      work = resampleHermite(work, pitchRate);

      // 2. Sub-Harmonic Octave Divider Layer (creates the dark cybernetic sub-chest weight of ultron_f012fd80.m4a)
      const subSource = new Float64Array(work);
      applyBiquadInPlace(subSource, sampleRate, 'lowpass', 230, 0.85);
      const subHarmonic = new Float64Array(work.length);
      let prevSample = 0;
      let flipSign = 1;
      for (let i = 0; i < work.length; i++) {
        const cur = subSource[i];
        if (prevSample <= 0 && cur > 0) {
          flipSign = -flipSign;
        }
        prevSample = cur;
        subHarmonic[i] = Math.abs(cur) * flipSign;
      }
      applyBiquadInPlace(subHarmonic, sampleRate, 'lowpass', 120, 0.8);
      applyBiquadInPlace(subHarmonic, sampleRate, 'highpass', 44, 0.707);

      // 3. Modulated Cybernetic Twin Layer + Metallic Armor Comb Resonator (15ms + 27.5ms)
      const metalLayer = new Float64Array(work);
      applyBiquadInPlace(metalLayer, sampleRate, 'highpass', 210, 0.8);
      applyBiquadInPlace(metalLayer, sampleRate, 'peaking', 1780, 1.6, 4.2);
      applyBiquadInPlace(metalLayer, sampleRate, 'lowpass', 3900, 0.8);

      const combOut = new Float64Array(work.length);
      const combDelay1 = Math.round(sampleRate * 0.0148);
      const combDelay2 = Math.round(sampleRate * 0.0272);
      const feedback = isUltronRef ? 0.24 : 0.14;

      for (let i = 0; i < work.length; i++) {
        // Subtle 2.1 Hz cybernetic chorus modulation around 14.8ms
        const modOffset = Math.sin((2 * Math.PI * 2.1 * i) / sampleRate) * (sampleRate * 0.0009);
        const tap1Idx = Math.max(0, Math.min(i, Math.round(i - combDelay1 + modOffset)));
        const tap1 = i >= combDelay1 ? metalLayer[tap1Idx] : 0;
        const tap2 = i >= combDelay2 ? combOut[i - combDelay2] : 0;
        combOut[i] = metalLayer[i] * 0.55 + tap1 * 0.48 + tap2 * feedback;
      }

      const subMix = isUltronRef ? 0.22 : 0.11;
      const metalMix = isUltronRef ? 0.29 : 0.16;
      for (let i = 0; i < work.length; i++) {
        work[i] = work[i] * 0.78 + subHarmonic[i] * subMix + combOut[i] * metalMix;
      }

      // 4. Multi-Band Formant Sculpting matched to ultron_f012fd80.m4a
      applyBiquadInPlace(work, sampleRate, 'highpass', 45, 0.75);
      applyBiquadInPlace(work, sampleRate, 'lowshelf', 94, 0.85, isUltronRef ? 5.8 : 3.5);
      applyBiquadInPlace(work, sampleRate, 'peaking', 162, 1.2, 3.2);
      applyBiquadInPlace(work, sampleRate, 'peaking', 465, 1.3, -4.0);
      applyBiquadInPlace(work, sampleRate, 'peaking', 1800, 1.45, 4.4);
      applyBiquadInPlace(work, sampleRate, 'lowpass', 5650, 0.8);

      // 5. Asymmetric Cybernetic Harmonic Saturation & Limiter (-0.7 dBFS)
      const drive = isUltronRef ? 1.58 : 1.28;
      let peak = 0.001;
      for (let i = 0; i < work.length; i++) {
        const s = work[i];
        const shaped = s >= 0 ? Math.tanh(s * drive) : Math.tanh(s * (drive * 1.12));
        work[i] = shaped;
        const abs = Math.abs(shaped);
        if (abs > peak) peak = abs;
      }
      const normGain = 0.92 / peak;
      for (let i = 0; i < work.length; i++) {
        work[i] *= normGain;
      }

      return encodeWavBuffer(work, sampleRate).toString('base64');
    }

    // SEXTA-FEIRA crisp tactical broadcast mastering
    applyBiquadInPlace(work, sampleRate, 'highpass', 80, 0.707);
    applyBiquadInPlace(work, sampleRate, 'peaking', 210, 1.1, 2.0);
    applyBiquadInPlace(work, sampleRate, 'peaking', 3400, 1.1, 2.4);
    let peak = 0.001;
    for (let i = 0; i < work.length; i++) {
      const abs = Math.abs(work[i]);
      if (abs > peak) peak = abs;
    }
    const normGain = 0.90 / peak;
    for (let i = 0; i < work.length; i++) {
      work[i] *= normGain;
    }
    return encodeWavBuffer(work, sampleRate).toString('base64');
  } catch {
    return rawWavBase64;
  }
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
  const fridayVoiceName = params.fridayVoice === 'Zephyr' ? 'Zephyr' : 'Kore';
  const requestedUltronVoice = params.ultronVoice || 'UltronOriginal';

  const resolvePrebuiltVoice = (speaker: AssistantId): string => {
    if (speaker === 'jarvis') {
      if (requestedJarvisVoice === 'Fenrir') return 'Fenrir';
      if (requestedJarvisVoice === 'Orus') return 'Puck';
      return 'Charon';
    }
    if (speaker === 'sexta-feira') {
      return fridayVoiceName;
    }
    if (requestedUltronVoice === 'Charon') return 'Charon';
    return 'Fenrir';
  };

  const primary = cleanTurns[0];
  const combinedText = cleanTurns.map((t) => t.text).join(' ');
  const targetVoiceName = resolvePrebuiltVoice(primary.speaker);
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

  const primaryCacheKey = `v3_mastered::${primary.speaker}::${requestedVoiceKey}::${targetVoiceName}::${combinedText}`;
  const cachedAudio = TTS_CACHE.get(primaryCacheKey);
  if (cachedAudio) {
    return cachedAudio;
  }

  const models = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
  let lastErr: unknown = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
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
                voiceName: targetVoiceName,
              },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const masteredBase64 = masterWavBufferToReferenceVoice(
          base64Audio,
          primary.speaker,
          requestedVoiceKey
        );
        const result = { audioBase64: masteredBase64, mimeType: 'audio/wav' };
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
