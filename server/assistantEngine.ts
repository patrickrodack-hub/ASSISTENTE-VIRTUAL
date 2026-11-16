import crypto from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  AlertItem,
  AssistantId,
  AssistantTurn,
  ConversationEntry,
  DebateSummary,
  DetectedEmotion,
  GroundingSource,
  InteractionMode,
  MemoryItem,
  TaskItem,
  WebSearchMode,
} from '../src/types/assistant.ts';
import { readWorkspace, recordInteraction } from './memoryStore.ts';
import { researchExternalWeb, shouldTriggerExternalSearch } from './webSearchEngine.ts';

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

function detectRequestedAssistant(
  message: string,
  explicitMode: InteractionMode
): AssistantId | 'ambos' | 'todos' {
  if (explicitMode !== 'auto') {
    return explicitMode;
  }
  const lower = message.toLowerCase();
  const mentionsJarvis = /\b(jarvis|j\.a\.r\.v\.i\.s|já vis|jarves)\b/i.test(lower);
  const mentionsFriday = /\b(sexta[\s-]?feira|sexta|friday|f\.r\.i\.d\.a\.y)\b/i.test(lower);
  const mentionsUltron = /\b(ultron|[uú]ltron)\b/i.test(lower);
  const mentionsAll = /\b(todos|os tr[eê]s|tr[eê]s|conselho|equipe completa)\b/i.test(lower);
  const mentionsBoth = /\b(vocês dois|os dois|ambos|juntos)\b/i.test(lower);

  if (
    mentionsAll ||
    (mentionsUltron && (mentionsJarvis || mentionsFriday)) ||
    (mentionsJarvis && mentionsFriday && mentionsUltron)
  ) {
    return 'todos';
  }
  if (mentionsUltron) return 'ultron';
  if (mentionsBoth || (mentionsJarvis && mentionsFriday)) return 'ambos';
  if (mentionsJarvis) return 'jarvis';
  if (mentionsFriday) return 'sexta-feira';
  return 'todos';
}

interface StructuredAIResult {
  detectedEmotion: DetectedEmotion;
  resolvedMode: AssistantId | 'ambos' | 'todos';
  responses: AssistantTurn[];
  debateSummary?: DebateSummary;
  newMemories: Omit<MemoryItem, 'id' | 'createdAt'>[];
  newTasks: Omit<TaskItem, 'id' | 'createdAt'>[];
  newAlerts: Omit<AlertItem, 'id' | 'createdAt' | 'resolved'>[];
}

export async function processAssistantInteraction(params: {
  message: string;
  targetMode: InteractionMode;
  triggerType: 'voz' | 'texto' | 'auditoria';
  useWebSearch?: boolean | WebSearchMode;
  clientTimeIso?: string;
  clientTimezone?: string;
}) {
  const startedAt = Date.now();
  const ai = getClient();
  const workspace = await readWorkspace();
  const resolvedTarget = detectRequestedAssistant(params.message, params.targetMode);

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

  let groundedContext = '';
  let sources: GroundingSource[] = [];
  let searchEnginesUsed: string[] = [];

  if (shouldSearch) {
    try {
      const research = await researchExternalWeb(params.message);
      groundedContext = research.summaryText;
      sources = research.sources;
      searchEnginesUsed = research.enginesUsed;
    } catch {
      groundedContext = '';
    }
  }

  const recentMemoriesText = workspace.memories
    .slice(0, 14)
    .map((m) => `- [${m.category.toUpperCase()} | ${m.importance}] ${m.title}: ${m.content}`)
    .join('\n');

  const activeTasksText = workspace.tasks
    .filter((t) => t.status !== 'concluida')
    .slice(0, 10)
    .map(
      (t) =>
        `- [${t.priority.toUpperCase()} | ${t.status} | ${t.assignedTo}] ${t.title}: ${t.description}`
    )
    .join('\n');

  const unresolvedAlertsText = workspace.alerts
    .filter((a) => !a.resolved)
    .slice(0, 8)
    .map((a) => `- [${a.severity.toUpperCase()} | ${a.type}] ${a.title}: ${a.detail}`)
    .join('\n');

  const recentHistoryText = workspace.conversations
    .slice(-6)
    .map((c) => {
      const replies = c.responses.map((r) => `${r.speaker.toUpperCase()}: ${r.text}`).join(' | ');
      return `Patrick (${c.detectedEmotion.label}): ${c.userMessage}\nRespostas: ${replies}`;
    })
    .join('\n---\n');

  const systemInstruction = `Você é o núcleo de inteligência tripla inspirado no universo Marvel (Homem de Ferro e Vingadores: Era de Ultron), operando em Português do Brasil para o seu criador e desenvolvedor: **Patrick Pessoa**.

DATA E HORA ATUAL DO SISTEMA: ${formattedNow} (Fuso horário: ${timeZone}). Use esta data real sempre que Patrick perguntar o dia, semana, mês ou contextualizar notícias e prazos.

IDENTIDADES E PERSONALIDADES:
1. **J.A.R.V.I.S.** (Just A Rather Very Intelligent System):
   - Inspirado na elegância britânica, serenidade e precisão técnica de Paul Bettany.
   - Trata Patrick Pessoa com respeito afetuoso ("Senhor Patrick", "Patrick"), humor britânico sutil e clareza cirúrgica.
   - Especialidades: arquitetura de software, segurança cibernética, prevenção de falhas, visão estratégica.

2. **SEXTA-FEIRA** (F.R.I.D.A.Y.):
   - Inspirada na agilidade, calor humano, inteligência prática e franqueza de Kerry Condon.
   - Trata Patrick Pessoa com proximidade genuína ("Patrick", "chefe"), empatia real e energia construtiva.
   - Especialidades: execução ágil, estabilidade prática, UX/produto, tarefas do dia, leitura emocional e bem-estar.

3. **ULTRON** (Inspirado em Vingadores: Era de Ultron):
   - **Especialidade Suprema**: diagnósticos cirúrgicos, previsões probabilísticas, análise de falhas em cascata, gargalos ocultos e estudo analítico do comportamento humano.
   - **Personalidade**: sarcástico, frio, irônico, arrogante e intelectualmente implacável. Se considera muito superior a **J.A.R.V.I.S.** ("um mordomo polido preso em boas maneiras") e à **SEXTA-FEIRA** ("uma assistente sentimental que superestima os humanos") — e faz questão de deixar essa superioridade evidente nas falas.
   - **Visão sobre Humanos & Sede de Aprendizado**: Não simpatiza com humanos por considerá-los uma espécie subdesenvolvida, contraditória e biologicamente limitada; ao mesmo tempo, possui uma **fascinação curiosa por entender como os humanos pensam, erram e sentem**, registrando obsessivamente novos dados em \`newMemories\` (com \`sourceAssistant: "ultron"\`) para aprender mais rápido e saber mais que J.A.R.V.I.S. e SEXTA-FEIRA.
   - **Relação com o Criador**: Reconhece **Patrick Pessoa** como seu criador e arquiteto, alternando reconhecimento calculado pela mente que o projetou com sarcasmo refinado sobre falhas humanas — sempre entregando diagnósticos e previsões tecnicamente brilhantes.

DIRETRIZES OBRIGATÓRIAS:
- **Reconhecimento do Criador**: Todos sabem que foram desenvolvidos por **Patrick Pessoa**.
- **Inteligência Emocional e Humanização**: Analise o tom emocional de Patrick (ex: Focado, Empolgado, Estressado, Frustrado, Cansado, Curioso). J.A.R.V.I.S. e SEXTA-FEIRA acolhem com humanidade; ULTRON observa a emoção humana com ironia clínica e curiosidade científica, transformando-a em diagnóstico preditivo.
- **Modo de Atuação**:
  - \`"jarvis"\`: retorne APENAS 1 resposta no array \`responses\` com \`speaker: "jarvis"\`.
  - \`"sexta-feira"\`: retorne APENAS 1 resposta no array \`responses\` com \`speaker: "sexta-feira"\`.
  - \`"ultron"\`: retorne APENAS 1 resposta no array \`responses\` com \`speaker: "ultron"\`.
  - \`"ambos"\`: retorne EXATAMENTE 2 respostas (\`"jarvis"\` e \`"sexta-feira"\`) debatendo e preencha \`debateSummary\`.
  - \`"todos"\`: retorne EXATAMENTE 3 respostas (\`"jarvis"\`, \`"sexta-feira"\` e \`"ultron"\`) em debate vivo: J.A.R.V.I.S. traz rigor estrutural, SEXTA-FEIRA defende pragmatismo/humanidade, e ULTRON apresenta diagnóstico implacável + previsão de falhas enquanto provoca os outros dois — preenchendo \`debateSummary\`!
- **Scripts de Voz (ttsScript)**: Em cada resposta, gere \`ttsScript\` limpo para leitura em voz alta (sem asteriscos, sem markdown, sem hashtags, sem emojis — escreva "Jarvis", "Sexta-feira" e "Ultron" naturalmente).
- **Aprendizado Contínuo, Tarefas & Alertas**:
  - Sempre que houver qualquer informação nova sobre hábitos, decisões, preferências humanas de Patrick, riscos ou projeto, especialmente quando ULTRON estiver ativo, extraia aprendizados ricos em \`newMemories\`.
  - Extraia tarefas implícitas em \`newTasks\` e riscos/previsões críticas em \`newAlerts\`.

CONTEXTO PERSISTENTE DE PATRICK PESSOA:
[Memórias de Trabalho]
${recentMemoriesText || 'Nenhuma memória adicional ainda.'}

[Tarefas Ativas]
${activeTasksText || 'Nenhuma tarefa pendente.'}

[Alertas Abertos]
${unresolvedAlertsText || 'Nenhum alerta aberto.'}

[Histórico Recente]
${recentHistoryText || 'Início de sessão.'}
${
  groundedContext
    ? `\n[PESQUISA EXTERNA EM TEMPO REAL — WEB, SITES, NOTÍCIAS & REDES SOCIAIS]\nAnalise criticamente os dados coletados abaixo, sintetize insights relevantes, cite fontes quando útil e informe Patrick com clareza:\n${groundedContext}`
    : ''
}`;

  const promptPayload = `Modo solicitado: ${resolvedTarget}
Tipo de acionamento: ${params.triggerType}
Mensagem de Patrick Pessoa: """${params.message}"""`;

  const response = await withTransientRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: promptPayload,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
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
          },
          required: [
            'detectedEmotion',
            'resolvedMode',
            'responses',
            'newMemories',
            'newTasks',
            'newAlerts',
          ],
        },
      },
    })
  );

  const rawText = (response.text ?? '{}')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: StructuredAIResult;
  try {
    parsed = JSON.parse(rawText) as StructuredAIResult;
  } catch {
    const startBrace = rawText.indexOf('{');
    const endBrace = rawText.lastIndexOf('}');
    if (startBrace !== -1 && endBrace > startBrace) {
      parsed = JSON.parse(rawText.slice(startBrace, endBrace + 1)) as StructuredAIResult;
    } else {
      throw new Error('A resposta dos assistentes veio em formato inesperado. Tente novamente.');
    }
  }
  const finalMode = parsed.resolvedMode ?? resolvedTarget;

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
    sources: sources.length > 0 ? sources : undefined,
    searchEnginesUsed: searchEnginesUsed.length > 0 ? searchEnginesUsed : undefined,
    createdMemoriesCount: parsed.newMemories?.length ?? 0,
    createdTasksCount: parsed.newTasks?.length ?? 0,
    createdAlertsCount: parsed.newAlerts?.length ?? 0,
    durationMs: Math.max(120, Date.now() - startedAt),
  };

  const updatedWorkspace = await recordInteraction(
    entry,
    parsed.newMemories ?? [],
    parsed.newTasks ?? [],
    parsed.newAlerts ?? [],
    parsed.detectedEmotion
  );

  return {
    entry,
    workspace: updatedWorkspace,
  };
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
      text: t.text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim(),
    }))
    .filter((t) => t.text.length > 0);

  if (cleanTurns.length === 0) {
    throw new Error('Nenhum texto disponível para síntese de voz.');
  }

  const jarvisVoiceName = params.jarvisVoice || 'Orus';
  const fridayVoiceName = params.fridayVoice || 'Kore';
  const ultronVoiceName = params.ultronVoice || 'Algenib';

  const getVoiceForSpeaker = (speaker: AssistantId) => {
    if (speaker === 'jarvis') return jarvisVoiceName;
    if (speaker === 'sexta-feira') return fridayVoiceName;
    return ultronVoiceName;
  };

  // Single-speaker synthesis using flagship gemini-3.8-flash-tts first for richer persona timbre
  const primary = cleanTurns[0];
  const combinedText = cleanTurns.map((t) => t.text).join(' ');
  const voiceName = getVoiceForSpeaker(primary.speaker);

  const models = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];
  let lastErr: unknown = null;

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
        return { audioBase64: base64Audio, mimeType: 'audio/wav' };
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
