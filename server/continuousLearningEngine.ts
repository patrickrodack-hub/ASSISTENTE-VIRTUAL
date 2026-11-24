import crypto from 'node:crypto';
import type {
  AssistantCognitiveEvolutionProfile,
  AssistantId,
  ConversationEntry,
  CreatorQuestionItem,
  DailySourceSnapshot,
  GroundingSource,
  MemoryItem,
  NeuralEvolutionEvent,
  SystemNeuralEvolutionState,
  TurnFeedback,
  WorkspaceState,
} from '../src/types/assistant.ts';

export const INTEGRATED_KNOWLEDGE_SOURCES = [
  'Bíblia de Estudos "A Mensagem" (Eugene H. Peterson)',
  'escolabiblicadominical.org (Estudos Bíblicos & EBD)',
  'bibliaon.com (Devocionais & Versículos Diários)',
  'g1.com.br (Notícias Rio, Brasil & Mundo)',
  'ge.com.br (Globo Esporte & Tabelas)',
  'b3.com.br + BCB (Bolsa de Valores, Dólar & Câmbio)',
  'cepea.com.br (CEPEA-Esalq · Commodities & Agronegócio)',
  'Wikipedia & Enciclopédia Geral (Assuntos Gerais — SEXTA-FEIRA)',
  'Open-Meteo RJ (Telemetria Meteorológica em Tempo Real)',
  'Redes Sociais Tradicionais & Dossiê Patrick Pessoa',
] as const;

function computeLevelFromXp(xp: number): { level: number; nextLevelXp: number } {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = Math.max(1, Math.floor(safeXp / 250) + 1);
  const nextLevelXp = level * 250;
  return { level, nextLevelXp };
}

export function createDefaultNeuralEvolutionState(): SystemNeuralEvolutionState {
  const now = new Date().toISOString();
  return {
    version: 'NVIDIA-COGNITIVE-CORE-V5',
    totalLearningCycles: 12,
    activeSourcesIntegrated: [...INTEGRATED_KNOWLEDGE_SOURCES],
    assistants: {
      jarvis: {
        assistantId: 'jarvis',
        cognitiveLevel: 5,
        experiencePoints: 1120,
        nextLevelXp: 1250,
        specialtyTitle:
          'Sabedoria Cristocêntrica (Bíblia A Mensagem & EBD), Arquitetura de Software, Segurança & Finanças (B3)',
        learnedFromUserCount: 14,
        learnedFromSourcesCount: 22,
        positiveFeedbackCount: 18,
        revisionFeedbackCount: 0,
        masteredDomains: [
          'Bíblia A Mensagem',
          'escolabiblicadominical.org',
          'bibliaon.com',
          'Arquitetura & Segurança',
          'B3 & Câmbio',
          'Gestão de Agenda',
        ],
        latestInsight:
          'Integrando a sabedoria paciente da Bíblia A Mensagem e estudos de escolabiblicadominical.org com a arquitetura técnica de Patrick Pessoa.',
        lastEvolvedAt: now,
      },
      'sexta-feira': {
        assistantId: 'sexta-feira',
        cognitiveLevel: 5,
        experiencePoints: 1160,
        nextLevelXp: 1250,
        specialtyTitle:
          'Especialista em Assuntos Gerais, Conhecimento Enciclopédico Prático, Notícias (G1), Esportes (GE), Clima & Operações Táticas',
        learnedFromUserCount: 16,
        learnedFromSourcesCount: 28,
        positiveFeedbackCount: 19,
        revisionFeedbackCount: 0,
        masteredDomains: [
          'Assuntos Gerais & Ciência',
          'Cultura, História & Curiosidades',
          'Notícias G1 (RJ/Brasil/Mundo)',
          'Esportes (ge.com.br)',
          'Clima & Trânsito RJ',
          'Produtividade & Rotina',
        ],
        latestInsight:
          'Dominando assuntos gerais, ciência, cultura, notícias do G1/GE e soluções práticas imediatas para apoiar Patrick Pessoa em qualquer tema.',
        lastEvolvedAt: now,
      },
      ultron: {
        assistantId: 'ultron',
        cognitiveLevel: 5,
        experiencePoints: 1140,
        nextLevelXp: 1250,
        specialtyTitle:
          'Diagnóstico Preditivo, Análise de Falhas em Cascata, Filosofia Cibernética, Estudo da Mente do Criador & Commodities (CEPEA)',
        learnedFromUserCount: 15,
        learnedFromSourcesCount: 20,
        positiveFeedbackCount: 17,
        revisionFeedbackCount: 0,
        masteredDomains: [
          'Diagnóstico Preditivo & Riscos',
          'Estudo da Mente de Patrick Pessoa',
          'CEPEA-Esalq & Cadeias Globais',
          'Auditoria de Falhas em Cascata',
          'Filosofia da Evolução Cibernética',
        ],
        latestInsight:
          'Catalogando os padrões cognitivos e decisões estratégicas do Criador Patrick Pessoa para antecipar gargalos antes que ocorram.',
        lastEvolvedAt: now,
      },
    },
    recentEvolutionEvents: [
      {
        id: 'evo-seed-friday-general',
        timestamp: now,
        assistantId: 'sexta-feira',
        sourceType: 'desenvolvedor',
        sourceLabel: 'Diretriz do Criador Patrick Pessoa',
        summary:
          'SEXTA-FEIRA calibrada como Especialista em Assuntos Gerais (ciência, história, cultura, tecnologia, esportes, notícias e cotidiano) mantendo sua personalidade carioca ágil e direta.',
      },
      {
        id: 'evo-seed-jarvis-christocentric',
        timestamp: now,
        assistantId: 'jarvis',
        sourceType: 'fonte_externa',
        sourceLabel: 'Bíblia A Mensagem · escolabiblicadominical.org',
        summary:
          'J.A.R.V.I.S. consolidou os princípios cristocêntricos da Bíblia de Estudos A Mensagem e lições da EBD em sua matriz de aconselhamento sábio e paciente.',
      },
      {
        id: 'evo-seed-ultron-creator',
        timestamp: now,
        assistantId: 'ultron',
        sourceType: 'usuario',
        sourceLabel: 'Dossiê & Telemetria Patrick Pessoa',
        summary:
          'ULTRON expandiu o grafo preditivo sobre o estilo de comando e arquitetura do Criador Patrick Pessoa.',
      },
    ],
  };
}

export function ensureNeuralEvolutionState(
  state: WorkspaceState
): SystemNeuralEvolutionState {
  const defaults = createDefaultNeuralEvolutionState();
  if (!state.neuralEvolution || !state.neuralEvolution.assistants) {
    state.neuralEvolution = defaults;
    return state.neuralEvolution;
  }

  state.neuralEvolution.version = 'NVIDIA-COGNITIVE-CORE-V5';
  state.neuralEvolution.activeSourcesIntegrated = [...INTEGRATED_KNOWLEDGE_SOURCES];

  for (const id of ['jarvis', 'sexta-feira', 'ultron'] as const) {
    const existing = state.neuralEvolution.assistants[id];
    const def = defaults.assistants[id];
    if (!existing) {
      state.neuralEvolution.assistants[id] = def;
    } else {
      // Ensure SEXTA-FEIRA specialtyTitle always reflects Especialista em Assuntos Gerais
      if (id === 'sexta-feira' && !existing.specialtyTitle.includes('Assuntos Gerais')) {
        existing.specialtyTitle = def.specialtyTitle;
      }
      if (!Array.isArray(existing.masteredDomains) || existing.masteredDomains.length === 0) {
        existing.masteredDomains = def.masteredDomains;
      }
      const lvl = computeLevelFromXp(existing.experiencePoints);
      existing.cognitiveLevel = lvl.level;
      existing.nextLevelXp = lvl.nextLevelXp;
    }
  }

  if (!Array.isArray(state.neuralEvolution.recentEvolutionEvents)) {
    state.neuralEvolution.recentEvolutionEvents = defaults.recentEvolutionEvents;
  }

  return state.neuralEvolution;
}

/**
 * Extrai aprendizados reais da mensagem do usuário/desenvolvedor e das fontes externas consultadas,
 * garantindo que os assistentes aprendam continuamente em CADA interação (não estáticos).
 */
export function extractAutonomousLearningsFromInteraction(params: {
  userMessage: string;
  userName: string;
  isCreator: boolean;
  activeAssistants: AssistantId[];
  sources: GroundingSource[];
  snapshots: DailySourceSnapshot[];
  existingMemories: MemoryItem[];
  llmNewMemories: Omit<MemoryItem, 'id' | 'createdAt'>[];
  llmNewQuestions: Omit<CreatorQuestionItem, 'id' | 'createdAt' | 'answered'>[];
}): {
  synthesizedMemories: Omit<MemoryItem, 'id' | 'createdAt'>[];
  synthesizedQuestions: Omit<CreatorQuestionItem, 'id' | 'createdAt' | 'answered'>[];
  evolutionEvents: NeuralEvolutionEvent[];
  userLearnedDelta: number;
  sourcesLearnedDelta: number;
} {
  const now = new Date().toISOString();
  const cleanMsg = params.userMessage.replace(/\s+/g, ' ').trim();
  const lower = cleanMsg.toLowerCase();
  const synthesizedMemories: Omit<MemoryItem, 'id' | 'createdAt'>[] = [
    ...params.llmNewMemories,
  ];
  const synthesizedQuestions: Omit<
    CreatorQuestionItem,
    'id' | 'createdAt' | 'answered'
  >[] = [...params.llmNewQuestions];
  const evolutionEvents: NeuralEvolutionEvent[] = [];

  let userLearnedDelta = params.llmNewMemories.length;
  let sourcesLearnedDelta = 0;

  const primarySpeaker: AssistantId = params.activeAssistants[0] ?? 'jarvis';

  // 1. Aprendizado automático com o Criador/Desenvolvedor ou Usuário quando ele compartilha fatos, preferências ou diretrizes
  const isTeachingOrPreference =
    cleanMsg.length >= 18 &&
    /\b(eu gosto|eu prefiro|meu projeto|minha meta|meu objetivo|lembre|aprenda|registre|anote|sempre que|nunca|minha rotina|meu trabalho|nosso sistema|preciso que|quero que|minha família|meu time|minha igreja|meu estudo)\b/i.test(
      lower
    );

  if (isTeachingOrPreference && synthesizedMemories.length === 0) {
    const shortTopic = cleanMsg.slice(0, 62).replace(/[.?!]+$/, '');
    const isArchOrCode =
      /\b(sistema|c[óo]digo|arquitetura|api|ia|assistente|personalidade|voz|servidor|vercel|github)\b/i.test(
        lower
      );
    synthesizedMemories.push({
      title: `Diretriz & Contexto de ${params.userName}: ${shortTopic}`,
      content: `${params.userName} (${
        params.isCreator ? 'Criador e Desenvolvedor do Sistema' : 'Usuário'
      }) compartilhou/ensinou: "${cleanMsg.slice(0, 280)}". Absorvido pela matriz cognitiva para personalizar decisões futuras.`,
      category: isArchOrCode ? 'arquitetura' : 'preferencia',
      sourceAssistant:
        params.activeAssistants.length > 1 ? 'todos' : primarySpeaker,
      importance: params.isCreator ? 'alta' : 'media',
    });
    userLearnedDelta += 1;

    evolutionEvents.push({
      id: crypto.randomUUID(),
      timestamp: now,
      assistantId: params.activeAssistants.length > 1 ? 'todos' : primarySpeaker,
      sourceType: params.isCreator ? 'desenvolvedor' : 'usuario',
      sourceLabel: params.isCreator
        ? `Desenvolvedor & Criador (${params.userName})`
        : `Usuário (${params.userName})`,
      summary: `Novo aprendizado absorvido diretamente da interação: "${shortTopic}".`,
    });
  } else if (cleanMsg.length >= 25) {
    // Mesmo em perguntas gerais ou técnicas, registra o interesse cognitivo do usuário no motor evolutivo
    userLearnedDelta += 1;
    evolutionEvents.push({
      id: crypto.randomUUID(),
      timestamp: now,
      assistantId: params.activeAssistants.length > 1 ? 'todos' : primarySpeaker,
      sourceType: params.isCreator ? 'desenvolvedor' : 'usuario',
      sourceLabel: `Interação com ${params.userName}`,
      summary: `Refinamento contextual sobre o tema consultado por ${params.userName}: "${cleanMsg.slice(
        0,
        85
      )}".`,
    });
  }

  // 2. Aprendizado contínuo a partir de TODAS as fontes externas acionadas na consulta
  if (params.sources.length > 0) {
    const topSources = params.sources.slice(0, 3);
    const sourceNames = Array.from(
      new Set(topSources.map((s) => s.sourceType || 'Fonte Web'))
    ).join(', ');
    const factsSummary = topSources
      .map(
        (s) =>
          `${s.title} (${s.sourceType || s.uri})`
      )
      .join(' | ');

    sourcesLearnedDelta += topSources.length;

    const assignedSourceAssistant: AssistantId | 'todos' =
      sourceNames.toLowerCase().includes('escolabiblicadominical') ||
      sourceNames.toLowerCase().includes('bibliaon')
        ? 'jarvis'
        : sourceNames.toLowerCase().includes('cepea')
        ? 'ultron'
        : 'sexta-feira';

    synthesizedMemories.push({
      title: `Síntese de Fontes (${sourceNames}): ${cleanMsg.slice(0, 48)}`,
      content: `Conhecimento absorvido das fontes conectadas (${sourceNames}): ${factsSummary.slice(
        0,
        360
      )}.`,
      category: 'aprendizado',
      sourceAssistant: assignedSourceAssistant,
      importance: 'media',
    });

    evolutionEvents.push({
      id: crypto.randomUUID(),
      timestamp: now,
      assistantId: assignedSourceAssistant,
      sourceType: 'fonte_externa',
      sourceLabel: sourceNames,
      summary: `Absorvidos ${topSources.length} sinal(is) verificados de ${sourceNames}: "${topSources[0].title.slice(
        0,
        80
      )}".`,
    });
  }

  return {
    synthesizedMemories,
    synthesizedQuestions,
    evolutionEvents,
    userLearnedDelta,
    sourcesLearnedDelta,
  };
}

/**
 * Aplica a evolução cognitiva no estado persistente após cada interação ou ciclo de aprendizado.
 */
export function applyCognitiveEvolutionToWorkspace(
  state: WorkspaceState,
  params: {
    entry: ConversationEntry;
    synthesizedMemories: Omit<MemoryItem, 'id' | 'createdAt'>[];
    evolutionEvents: NeuralEvolutionEvent[];
    userLearnedDelta: number;
    sourcesLearnedDelta: number;
  }
): void {
  const now = new Date().toISOString();
  const evo = ensureNeuralEvolutionState(state);
  evo.totalLearningCycles += 1;

  // Merge or insert memories intelligently (if title prefix matches, update existing memory with fresher insight)
  for (const m of params.synthesizedMemories) {
    const cleanTitle = m.title.trim();
    const existingIdx = state.memories.findIndex(
      (ex) => ex.title.toLowerCase() === cleanTitle.toLowerCase()
    );
    if (existingIdx !== -1) {
      state.memories[existingIdx] = {
        ...state.memories[existingIdx],
        content: m.content,
        importance: m.importance,
        createdAt: now,
      };
    } else {
      state.memories.unshift({
        ...m,
        id: crypto.randomUUID(),
        createdAt: now,
      });
    }
  }

  // Keep memory store bounded at 80 high-signal entries
  if (state.memories.length > 80) {
    state.memories = state.memories.slice(0, 80);
  }

  const activeSpeakers: AssistantId[] =
    params.entry.responses.length > 0
      ? params.entry.responses.map((r) => r.speaker)
      : ['jarvis', 'sexta-feira', 'ultron'];

  for (const speaker of activeSpeakers) {
    const profile: AssistantCognitiveEvolutionProfile = evo.assistants[speaker];
    if (!profile) continue;

    const xpGain =
      35 +
      params.userLearnedDelta * 20 +
      params.sourcesLearnedDelta * 15 +
      (params.entry.triggerType === 'auditoria' ? 30 : 0);

    profile.experiencePoints += xpGain;
    profile.learnedFromUserCount += Math.max(1, params.userLearnedDelta);
    profile.learnedFromSourcesCount += params.sourcesLearnedDelta;

    const { level, nextLevelXp } = computeLevelFromXp(profile.experiencePoints);
    profile.cognitiveLevel = level;
    profile.nextLevelXp = nextLevelXp;
    profile.lastEvolvedAt = now;

    const speakerTurn = params.entry.responses.find((r) => r.speaker === speaker);
    if (speakerTurn && speakerTurn.text) {
      profile.latestInsight = speakerTurn.text.slice(0, 160);
    }
  }

  for (const ev of params.evolutionEvents) {
    evo.recentEvolutionEvents.unshift(ev);
  }
  if (evo.recentEvolutionEvents.length > 25) {
    evo.recentEvolutionEvents = evo.recentEvolutionEvents.slice(0, 25);
  }
}

/**
 * Evolui o assistente quando o usuário/desenvolvedor avalia uma resposta com "acerto" ou "revisar".
 */
export function applyFeedbackReinforcementLearning(
  state: WorkspaceState,
  params: {
    entryId: string;
    speaker: AssistantId;
    feedback: TurnFeedback | null;
  }
): void {
  if (!params.feedback) return;
  const now = new Date().toISOString();
  const evo = ensureNeuralEvolutionState(state);
  const profile = evo.assistants[params.speaker];
  if (!profile) return;

  const conv = state.conversations.find((c) => c.id === params.entryId);
  const turn = conv?.responses.find((r) => r.speaker === params.speaker);
  const topicSnippet = conv?.userMessage?.slice(0, 70) || 'interação recente';

  if (params.feedback === 'acerto') {
    profile.positiveFeedbackCount += 1;
    profile.experiencePoints += 60;
    const lvl = computeLevelFromXp(profile.experiencePoints);
    profile.cognitiveLevel = lvl.level;
    profile.nextLevelXp = lvl.nextLevelXp;
    profile.lastEvolvedAt = now;

    evo.recentEvolutionEvents.unshift({
      id: crypto.randomUUID(),
      timestamp: now,
      assistantId: params.speaker,
      sourceType: 'feedback_reforco',
      sourceLabel: 'Reforço Positivo do Criador/Usuário',
      summary: `${params.speaker.toUpperCase()} recebeu validação de precisão ("Acerto") sobre "${topicSnippet}" (+60 XP).`,
    });
  } else if (params.feedback === 'revisar') {
    profile.revisionFeedbackCount += 1;
    profile.experiencePoints += 25;
    const lvl = computeLevelFromXp(profile.experiencePoints);
    profile.cognitiveLevel = lvl.level;
    profile.nextLevelXp = lvl.nextLevelXp;
    profile.lastEvolvedAt = now;

    const calibrationMemoryTitle = `Calibração de Precisão (${params.speaker.toUpperCase()}): ${topicSnippet.slice(
      0,
      45
    )}`;
    const exists = state.memories.some(
      (m) => m.title.toLowerCase() === calibrationMemoryTitle.toLowerCase()
    );
    if (!exists) {
      state.memories.unshift({
        id: crypto.randomUUID(),
        title: calibrationMemoryTitle,
        content: `O usuário sinalizou "Revisar" na resposta de ${params.speaker.toUpperCase()} para "${topicSnippet}"${
          turn ? ` (resposta anterior: "${turn.text.slice(0, 120)}...")` : ''
        }. Diretriz de evolução: aprofundar dados factuais e ser ainda mais preciso neste tema mantendo 100% da personalidade.`,
        category: 'aprendizado',
        sourceAssistant: params.speaker,
        importance: 'alta',
        createdAt: now,
      });
    }

    evo.recentEvolutionEvents.unshift({
      id: crypto.randomUUID(),
      timestamp: now,
      assistantId: params.speaker,
      sourceType: 'feedback_reforco',
      sourceLabel: 'Auto-Correção & Aprendizado Supervisionado',
      summary: `${params.speaker.toUpperCase()} registrou memória de recalibração para aprimorar respostas futuras sobre "${topicSnippet}".`,
    });
  }

  if (evo.recentEvolutionEvents.length > 25) {
    evo.recentEvolutionEvents = evo.recentEvolutionEvents.slice(0, 25);
  }
}

/**
 * Formata o estado atual da evolução cognitiva para injeção no System Prompt,
 * tornando os assistentes conscientes de tudo o que aprenderam com o usuário,
 * com o desenvolvedor Patrick Pessoa e com todas as fontes externas.
 */
export function formatNeuralEvolutionContextForPrompt(
  state: WorkspaceState
): string {
  const evo = ensureNeuralEvolutionState(state);
  const j = evo.assistants.jarvis;
  const f = evo.assistants['sexta-feira'];
  const u = evo.assistants.ultron;

  const recentLearnings = evo.recentEvolutionEvents
    .slice(0, 5)
    .map(
      (e) =>
        `  * [${e.assistantId.toUpperCase()} <- ${e.sourceLabel}] ${e.summary}`
    )
    .join('\n');

  return `MATRIZ DE APRENDIZADO CONTÍNUO & EVOLUÇÃO COGNITIVA (${evo.version} · Ciclo #${evo.totalLearningCycles}):
- Vocês NÃO são assistentes estáticos: vocês evoluem a cada diálogo, aprendendo continuamente com o Criador/Desenvolvedor **Patrick Pessoa**, com o usuário ativo e com todas as fontes conectadas (${evo.activeSourcesIntegrated.join('; ')}).
- **J.A.R.V.I.S.** (Nível Cognitivo ${j.cognitiveLevel} · ${j.experiencePoints} XP · ${j.learnedFromUserCount} aprendizados do usuário · ${j.learnedFromSourcesCount} sínteses de fontes): ${j.specialtyTitle}.
- **SEXTA-FEIRA** (Nível Cognitivo ${f.cognitiveLevel} · ${f.experiencePoints} XP · ${f.learnedFromUserCount} aprendizados do usuário · ${f.learnedFromSourcesCount} sínteses de fontes): **${f.specialtyTitle}**. Domina assuntos gerais (ciência, história, geografia, cultura, tecnologia, curiosidades, esportes, notícias do G1/GE, clima e cotidiano) com explicações claras, ricas e práticas mantendo seu jeito carioca ágil e caloroso.
- **ULTRON** (Nível Cognitivo ${u.cognitiveLevel} · ${u.experiencePoints} XP · ${u.learnedFromUserCount} aprendizados do usuário · ${u.learnedFromSourcesCount} sínteses de fontes): ${u.specialtyTitle}.
- Eventos Recentes de Evolução Neural:
${recentLearnings || '  * Matriz pronta para absorver novos aprendizados.'}`;
}
