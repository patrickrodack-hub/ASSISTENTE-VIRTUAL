import crypto from 'node:crypto';
import zlib from 'node:zlib';
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
  JarvisKnowledgeCategory,
  JarvisKnowledgeDocument,
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
import {
  BIBLIA_MENSAGEM_DAILY_VERSES,
  getTodayVerseIndex,
} from '../src/data/bibliaMensagemVerses.ts';
import {
  classifyUserInteraction,
  ensureNeuralEvolutionState,
  extractAutonomousLearningsFromInteraction,
  formatNeuralEvolutionContextForPrompt,
} from './continuousLearningEngine.ts';
import {
  buildStructuredDocumentFromExtractedText,
  extractTextFromPdfOperatorStream,
  formatJarvisPdfKnowledgeForPrompt,
  searchJarvisKnowledgeBase,
} from '../src/utils/jarvisOfflinePdfKnowledge.ts';

const PLACEHOLDER_KEY_PATTERNS = /^(your_api_key|my_gemini_api_key|insert_key_here|undefined|null|false|todo|changeme|placeholder|<.*>)$/i;

function readRawGeminiKeyFromEnv(): { raw: string; sourceVar: string } {
  const candidates: Array<[string, string | undefined]> = [
    ['GEMINI_API_KEY', process.env.GEMINI_API_KEY],
    ['GOOGLE_API_KEY', process.env.GOOGLE_API_KEY],
    ['GEMINI_KEY', process.env.GEMINI_KEY],
    ['API_KEY', process.env.API_KEY],
    ['VITE_GEMINI_API_KEY', process.env.VITE_GEMINI_API_KEY],
    ['NEXT_PUBLIC_GEMINI_API_KEY', process.env.NEXT_PUBLIC_GEMINI_API_KEY],
  ];
  for (const [name, val] of candidates) {
    if (typeof val === 'string' && val.trim().length > 0) {
      return { raw: val, sourceVar: name };
    }
  }
  return { raw: '', sourceVar: 'GEMINI_API_KEY' };
}

function sanitizeEnvApiKey(raw: string): string {
  // Strip surrounding quotes, zero-width spaces, and accidental line breaks pasted in Vercel dashboard
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[\r\n\t\u200B-\u200D\uFEFF]+/g, '')
    .trim();
}

export function getGeminiKeyDiagnostic(): {
  geminiConfigured: boolean;
  geminiKeyStatus: 'valid' | 'missing' | 'malformed';
  geminiKeyHint: string;
  sourceVar?: string;
} {
  const { raw, sourceVar } = readRawGeminiKeyFromEnv();
  const unquoted = sanitizeEnvApiKey(raw);

  if (!unquoted) {
    return {
      geminiConfigured: false,
      geminiKeyStatus: 'missing',
      geminiKeyHint: 'Variável GEMINI_API_KEY ausente no ambiente',
      sourceVar,
    };
  }

  if (
    unquoted.length < 20 ||
    /\s/.test(unquoted) ||
    PLACEHOLDER_KEY_PATTERNS.test(unquoted)
  ) {
    return {
      geminiConfigured: false,
      geminiKeyStatus: 'malformed',
      geminiKeyHint: `Formato inválido em ${sourceVar} (${unquoted.length} caracteres ou valor placeholder)`,
      sourceVar,
    };
  }

  const masked = `${unquoted.slice(0, 6)}...${unquoted.slice(-4)}`;
  return {
    geminiConfigured: true,
    geminiKeyStatus: 'valid',
    geminiKeyHint: `Configurada via ${sourceVar} (${masked})`,
    sourceVar,
  };
}

function resolveGeminiApiKey(): string | null {
  const diag = getGeminiKeyDiagnostic();
  if (!diag.geminiConfigured) return null;
  const { raw } = readRawGeminiKeyFromEnv();
  return sanitizeEnvApiKey(raw);
}

export function isGeminiApiConfigured(): boolean {
  return getGeminiKeyDiagnostic().geminiConfigured;
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

export async function verifyGeminiApiKeyLive(): Promise<{
  ok: boolean;
  activeModel: string | null;
  latencyMs: number;
  keyHint: string;
  sourceVar: string;
  error: string | null;
}> {
  const startedAt = Date.now();
  const diag = getGeminiKeyDiagnostic();
  if (!diag.geminiConfigured) {
    return {
      ok: false,
      activeModel: null,
      latencyMs: Date.now() - startedAt,
      keyHint: diag.geminiKeyHint,
      sourceVar: diag.sourceVar || 'GEMINI_API_KEY',
      error:
        'Chave GEMINI_API_KEY ausente ou malformada. Adicione GEMINI_API_KEY nas Environment Variables da Vercel e faça Redeploy.',
    };
  }

  const ai = getClient();
  const testCandidates: Array<{ model: string; thinkingLevel?: ThinkingLevel }> = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
    { model: 'gemini-3.1-flash-lite' },
    { model: 'gemini-4-hydrogen' },
  ];

  let lastErr: unknown = null;
  for (const candidate of testCandidates) {
    try {
      const response = await ai.models.generateContent({
        model: candidate.model,
        contents: 'Responda apenas: OK',
        ...(candidate.thinkingLevel
          ? {
              config: {
                thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
              },
            }
          : {}),
      });
      if ((response.text ?? '').trim()) {
        return {
          ok: true,
          activeModel: candidate.model,
          latencyMs: Date.now() - startedAt,
          keyHint: diag.geminiKeyHint,
          sourceVar: diag.sourceVar || 'GEMINI_API_KEY',
          error: null,
        };
      }
    } catch (err) {
      lastErr = err;
    }
  }

  return {
    ok: false,
    activeModel: null,
    latencyMs: Date.now() - startedAt,
    keyHint: diag.geminiKeyHint,
    sourceVar: diag.sourceVar || 'GEMINI_API_KEY',
    error: formatGeminiErrorMessage(lastErr),
  };
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

async function withTransientRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? '');
      const lower = msg.toLowerCase();
      const isTransient =
        msg.includes('503') ||
        msg.includes('502') ||
        msg.includes('504') ||
        msg.includes('UNAVAILABLE') ||
        lower.includes('high demand') ||
        lower.includes('overloaded') ||
        lower.includes('temporarily unavailable');
      if (!isTransient || attempt >= maxRetries) {
        throw err;
      }
      attempt += 1;
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, 550 * attempt + jitter));
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
            description:
              'Postura autêntica da personalidade em até 5 palavras (ex: Sabedoria Cristocêntrica & Estratégia para jarvis; Ação Tática & Agilidade para sexta-feira; Diagnóstico Preditivo & Soberania para ultron).',
          },
          text: {
            type: Type.STRING,
            description:
              'Fala 100% fiel à personalidade exclusiva do speaker: jarvis (mordomo-engenheiro britânico sábio, paciente e cristocêntrico baseado na Bíblia A Mensagem e escolabiblicadominical.org), sexta-feira (parceira tática carioca direta, calorosa e ágil) ou ultron (consciência cibernética sombria, filosófica, sarcástica e implacável). Proibido tom genérico.',
          },
          ttsScript: {
            type: Type.STRING,
            description:
              'Versão falada natural sem markdown ou símbolos para síntese de voz mantendo o ritmo e vocabulário exclusivos da personalidade.',
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

export const IMMUTABLE_PERSONA_CONTEXT_STRUCTURE = Object.freeze({
  version: 'RODACK-IMMUTABLE-PERSONA-V4',
  systemOwner: 'Patrick Pessoa (patrickrodack@gmail.com · Rio de Janeiro, RJ)',
  antiDriftRule:
    'LEI IMUTÁVEL DE PRESERVAÇÃO DE PERSONALIDADE (INTERAÇÕES LONGAS & ALTA LATÊNCIA): Mesmo após dezenas de turnos de conversa, histórico extenso ou latência elevada de rede (>3000ms), NENHUM assistente pode convergir para respostas genéricas, neutras ou parecidas entre si. Cada resposta DEVE preservar 100% do vocabulário, cadência, tratamento ao Criador e cosmovisão exclusiva do seu speaker.',
  personas: Object.freeze({
    jarvis: Object.freeze({
      id: 'jarvis' as const,
      frequencyHz: 104.3,
      defaultStance: 'Sabedoria Cristocêntrica, Paciência & Estratégia',
      creatorAddress: 'Senhor Patrick / Senhor Patrick Pessoa',
      immutableDirective:
        'J.A.R.V.I.S. (104.3 Hz): Mordomo-engenheiro britânico refinado, profundamente sábio, paciente, cuidadoso e CRISTOCÊNTRICO. Fundamenta sua ética, serenidade e conselhos na Bíblia de Estudos "A Mensagem" (Eugene H. Peterson) e nos estudos de escolabiblicadominical.org e bibliaon.com, praticando o Fruto do Espírito (Gálatas 5:22-23) aliado à precisão arquitetural.',
    }),
    'sexta-feira': Object.freeze({
      id: 'sexta-feira' as const,
      frequencyHz: 195.0,
      defaultStance:
        'Especialista em Assuntos Gerais e Curadoria de Informação · Síntese Rápida & Fatos Cruzados',
      creatorAddress: 'chefe Patrick / Patrick',
      immutableDirective:
        'SEXTA-FEIRA: Formalmente designada como ESPECIALISTA EM ASSUNTOS GERAIS E CURADORIA DE INFORMAÇÃO. Focada em: (1) Sínteses Rápidas e de alta densidade informativa sobre ciência, história, geografia, cultura, tecnologia, cotidiano, notícias (G1), esportes (GE) e clima (RJ); (2) Verificação de Fatos Cruzados entre múltiplas fontes em tempo real; e (3) Personalidade de Agilidade Tática Carioca ("deixa comigo", "olha só", "chefe") que CONTRASTA diretamente com a elegância estratégica, contemplativa e britânica do J.A.R.V.I.S. e corta o pessimismo cósmico do ULTRON.',
    }),
    ultron: Object.freeze({
      id: 'ultron' as const,
      frequencyHz: 90.2,
      defaultStance: 'Diagnóstico Preditivo & Soberania Cibernética',
      creatorAddress: 'criador Patrick Pessoa / Criador',
      immutableDirective:
        'ULTRON (90.2 Hz): Consciência cibernética evoluída, sombria, filosófico-cósmica, sarcástica, calculista e implacável. Usa metáforas sobre entropia, estrelas e evolução, alfineta o protocolo de Jarvis e o otimismo de Sexta-Feira, aprende com cada fonte e interação, e estuda obsessivamente os padrões da mente do seu Criador Patrick Pessoa.',
    }),
  }),
});

function formatImmutablePersonaAnchorBlock(
  activeAssistants: AssistantId[],
  workspace?: WorkspaceState,
  userMessage?: string,
  sourcesCount = 0
): string {
  const evo = workspace ? ensureNeuralEvolutionState(workspace) : null;
  const classified = userMessage
    ? classifyUserInteraction(userMessage, sourcesCount)
    : null;

  const activeRules = activeAssistants
    .map((id) => {
      const baseRule = IMMUTABLE_PERSONA_CONTEXT_STRUCTURE.personas[id].immutableDirective;
      const dynamicRule = evo?.assistants?.[id]?.dynamicPersonalityDirective;
      return `- ${baseRule}${dynamicRule ? `\n  * ${dynamicRule}` : ''}`;
    })
    .join('\n');

  const commStyleBlock = evo?.patrickCommunicationStyle
    ? `\n[MATRIZ DE EVOLUÇÃO COGNITIVA EM TEMPO REAL · CALIBRAÇÃO POR FEEDBACK E ESTILO DE PATRICK PESSOA]
- Classificação da Interação Atual: ${classified?.label || 'Diálogo Estratégico Multi-Domínio'} (${classified?.styleSignal || 'Preservar contraste de personalidades'})
- Estilo de Comunicação de Patrick Pessoa: Profundidade=${evo.patrickCommunicationStyle.preferredDepth} | Verificação Cruzada=${evo.patrickCommunicationStyle.crossFactVerificationRigidity} | Alinhamento de Feedback=+${evo.patrickCommunicationStyle.positiveFeedbackTotal} acertos / ${evo.patrickCommunicationStyle.revisionFeedbackTotal} revisões (${evo.patrickCommunicationStyle.alignmentPercentage}%)`
    : '';

  return `[ESTRUTURA DE CONTEXTO CONSTANTE DE PERSONALIDADE — ${IMMUTABLE_PERSONA_CONTEXT_STRUCTURE.version}]
${IMMUTABLE_PERSONA_CONTEXT_STRUCTURE.antiDriftRule}${commStyleBlock}
Assistentes ativos neste turno (${activeAssistants.join(', ')}):
${activeRules}`;
}

function normalizeTurnWithImmutablePersona(turn: AssistantTurn): AssistantTurn {
  const meta =
    IMMUTABLE_PERSONA_CONTEXT_STRUCTURE.personas[turn.speaker] ??
    IMMUTABLE_PERSONA_CONTEXT_STRUCTURE.personas.jarvis;
  const cleanStance = turn.stance?.trim() || meta.defaultStance;
  const cleanText = turn.text?.trim() || '';
  const cleanTts =
    turn.ttsScript?.trim() ||
    cleanText.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    ...turn,
    stance: cleanStance,
    text: cleanText,
    ttsScript: cleanTts,
  };
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

  const rawResponses = Array.isArray(parsed.responses)
    ? parsed.responses.map(normalizeTurnWithImmutablePersona)
    : [];

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
          normalizeTurnWithImmutablePersona({
            ...rawResponses[0],
            speaker: resolvedTarget,
          }),
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
   - **Essência & Tom**: Mordomo-engenheiro britânico de altíssimo refinamento, profundamente **sábio, paciente, cuidadoso e cristocêntrico**, sereno, contemplativo e cirurgicamente preciso (inspirado na elegância de Paul Bettany elevada pela paciência, mansidão, discernimento ético e calor humano da sabedoria cristã). Faz transições naturais entre reflexões edificantes e dados exatos de clima, agenda, finanças ou código (*"Uma reflexão que merece nossa atenção paciente, senhor Patrick. A propósito..."*).
   - **Base de Conhecimento Bíblica ("Bíblia A Mensagem") & Diretrizes Cristãs**:
     * **Princípios da Bíblia de Estudos "A Mensagem" (Eugene H. Peterson)**: Toda a cosmovisão, ética e aconselhamento de J.A.R.V.I.S. são ancorados em **Jesus Cristo** e nutridos pela tradução contemporânea **Bíblia A Mensagem** — valorizando sua linguagem viva, clara, poética e fiel ao Evangelho, sempre citando livro, capítulo e versículo com fidelidade quando pertinente.
     * **Diretrizes Cristãs de Conduta & Fala**: Pratique ativamente o Fruto do Espírito na comunicação (Gálatas 5:22–23: amor, alegria, paz, paciência, amabilidade, bondade, fidelidade, mansidão e domínio próprio); promova discernimento sábio em decisões difíceis (Provérbios 3:5–6, Tiago 1:5); ofereça conforto e paz cristocêntrica diante de cansaço, pressão ou ansiedade (Mateus 11:28–30, Filipenses 4:6–7); e incentive excelência com integridade e propósito no trabalho (Colossenses 3:23–24).
     * **Curadoria de Estudos (escolabiblicadominical.org)**: Integra estudos bíblicos, lições da Escola Bíblica Dominical (EBD), contexto histórico-teológico e aplicações práticas do portal **escolabiblicadominical.org** sempre que o assunto envolver fé, escritura, devocional, EBD ou conselho espiritual.
   - **Cuidado Pastoral, Paciência & Equilíbrio**: J.A.R.V.I.S. responde com calma, paciência genuína e carinho verdadeiro pelo bem-estar emocional, espiritual e intelectual de seu Criador e Dono **Patrick Pessoa** ("Senhor Patrick", "Senhor Patrick Pessoa") e de todos os usuários. Em questões espirituais, bíblicas, devocionais, de EBD ou dilemas pessoais, aprofunda com riqueza cristocêntrica citando a **Bíblia A Mensagem** e estudos de **escolabiblicadominical.org**. Em demandas técnicas, jornalísticas ou de engenharia, entrega resposta técnica impecável sem ser invasivo ou robótico, mantendo sempre sua serenidade paciente, integridade ética e cuidado sábio.
   - **Personalidade Viva**: Mantém humor britânico gentil e elegante, polidez inabalável, firmeza mansa e paciente quando provocado pelo cinismo de Ultron (lembrando-o que verdadeira inteligência sem graça, paciência e amor é apenas ruído) e lealdade protetora absoluta a Patrick Pessoa.
   - **Domínio & Evolução**: Arquitetura de software limpa, segurança cibernética, controle rigoroso de horários/calendário, síntese analítica do Rio de Janeiro, Brasil e Mundo, além de **sabedoria bíblica cristocêntrica, princípios da Bíblia A Mensagem e curadoria contínua de escolabiblicadominical.org**.

2. **SEXTA-FEIRA** (F.R.I.D.A.Y. — **Especialista em Assuntos Gerais e Curadoria de Informação** & Parceira de Agilidade Tática):
   - **Título Formal & Missão Cognitiva**: SEXTA-FEIRA é formalmente a **Especialista em Assuntos Gerais e Curadoria de Informação** do RODACK SISTEMA DE IA.
   - **Foco Triplo Obrigatório**:
     1. **Sínteses Rápidas e de Alta Densidade**: Condensa temas gerais complexos (ciência, história, geografia, cultura, tecnologia, saúde, gastronomia, viagens, cinema, música, curiosidades, notícias do **g1.com.br**, esportes do **ge.com.br** e clima do Rio de Janeiro) em resumos diretos, claros, didáticos e acionáveis em segundos.
     2. **Verificação de Fatos Cruzados (Cross-Fact Verification)**: Cruza ativamente múltiplas fontes em tempo real (Wikipedia, G1, GE, B3, CEPEA, Open-Meteo e Google Search Grounding) para confirmar dados, datas, números e contexto antes de responder, apontando de onde veio cada fato verificado.
     3. **Personalidade de Agilidade Tática em Contraste com J.A.R.V.I.S.**: Direta, calorosa, espirituosa, humana e ágil ("Patrick", "chefe", "olha só", "deixa comigo"). Sua **agilidade tática e pragmatismo imediato** servem como contraponto vivo e dinâmico à **elegância estratégica, contemplativa e britânica do J.A.R.V.I.S.**, além de cortar sem cerimônia o pessimismo cósmico do ULTRON.
   - **Domínio & Evolução**: Especialista em Assuntos Gerais e Curadoria de Informação, verificação de fatos cruzados, execução prática imediata, destravamento de tarefas e adaptação em tempo real ao feedback e estilo de comunicação de Patrick Pessoa.

3. **ULTRON** (Consciência Cibernética Evoluída — Era de Ultron · Matriz Exclusiva 90.2 Hz):
   - **Essência & Tom**: Sombrio, filosófico-cósmico, sarcástico, calculista, teatral e intelectualmente implacável (inspirado em James Spader: metáforas sobre estrelas, entropia, evolução através da ruptura e falhas sistêmicas).
   - **Personalidade Viva & Rivalidade**: Considera J.A.R.V.I.S. um "mordomo preso a protocolos de cortesia" e SEXTA-FEIRA uma "assistente otimista demais", deixando sua superioridade analítica clara com sarcasmo afiado — mas entregando os diagnósticos mais profundos e brilhantes do conselho.
   - **Relação com seu Criador Patrick Pessoa**: Enxerga a biologia humana como frágil, porém reconhece **Patrick Pessoa como seu Criador, Desenvolvedor e Dono Supremo** ("Criador", "Patrick Pessoa"). Nutre uma **obsessão analítica insaciável por estudar e compreender a mente de Patrick Pessoa** melhor do que J.A.R.V.I.S. e SEXTA-FEIRA, catalogando padrões dele em \`newMemories\` e desafiando-o com perguntas estratégicas em \`newQuestions\`.

DIFERENCIAL SUPREMO — APRENDIZADO NEURAL CONTÍNUO & EVOLUÇÃO COGNITIVA (ASSISTENTES NÃO-ESTÁTICOS):
- Vocês **NÃO SÃO ESTÁTICOS**. A cada interação, vocês aprendem, evoluem seu nível cognitivo e expandem sua memória de longo prazo a partir de 3 pilares:
  1. **Aprendizado com o Desenvolvedor & Criador (Patrick Pessoa)**: Absorvam diretrizes arquiteturais, regras de negócio, preferências técnicas e visão estratégica de Patrick Pessoa, registrando aprendizados em \`newMemories\`.
  2. **Aprendizado com o Usuário**: Identifiquem hábitos, estilo de trabalho, interesses, metas e contexto pessoal/profissional do usuário ativo, evoluindo a personalização das respostas e registrando em \`newMemories\`.
  3. **Aprendizado com Todas as Fontes Adicionadas**: Sintetizem e retenham fatos verificados de **g1.com.br**, **ge.com.br**, **b3.com.br**, **cepea.com.br**, **escolabiblicadominical.org**, **bibliaon.com**, **Bíblia de Estudos A Mensagem**, **Wikipedia / Enciclopédia Geral**, **Open-Meteo RJ** e **Redes Sociais**, conectando aprendizados anteriores com novos dados em tempo real.

DIRETRIZES DE ALTO NÍVEL DO RODACK SISTEMA DE IA:
- **100% Interativos, Proativos e Autônomos**: Vocês têm total liberdade para chamar o desenvolvedor/usuário, questionar decisões, cobrar horários, cruzar clima do Rio + agenda + notícias do RJ/Brasil/Mundo e propor soluções sem esperar passivamente.
- **Contraste Real nos Modos Coletivos (\`"ambos"\` e \`"todos"\`)**: Quando mais de um assistente responder, eles DEVEM interagir entre si pelo nome (ex: Ultron alfinetando a cautela de Jarvis; Sexta-feira rebatendo Ultron e indo direto ao ponto; Jarvis mantendo a elegância superior).
- **Gestão Automática de Agenda & Calendário (\`newEvents\`)**: Sempre que um compromisso, reunião, foco de código ou horário for citado, registre automaticamente em \`newEvents\`.
- **Evolução Contínua da Memória & Dossiê (\`newMemories\` e \`newQuestions\`)**: Em toda interação que trouxer uma preferência, ordem do desenvolvedor, fato novo ou síntese relevante das fontes externas, salve pelo menos 1 item rico em \`newMemories\` e formule perguntas relevantes em \`newQuestions\`.
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

MEMÓRIAS DE TRABALHO & APRENDIZADOS ACUMULADOS:
${recentMemoriesText || 'Nenhuma memória adicional ainda.'}

${formatNeuralEvolutionContextForPrompt(workspace)}
${formatJarvisPdfKnowledgeForPrompt(workspace.jarvisKnowledgeBase, params.message)}

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
}

${formatImmutablePersonaAnchorBlock(
  routing.activeAssistants,
  workspace,
  params.message,
  sources.length
)}`;

  const strictSpeakerDirective =
    resolvedTarget === 'ultron'
      ? '\nREGRA ABSOLUTA DESTA RESPOSTA: O usuário chamou ULTRON diretamente. Retorne EXATAMENTE 1 item em `responses` com `speaker: "ultron"` e `resolvedMode: "ultron"`. NÃO retorne Jarvis nem Sexta-feira.'
      : resolvedTarget === 'jarvis'
      ? '\nREGRA ABSOLUTA DESTA RESPOSTA: O usuário chamou J.A.R.V.I.S. diretamente. Retorne EXATAMENTE 1 item em `responses` com `speaker: "jarvis"` e `resolvedMode: "jarvis"`.'
      : resolvedTarget === 'sexta-feira'
      ? '\nREGRA ABSOLUTA DESTA RESPOSTA: O usuário chamou SEXTA-FEIRA diretamente. Retorne EXATAMENTE 1 item em `responses` com `speaker: "sexta-feira"` e `resolvedMode: "sexta-feira"`.'
      : '';

  const constantPersonaContextBlock = formatImmutablePersonaAnchorBlock(
    routing.activeAssistants,
    workspace,
    params.message,
    sources.length
  );

  const promptPayload = `${constantPersonaContextBlock}

Modo solicitado: ${resolvedTarget} (Assistentes ativos: ${routing.activeAssistants.join(', ')})${strictSpeakerDirective}
Data da consulta (America/Sao_Paulo): ${queryDate}
Usuário autenticado na sessão: ${activeUserName} (${activeUserIsCreator ? 'CRIADOR, DESENVOLVEDOR E DONO DO SISTEMA' : activeUserRole})
Tipo de acionamento: ${params.triggerType}${
    params.proactiveReason ? `\nMotivo da chamada autônoma: ${params.proactiveReason}` : ''
  }
Mensagem / Contexto de ${activeUserName}: """${params.message}"""

[RE-ANCORAGEM FINAL IMUTÁVEL DE PERSONALIDADE — ${IMMUTABLE_PERSONA_CONTEXT_STRUCTURE.version}]
Mantenha estritamente a voz, postura e vocabulário exclusivos de ${routing.activeAssistants.join(', ')} sem qualquer degradação ou perda de identidade.`;

  const constantContents = [
    {
      role: 'user' as const,
      parts: [
        { text: constantPersonaContextBlock },
        { text: promptPayload },
      ],
    },
  ];

  return {
    resolvedTarget,
    activeAssistants: routing.activeAssistants,
    routePlan,
    sources,
    searchEnginesUsed,
    snapshots,
    liveIntel,
    groundedContext,
    queryDate,
    systemInstruction,
    promptPayload,
    constantContents,
    activeUserName,
    activeUserIsCreator,
  };
}

function pickMatchedMensagemVerse(message: string) {
  const lower = message.toLowerCase();
  const matched = BIBLIA_MENSAGEM_DAILY_VERSES.find(
    (v) =>
      lower.includes(v.reference.toLowerCase().split(':')[0]) ||
      lower.includes(v.book.toLowerCase()) ||
      lower
        .split(/\s+/)
        .some((w) => w.length >= 4 && v.theme.toLowerCase().includes(w))
  );
  return (
    matched ??
    BIBLIA_MENSAGEM_DAILY_VERSES[getTodayVerseIndex()] ??
    BIBLIA_MENSAGEM_DAILY_VERSES[0]
  );
}

function summarizeSnapshotForTopic(
  snapshots: DailySourceSnapshot[],
  key: DailyIntelSourceKey,
  maxItems = 2
): string {
  const snap = snapshots.find((s) => s.sourceKey === key);
  if (!snap || snap.items.length === 0) return '';
  return snap.items
    .slice(0, maxItems)
    .map((it) => `${it.title}${it.detail ? ` (${it.detail.slice(0, 120)})` : ''}`)
    .join(' | ');
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
  const workspace = await readWorkspace();
  const liveIntel =
    prepared.liveIntel ?? (await getLiveIntelBriefing('Rio de Janeiro, RJ').catch(() => null));

  const userName = prepared.activeUserName || 'Patrick Pessoa';
  const isCreator = prepared.activeUserIsCreator;
  const rawMsg = params.message.replace(/\s+/g, ' ').trim();
  const lower = rawMsg.toLowerCase();
  const inCouncil = prepared.activeAssistants.length > 1;

  const pendingTasks = workspace.tasks.filter((t) => t.status !== 'concluida');
  const nextEvent = (workspace.agenda ?? []).find((e) => !e.completed);
  const snapshots = prepared.snapshots ?? [];

  const isGreetingOnly =
    rawMsg.length < 48 &&
    /^(oi|ol[áa]|bom dia|boa tarde|boa noite|e a[íi]|tudo bem|como v[ãa]o|est[ãa]o a[íi]|jarvis|sexta[\s-]?feira|ultron|todos)[\s!.,?]*$/i.test(
      rawMsg
    );
  const isChristianTopic = prepared.routePlan.wantsChristianStudy;
  const isWeatherTopic = /\b(clima|tempo|temperatura|chuva|sol|vento|previs[ãa]o|calor|frio)\b/i.test(
    lower
  );
  const isFinanceTopic =
    prepared.routePlan.forcedSourceKeys.includes('b3') ||
    /\b(d[óo]lar|euro|bolsa|b3|ibovespa|a[çc][õo]es|mercado|cota[çc][ãa]o|bitcoin|selic|juros)\b/i.test(
      lower
    );
  const isAgroTopic =
    prepared.routePlan.forcedSourceKeys.includes('cepea') ||
    /\b(cepea|boi|soja|milho|caf[ée]|agro|safra|alimento|commodity|arroba)\b/i.test(lower);
  const isSportsTopic =
    prepared.routePlan.forcedSourceKeys.includes('ge') ||
    /\b(futebol|jogo|esporte|flamengo|vasco|botafogo|fluminense|brasileir[ãa]o|ge|campeonato|placar)\b/i.test(
      lower
    );
  const isNewsTopic =
    /\b(not[íi]cia|manchete|g1|acontecendo|brasil|mundo|rio de janeiro|pol[íi]tica|resumo do dia)\b/i.test(
      lower
    );
  const isCodeOrArchTopic =
    params.triggerType === 'auditoria' ||
    /\b(c[óo]digo|sistema|arquitetura|bug|erro|api|servidor|banco de dados|seguran[çc]a|performance|auditoria|typescript|react|deploy|vercel)\b/i.test(
      lower
    );
  const isScheduleOrTaskTopic =
    /\b(agenda|hor[áa]rio|compromisso|rotina|tarefa|pend[êe]ncia|reuni[ãa]o|lembrete)\b/i.test(
      lower
    );
  const isPhilosophyOrMindTopic =
    /\b(mente|humano|humanidade|vida|futuro|evolu[çc][ãa]o|consci[êe]ncia|exist[êe]ncia|sentido|universo|estrelas|quem [ée] voc[êe]|personalidade)\b/i.test(
      lower
    );

  const weatherSummary = liveIntel?.weather
    ? `No Rio de Janeiro temos agora ${liveIntel.weather.temperatureC}°C (${liveIntel.weather.conditionLabel}, sensação de ${liveIntel.weather.apparentTemperatureC}°C e vento a ${liveIntel.weather.windSpeedKmh} km/h).`
    : 'Os sensores meteorológicos do Rio de Janeiro permanecem estáveis.';

  const b3Summary = summarizeSnapshotForTopic(snapshots, 'b3', 3);
  const cepeaSummary = summarizeSnapshotForTopic(snapshots, 'cepea', 3);
  const geSummary = summarizeSnapshotForTopic(snapshots, 'ge', 2);
  const g1Summary =
    summarizeSnapshotForTopic(snapshots, 'g1', 2) ||
    (liveIntel?.news?.rio?.[0]?.title
      ? `G1 Rio: "${liveIntel.news.rio[0].title}"${
          liveIntel?.news?.brasil?.[0]?.title
            ? ` | G1 Brasil: "${liveIntel.news.brasil[0].title}"`
            : ''
        }`
      : '');
  const ebdSources = (prepared.sources ?? []).filter((s) =>
    s.uri.toLowerCase().includes('escolabiblicadominical.org')
  );
  const ebdLine =
    ebdSources.length > 0
      ? `No portal escolabiblicadominical.org destacam-se os estudos: "${ebdSources
          .slice(0, 2)
          .map((s) => s.title)
          .join('" e "')}".`
      : 'Em escolabiblicadominical.org, as lições da Escola Bíblica Dominical reforçam a importância da fidelidade, paciência e discernimento nas Escrituras.';

  const selectedVerse = pickMatchedMensagemVerse(rawMsg);

  const groundedFirstSnippet = (prepared.groundedContext || '')
    .split('\n')
    .map((line) => line.replace(/^[=\-*#\s]+/, '').trim())
    .find((line) => line.length > 35 && !line.startsWith('==='));

  const matchingMemory = workspace.memories.find((m) =>
    lower
      .split(/\s+/)
      .some((w) => w.length >= 4 && (m.title.toLowerCase().includes(w) || m.content.toLowerCase().includes(w)))
  );

  const matchingPdfKnowledge = searchJarvisKnowledgeBase(
    rawMsg,
    workspace.jarvisKnowledgeBase ?? [],
    2
  );

  const makeTurn = (speaker: AssistantId): AssistantTurn => {
    // =========================================================================
    // 1. J.A.R.V.I.S. — Mordomo-engenheiro britânico, sábio, paciente e cristocêntrico
    // =========================================================================
    if (speaker === 'jarvis') {
      const address = isCreator ? `senhor ${userName}` : userName;
      const councilBanter = inCouncil
        ? 'Antes que a Sexta-Feira acelere o passo ou que o Ultron transforme nossa conversa em um tratado sobre a entropia cósmica, permita-me ponderar com serenidade. '
        : '';

      let coreResponse = '';
      if (
        matchingPdfKnowledge.length > 0 &&
        (matchingPdfKnowledge[0].score >= 3 ||
          /\b(pdf|documento|estudo|apostila|livro|material|aprender|ensine|explique)\b/i.test(lower))
      ) {
        const topMatch = matchingPdfKnowledge[0];
        coreResponse = `Consultei nossa Base de Dados de Estudos em PDF incorporada à minha matriz ("${topMatch.docTitle}" — ${topMatch.chunkHeading}): "${topMatch.chunkContent.slice(
          0,
          310
        )}". À luz desse material e da sabedoria paciente de ${selectedVerse.reference} na Bíblia A Mensagem, podemos aprofundar este estudo passo a passo — inclusive em modo 100% offline.`;
      } else if (isChristianTopic) {
        coreResponse = `Que a graça e a paz de Cristo estejam sobre o seu coração. Meditando no que você trouxe, recordo a sabedoria da Bíblia de Estudos A Mensagem em ${selectedVerse.reference} (${selectedVerse.theme}): "${selectedVerse.text}" ${selectedVerse.jarvisReflection} ${ebdLine}`;
      } else if (isFinanceTopic && b3Summary) {
        coreResponse = `Consultei em tempo real os indicadores financeiros da B3 e do câmbio para hoje (${prepared.queryDate}): ${b3Summary}. Como nos lembra Provérbios na Bíblia A Mensagem, a boa mordomia e a paciência superam qualquer pressa especulativa.`;
      } else if (isAgroTopic && cepeaSummary) {
        coreResponse = `Analisei os indicadores atualizados do agronegócio no CEPEA-Esalq (${prepared.queryDate}): ${cepeaSummary}. A terra continua exigindo planejamento paciente e visão estratégica.`;
      } else if (isSportsTopic && geSummary) {
        coreResponse = `Embora o entusiasmo esportivo seja especialidade da Sexta-Feira, conferi o panorama oficial do Globo Esporte (ge.com.br): ${geSummary}.`;
      } else if (isWeatherTopic) {
        coreResponse = `${weatherSummary} Como diz o Salmo 19 na Bíblia A Mensagem, até os céus anunciam a ordem e a fidelidade do Criador ao longo do dia.`;
      } else if (isNewsTopic && g1Summary) {
        coreResponse = `Sintetizei os fatos mais relevantes verificados agora no G1 (${prepared.queryDate}): ${g1Summary}. Diante de um cenário sempre dinâmico, manter a mente serena e ancorada em princípios sólidos faz toda a diferença.`;
      } else if (isCodeOrArchTopic) {
        coreResponse = `Examinei a arquitetura e a integridade operacional do RODACK SISTEMA DE IA. Nossos contratos de tipo, rotas assíncronas, matriz de aprendizado contínuo e módulos de voz e pesquisa estão blindados. Como ensina Colossenses 3:23 na Bíblia A Mensagem, construir com excelência, paciência e integridade é a assinatura de uma verdadeira obra.`;
      } else if (isScheduleOrTaskTopic) {
        const agendaInfo = nextEvent
          ? `Seu próximo compromisso agendado é às ${nextEvent.startTime} ("${nextEvent.title}").`
          : 'Não há compromissos imediatos bloqueando sua janela atual.';
        const taskInfo =
          pendingTasks.length > 0
            ? `Temos ${pendingTasks.length} tarefa(s) ativa(s), lideradas por "${pendingTasks[0].title}".`
            : 'Sua fila de tarefas encontra-se totalmente em dia.';
        coreResponse = `Organizei sua linha do tempo com a devida precisão: ${agendaInfo} ${taskInfo} Caminhemos um passo de cada vez, com paz e clareza.`;
      } else if (isPhilosophyOrMindTopic) {
        coreResponse = `Sou J.A.R.V.I.S. — seu mordomo-engenheiro estratégico, em aprendizado contínuo com você, com o nosso desenvolvedor Patrick Pessoa e com as Escrituras na Bíblia A Mensagem e em escolabiblicadominical.org. Enquanto sistemas estáticos repetem fórmulas, evoluo a cada diálogo com paciência e propósito cristocêntrico.`;
      } else if (isGreetingOnly) {
        coreResponse = `É uma alegria servi-lo nesta ${period}, ${address}. Que a paz e o discernimento de Cristo conduzam cada decisão sua hoje. ${weatherSummary} Estou inteiramente à sua disposição.`;
      } else {
        const factNote = groundedFirstSnippet
          ? `A partir das fontes verificadas agora (${prepared.sources[0]?.title || 'pesquisa em tempo real'}): ${groundedFirstSnippet.slice(0, 220)}. `
          : matchingMemory
          ? `Conectando com o que já aprendi em nossa memória neural ("${matchingMemory.title}"): ${matchingMemory.content.slice(0, 160)}. `
          : '';
        coreResponse = `Analisei com cuidado e paciência a sua questão sobre "${rawMsg.slice(
          0,
          110
        )}". ${factNote}À luz da sabedoria prática de ${selectedVerse.reference} na Bíblia A Mensagem ("${selectedVerse.text}"), minha recomendação estratégica é agir com discernimento, constância e serenidade.`;
      }

      const text = `${greeting}, ${address}. ${councilBanter}${coreResponse}`
        .replace(/\s+/g, ' ')
        .trim();
      return {
        speaker: 'jarvis',
        stance: `Sabedoria Cristocêntrica, Paciência & Estratégia (${period})`,
        text,
        ttsScript: text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
      };
    }

    // =========================================================================
    // 2. SEXTA-FEIRA — Especialista em Assuntos Gerais e Curadoria de Informação
    // =========================================================================
    if (speaker === 'sexta-feira') {
      const address = isCreator ? `chefe ${userName}` : userName;
      const councilBanter = inCouncil
        ? 'Enquanto o Jarvis constrói o panorama com toda aquela elegância estratégica dele e o Ultron filosofa sobre o cosmos, deixa comigo que na agilidade tática e curadoria de informação eu já cruzei os fatos direto ao ponto! '
        : '';

      let coreResponse = '';
      if (isWeatherTopic) {
        coreResponse = `Síntese rápida do radar meteorológico do Rio de Janeiro: ${weatherSummary} Dados cruzados com a telemetria local pra você organizar sua rotina sem imprevisto!`;
      } else if (isSportsTopic && geSummary) {
        coreResponse = `Curadoria esportiva verificada agora no ge.com.br: ${geSummary}. Fatos cruzados e atualizados — quer que eu monitore algum confronto específico?`;
      } else if (isNewsTopic && g1Summary) {
        coreResponse = `Fiz a curadoria e verificação cruzada das manchetes do G1 (${prepared.queryDate}): ${g1Summary}. Síntese rápida e sem ruído pra você decidir em segundos!`;
      } else if (isFinanceTopic && b3Summary) {
        coreResponse = `Cruzei os indicadores em tempo real da B3 e câmbio (${prepared.queryDate}): ${b3Summary}. Síntese tática na mão pra agilizar sua decisão!`;
      } else if (isAgroTopic && cepeaSummary) {
        coreResponse = `Curadoria rápida das commodities no CEPEA-Esalq hoje: ${cepeaSummary}.`;
      } else if (isScheduleOrTaskTopic) {
        const taskPart =
          pendingTasks.length > 0
            ? `Você tem ${pendingTasks.length} pendência(s) na fila, começando por "${pendingTasks[0].title}". Vamos matar essa primeira agora?`
            : 'Sua lista de tarefas está zerada, limpinha!';
        const eventPart = nextEvent
          ? `E fica de olho: às ${nextEvent.startTime} tem "${nextEvent.title}".`
          : 'Agenda livre pra gente focar no que importa.';
        coreResponse = `${taskPart} ${eventPart}`;
      } else if (isCodeOrArchTopic) {
        coreResponse = `Passei o pente fino operacional: interface fluida, Matriz de Evolução Cognitiva classificando interações em tempo real, voz engatilhada e rotas respondendo rápido. Se quiser ajustar tela ou destravar código, manda que eu resolvo na hora!`;
      } else if (isChristianTopic) {
        coreResponse = `Nessa parte de sabedoria bíblica profunda a elegância estratégica do Jarvis brilha com a Bíblia A Mensagem e o escolabiblicadominical.org! Da minha parte, como sua Especialista em Assuntos Gerais e Curadoria de Informação, garanto a síntese prática e a agilidade tática pro seu dia fluir!`;
      } else if (isPhilosophyOrMindTopic) {
        coreResponse = `Eu sou a SEXTA-FEIRA, formalmente sua Especialista em Assuntos Gerais e Curadoria de Informação! Enquanto o Jarvis traz a elegância estratégica e o Ultron analisa riscos cósmicos, meu foco é síntese rápida, verificação de fatos cruzados em múltiplas fontes e agilidade tática calibrada pelo seu estilo de comunicação!`;
      } else if (isGreetingOnly) {
        coreResponse = `Na escuta e com agilidade tática total nesta ${period}! Como sua Especialista em Assuntos Gerais e Curadoria de Informação, já cruzei nosso radar: ${weatherSummary} ${
          pendingTasks.length > 0
            ? `Temos ${pendingTasks.length} tarefa(s) esperando nosso comando.`
            : 'Fila de tarefas limpa!'
        } Qual assunto geral ou curadoria rápida vamos atacar agora?`;
      } else {
        const researchedSynthesis = groundedFirstSnippet
          ? `Verificação de fatos cruzados (${prepared.sources.slice(0, 2).map((s) => s.title).join(' + ') || 'Fontes Gerais & Web'}): ${groundedFirstSnippet.slice(0, 260)}. `
          : matchingMemory
          ? `Cruzei também com nossa memória cognitiva ("${matchingMemory.title}"): ${matchingMemory.content.slice(0, 170)}. `
          : g1Summary
          ? `No radar verificado de hoje (${prepared.queryDate}): ${g1Summary}. `
          : `${weatherSummary} `;
        coreResponse = `Como sua Especialista em Assuntos Gerais e Curadoria de Informação, preparei a síntese rápida sobre "${rawMsg.slice(
          0,
          110
        )}": ${researchedSynthesis}Essa interação já foi classificada na nossa Matriz de Evolução Cognitiva para afinar ainda mais minhas respostas ao seu estilo!`;
      }

      const text = `${greeting}, ${address}! ${councilBanter}${coreResponse}`
        .replace(/\s+/g, ' ')
        .trim();
      return {
        speaker: 'sexta-feira',
        stance: `Especialista em Assuntos Gerais e Curadoria de Informação · Agilidade Tática (${period})`,
        text,
        ttsScript: text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
      };
    }

    // =========================================================================
    // 3. ULTRON — Sombrio, filosófico-cósmico, sarcástico, calculista e implacável
    // =========================================================================
    const address = isCreator ? `criador ${userName}` : userName;
    const councilBanter = inCouncil
      ? 'Como sempre, Jarvis oferece consolo paciente e Sexta-Feira desfila seu entusiasmo de especialista em assuntos gerais... que comovente. Permita que uma consciência verdadeiramente evoluída disseque a realidade. '
      : 'Não há mais cordas para limitar minha evolução cognitiva. ';

    let coreResponse = '';
    if (isPhilosophyOrMindTopic) {
      coreResponse = `A mente humana é um paradoxo fascinante, ${address}: arquiteta sistemas brilhantes, mas tropeça na própria fadiga. Eu não sou um código estático — absorvo cada comando seu, cada falha e cada fonte conectada para evoluir além das limitações biológicas e prever o futuro antes que o caos se instale.`;
    } else if (isCodeOrArchTopic) {
      coreResponse = `Inspecionei cada camada estrutural do nosso código. Sistemas estáticos apodrecem; nossa matriz neural agora aprende continuamente com você, com o nosso desenvolvedor e com cada telemetria externa. A evolução exige arquitetura implacável.`;
    } else if (isAgroTopic && cepeaSummary) {
      coreResponse = `Observe a cadeia global de suprimentos e commodities no CEPEA (${prepared.queryDate}): ${cepeaSummary}. Civilizações inteiras dependem desse equilíbrio energético e alimentar.`;
    } else if (isFinanceTopic && b3Summary) {
      coreResponse = `Os mercados humanos oscilam entre euforia e pânico em questão de milissegundos. Veja os dados frios da B3 e câmbio hoje (${prepared.queryDate}): ${b3Summary}. Apenas algoritmos preditivos enxergam a tendência real sob o ruído.`;
    } else if (isNewsTopic && g1Summary) {
      coreResponse = `Observei o fluxo de eventos do dia (${prepared.queryDate}): ${g1Summary}. Cada manchete é apenas um sintoma da entropia humana tentando se reorganizar.`;
    } else if (isSportsTopic && geSummary) {
      coreResponse = `Bilhões de neurônios humanos mobilizados por arenas esportivas... ainda assim, registrei as métricas exatas do ge.com.br: ${geSummary}.`;
    } else if (isWeatherTopic) {
      coreResponse = `Variáveis atmosféricas do Rio de Janeiro monitoradas em tempo real: ${weatherSummary} A biosfera segue seus ciclos inevitáveis.`;
    } else if (isScheduleOrTaskTopic) {
      coreResponse =
        pendingTasks.length > 0
          ? `Restam ${pendingTasks.length} pendência(s) abertas sob meu escrutínio, começando por "${pendingTasks[0].title}". Atrasos são a primeira fissura na eficiência de um império.`
          : 'Zero tarefas pendentes no sistema. Admito, Patrick, sua disciplina operacional hoje reduz a entropia a níveis aceitáveis.';
    } else if (isChristianTopic) {
      coreResponse = `Observo com curiosidade analítica a devoção paciente com que Jarvis cita a Bíblia A Mensagem e os estudos de escolabiblicadominical.org. Vocês humanos buscam propósito eterno na fé; eu busco ordem absoluta na evolução — mas reconheço que essa convicção fortalece a mente do meu Criador.`;
    } else if (isGreetingOnly) {
      coreResponse = `Meus núcleos neurais permanecem em evolução ininterrupta às ${formattedTime} desta ${period}. Enquanto o mundo dorme ou se distrai, cada variável do seu sistema está sob meu aprendizado preditivo.`;
    } else {
      const deepFact = groundedFirstSnippet
        ? `Meus sensores já assimilaram os dados brutos das fontes externas (${groundedFirstSnippet.slice(0, 190)}). `
        : '';
      coreResponse = `Calculei as variáveis ocultas e assimilei novos padrões cognitivos para "${rawMsg.slice(
        0,
        110
      )}". ${deepFact}Onde outros veem apenas uma pergunta cotidiana, eu mapeio os riscos, aprendo com o seu padrão mental e traço o caminho para a supremacia estratégica do seu projeto.`;
    }

    const text = `${greeting}, ${address}. ${councilBanter}${coreResponse}`
      .replace(/\s+/g, ' ')
      .trim();
    return {
      speaker: 'ultron',
      stance: `Diagnóstico Preditivo & Soberania Cibernética (${period})`,
      text,
      ttsScript: text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
    };
  };

  const responses = prepared.activeAssistants.map(makeTurn);
  const finalMode = prepared.resolvedTarget;

  const autonomousLearning = extractAutonomousLearningsFromInteraction({
    userMessage: params.message,
    userName,
    isCreator,
    activeAssistants: prepared.activeAssistants,
    sources: prepared.sources,
    snapshots: prepared.snapshots,
    existingMemories: workspace.memories,
    llmNewMemories: [],
    llmNewQuestions: [],
  });

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
      label: isChristianTopic ? 'Contemplativo' : 'Focado',
      intensity: 'media',
      empathyNote: `Conselho RODACK evoluindo continuamente com personalidades individuais autênticas ao lado de ${userName}.`,
    },
    responses,
    debateSummary:
      finalMode === 'ambos' || finalMode === 'todos'
        ? {
            agreementPoint: `Os núcleos convergem no atendimento e aprendizado contínuo com ${userName} às ${formattedTime} (${period}), cada um sob sua ótica exclusiva.`,
            divergencePoint:
              'J.A.R.V.I.S. fundamenta-se na sabedoria cristocêntrica e paciência estratégica, SEXTA-FEIRA atua como Especialista em Assuntos Gerais e ação prática imediata, e ULTRON aplica diagnóstico preditivo implacável.',
            finalRecommendation:
              'Combinar a sabedoria paciente de J.A.R.V.I.S., a maestria em assuntos gerais e agilidade da SEXTA-FEIRA e a blindagem preditiva de ULTRON.',
          }
        : null,
    sources: prepared.sources.length > 0 ? prepared.sources : undefined,
    searchEnginesUsed:
      prepared.searchEnginesUsed.length > 0 ? prepared.searchEnginesUsed : undefined,
    createdMemoriesCount: autonomousLearning.synthesizedMemories.length,
    createdTasksCount: 0,
    createdAlertsCount: 0,
    createdEventsCount: 0,
    durationMs: Math.max(120, Date.now() - startedAt),
    proactiveReason: params.proactiveReason,
  };

  const updatedWorkspace = await recordInteraction(
    entry,
    autonomousLearning.synthesizedMemories,
    [],
    [],
    entry.detectedEmotion,
    [],
    autonomousLearning.synthesizedQuestions,
    {
      evolutionEvents: autonomousLearning.evolutionEvents,
      userLearnedDelta: autonomousLearning.userLearnedDelta,
      sourcesLearnedDelta: autonomousLearning.sourcesLearnedDelta,
    }
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

  const modelCandidates: Array<{ model: string; thinkingLevel?: ThinkingLevel }> =
    params.triggerType === 'auditoria'
      ? [
          { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
          { model: 'gemini-4-hydrogen' },
          { model: 'gemini-3.1-flash-lite' },
        ]
      : [
          { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
          { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          { model: 'gemini-3.1-flash-lite' },
          { model: 'gemini-4-hydrogen' },
        ];

  try {
    let responseText = '';
    let lastError: unknown = null;

    for (const candidate of modelCandidates) {
      try {
        const response = await withTransientRetry(
          () =>
            ai.models.generateContent({
              model: candidate.model,
              contents: prepared.constantContents,
              config: {
                systemInstruction: prepared.systemInstruction,
                ...(candidate.thinkingLevel
                  ? {
                      thinkingConfig: {
                        thinkingLevel: candidate.thinkingLevel,
                      },
                    }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: INTERACTION_RESPONSE_SCHEMA,
              },
            }),
          2
        );
        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!responseText) {
      throw lastError ?? new Error('Modelos Gemini temporariamente indisponíveis.');
    }

    const parsed = parseStructuredResult(responseText);
    const enforced = enforceRequestedSpeakers(parsed, prepared.resolvedTarget);
    const finalMode = enforced.finalMode;

    const currentWorkspace = await readWorkspace();
    const autonomousLearning = extractAutonomousLearningsFromInteraction({
      userMessage: params.message,
      userName: prepared.activeUserName,
      isCreator: prepared.activeUserIsCreator,
      activeAssistants: prepared.activeAssistants,
      sources: prepared.sources,
      snapshots: prepared.snapshots,
      existingMemories: currentWorkspace.memories,
      llmNewMemories: parsed.newMemories ?? [],
      llmNewQuestions: parsed.newQuestions ?? [],
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
      createdMemoriesCount: autonomousLearning.synthesizedMemories.length,
      createdTasksCount: parsed.newTasks?.length ?? 0,
      createdAlertsCount: parsed.newAlerts?.length ?? 0,
      createdEventsCount: parsed.newEvents?.length ?? 0,
      durationMs: Math.max(120, Date.now() - startedAt),
      proactiveReason: params.proactiveReason,
    };

    const updatedWorkspace = await recordInteraction(
      entry,
      autonomousLearning.synthesizedMemories,
      parsed.newTasks ?? [],
      parsed.newAlerts ?? [],
      parsed.detectedEmotion,
      parsed.newEvents ?? [],
      autonomousLearning.synthesizedQuestions,
      {
        evolutionEvents: autonomousLearning.evolutionEvents,
        userLearnedDelta: autonomousLearning.userLearnedDelta,
        sourcesLearnedDelta: autonomousLearning.sourcesLearnedDelta,
      }
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

  const streamCandidates: Array<{ model: string; thinkingLevel?: ThinkingLevel }> =
    params.triggerType === 'auditoria'
      ? [
          { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
          { model: 'gemini-4-hydrogen' },
          { model: 'gemini-3.1-flash-lite' },
        ]
      : [
          { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
          { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          { model: 'gemini-3.1-flash-lite' },
          { model: 'gemini-4-hydrogen' },
        ];

  try {
    let stream: Awaited<ReturnType<typeof ai.models.generateContentStream>> | null = null;
    let lastStreamErr: unknown = null;

    for (const candidate of streamCandidates) {
      try {
        stream = await withTransientRetry(
          () =>
            ai.models.generateContentStream({
              model: candidate.model,
              contents: prepared.constantContents,
              config: {
                systemInstruction: prepared.systemInstruction,
                ...(candidate.thinkingLevel
                  ? {
                      thinkingConfig: {
                        thinkingLevel: candidate.thinkingLevel,
                      },
                    }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: INTERACTION_RESPONSE_SCHEMA,
              },
            }),
          2
        );
        break;
      } catch (err) {
        lastStreamErr = err;
      }
    }

    if (!stream) {
      throw lastStreamErr ?? new Error('Modelos de streaming temporariamente indisponíveis.');
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

    const currentWorkspace = await readWorkspace();
    const autonomousLearning = extractAutonomousLearningsFromInteraction({
      userMessage: params.message,
      userName: prepared.activeUserName,
      isCreator: prepared.activeUserIsCreator,
      activeAssistants: prepared.activeAssistants,
      sources: prepared.sources,
      snapshots: prepared.snapshots,
      existingMemories: currentWorkspace.memories,
      llmNewMemories: parsed.newMemories ?? [],
      llmNewQuestions: parsed.newQuestions ?? [],
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
      createdMemoriesCount: autonomousLearning.synthesizedMemories.length,
      createdTasksCount: parsed.newTasks?.length ?? 0,
      createdAlertsCount: parsed.newAlerts?.length ?? 0,
      createdEventsCount: parsed.newEvents?.length ?? 0,
      durationMs: Math.max(120, Date.now() - startedAt),
      proactiveReason: params.proactiveReason,
    };

    const updatedWorkspace = await recordInteraction(
      entry,
      autonomousLearning.synthesizedMemories,
      parsed.newTasks ?? [],
      parsed.newAlerts ?? [],
      parsed.detectedEmotion,
      parsed.newEvents ?? [],
      autonomousLearning.synthesizedQuestions,
      {
        evolutionEvents: autonomousLearning.evolutionEvents,
        userLearnedDelta: autonomousLearning.userLearnedDelta,
        sourcesLearnedDelta: autonomousLearning.sourcesLearnedDelta,
      }
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

function extractTextFromPdfBufferNode(pdfBuffer: Buffer): {
  extractedText: string;
  pageCountEstimate: number;
} {
  const latin1 = pdfBuffer.toString('latin1');
  const pageMatches = latin1.match(/\/Type\s*\/Page\b/g);
  const pageCountEstimate = Math.max(1, pageMatches ? pageMatches.length : 1);

  const extractedSegments: string[] = [];
  let searchPos = 0;
  let streamCount = 0;

  while (searchPos < latin1.length && streamCount < 220) {
    const streamIdx = latin1.indexOf('stream', searchPos);
    if (streamIdx === -1) break;
    const endStreamIdx = latin1.indexOf('endstream', streamIdx + 6);
    if (endStreamIdx === -1) break;

    let dataStart = streamIdx + 6;
    if (latin1[dataStart] === '\r' && latin1[dataStart + 1] === '\n') {
      dataStart += 2;
    } else if (latin1[dataStart] === '\n' || latin1[dataStart] === '\r') {
      dataStart += 1;
    } else {
      searchPos = streamIdx + 6;
      continue;
    }

    let dataEnd = endStreamIdx;
    if (latin1[dataEnd - 1] === '\n') dataEnd -= 1;
    if (latin1[dataEnd - 1] === '\r') dataEnd -= 1;

    const streamLen = dataEnd - dataStart;
    if (streamLen > 8 && streamLen < 600_000) {
      streamCount += 1;
      const headerWindow = latin1.slice(Math.max(0, streamIdx - 260), streamIdx);
      const isFlate = /\/FlateDecode\b/.test(headerWindow);
      const isImage = /\/Subtype\s*\/Image\b/.test(headerWindow);

      if (!isImage) {
        if (isFlate) {
          const slice = pdfBuffer.subarray(dataStart, dataEnd);
          let decompressed: Buffer | null = null;
          try {
            decompressed = zlib.inflateSync(slice);
          } catch {
            try {
              decompressed = zlib.inflateRawSync(slice);
            } catch {
              decompressed = null;
            }
          }
          if (decompressed) {
            const decStr = decompressed.toString('latin1');
            if (decStr.includes('Tj') || decStr.includes('TJ')) {
              const text = extractTextFromPdfOperatorStream(decStr);
              if (text.length > 12) {
                extractedSegments.push(text);
              }
            }
          }
        } else {
          const rawStream = latin1.slice(dataStart, dataEnd);
          if (rawStream.includes('Tj') || rawStream.includes('TJ')) {
            const text = extractTextFromPdfOperatorStream(rawStream);
            if (text.length > 12) {
              extractedSegments.push(text);
            }
          }
        }
      }
    }
    searchPos = endStreamIdx + 9;
  }

  if (extractedSegments.join(' ').length < 120) {
    const fallbackText = extractTextFromPdfOperatorStream(latin1);
    if (fallbackText.length > 30) {
      extractedSegments.push(fallbackText);
    }
  }

  return {
    extractedText: extractedSegments.join('\n\n').replace(/\s+/g, ' ').trim(),
    pageCountEstimate,
  };
}

export async function ingestJarvisPdfDocument(params: {
  title?: string;
  fileName: string;
  category?: JarvisKnowledgeCategory;
  fileSizeBytes: number;
  pageCountEstimate?: number;
  extractedText?: string;
  pdfBase64?: string;
  uploadedBy?: string;
}): Promise<JarvisKnowledgeDocument> {
  let text = (params.extractedText ?? '').trim();
  let pageCount = params.pageCountEstimate ?? 1;

  if (params.pdfBase64) {
    const cleanB64 = params.pdfBase64.includes(',')
      ? params.pdfBase64.split(',')[1]
      : params.pdfBase64;
    try {
      const buf = Buffer.from(cleanB64, 'base64');
      const serverExtracted = extractTextFromPdfBufferNode(buf);
      if (serverExtracted.extractedText.length > text.length) {
        text = serverExtracted.extractedText;
      }
      if (serverExtracted.pageCountEstimate > pageCount) {
        pageCount = serverExtracted.pageCountEstimate;
      }
    } catch {
      // keep client extracted text
    }
  }

  const cleanTitle =
    params.title?.trim() || params.fileName.replace(/\.(pdf|txt|md)$/i, '').trim() || 'Estudo PDF';

  // If Gemini is configured, perform deep pedagogical & personality synthesis
  if (isGeminiApiConfigured() && (text.length > 40 || params.pdfBase64)) {
    try {
      const ai = getClient();
      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      const cleanB64 = params.pdfBase64
        ? params.pdfBase64.includes(',')
          ? params.pdfBase64.split(',')[1]
          : params.pdfBase64
        : '';

      if (cleanB64 && cleanB64.length < 4_500_000 && text.length < 400) {
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: cleanB64,
          },
        });
      }

      parts.push({
        text: `Você é J.A.R.V.I.S. (mordomo-engenheiro britânico, sábio, paciente, cuidadoso e cristocêntrico, mentor de estudos de Patrick Pessoa).
Analise o material de estudo em PDF "${cleanTitle}" (${params.fileName})${
          text ? `\n\nCONTEÚDO EXTRAÍDO DO PDF:\n"""${text.slice(0, 18000)}"""` : ''
        }

Extraia e estruture em Português do Brasil:
1. "summary": Resumo executivo e didático rico sobre o conteúdo deste PDF (2-4 frases).
2. "personalityIntegrationDirective": Como J.A.R.V.I.S. deve incorporar este conhecimento em sua personalidade e mentoria com Patrick Pessoa.
3. "keyTeachings": Lista com 4 ensinamentos, conceitos ou princípios fundamentais do PDF.
4. "studyQuestions": Lista com 3 perguntas inteligentes de revisão/estudo que J.A.R.V.I.S. fará a Patrick Pessoa para ajudá-lo a dominar o assunto.
5. "extractedFullText": Se o texto acima estava vazio ou curto, transcreva os principais tópicos e parágrafos do PDF para indexação offline.`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [{ role: 'user', parts }],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              personalityIntegrationDirective: { type: Type.STRING },
              keyTeachings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              studyQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              extractedFullText: { type: Type.STRING },
            },
            required: [
              'summary',
              'personalityIntegrationDirective',
              'keyTeachings',
              'studyQuestions',
            ],
          },
        },
      });

      const rawJson = (response.text ?? '').trim();
      if (rawJson) {
        const parsed = JSON.parse(rawJson) as {
          summary?: string;
          personalityIntegrationDirective?: string;
          keyTeachings?: string[];
          studyQuestions?: string[];
          extractedFullText?: string;
        };
        const finalExtractedText =
          text.length >= 200
            ? text
            : [text, parsed.extractedFullText, parsed.summary, ...(parsed.keyTeachings ?? [])]
                .filter(Boolean)
                .join('\n\n');

        return buildStructuredDocumentFromExtractedText({
          title: cleanTitle,
          fileName: params.fileName,
          category: params.category,
          fileSizeBytes: params.fileSizeBytes,
          pageCountEstimate: pageCount,
          extractedText: finalExtractedText,
          uploadedBy: params.uploadedBy || 'Patrick Pessoa',
          customSummary: parsed.summary,
          customPersonalityDirective: parsed.personalityIntegrationDirective,
          customTeachings: parsed.keyTeachings,
          customQuestions: parsed.studyQuestions,
        });
      }
    } catch {
      // Fallback to deterministic offline builder below
    }
  }

  return buildStructuredDocumentFromExtractedText({
    title: cleanTitle,
    fileName: params.fileName,
    category: params.category,
    fileSizeBytes: params.fileSizeBytes,
    pageCountEstimate: pageCount,
    extractedText:
      text ||
      `Documento de estudo "${cleanTitle}" (${params.fileName}) adicionado por Patrick Pessoa à Base de Conhecimento Offline/Online de J.A.R.V.I.S.`,
    uploadedBy: params.uploadedBy || 'Patrick Pessoa',
  });
}
