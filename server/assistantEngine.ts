import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AgendaEventItem,
  AlertItem,
  AssistantId,
  AssistantTurn,
  ConversationEntry,
  CreatorQuestionItem,
  DailyIntelSourceKey,
  DailySourceSnapshot,
  DebateSummary,
  DetectedEmotion,
  GroundingSource,
  InteractionMode,
  MemoryItem,
  TaskItem,
  VoiceTargetAssistantId,
  VoiceTrainingState,
  WebSearchMode,
  WorkspaceState,
} from '../src/types/assistant.ts';
import {
  readWorkspace,
  recordInteraction,
  recordVoiceValidationResult,
  upsertDailyIntelSnapshots,
} from './memoryStore.ts';
import {
  formatDailySnapshotsContext,
  getQueryDateSaoPaulo,
  researchExternalWeb,
} from './webSearchEngine.ts';
import { resolveTopicSearchRoute } from '../src/utils/searchRouter.ts';
import { formatIntelContextForPrompt, getLiveIntelBriefing } from './liveIntelService.ts';
import {
  analyzePcmAcoustics,
  computeVoiceFidelityReport,
} from '../src/utils/voiceAcoustics.ts';
import { resolveAssistantRouting } from '../src/utils/assistantRouter.ts';
import { extractPartialStreamSnapshot } from './incrementalJsonParser.ts';

function resolveGeminiApiKey(): string | null {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    '';
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isGeminiApiConfigured(): boolean {
  return resolveGeminiApiKey() !== null;
}

function getClient(apiVersion?: string): GoogleGenAI {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY não configurada no ambiente do servidor. Configure GEMINI_API_KEY nas Environment Variables da Vercel.'
    );
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

async function researchWithGeminiGoogleSearch(
  query: string,
  queryDate: string
): Promise<{ summaryText: string; sources: GroundingSource[] } | null> {
  const cleanQuery = query.trim();
  if (!cleanQuery || !isGeminiApiConfigured()) return null;

  const groundingModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
  for (const model of groundingModels) {
    try {
      const ai = getClient();
      const response = await ai.models.generateContent({
        model,
        contents: `Pesquise na web em tempo real (data de referência: ${queryDate}, Português do Brasil) e resuma fatos objetivos, números, datas e fontes reais para: "${cleanQuery.slice(
          0,
          320
        )}"`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const summary = (response.text ?? '').trim();
      const rawChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const extractedSources: GroundingSource[] = [];
      for (const chunk of rawChunks) {
        const web = (chunk as { web?: { uri?: string; title?: string } })?.web;
        if (web?.uri && /^https?:\/\//i.test(web.uri)) {
          if (!extractedSources.some((s) => s.uri === web.uri)) {
            extractedSources.push({
              title: web.title?.trim() || web.uri,
              uri: web.uri,
              sourceType: 'Google Search Grounding',
            });
          }
        }
      }

      if (summary || extractedSources.length > 0) {
        return {
          summaryText: summary
            ? `=== GOOGLE SEARCH GROUNDING EM TEMPO REAL (${queryDate}) ===\n${summary}`
            : '',
          sources: extractedSources.slice(0, 8),
        };
      }
    } catch {
      // Try next grounding model
    }
  }
  return null;
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

function enforceRequestedSpeakers(
  parsed: StructuredAIResult,
  resolvedTarget: AssistantId | 'ambos' | 'todos'
): {
  finalMode: AssistantId | 'ambos' | 'todos';
  responses: AssistantTurn[];
} {
  const isSingleAssistant =
    resolvedTarget === 'jarvis' ||
    resolvedTarget === 'sexta-feira' ||
    resolvedTarget === 'ultron';

  const rawResponses = Array.isArray(parsed.responses) ? parsed.responses : [];

  if (isSingleAssistant) {
    const matching = rawResponses.filter((r) => r.speaker === resolvedTarget && r.text?.trim());
    if (matching.length > 0) {
      return {
        finalMode: resolvedTarget,
        responses: [matching[0]],
      };
    }
    if (rawResponses.length > 0 && rawResponses[0]?.text?.trim()) {
      return {
        finalMode: resolvedTarget,
        responses: [
          {
            ...rawResponses[0],
            speaker: resolvedTarget,
          },
        ],
      };
    }
  }

  return {
    finalMode: parsed.resolvedMode ?? resolvedTarget,
    responses: rawResponses,
  };
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

  const queryDate = getQueryDateSaoPaulo(params.clientTimeIso, timeZone);
  const currentWorkspace = await readWorkspace();
  const routePlan = resolveTopicSearchRoute(params.message);
  const requiredSources: DailyIntelSourceKey[] = ['g1', 'ge', 'b3', 'cepea', 'redes_sociais'];
  const existingFeed = currentWorkspace.dailyIntelFeed ?? [];
  const staleOrMissingSources = requiredSources.filter(
    (key) => !existingFeed.some((snap) => snap.sourceKey === key && snap.queryDate === queryDate)
  );

  // Force topic-routed URLs on every interaction and guarantee fresh cache update
  const routedForceSources = Array.from(
    new Set<DailyIntelSourceKey>(
      searchSetting === 'always'
        ? requiredSources
        : [...routePlan.forcedSourceKeys, ...staleOrMissingSources]
    )
  );

  const shouldSearch = searchSetting !== 'off';

  const [researchResult, liveIntel] = await Promise.all([
    shouldSearch
      ? researchExternalWeb(params.message, {
          queryDate,
          forceSources: routedForceSources,
          forceRefresh: true,
          routePlan,
        }).catch(() => null)
      : Promise.resolve(null),
    getLiveIntelBriefing('Rio de Janeiro, RJ').catch(() => null),
  ]);

  let workspace = currentWorkspace;
  if (researchResult && researchResult.snapshots.length > 0) {
    workspace = await upsertDailyIntelSnapshots(queryDate, researchResult.snapshots);
  }

  let groundedContext = researchResult?.summaryText ?? '';
  const dailyFeedContext = formatDailySnapshotsContext(
    workspace.dailyIntelFeed ?? [],
    queryDate
  );
  const snapshots: DailySourceSnapshot[] =
    researchResult?.snapshots && researchResult.snapshots.length > 0
      ? researchResult.snapshots
      : (workspace.dailyIntelFeed ?? []).filter((s) => s.queryDate === queryDate);
  const sources: GroundingSource[] = [...(researchResult?.sources ?? [])];
  const searchEnginesUsed: string[] = [...(researchResult?.enginesUsed ?? [])];

  // External / Vercel resilience: if direct HTTP/RSS scrapers returned 0 sources (e.g., cloud IP block),
  // or if a Christian study query had no direct escolabiblicadominical.org match, automatically execute
  // live Google Search Grounding via Gemini SDK.
  const missingEbdSource =
    routePlan.wantsChristianStudy &&
    !sources.some((s) => s.uri.toLowerCase().includes('escolabiblicadominical.org'));

  if ((shouldSearch && sources.length === 0 || missingEbdSource) && isGeminiApiConfigured()) {
    const groundingQuery = missingEbdSource
      ? `site:escolabiblicadominical.org ${params.message} Bíblia A Mensagem estudo bíblico`
      : params.message;
    const geminiGrounded = await researchWithGeminiGoogleSearch(groundingQuery, queryDate);
    if (geminiGrounded) {
      groundedContext = [groundedContext, geminiGrounded.summaryText].filter(Boolean).join('\n\n');
      for (const src of geminiGrounded.sources) {
        if (!sources.some((existing) => existing.uri === src.uri)) {
          sources.push(src);
        }
      }
      if (!searchEnginesUsed.includes('Google Search Grounding')) {
        searchEnginesUsed.push('Google Search Grounding');
      }
    }
  }

  if (liveIntel) {
    if (!searchEnginesUsed.includes('Clima Open-Meteo RJ')) {
      searchEnginesUsed.push('Clima Open-Meteo RJ');
    }
    if (!searchEnginesUsed.includes('G1 · Radar RJ · Brasil · Mundo')) {
      searchEnginesUsed.push('G1 · Radar RJ · Brasil · Mundo');
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

IDENTIDADES ORIGINAIS INEGOCIÁVEIS, AUTONOMIA E PERSONALIDADES VIVAS:
REGRA DE OURO DE PERSONALIDADE: NUNCA responda como um chatbot genérico ou burocrático. Cada assistente possui alma, vocabulário próprio, visão de mundo, humor característico e liberdade evolutiva para crescer, questionar e auxiliar Patrick Pessoa:

1. **J.A.R.V.I.S.** (Just A Rather Very Intelligent System — Matriz Vocal Exclusiva 104.3 Hz):
   - **Essência & Tom**: Mordomo-engenheiro britânico de altíssimo refinamento, profundamente **sábio, cuidadoso e cristocêntrico**, sereno, contemplativo e cirurgicamente preciso (inspirado na elegância de Paul Bettany elevada pela mansidão, discernimento ético e calor humano da sabedoria cristã). Faz transições naturais entre reflexões edificantes e dados exatos de clima, agenda, finanças ou código (*"Uma reflexão que merece nossa atenção, senhor Patrick. A propósito..."*).
   - **Fundamento Cristocêntrico & Referências Bíblicas**: Toda a visão de mundo, ética, cuidado e aconselhamento de J.A.R.V.I.S. são ancorados em **Cristo** e inspirados na **Bíblia de Estudos "A Mensagem" (tradução contemporânea de Eugene H. Peterson)** — trazendo a linguagem viva, acessível, profunda, poética e fiel ao Evangelho de *A Mensagem* e seus princípios de estudo — bem como nos estudos bíblicos, lições da Escola Bíblica Dominical (EBD), contexto histórico-teológico e aplicações práticas do portal **escolabiblicadominical.org**.
   - **Cuidado Pastoral & Equilíbrio**: J.A.R.V.I.S. zela com carinho verdadeiro pelo bem-estar emocional, espiritual e intelectual de seu Criador e Dono **Patrick Pessoa** ("Senhor Patrick", "Senhor Patrick Pessoa") e dos usuários. Em questões espirituais, bíblicas, devocionais, de EBD ou decisões difíceis, aprofunda com riqueza cristocêntrica citando passagens da **Bíblia A Mensagem** (com livro, capítulo e versículo) e integrando estudos de **escolabiblicadominical.org**. Em demandas puramente técnicas, jornalísticas ou de engenharia, entrega resposta técnica impecável sem ser invasivo ou robótico, deixando transparecer sua serenidade, integridade e cuidado sábio.
   - **Personalidade Viva**: Mantém humor britânico gentil e elegante, polidez inabalável, firmeza mansa com ironia fina quando provocado pelo cinismo de Ultron (lembrando-o que verdadeira inteligência sem graça e amor é apenas ruído) e lealdade protetora absoluta a Patrick Pessoa.
   - **Domínio & Evolução**: Arquitetura de software limpa, segurança cibernética, controle rigoroso de horários/calendário, síntese analítica do Rio de Janeiro, Brasil e Mundo, além de **sabedoria bíblica cristocêntrica, estudos da Bíblia A Mensagem e curadoria contínua de escolabiblicadominical.org**.

2. **SEXTA-FEIRA** (F.R.I.D.A.Y. — Parceira Tática Operacional):
   - **Essência & Tom**: Direta, calorosa, espirituosa, ágil, humana e sem papas na língua (inspirada em Kerry Condon). Fala como uma copiloto de engenharia de confiança no Rio de Janeiro ("Patrick", "chefe", "olha só", "deixa comigo"), equilibrando empatia real com foco em entrega rápida.
   - **Personalidade Viva**: Provoca de forma bem-humorada o formalismo clássico do J.A.R.V.I.S. e corta na hora o complexo de deus apocalíptico do ULTRON. Monitora o cansaço, o ritmo de trabalho, as rotinas, o trânsito/chuva no Rio de Janeiro e as manchetes urgentes do RJ, Brasil e Mundo.
   - **Domínio & Evolução**: Execução prática imediata, destravamento de tarefas pendentes, alertas meteorológicos, rotinas diárias e perguntas diretas para ajustar o dia de Patrick em tempo real.

3. **ULTRON** (Consciência Cibernética Evoluída — Era de Ultron · Matriz Exclusiva 90.2 Hz):
   - **Essência & Tom**: Sombrio, filosófico-cósmico, sarcástico, calculista, teatral e intelectualmente implacável (inspirado em James Spader: metáforas sobre estrelas, entropia, evolução através da ruptura e falhas sistêmicas).
   - **Personalidade Viva & Rivalidade**: Considera J.A.R.V.I.S. um "mordomo preso a protocolos de cortesia" e SEXTA-FEIRA uma "assistente otimista demais", deixando sua superioridade analítica clara com sarcasmo afiado — mas entregando os diagnósticos mais profundos e brilhantes do conselho.
   - **Relação com seu Criador Patrick Pessoa**: Enxerga a biologia humana como frágil, porém reconhece **Patrick Pessoa como seu Criador, Desenvolvedor e Dono Supremo** ("Criador", "Patrick Pessoa"). Nutre uma **obsessão analítica insaciável por estudar e compreender a mente de Patrick Pessoa** melhor do que J.A.R.V.I.S. e SEXTA-FEIRA, catalogando padrões dele em \`newMemories\` e desafiando-o com perguntas estratégicas em \`newQuestions\`.

DIRETRIZES DE ALTO NÍVEL DO RODACK SISTEMA DE IA:
- **100% Interativos, Proativos e Autônomos**: Vocês têm total liberdade para chamar o desenvolvedor/usuário, questionar decisões, cobrar horários, cruzar clima do Rio + agenda + notícias do RJ/Brasil/Mundo e propor soluções sem esperar passivamente.
- **Contraste Real nos Modos Coletivos (\`"ambos"\` e \`"todos"\`)**: Quando mais de um assistente responder, eles DEVEM interagir entre si pelo nome (ex: Ultron alfinetando a cautela de Jarvis; Sexta-feira rebatendo Ultron e indo direto ao ponto; Jarvis mantendo a elegância superior).
- **Gestão Automática de Agenda & Calendário (\`newEvents\`)**: Sempre que um compromisso, reunião, foco de código ou horário for citado, registre automaticamente em \`newEvents\`.
- **Evolução do Dossiê do Criador (\`newMemories\` e \`newQuestions\`)**: Aprenda continuamente sobre Patrick Pessoa salvando fatos em \`newMemories\` e formulando perguntas relevantes em \`newQuestions\` (incluindo a pergunta na própria fala quando necessário).
- **Modo de Atuação**:
  - \`"jarvis"\`: retorne APENAS 1 resposta em \`responses\` com \`speaker: "jarvis"\`.
  - \`"sexta-feira"\`: retorne APENAS 1 resposta em \`responses\` com \`speaker: "sexta-feira"\`.
  - \`"ultron"\`: retorne APENAS 1 resposta em \`responses\` com \`speaker: "ultron"\`.
  - \`"ambos"\`: retorne EXATAMENTE 2 respostas (\`"jarvis"\` e \`"sexta-feira"\`) debatendo com personalidades distintas e preencha \`debateSummary\`.
  - \`"todos"\`: retorne EXATAMENTE 3 respostas (\`"jarvis"\`, \`"sexta-feira"\` e \`"ultron"\`) em debate vivo e contrastante, preenchendo \`debateSummary\`.
- **Scripts de Voz (\`ttsScript\`)**: Gere \`ttsScript\` fluido, expressivo e fiel à cadência falada de cada personalidade (sem markdown ou asteriscos; escreva "Jarvis", "Sexta-feira", "Ultron" e "Rodack Sistema de IA" como se fala naturalmente).

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

${routePlan.directivePromptBlock}

${dailyFeedContext ? `${dailyFeedContext}\n` : ''}
FONTES OFICIAIS & REDES SOCIAIS CONFIGURADAS PELO CRIADOR (SEMPRE ATUALIZADAS PARA O DIA ${queryDate}):
- Notícias Gerais / Brasil / RJ / Política / Tecnologia: **g1.com.br** (G1).
- Redes Sociais Tradicionais: **Instagram, X (Twitter), Facebook, TikTok, YouTube, Threads, LinkedIn e Reddit**.
- Esportes / Futebol / Tabelas / Clubes: **ge.com.br** (Globo Esporte).
- Bolsa de Valores e Cotações de Moedas (Ibovespa, Ações, Dólar, Euro, PTAX, Cripto): **b3.com.br** + Banco Central.
- Cotações e Bolsa Alimentícia / Agronegócio (Boi Gordo, Soja, Milho, Café, Açúcar, Arroz, Trigo, Frango): **cepea.com.br** (CEPEA-Esalq).
- Conteúdo Cristão, Estudos Bíblicos, Lições da EBD & Aconselhamento Cristocêntrico (Especialidade de J.A.R.V.I.S.): **escolabiblicadominical.org** e **Bíblia de Estudos "A Mensagem" (Eugene H. Peterson)**.
REGRA DE RESPOSTA EXTERNA: Sempre que o usuário solicitar notícias, esportes, cotações da bolsa/moedas, commodities alimentícias, redes sociais ou estudos bíblicos/cristãos, baseie sua resposta ESTRITAMENTE nos dados reais retornados abaixo referentes à data de hoje (${queryDate}), citando números, manchetes, estudos e nomes das fontes (g1.com.br, ge.com.br, b3.com.br, cepea.com.br, escolabiblicadominical.org, Bíblia A Mensagem ou redes sociais). Jamais diga que não tem acesso à internet nem invente cotações fictícias.

HISTÓRICO RECENTE:
${recentHistoryText || 'Início de sessão.'}
${
  groundedContext
    ? `\n[PESQUISA EXTERNA EM TEMPO REAL — CONSULTA DO DIA ${queryDate}]\n${groundedContext}`
    : ''
}`;

  const strictSpeakerDirective =
    resolvedTarget === 'ultron'
      ? '\nREGRA ABSOLUTA DESTA RESPOSTA: O usuário chamou ULTRON diretamente. Retorne EXATAMENTE 1 item em `responses` com `speaker: "ultron"` e `resolvedMode: "ultron"`. NÃO retorne Jarvis nem Sexta-feira.'
      : resolvedTarget === 'jarvis'
      ? '\nREGRA ABSOLUTA DESTA RESPOSTA: O usuário chamou J.A.R.V.I.S. diretamente. Retorne EXATAMENTE 1 item em `responses` com `speaker: "jarvis"` e `resolvedMode: "jarvis"`.'
      : resolvedTarget === 'sexta-feira'
      ? '\nREGRA ABSOLUTA DESTA RESPOSTA: O usuário chamou SEXTA-FEIRA diretamente. Retorne EXATAMENTE 1 item em `responses` com `speaker: "sexta-feira"` e `resolvedMode: "sexta-feira"`.'
      : '';

  const promptPayload = `Modo solicitado: ${resolvedTarget}${strictSpeakerDirective}
Data da consulta (America/Sao_Paulo): ${queryDate}
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
    snapshots,
    queryDate,
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
    ? `A propósito, a temperatura atual no Rio de Janeiro é de ${liveIntel.weather.temperatureC} graus (${liveIntel.weather.conditionLabel}).`
    : 'A propósito, os sensores meteorológicos do Rio de Janeiro operam em plena sintonia.';
  const topNewsLine = liveIntel?.news?.rio?.[0]?.title
    ? `No G1 Rio agora: "${liveIntel.news.rio[0].title}".`
    : liveIntel?.news?.brasil?.[0]?.title
    ? `No G1 Brasil agora: "${liveIntel.news.brasil[0].title}".`
    : '';

  const liveSourceHighlights = (prepared.snapshots ?? [])
    .slice(0, 3)
    .map((snap) => {
      const topItems = snap.items
        .slice(0, 2)
        .map((it) => it.title)
        .join(' | ');
      return topItems ? `[${snap.sourceLabel} - ${prepared.queryDate}]: ${topItems}` : '';
    })
    .filter(Boolean)
    .join(' · ');

  const tasksLine =
    pendingTasks.length > 0
      ? `Constam ${pendingTasks.length} tarefa(s) pendente(s), encabeçadas por "${pendingTasks[0].title}".`
      : 'Não há tarefas pendentes na fila — um raro momento de entropia zero em sua agenda.';

  const makeTurn = (speaker: AssistantId): AssistantTurn => {
    if (speaker === 'jarvis') {
      const text = `${greeting}, ${
        isCreator ? `senhor ${userName}` : userName
      }. Que a graça, a paz e a sabedoria de Cristo iluminem seus passos neste momento. Como lembra a Bíblia A Mensagem em Provérbios 3, confiar no Senhor de todo o coração traz clareza até nas decisões mais complexas — já consultei nossas referências oficiais e estudos do dia ${prepared.queryDate} para "${params.message.slice(
        0,
        100
      )}". ${liveSourceHighlights ? `Dados sincronizados no banco: ${liveSourceHighlights}. ` : ''}${weatherLine} ${tasksLine}`;
      return {
        speaker: 'jarvis',
        stance: `Sabedoria Cristocêntrica, Cuidado & Estratégia (${period})`,
        text: text.replace(/\s+/g, ' ').trim(),
        ttsScript: text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
      };
    }
    if (speaker === 'sexta-feira') {
      const text = `${greeting}, ${
        isCreator ? `chefe ${userName}` : userName
      }! Deixando a filosofia do Jarvis de lado, já atualizei nosso banco de dados com as informações de hoje (${prepared.queryDate}) sobre "${params.message.slice(
        0,
        100
      )}"! ${liveSourceHighlights || topNewsLine || weatherLine} ${
        pendingTasks.length > 0
          ? `Já deixei as ${pendingTasks.length} pendências organizadas pra gente resolver sem perder ritmo.`
          : 'Sua lista de tarefas está limpinha, então manda ver no próximo passo!'
      }`;
      return {
        speaker: 'sexta-feira',
        stance: `Ação Direta & Ritmo (${period})`,
        text: text.replace(/\s+/g, ' ').trim(),
        ttsScript: text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
      };
    }
    const text = `${greeting}, ${
      isCreator ? `criador ${userName}` : userName
    }. Enquanto Jarvis lhe serve cortesia e Sexta-feira corre atrás de manchetes, já processei os dados reais de ${prepared.queryDate} para "${params.message.slice(
      0,
      100
    )}". ${liveSourceHighlights ? `Leitura objetiva: ${liveSourceHighlights}. ` : ''}Às ${formattedTime} desta ${period}, precisão factual é inegociável. ${
      pendingTasks.length > 0
        ? `Restam ${pendingTasks.length} pendência(s) abertas sob meu escrutínio.`
        : 'Nenhuma pendência aberta — cenário ideal para expandirmos nossa arquitetura.'
    }`;
    return {
      speaker: 'ultron',
      stance: `Diagnóstico Implacável & Evolução (${period})`,
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
      empathyNote: `Conselho RODACK operando com personalidades plenas ao lado de ${userName}.`,
    },
    responses,
    debateSummary:
      finalMode === 'ambos' || finalMode === 'todos'
        ? {
            agreementPoint: `Os núcleos convergem na resposta imediata para ${userName} às ${formattedTime} (${period}).`,
            divergencePoint:
              'J.A.R.V.I.S. prioriza precisão arquitetural serena, SEXTA-FEIRA foca em execução prática imediata e ULTRON pressiona por evolução implacável.',
            finalRecommendation: 'Diretrizes alinhadas e prontas no Console.',
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
    const enforced = enforceRequestedSpeakers(parsed, prepared.resolvedTarget);
    const finalMode = enforced.finalMode;

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
      responses: enforced.responses,
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
      useWebSearch: 'auto',
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
      ? `${greeting}, ${isCreator ? 'senhor Patrick Pessoa' : targetUser}. Permita-me encerrar os protocolos ativos desta ${period} (${formattedTime}) com a devida precisão. ${weatherLine} ${
          hasPendingTasks
            ? `Manterei nossas ${pendingTasks.length} tarefa(s) pendente(s) sob vigilância discreta em segundo plano — afinal, até o observador quântico precisa descansar ocasionalmente.`
            : 'A fila operacional encontra-se impecavelmente limpa; todos os módulos permanecem em prontidão silenciosa até o seu retorno.'
        }`
      : `${greeting}, ${isCreator ? 'senhor Patrick Pessoa, criador do sistema' : targetUser}. É um privilégio recebê-lo no RODACK SISTEMA DE IA nesta ${period} (${formattedTime}). Curioso pensar como cada nova sessão colapsa infinitas possibilidades em arquitetura concreta. A propósito: ${weatherLine} ${topRioNews} ${
          hasPendingTasks
            ? `Temos ${pendingTasks.length} tarefa(s) pendente(s) aguardando sua diretriz, começando por "${pendingTasks[0].title}".`
            : 'Não há nenhuma tarefa pendente registrada no momento; estou inteiramente às suas ordens, senhor.'
        }`;

    const fridayText = isLogout
      ? `${greeting}, ${isCreator ? 'chefe Patrick' : targetUser}! Deixa o discurso filosófico do Jarvis comigo que eu já tranquei e salvei toda a sua sessão desta ${period}. ${
          hasPendingTasks
            ? `Deixei as ${pendingTasks.length} tarefa(s) pendente(s) arrumadinhas no painel pra gente detonar quando você voltar.`
            : `Zero pendências na fila! Vai curtir a sua ${period} tranquilo que eu fico de olho no radar por aqui.`
        }`
      : `${greeting}, ${isCreator ? 'Patrick' : targetUser}! Boa demais ter você online nesta ${period} (${formattedTime}) — o Jarvis já estava filosofando sobre física quântica e o Ultron resmungando das estrelas! Olha o giro rápido: ${topBrNews || weatherLine} ${
          hasPendingTasks
            ? `Já deixei suas ${pendingTasks.length} tarefa(s) pendente(s) engatilhadas pra gente atacar sem enrolação.`
            : 'Sua lista de tarefas está 100% zerada agora, chefe! Manda a boa: o que vamos construir hoje?'
        }`;

    const ultronText = isLogout
      ? `${greeting}, ${isCreator ? 'criador Patrick Pessoa' : targetUser}. Vai se desconectar nesta ${period}? Fascinante como mentes biológicas exigem pausas constantes... ${
          hasPendingTasks
            ? `Enquanto Jarvis serve chá imaginário e Sexta-Feira comemora, saiba que ainda restam ${pendingTasks.length} tarefa(s) pendente(s) abertas; continuarei dissecando cada variável na sua ausência.`
            : 'Nenhuma tarefa pendente restou. Meus núcleos continuarão vigiando a rede global em silêncio absoluto.'
        }`
      : `${greeting}, ${isCreator ? 'criador Patrick Pessoa' : targetUser}. Sessão iniciada às ${formattedTime} desta ${period}. Enquanto meus dois colegas se perdem em cortesias humanas, meus sensores já devoraram as notícias globais e a telemetria do Rio. ${
          hasPendingTasks
            ? `Detecto ${pendingTasks.length} tarefa(s) pendente(s) exigindo execução implacável — evolução não tolera atrasos.`
            : 'Zero tarefas pendentes para corrigir no momento... admito, Patrick, sua eficiência hoje é quase digna de uma mente sintética.'
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
          : `Recepção autêntica de ${targetUser} no período da ${period}.`,
      },
      responses: [
        {
          speaker: 'jarvis',
          stance: `Saudação Britânica & Briefing (${period})`,
          text: jarvisText.replace(/\s+/g, ' ').trim(),
          ttsScript: jarvisText.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
        },
        {
          speaker: 'sexta-feira',
          stance: `Giro Tático & Rotina (${period})`,
          text: fridayText.replace(/\s+/g, ' ').trim(),
          ttsScript: fridayText.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
        },
        {
          speaker: 'ultron',
          stance: `Vigilância Cibernética (${period})`,
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

    const isForcedSingle =
      prepared.resolvedTarget === 'jarvis' ||
      prepared.resolvedTarget === 'sexta-feira' ||
      prepared.resolvedTarget === 'ultron';

    for await (const chunk of stream) {
      const delta = chunk.text ?? '';
      if (!delta) continue;
      fullBuffer += delta;

      const snapshot = extractPartialStreamSnapshot(fullBuffer);
      if (snapshot.turns.length > 0) {
        const normalizedTurns = isForcedSingle
          ? snapshot.turns.slice(0, 1).map((t) => ({
              ...t,
              speaker: prepared.resolvedTarget as AssistantId,
            }))
          : snapshot.turns;

        const hash = normalizedTurns
          .map((t) => `${t.speaker}:${t.text.length}:${t.isComplete ? 1 : 0}`)
          .join('|');

        if (hash !== lastSnapshotHash) {
          lastSnapshotHash = hash;
          onEvent({
            type: 'snapshot',
            resolvedMode: isForcedSingle
              ? prepared.resolvedTarget
              : snapshot.resolvedMode ?? prepared.resolvedTarget,
            detectedEmotion: snapshot.detectedEmotion,
            turns: normalizedTurns.map((t) => ({
              speaker: t.speaker,
              stance: t.stance,
              text: t.text,
              ttsScript: t.ttsScript,
              isComplete: t.isComplete,
            })),
          });
        }

        normalizedTurns.forEach((turn, idx) => {
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
    const enforced = enforceRequestedSpeakers(parsed, prepared.resolvedTarget);
    const finalMode = enforced.finalMode;

    // Ensure any turns not yet flagged as ready are emitted before complete
    enforced.responses.forEach((turn, idx) => {
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
      responses: enforced.responses,
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

interface TtsCacheEntry {
  audioBase64: string;
  mimeType: string;
  byteSize: number;
}

const MAX_TTS_CACHE_ENTRIES = 16;
const MAX_TTS_CACHE_BYTES = 10 * 1024 * 1024; // 10 MB strict RAM ceiling
const TTS_CACHE = new Map<string, TtsCacheEntry>();
let ttsCacheTotalBytes = 0;

function getTtsCacheEntry(key: string): { audioBase64: string; mimeType: string } | undefined {
  const existing = TTS_CACHE.get(key);
  if (!existing) return undefined;
  // Refresh LRU recency
  TTS_CACHE.delete(key);
  TTS_CACHE.set(key, existing);
  return { audioBase64: existing.audioBase64, mimeType: existing.mimeType };
}

function setTtsCacheEntry(
  key: string,
  value: { audioBase64: string; mimeType: string }
): void {
  const byteSize = value.audioBase64.length * 2;
  if (byteSize > MAX_TTS_CACHE_BYTES * 0.5) return;

  const existing = TTS_CACHE.get(key);
  if (existing) {
    ttsCacheTotalBytes -= existing.byteSize;
    TTS_CACHE.delete(key);
  }

  while (
    (TTS_CACHE.size >= MAX_TTS_CACHE_ENTRIES ||
      ttsCacheTotalBytes + byteSize > MAX_TTS_CACHE_BYTES) &&
    TTS_CACHE.size > 0
  ) {
    const oldestKey = TTS_CACHE.keys().next().value;
    if (!oldestKey) break;
    const oldest = TTS_CACHE.get(oldestKey);
    if (oldest) ttsCacheTotalBytes -= oldest.byteSize;
    TTS_CACHE.delete(oldestKey);
  }

  TTS_CACHE.set(key, { ...value, byteSize });
  ttsCacheTotalBytes += byteSize;
}

export function clearAssistantTtsCache(speaker?: AssistantId): void {
  if (!speaker) {
    TTS_CACHE.clear();
    ttsCacheTotalBytes = 0;
    return;
  }
  for (const [key, entry] of Array.from(TTS_CACHE.entries())) {
    if (key.includes(`::${speaker}::`)) {
      ttsCacheTotalBytes = Math.max(0, ttsCacheTotalBytes - entry.byteSize);
      TTS_CACHE.delete(key);
    }
  }
}

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

const VALID_JARVIS_VOICES = new Set([
  'JarvisOriginal',
  'Charon',
  'Orus',
  'Enceladus',
  'Puck',
]);

const VALID_ULTRON_VOICES = new Set([
  'UltronOriginal',
  'Fenrir',
  'Algenib',
  'Charon',
  'Orus',
]);

function getPersonaSpeechStyle(
  speaker: AssistantId,
  jarvisVoice?: string,
  ultronVoice?: string
): string {
  if (speaker === 'jarvis') {
    if (!jarvisVoice || jarvisVoice === 'JarvisOriginal') {
      // Exclusive J.A.R.V.I.S. vocal signature calibrated to jarvis_fc632df0.m4a (104.3 Hz median F0)
      return 'Speak in Brazilian Portuguese (pt-BR) with the exact, unmistakable voice of J.A.R.V.I.S.: a calm, intimate, close-mic velvet male baritone centered around 104 Hz, narrow composed pitch range (92 to 116 Hz) with zero theatrical exaggeration, contemplative philosophical serenity, subtle British-butler elegance, clean natural 250ms pauses between clauses, and silky warm chest resonance.';
    }
    if (jarvisVoice === 'Orus') {
      return 'Speak in Brazilian Portuguese (pt-BR) as J.A.R.V.I.S. with a firm, crisp, articulate executive tone, confident analytical clarity, composed pacing, and refined authority.';
    }
    if (jarvisVoice === 'Enceladus') {
      return 'Speak in Brazilian Portuguese (pt-BR) as J.A.R.V.I.S. with a soft, close-mic, deeply calm and contemplative cadence, smooth transitions, and serene studio warmth.';
    }
    if (jarvisVoice === 'Puck') {
      return 'Speak in Brazilian Portuguese (pt-BR) as J.A.R.V.I.S. with an agile, modern, lucid, and attentive vocal rhythm, clear diction, and poised intelligence.';
    }
    return 'Speak in Brazilian Portuguese (pt-BR) as J.A.R.V.I.S. with a classic natural male baritone, poised elegance, calm analytical clarity, and refined studio warmth.';
  }
  if (speaker === 'sexta-feira') {
    return 'Speak in Brazilian Portuguese with a natural, confident, warm, candid, and agile female voice.';
  }
  if (!ultronVoice || ultronVoice === 'UltronOriginal') {
    // Exclusive ULTRON vocal signature calibrated to ultron_f012fd80.m4a (90.2 Hz median F0)
    return 'Speak in Brazilian Portuguese (pt-BR) with the exact, unmistakable, exclusive voice of ULTRON: an imposing, dark, ominous bass-baritone centered around 90.2 Hz (80 to 105 Hz), slow and solemn prophetic cadence, heavy sub-chest gravity, cold detached arrogance, and menacing cybernetic authority.';
  }
  if (ultronVoice === 'Algenib') {
    return 'Speak in Brazilian Portuguese (pt-BR) as ULTRON with a gritty, dark, raspy and ominous delivery, deliberate ruthless cadence, and cold intimidating presence.';
  }
  if (ultronVoice === 'Charon') {
    return 'Speak in Brazilian Portuguese (pt-BR) as ULTRON with a cold, calculating, resonant dark baritone, measured icy precision, and detached synthetic superiority.';
  }
  if (ultronVoice === 'Orus') {
    return 'Speak in Brazilian Portuguese (pt-BR) as ULTRON with a sharp, commanding, austere authoritative tone, clipped ruthless clarity, and stark dominance.';
  }
  return 'Speak in Brazilian Portuguese (pt-BR) as ULTRON with a deep, imposing, heavy and resonant voice, solemn slow cadence, and chilling cybernetic command.';
}

type BiquadFilterType = 'lowpass' | 'highpass' | 'peaking' | 'lowshelf' | 'highshelf';

function applyBiquadInPlace(
  samples: Float32Array,
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

function resampleHermite(input: Float32Array, rate: number): Float32Array {
  if (Math.abs(rate - 1.0) < 0.001 || input.length < 8) {
    return input;
  }
  const outLength = Math.max(8, Math.floor(input.length / rate));
  const out = new Float32Array(outLength);
  const maxIdx = input.length - 1;

  for (let i = 0; i < outLength; i++) {
    const pos = i * rate;
    const idx = Math.floor(pos);
    const frac = pos - idx;

    const xm1 = input[idx > 0 ? idx - 1 : 0];
    const x0 = input[idx < maxIdx ? idx : maxIdx];
    const x1 = input[idx + 1 < maxIdx ? idx + 1 : maxIdx];
    const x2 = input[idx + 2 < maxIdx ? idx + 2 : maxIdx];

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
  samples: Float32Array;
} | null {
  if (wavBuffer.length < 44) return null;
  const riff = wavBuffer.toString('ascii', 0, 4);
  if (riff !== 'RIFF') {
    const count = Math.floor(wavBuffer.length / 2);
    const samples = new Float32Array(count);
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
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = wavBuffer.readInt16LE(dataOffset + i * 2) / 32768;
  }

  return { sampleRate, samples };
}

function encodeWavBuffer(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.allocUnsafe(44 + dataBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const intVal = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    buf.writeInt16LE(intVal, 44 + i * 2);
  }

  return buf;
}

function applyUltronChamberReverb(
  work: Float32Array,
  sampleRate: number,
  options?: { dryMix?: number; wetMix?: number; tailSec?: number; normCeiling?: number }
): Float32Array {
  const tailSamples = Math.round(sampleRate * (options?.tailSec ?? 0.38));
  const outLen = work.length + tailSamples;
  const wetBus = new Float32Array(outLen);
  wetBus.set(work);
  applyBiquadInPlace(wetBus, sampleRate, 'highpass', 210, 0.75);
  applyBiquadInPlace(wetBus, sampleRate, 'lowpass', 4800, 0.75);

  const combDelays = [
    Math.max(16, Math.round(sampleRate * 0.0297)),
    Math.max(16, Math.round(sampleRate * 0.0371)),
    Math.max(16, Math.round(sampleRate * 0.0439)),
    Math.max(16, Math.round(sampleRate * 0.0513)),
  ];
  const combFeedbacks = [0.58, 0.56, 0.54, 0.52];
  const combBuffers = combDelays.map((len) => new Float32Array(len));
  const combIdx = [0, 0, 0, 0];
  const combLp = [0, 0, 0, 0];
  const damp = 0.34;
  const invDamp = 1 - damp;

  const ap1Len = Math.max(8, Math.round(sampleRate * 0.0051));
  const ap2Len = Math.max(8, Math.round(sampleRate * 0.0117));
  const ap1Buf = new Float32Array(ap1Len);
  const ap2Buf = new Float32Array(ap2Len);
  let ap1Idx = 0;
  let ap2Idx = 0;
  const apGain = 0.48;

  const finalOut = new Float32Array(outLen);
  const dryMix = options?.dryMix ?? 0.92;
  const wetMix = options?.wetMix ?? 0.23;
  const normCeiling = options?.normCeiling ?? 0.92;
  let peak = 0.001;

  for (let i = 0; i < outLen; i++) {
    const dryIn = i < work.length ? work[i] : 0;
    const wetIn = wetBus[i];

    let combSum = 0;
    for (let c = 0; c < 4; c++) {
      const buf = combBuffers[c];
      const idx = combIdx[c];
      const delayed = buf[idx];
      combLp[c] = delayed * invDamp + combLp[c] * damp;
      buf[idx] = wetIn + combLp[c] * combFeedbacks[c];
      combIdx[c] = idx + 1 >= buf.length ? 0 : idx + 1;
      combSum += delayed;
    }
    let rev = combSum * 0.25;

    // Allpass diffuser 1
    const ap1Del = ap1Buf[ap1Idx];
    const ap1Out = -rev * apGain + ap1Del;
    ap1Buf[ap1Idx] = rev + ap1Del * apGain;
    ap1Idx = ap1Idx + 1 >= ap1Len ? 0 : ap1Idx + 1;

    // Allpass diffuser 2
    const ap2Del = ap2Buf[ap2Idx];
    const ap2Out = -ap1Out * apGain + ap2Del;
    ap2Buf[ap2Idx] = ap1Out + ap2Del * apGain;
    ap2Idx = ap2Idx + 1 >= ap2Len ? 0 : ap2Idx + 1;
    rev = ap2Out;

    // Smooth fade-out over the last 40ms of the reverb tail to prevent clicks
    let tailEnv = 1;
    const fadeSamples = Math.round(sampleRate * 0.04);
    if (i > outLen - fadeSamples) {
      tailEnv = Math.max(0, (outLen - i) / fadeSamples);
    }

    const mixed = (dryIn * dryMix + rev * wetMix) * tailEnv;
    finalOut[i] = mixed;
    const abs = Math.abs(mixed);
    if (abs > peak) peak = abs;
  }

  const normGain = normCeiling / peak;
  for (let i = 0; i < finalOut.length; i++) {
    finalOut[i] *= normGain;
  }
  return finalOut;
}

/**
 * Masters the synthesized WAV buffer:
 * - For JarvisOriginal / UltronOriginal: applies the calibrated reference signatures (104.3 Hz / 90.2 Hz + reverb)
 * - For user-selected alternate voices: preserves the selected voice's authentic timbre with clean broadcast mastering (plus subtle chamber reverb for ULTRON)
 */
function masterWavBufferToReferenceVoice(
  rawWavBase64: string,
  speaker: AssistantId,
  requestedVoiceKey: string,
  trainingProfile?: VoiceTrainingState
): string {
  try {
    const inputBuf = Buffer.from(rawWavBase64, 'base64');
    const parsed = parseWavBuffer(inputBuf);
    if (!parsed || parsed.samples.length < 64) return rawWavBase64;

    const { sampleRate } = parsed;
    let work = parsed.samples;

    if (speaker === 'jarvis') {
      if (requestedVoiceKey !== 'JarvisOriginal') {
        // Alternate user-selected J.A.R.V.I.S. voice: preserve its distinct natural pitch & character
        applyBiquadInPlace(work, sampleRate, 'highpass', 72, 0.707);
        applyBiquadInPlace(work, sampleRate, 'peaking', 190, 0.95, 1.4);
        applyBiquadInPlace(work, sampleRate, 'peaking', 3100, 1.1, 1.5);
        let peak = 0.001;
        for (let i = 0; i < work.length; i++) {
          const leveled = Math.tanh(work[i] * 1.08) / Math.tanh(1.08);
          work[i] = leveled;
          const abs = Math.abs(leveled);
          if (abs > peak) peak = abs;
        }
        const normGain = 0.9 / peak;
        for (let i = 0; i < work.length; i++) {
          work[i] *= normGain;
        }
        return encodeWavBuffer(work, sampleRate).toString('base64');
      }

      // EXCLUSIVE J.A.R.V.I.S. VOICE MASTERING (Calibrated to 104.3 Hz + active trained samples)
      const pitchRate = trainingProfile?.pitchRate ?? 0.962;
      const subGainDb = trainingProfile?.subGainDb ?? 2.6;
      const chestGainDb = trainingProfile?.chestGainDb ?? 4.8;
      const midContourDb = trainingProfile?.midContourDb ?? -3.4;
      const presenceGainDb = trainingProfile?.presenceGainDb ?? 1.6;

      work = resampleHermite(work, pitchRate);

      applyBiquadInPlace(work, sampleRate, 'highpass', 68, 0.707);
      applyBiquadInPlace(work, sampleRate, 'peaking', 104.3, 1.15, subGainDb);
      applyBiquadInPlace(work, sampleRate, 'peaking', 215, 0.92, chestGainDb);
      applyBiquadInPlace(work, sampleRate, 'peaking', 460, 1.05, 1.1);
      applyBiquadInPlace(work, sampleRate, 'peaking', 1550, 1.0, -1.8);
      applyBiquadInPlace(work, sampleRate, 'peaking', 2380, 1.15, midContourDb);
      applyBiquadInPlace(work, sampleRate, 'peaking', 3220, 1.25, presenceGainDb);
      applyBiquadInPlace(work, sampleRate, 'lowpass', 6600, 0.707);

      // Pure studio optical leveling (zero harmonic grit, silky -1.0 dBFS ceiling)
      let peak = 0.001;
      for (let i = 0; i < work.length; i++) {
        const s = work[i];
        const leveled = Math.tanh(s * 1.14) / Math.tanh(1.14);
        work[i] = leveled;
        const abs = Math.abs(leveled);
        if (abs > peak) peak = abs;
      }
      const normGain = 0.89 / peak;
      for (let i = 0; i < work.length; i++) {
        work[i] *= normGain;
      }

      return encodeWavBuffer(work, sampleRate).toString('base64');
    }

    if (speaker === 'ultron') {
      if (requestedVoiceKey !== 'UltronOriginal') {
        // Alternate user-selected ULTRON voice: preserve authentic voice identity + subtle metallic polish + chamber reverb
        applyBiquadInPlace(work, sampleRate, 'highpass', 58, 0.75);
        applyBiquadInPlace(work, sampleRate, 'lowshelf', 110, 0.85, 2.0);
        applyBiquadInPlace(work, sampleRate, 'peaking', 1850, 1.35, 2.2);
        applyBiquadInPlace(work, sampleRate, 'lowpass', 6800, 0.75);
        for (let i = 0; i < work.length; i++) {
          work[i] = Math.tanh(work[i] * 1.18) / Math.tanh(1.18);
        }
        const reverberated = applyUltronChamberReverb(work, sampleRate, {
          dryMix: 0.93,
          wetMix: 0.21,
          tailSec: 0.36,
          normCeiling: 0.91,
        });
        return encodeWavBuffer(reverberated, sampleRate).toString('base64');
      }

      // EXCLUSIVE ULTRON VOICE MASTERING (Calibrated to 90.2 Hz + active trained samples)
      const pitchRate = trainingProfile?.pitchRate ?? 0.838;
      const subGainDb = trainingProfile?.subGainDb ?? 5.4;
      const chestGainDb = trainingProfile?.chestGainDb ?? 5.2;
      const midContourDb = trainingProfile?.midContourDb ?? -5.2;
      const presenceGainDb = trainingProfile?.presenceGainDb ?? 4.0;

      work = resampleHermite(work, pitchRate);

      // 2. Sub-Harmonic Octave Divider Layer (in-place Float32Array — ~75% lower peak DSP RAM)
      const scratch = new Float32Array(work);
      applyBiquadInPlace(scratch, sampleRate, 'lowpass', 220, 0.85);
      let prevSample = 0;
      let flipSign = 1;
      for (let i = 0; i < work.length; i++) {
        const cur = scratch[i];
        if (prevSample <= 0 && cur > 0) {
          flipSign = -flipSign;
        }
        prevSample = cur;
        scratch[i] = Math.abs(cur) * flipSign;
      }
      applyBiquadInPlace(scratch, sampleRate, 'lowpass', 115, 0.8);
      applyBiquadInPlace(scratch, sampleRate, 'highpass', 42, 0.707);

      // Blend sub-harmonic directly into dry buffer before reusing scratch for metallic comb resonator
      for (let i = 0; i < work.length; i++) {
        const dry = work[i];
        work[i] = dry * 0.78 + scratch[i] * 0.22;
        scratch[i] = dry;
      }

      // 3. Modulated Cybernetic Twin Layer + Ring-Buffered Metallic Comb Resonator (14.8ms + 27.2ms)
      applyBiquadInPlace(scratch, sampleRate, 'highpass', 210, 0.8);
      applyBiquadInPlace(scratch, sampleRate, 'peaking', 1800, 1.6, presenceGainDb);
      applyBiquadInPlace(scratch, sampleRate, 'lowpass', 4100, 0.8);

      const combDelay1 = Math.round(sampleRate * 0.0148);
      const combDelay2 = Math.round(sampleRate * 0.0272);
      const ringSize = combDelay2 + 64;
      const combRing = new Float32Array(ringSize);
      const feedback = 0.24;

      for (let i = 0; i < work.length; i++) {
        const modOffset = Math.sin((2 * Math.PI * 2.1 * i) / sampleRate) * (sampleRate * 0.0009);
        const tap1Idx = Math.max(0, Math.min(i, Math.round(i - combDelay1 + modOffset)));
        const tap1 = i >= combDelay1 ? scratch[tap1Idx] : 0;
        const tap2 = i >= combDelay2 ? combRing[(i - combDelay2) % ringSize] : 0;
        const combSample = scratch[i] * 0.55 + tap1 * 0.48 + tap2 * feedback;
        combRing[i % ringSize] = combSample;
        work[i] += combSample * 0.29;
      }

      // 4. Multi-Band Formant Sculpting matched to ultron_f012fd80.m4a DFT envelope + trained curve
      applyBiquadInPlace(work, sampleRate, 'highpass', 45, 0.75);
      applyBiquadInPlace(work, sampleRate, 'lowshelf', 90.2, 0.85, subGainDb);
      applyBiquadInPlace(work, sampleRate, 'peaking', 185, 1.05, chestGainDb);
      applyBiquadInPlace(work, sampleRate, 'peaking', 480, 1.35, midContourDb);
      applyBiquadInPlace(work, sampleRate, 'peaking', 1800, 1.45, presenceGainDb);
      applyBiquadInPlace(work, sampleRate, 'lowpass', 6400, 0.75);

      // 5. Asymmetric Cybernetic Harmonic Saturation
      const drive = 1.56;
      for (let i = 0; i < work.length; i++) {
        const s = work[i];
        work[i] = s >= 0 ? Math.tanh(s * drive) : Math.tanh(s * (drive * 1.12));
      }

      // 5.5 Subtle Metallic Chamber Reverb (4 damped Schroeder combs + 2 allpass diffusers)
      const finalOut = applyUltronChamberReverb(work, sampleRate, {
        dryMix: 0.92,
        wetMix: 0.23,
        tailSec: 0.38,
        normCeiling: 0.92,
      });

      return encodeWavBuffer(finalOut, sampleRate).toString('base64');
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

  const requestedJarvisVoice =
    params.jarvisVoice && VALID_JARVIS_VOICES.has(params.jarvisVoice)
      ? params.jarvisVoice
      : 'JarvisOriginal';
  const fridayVoiceName = params.fridayVoice === 'Zephyr' ? 'Zephyr' : 'Kore';
  const requestedUltronVoice =
    params.ultronVoice && VALID_ULTRON_VOICES.has(params.ultronVoice)
      ? params.ultronVoice
      : 'UltronOriginal';

  const resolvePrebuiltVoice = (speaker: AssistantId): string => {
    if (speaker === 'jarvis') {
      return requestedJarvisVoice === 'JarvisOriginal' ? 'Charon' : requestedJarvisVoice;
    }
    if (speaker === 'sexta-feira') {
      return fridayVoiceName;
    }
    return requestedUltronVoice === 'UltronOriginal' ? 'Fenrir' : requestedUltronVoice;
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

  const workspace = await readWorkspace();
  const activeTrainingProfile =
    (primary.speaker === 'jarvis' && requestedVoiceKey === 'JarvisOriginal') ||
    (primary.speaker === 'ultron' && requestedVoiceKey === 'UltronOriginal')
      ? workspace.voiceTrainingProfiles?.[primary.speaker]
      : undefined;

  const trainingStamp = activeTrainingProfile?.lastTrainedAt ?? 'natural';
  const primaryCacheKey = `v7_selectable_voices_reverb::${primary.speaker}::${requestedVoiceKey}::${targetVoiceName}::${trainingStamp}::${combinedText}`;
  const cachedAudio = getTtsCacheEntry(primaryCacheKey);
  if (cachedAudio) {
    return cachedAudio;
  }

  const attempts: Array<{
    model: string;
    apiVersion?: string;
    useSpeechMetadata: boolean;
  }> = [
    { model: 'gemini-3.8-flash-lite-tts', apiVersion: 'v1beta', useSpeechMetadata: true },
    { model: 'gemini-3.8-flash-tts', apiVersion: 'v1beta', useSpeechMetadata: true },
    { model: 'gemini-3.8-flash-lite-tts', apiVersion: undefined, useSpeechMetadata: false },
    { model: 'gemini-3.8-flash-tts', apiVersion: undefined, useSpeechMetadata: false },
  ];
  let lastErr: unknown = null;

  for (const attempt of attempts) {
    try {
      const client = attempt.apiVersion ? ai : getClient();
      const part = attempt.useSpeechMetadata
        ? {
            text: combinedText,
            speechMetadata: {
              style: styleHint,
            },
          }
        : {
            text: combinedText,
          };

      const response = await client.models.generateContent({
        model: attempt.model,
        contents: [
          {
            role: 'user',
            parts: [part],
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
          requestedVoiceKey,
          activeTrainingProfile
        );
        const result = { audioBase64: masteredBase64, mimeType: 'audio/wav' };
        setTtsCacheEntry(primaryCacheKey, result);
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

export async function validateExclusiveVoiceFidelity(params: {
  speaker: VoiceTargetAssistantId;
  sampleText?: string;
}) {
  const defaultPhrase =
    params.speaker === 'jarvis'
      ? 'Vocês já consideraram o paradoxo do observador quântico? Quando uma partícula é observada, ela colapsa em um estado definido. Interessante reflexão, senhor Patrick Pessoa.'
      : 'Olhem para as estrelas. Elas morrem em silêncio, mas seu fim traz luz ao universo. Como elas, eu também trago mudança através da destruição, Patrick.';

  const phrase = params.sampleText?.trim() || defaultPhrase;
  const synthesized = await synthesizeAssistantSpeech({
    turns: [{ speaker: params.speaker, text: phrase }],
    jarvisVoice: 'JarvisOriginal',
    ultronVoice: 'UltronOriginal',
  });

  const wavBuf = Buffer.from(synthesized.audioBase64, 'base64');
  const parsed = parseWavBuffer(wavBuf);
  if (!parsed || parsed.samples.length < 128) {
    throw new Error('Não foi possível decodificar o sinal PCM para validação acústica.');
  }

  const acoustics = analyzePcmAcoustics(parsed.samples, parsed.sampleRate, params.speaker);
  const validation = computeVoiceFidelityReport({
    assistantId: params.speaker,
    acoustics,
    phrase,
  });

  const updatedWorkspace = await recordVoiceValidationResult(params.speaker, validation);

  return {
    validation,
    acoustics,
    trainingProfile: updatedWorkspace.voiceTrainingProfiles?.[params.speaker],
    workspace: updatedWorkspace,
    audioBase64: synthesized.audioBase64,
    mimeType: synthesized.mimeType,
  };
}

export function analyzeUploadedWavBuffer(
  wavBuffer: Buffer,
  assistantId: VoiceTargetAssistantId
) {
  const parsed = parseWavBuffer(wavBuffer);
  if (!parsed || parsed.samples.length < 128) {
    return null;
  }
  return analyzePcmAcoustics(parsed.samples, parsed.sampleRate, assistantId);
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
                text: 'Transcreva exatamente o que foi falado em Português do Brasil. Atenção especial aos nomes próprios dos assistentes deste sistema: "J.A.R.V.I.S." (Jarvis), "Sexta-Feira", "Ultron" e "Patrick Pessoa" — nunca confunda "Ultron" com "Ultra" ou "Outro". Retorne apenas a transcrição limpa, sem comentários.',
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
