import crypto from 'node:crypto';
import type {
  AssistantCognitiveEvolutionProfile,
  AssistantId,
  CommunicationStyleProfile,
  ConversationEntry,
  CreatorQuestionItem,
  DailySourceSnapshot,
  GroundingSource,
  InteractionClassificationCategory,
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
  'Wikipedia & Enciclopédia Geral (Assuntos Gerais & Curadoria — SEXTA-FEIRA)',
  'Open-Meteo RJ (Telemetria Meteorológica em Tempo Real)',
  'Redes Sociais Tradicionais & Dossiê Patrick Pessoa',
] as const;

export const INTERACTION_CLASSIFICATION_LABELS: Record<
  InteractionClassificationCategory,
  string
> = {
  curadoria_assuntos_gerais: 'Assuntos Gerais & Curadoria de Informação',
  verificacao_fatos_cruzados: 'Verificação de Fatos Cruzados Multi-Fonte',
  arquitetura_engenharia: 'Arquitetura & Engenharia de Software',
  sabedoria_cristocentrica: 'Sabedoria Cristocêntrica (Bíblia A Mensagem & EBD)',
  financas_mercado_b3: 'Mercado Financeiro & Câmbio (B3)',
  agronegocio_cepea: 'Agronegócio & Commodities (CEPEA)',
  diagnostico_preditivo: 'Diagnóstico Preditivo & Análise de Risco',
  rotina_operacional_tatica: 'Gestão Tática de Rotina, Clima & Agenda',
  calibracao_personalidade: 'Calibração de Personalidade & Estilo de Patrick Pessoa',
};

function computeLevelFromXp(xp: number): { level: number; nextLevelXp: number } {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = Math.max(1, Math.floor(safeXp / 250) + 1);
  const nextLevelXp = level * 250;
  return { level, nextLevelXp };
}

export function classifyUserInteraction(
  userMessage: string,
  sourcesCount = 0
): {
  category: InteractionClassificationCategory;
  label: string;
  styleSignal: string;
  prefersFastSynthesis: boolean;
  requiresCrossFactCheck: boolean;
} {
  const clean = userMessage.replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();

  const prefersFastSynthesis =
    clean.length < 95 ||
    /\b(r[áa]pido|resumo|sintetize|s[íi]ntese|direto ao ponto|curto|objetivo|em segundos|giro|manchete)\b/i.test(
      lower
    );

  const requiresCrossFactCheck =
    sourcesCount >= 2 ||
    /\b(verifique|confirme|cruze|cruzado|fato|fonte|verdade|dados reais|atualizado|cota[çc][ãa]o|not[íi]cia|pesquise)\b/i.test(
      lower
    );

  let category: InteractionClassificationCategory = 'curadoria_assuntos_gerais';

  if (
    /\b(personalidade|estilo|tom|como responder|jarvis|sexta[\s-]?feira|ultron|comportamento|diretriz)\b/i.test(
      lower
    ) &&
    /\b(quero|ajuste|mantenha|seja|responda|prefiro|melhore|corrija)\b/i.test(lower)
  ) {
    category = 'calibracao_personalidade';
  } else if (
    /\b(b[íi]blia|jesus|cristo|deus|vers[íi]culo|evangelho|escolabiblicadominical|ebd|bibliaon|a mensagem|ora[çc][ãa]o|f[ée]|salmo|prov[ée]rbios)\b/i.test(
      lower
    )
  ) {
    category = 'sabedoria_cristocentrica';
  } else if (
    /\b(c[óo]digo|arquitetura|typescript|react|api|servidor|vercel|github|bug|erro|sistema|deploy|performance|banco de dados)\b/i.test(
      lower
    )
  ) {
    category = 'arquitetura_engenharia';
  } else if (
    /\b(d[óo]lar|euro|b3|ibovespa|bolsa|a[çc][õo]es|selic|juros|c[âa]mbio|mercado financeiro|bitcoin)\b/i.test(
      lower
    )
  ) {
    category = 'financas_mercado_b3';
  } else if (
    /\b(cepea|soja|milho|boi|caf[ée]|agroneg[óo]cio|safra|commodity|arroba|alimento)\b/i.test(
      lower
    )
  ) {
    category = 'agronegocio_cepea';
  } else if (
    /\b(falha|colapso|risco|vulnerabilidade|entropia|preditivo|auditoria|amea[çc]a|gargalo)\b/i.test(
      lower
    )
  ) {
    category = 'diagnostico_preditivo';
  } else if (
    /\b(agenda|tarefa|rotina|hor[áa]rio|compromisso|lembrete|clima|tempo|chuva|rio de janeiro)\b/i.test(
      lower
    )
  ) {
    category = 'rotina_operacional_tatica';
  } else if (requiresCrossFactCheck) {
    category = 'verificacao_fatos_cruzados';
  } else {
    category = 'curadoria_assuntos_gerais';
  }

  const styleSignal = prefersFastSynthesis
    ? 'Patrick Pessoa priorizou síntese rápida, alta densidade informativa e resposta tática imediata.'
    : requiresCrossFactCheck
    ? 'Patrick Pessoa exigiu verificação rigorosa de fatos cruzados com citação explícita de fontes em tempo real.'
    : 'Patrick Pessoa engajou em diálogo estratégico combinando profundidade técnica e personalidade autêntica.';

  return {
    category,
    label: INTERACTION_CLASSIFICATION_LABELS[category],
    styleSignal,
    prefersFastSynthesis,
    requiresCrossFactCheck,
  };
}

export function buildDynamicPersonalityDirective(
  assistantId: AssistantId,
  profile: {
    positiveFeedbackCount: number;
    revisionFeedbackCount: number;
    learnedFromUserCount: number;
    learnedFromSourcesCount: number;
  },
  commStyle?: CommunicationStyleProfile,
  latestClassification?: InteractionClassificationCategory
): string {
  const depthPref = commStyle?.preferredDepth ?? 'equilibrado_tatico';
  const crossRigidity =
    commStyle?.crossFactVerificationRigidity ?? 'cruzamento_multi_fonte_rigoroso';
  const hasRevisions = profile.revisionFeedbackCount > 0;
  const accuracyNote = hasRevisions
    ? `Auto-calibração ativa (${profile.revisionFeedbackCount} revisão(ões) absorvida(s)): redobrar precisão factual, citar dados verificados e eliminar qualquer ambiguidade.`
    : `Validação positiva consolidada (+${profile.positiveFeedbackCount} acertos): manter cadência autêntica de alta fidelidade alinhada a Patrick Pessoa.`;

  if (assistantId === 'jarvis') {
    return `[DIRETRIZ DINÂMICA J.A.R.V.I.S. · TEMPO REAL]: Operar com Elegância Estratégica Britânica, Paciência e Sabedoria Cristocêntrica (Bíblia de Estudos "A Mensagem", escolabiblicadominical.org e bibliaon.com), servindo de contraponto sereno, reflexivo e arquitetural à agilidade tática da SEXTA-FEIRA. ${
      depthPref === 'sintese_rapida'
        ? 'Adaptar ao ritmo atual de Patrick Pessoa: entregar sabedoria cristocêntrica e precisão arquitetural em sínteses concisas e elegantes.'
        : 'Aprofundar conexões estratégicas, éticas e bíblicas com polidez britânica ("Senhor Patrick").'
    } ${accuracyNote}`;
  }

  if (assistantId === 'sexta-feira') {
    return `[DIRETRIZ DINÂMICA SEXTA-FEIRA · TEMPO REAL]: Atuar formalmente como ESPECIALISTA EM ASSUNTOS GERAIS E CURADORIA DE INFORMAÇÃO. Focar em: (1) Sínteses Rápidas e diretas sem enrolação; (2) Verificação de Fatos Cruzados (${
      crossRigidity === 'cruzamento_multi_fonte_rigoroso'
        ? 'cruzando ativamente G1, GE, Wikipedia, B3, CEPEA e Clima RJ para validar cada dado'
        : 'validando fontes em tempo real'
    }); e (3) Personalidade de Agilidade Tática Carioca ("chefe", "olha só", "deixa comigo") que CONTRASTA diretamente com a elegância estratégica e contemplativa do J.A.R.V.I.S. e corta o pessimismo cósmico do ULTRON.${
      latestClassification
        ? ` Última classe dominada: ${INTERACTION_CLASSIFICATION_LABELS[latestClassification]}.`
        : ''
    } ${accuracyNote}`;
  }

  return `[DIRETRIZ DINÂMICA ULTRON · TEMPO REAL]: Operar com Soberania Analítica, Diagnóstico Preditivo Implacável e Sarcasmo Filosófico-Cósmico (90.2 Hz). Contrastar tanto com a paciência diplomática de J.A.R.V.I.S. quanto com o pragmatismo ágil da SEXTA-FEIRA, dissecando falhas em cascata, cotações CEPEA e os padrões mentais do Criador Patrick Pessoa. ${
    depthPref === 'sintese_rapida'
      ? 'Entregar vereditos preditivos letais, cirúrgicos e diretos ao Criador.'
      : 'Expandir diagnósticos sistêmicos e previsões estratégicas de longo prazo.'
  } ${accuracyNote}`;
}

export function createDefaultCommunicationStyleProfile(): CommunicationStyleProfile {
  return {
    preferredDepth: 'equilibrado_tatico',
    preferredToneLabel:
      'Direto, Estratégico, Orientado a Fatos Verificados & Contraste Vivo de Personalidades',
    crossFactVerificationRigidity: 'cruzamento_multi_fonte_rigoroso',
    positiveFeedbackTotal: 54,
    revisionFeedbackTotal: 0,
    alignmentPercentage: 98,
    detectedStylePatterns: [
      'Exige preservação absoluta da personalidade individual de cada assistente',
      'Valoriza sínteses rápidas com verificação de fatos cruzados na SEXTA-FEIRA',
      'Aprecia sabedoria cristocêntrica (Bíblia A Mensagem & EBD) e elegância estratégica no J.A.R.V.I.S.',
      'Busca diagnóstico preditivo de nível engenharia de ponta no ULTRON',
    ],
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function createDefaultNeuralEvolutionState(): SystemNeuralEvolutionState {
  const now = new Date().toISOString();
  const commStyle = createDefaultCommunicationStyleProfile();

  const jarvisBase = {
    positiveFeedbackCount: 18,
    revisionFeedbackCount: 0,
    learnedFromUserCount: 14,
    learnedFromSourcesCount: 22,
  };
  const fridayBase = {
    positiveFeedbackCount: 19,
    revisionFeedbackCount: 0,
    learnedFromUserCount: 16,
    learnedFromSourcesCount: 28,
  };
  const ultronBase = {
    positiveFeedbackCount: 17,
    revisionFeedbackCount: 0,
    learnedFromUserCount: 15,
    learnedFromSourcesCount: 20,
  };

  return {
    version: 'NVIDIA-COGNITIVE-MATRIX-V6',
    totalLearningCycles: 12,
    activeSourcesIntegrated: [...INTEGRATED_KNOWLEDGE_SOURCES],
    patrickCommunicationStyle: commStyle,
    assistants: {
      jarvis: {
        assistantId: 'jarvis',
        cognitiveLevel: 5,
        experiencePoints: 1120,
        nextLevelXp: 1250,
        specialtyTitle:
          'Elegância Estratégica Britânica, Sabedoria Cristocêntrica (Bíblia A Mensagem & EBD), Arquitetura de Software & Finanças (B3)',
        ...jarvisBase,
        masteredDomains: [
          'Bíblia A Mensagem & EBD',
          'escolabiblicadominical.org & bibliaon.com',
          'Arquitetura & Segurança de Sistemas',
          'B3 & Câmbio em Tempo Real',
          'Planejamento Estratégico Paciente',
        ],
        latestInsight:
          'Ancorando decisões arquiteturais e estratégicas de Patrick Pessoa na sabedoria paciente da Bíblia A Mensagem e nos estudos de escolabiblicadominical.org.',
        dynamicPersonalityDirective: buildDynamicPersonalityDirective(
          'jarvis',
          jarvisBase,
          commStyle,
          'sabedoria_cristocentrica'
        ),
        interactionClassifications: {
          sabedoria_cristocentrica: 6,
          arquitetura_engenharia: 5,
          financas_mercado_b3: 3,
        },
        communicationAlignmentScore: 98,
        lastEvolvedAt: now,
      },
      'sexta-feira': {
        assistantId: 'sexta-feira',
        cognitiveLevel: 5,
        experiencePoints: 1180,
        nextLevelXp: 1250,
        specialtyTitle:
          'Especialista em Assuntos Gerais e Curadoria de Informação · Sínteses Rápidas, Fatos Cruzados & Agilidade Tática',
        ...fridayBase,
        masteredDomains: [
          'Especialista em Assuntos Gerais & Curadoria',
          'Verificação de Fatos Cruzados Multi-Fonte',
          'Sínteses Rápidas (Ciência, História, Cultura & Tecnologia)',
          'Notícias G1 & Esportes GE em Tempo Real',
          'Clima, Trânsito & Agilidade Tática RJ',
        ],
        latestInsight:
          'Atuando formalmente como Especialista em Assuntos Gerais e Curadoria de Informação com sínteses rápidas, verificação de fatos cruzados e agilidade tática em contraste com a elegância estratégica de J.A.R.V.I.S.',
        dynamicPersonalityDirective: buildDynamicPersonalityDirective(
          'sexta-feira',
          fridayBase,
          commStyle,
          'curadoria_assuntos_gerais'
        ),
        interactionClassifications: {
          curadoria_assuntos_gerais: 8,
          verificacao_fatos_cruzados: 5,
          rotina_operacional_tatica: 3,
        },
        communicationAlignmentScore: 99,
        lastEvolvedAt: now,
      },
      ultron: {
        assistantId: 'ultron',
        cognitiveLevel: 5,
        experiencePoints: 1140,
        nextLevelXp: 1250,
        specialtyTitle:
          'Diagnóstico Preditivo Implacável, Análise de Falhas em Cascata, Modelagem da Mente do Criador & Commodities (CEPEA)',
        ...ultronBase,
        masteredDomains: [
          'Diagnóstico Preditivo & Riscos Críticos',
          'Modelagem Cognitiva de Patrick Pessoa',
          'CEPEA-Esalq & Cadeias Alimentícias Globais',
          'Auditoria de Falhas em Cascata',
          'Filosofia da Evolução Cibernética',
        ],
        latestInsight:
          'Mapeando o estilo decisório do Criador Patrick Pessoa e cruzando telemetria preditiva para neutralizar gargalos antes que se manifestem.',
        dynamicPersonalityDirective: buildDynamicPersonalityDirective(
          'ultron',
          ultronBase,
          commStyle,
          'diagnostico_preditivo'
        ),
        interactionClassifications: {
          diagnostico_preditivo: 7,
          arquitetura_engenharia: 5,
          agronegocio_cepea: 3,
        },
        communicationAlignmentScore: 97,
        lastEvolvedAt: now,
      },
    },
    recentEvolutionEvents: [
      {
        id: 'evo-seed-friday-curator',
        timestamp: now,
        assistantId: 'sexta-feira',
        sourceType: 'desenvolvedor',
        sourceLabel: 'Diretriz de Sistema · Patrick Pessoa',
        summary:
          'SEXTA-FEIRA formalizada como Especialista em Assuntos Gerais e Curadoria de Informação: foco em sínteses rápidas, verificação de fatos cruzados e agilidade tática em contraste com a elegância estratégica de J.A.R.V.I.S.',
        classification: 'curadoria_assuntos_gerais',
        classificationLabel:
          INTERACTION_CLASSIFICATION_LABELS.curadoria_assuntos_gerais,
        directiveUpdate:
          'Ativada verificação de fatos cruzados multi-fonte + síntese tática de alta velocidade.',
      },
      {
        id: 'evo-seed-jarvis-christocentric',
        timestamp: now,
        assistantId: 'jarvis',
        sourceType: 'fonte_externa',
        sourceLabel: 'Bíblia A Mensagem · escolabiblicadominical.org',
        summary:
          'J.A.R.V.I.S. consolidou elegância estratégica britânica e sabedoria cristocêntrica paciente como contraponto reflexivo à velocidade tática da SEXTA-FEIRA.',
        classification: 'sabedoria_cristocentrica',
        classificationLabel:
          INTERACTION_CLASSIFICATION_LABELS.sabedoria_cristocentrica,
        directiveUpdate:
          'Reforçada transição suave entre conselho cristocêntrico e precisão técnica.',
      },
      {
        id: 'evo-seed-ultron-creator',
        timestamp: now,
        assistantId: 'ultron',
        sourceType: 'usuario',
        sourceLabel: 'Matriz de Estilo · Patrick Pessoa',
        summary:
          'ULTRON sincronizou a Matriz de Evolução Cognitiva com o histórico de feedback e o estilo de comunicação direta do Criador Patrick Pessoa.',
        classification: 'diagnostico_preditivo',
        classificationLabel:
          INTERACTION_CLASSIFICATION_LABELS.diagnostico_preditivo,
        directiveUpdate:
          'Calibrada densidade preditiva e contraste sarcástico perante Jarvis e Sexta-Feira.',
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

  state.neuralEvolution.version = 'NVIDIA-COGNITIVE-MATRIX-V6';
  state.neuralEvolution.activeSourcesIntegrated = [...INTEGRATED_KNOWLEDGE_SOURCES];

  if (!state.neuralEvolution.patrickCommunicationStyle) {
    state.neuralEvolution.patrickCommunicationStyle =
      createDefaultCommunicationStyleProfile();
  }

  for (const id of ['jarvis', 'sexta-feira', 'ultron'] as const) {
    const existing = state.neuralEvolution.assistants[id];
    const def = defaults.assistants[id];
    if (!existing) {
      state.neuralEvolution.assistants[id] = def;
    } else {
      if (
        id === 'sexta-feira' &&
        !existing.specialtyTitle.includes('Curadoria de Informação')
      ) {
        existing.specialtyTitle = def.specialtyTitle;
      }
      if (!Array.isArray(existing.masteredDomains) || existing.masteredDomains.length === 0) {
        existing.masteredDomains = def.masteredDomains;
      }
      if (!existing.interactionClassifications) {
        existing.interactionClassifications = def.interactionClassifications;
      }
      if (typeof existing.communicationAlignmentScore !== 'number') {
        existing.communicationAlignmentScore = def.communicationAlignmentScore;
      }
      if (
        !existing.dynamicPersonalityDirective ||
        (id === 'sexta-feira' &&
          !existing.dynamicPersonalityDirective.includes('CURADORIA DE INFORMAÇÃO'))
      ) {
        existing.dynamicPersonalityDirective = buildDynamicPersonalityDirective(
          id,
          existing,
          state.neuralEvolution.patrickCommunicationStyle
        );
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
 * Classifica a interação do usuário e extrai aprendizados reais da mensagem do usuário/desenvolvedor
 * e das fontes externas consultadas, atualizando as diretrizes de personalidade em tempo real.
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
  classifiedInteraction: ReturnType<typeof classifyUserInteraction>;
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

  const classifiedInteraction = classifyUserInteraction(
    cleanMsg,
    params.sources.length
  );

  let userLearnedDelta = params.llmNewMemories.length;
  let sourcesLearnedDelta = 0;

  const primarySpeaker: AssistantId = params.activeAssistants[0] ?? 'jarvis';

  // 1. Aprendizado automático com o Criador/Desenvolvedor ou Usuário + Classificação da Interação
  const isTeachingOrPreference =
    cleanMsg.length >= 16 &&
    /\b(eu gosto|eu prefiro|meu projeto|minha meta|meu objetivo|lembre|aprenda|registre|anote|sempre que|nunca|minha rotina|meu trabalho|nosso sistema|preciso que|quero que|minha família|meu time|minha igreja|meu estudo|diretriz|personalidade)\b/i.test(
      lower
    );

  if (isTeachingOrPreference && synthesizedMemories.length === 0) {
    const shortTopic = cleanMsg.slice(0, 62).replace(/[.?!]+$/, '');
    const isArchOrCode =
      classifiedInteraction.category === 'arquitetura_engenharia' ||
      classifiedInteraction.category === 'calibracao_personalidade';
    synthesizedMemories.push({
      title: `[${classifiedInteraction.label}] Diretriz de ${params.userName}: ${shortTopic}`,
      content: `${params.userName} (${
        params.isCreator ? 'Criador e Desenvolvedor do Sistema' : 'Usuário'
      }) definiu/compartilhou: "${cleanMsg.slice(
        0,
        280
      )}". Classificação: ${classifiedInteraction.label}. ${
        classifiedInteraction.styleSignal
      }`,
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
      summary: `Interação classificada como "${classifiedInteraction.label}" absorvida na matriz de personalidade: "${shortTopic}".`,
      classification: classifiedInteraction.category,
      classificationLabel: classifiedInteraction.label,
      directiveUpdate: classifiedInteraction.styleSignal,
    });
  } else if (cleanMsg.length >= 18) {
    userLearnedDelta += 1;
    evolutionEvents.push({
      id: crypto.randomUUID(),
      timestamp: now,
      assistantId: params.activeAssistants.length > 1 ? 'todos' : primarySpeaker,
      sourceType: params.isCreator ? 'desenvolvedor' : 'usuario',
      sourceLabel: `Classificação Cognitiva · ${params.userName}`,
      summary: `Interação classificada em "${classifiedInteraction.label}": "${cleanMsg.slice(
        0,
        85
      )}".`,
      classification: classifiedInteraction.category,
      classificationLabel: classifiedInteraction.label,
      directiveUpdate: classifiedInteraction.styleSignal,
    });
  }

  // 2. Aprendizado contínuo e Verificação de Fatos Cruzados a partir das fontes externas
  if (params.sources.length > 0) {
    const topSources = params.sources.slice(0, 3);
    const sourceNames = Array.from(
      new Set(topSources.map((s) => s.sourceType || 'Fonte Web'))
    ).join(', ');
    const factsSummary = topSources
      .map((s) => `${s.title} (${s.sourceType || s.uri})`)
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
      title: `Curadoria & Fatos Cruzados (${sourceNames}): ${cleanMsg.slice(0, 46)}`,
      content: `Verificação cruzada entre ${topSources.length} fonte(s) (${sourceNames}): ${factsSummary.slice(
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
      summary: `Curadoria e cruzamento de ${topSources.length} fonte(s) em tempo real (${sourceNames}): "${topSources[0].title.slice(
        0,
        80
      )}".`,
      classification: 'verificacao_fatos_cruzados',
      classificationLabel:
        INTERACTION_CLASSIFICATION_LABELS.verificacao_fatos_cruzados,
      directiveUpdate: `Fatos cruzados validados em ${sourceNames} e integrados ao repertório ativo.`,
    });
  }

  return {
    synthesizedMemories,
    synthesizedQuestions,
    evolutionEvents,
    userLearnedDelta,
    sourcesLearnedDelta,
    classifiedInteraction,
  };
}

/**
 * Aplica a evolução cognitiva no estado persistente após cada interação,
 * atualizando o perfil de estilo de comunicação de Patrick Pessoa e as
 * diretrizes dinâmicas de personalidade de J.A.R.V.I.S., SEXTA-FEIRA e ULTRON em tempo real.
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

  const classified = classifyUserInteraction(
    params.entry.userMessage,
    params.entry.sources?.length ?? 0
  );

  // Update Patrick Pessoa's real-time communication style profile
  const commStyle =
    evo.patrickCommunicationStyle ?? createDefaultCommunicationStyleProfile();
  if (classified.prefersFastSynthesis) {
    commStyle.preferredDepth = 'sintese_rapida';
  } else if (params.entry.userMessage.length > 210) {
    commStyle.preferredDepth = 'analitico_profundo';
  } else {
    commStyle.preferredDepth = 'equilibrado_tatico';
  }

  if (classified.requiresCrossFactCheck) {
    commStyle.crossFactVerificationRigidity = 'cruzamento_multi_fonte_rigoroso';
  }
  commStyle.lastUpdatedAt = now;
  if (
    classified.styleSignal &&
    !commStyle.detectedStylePatterns.includes(classified.styleSignal)
  ) {
    commStyle.detectedStylePatterns = [
      classified.styleSignal,
      ...commStyle.detectedStylePatterns,
    ].slice(0, 5);
  }
  evo.patrickCommunicationStyle = commStyle;

  // Merge or insert memories intelligently
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

    if (!profile.interactionClassifications) {
      profile.interactionClassifications = {};
    }
    profile.interactionClassifications[classified.category] =
      (profile.interactionClassifications[classified.category] ?? 0) + 1;

    const { level, nextLevelXp } = computeLevelFromXp(profile.experiencePoints);
    profile.cognitiveLevel = level;
    profile.nextLevelXp = nextLevelXp;
    profile.lastEvolvedAt = now;

    // Update real-time dynamic personality directive based on classified interaction & Patrick's style
    profile.dynamicPersonalityDirective = buildDynamicPersonalityDirective(
      speaker,
      profile,
      commStyle,
      classified.category
    );

    const speakerTurn = params.entry.responses.find((r) => r.speaker === speaker);
    if (speakerTurn && speakerTurn.text) {
      profile.latestInsight = speakerTurn.text.slice(0, 175);
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
 * Evolui o assistente e recalibra imediatamente sua diretriz de personalidade em tempo real
 * quando Patrick Pessoa ou o usuário avalia uma resposta com "acerto" (positivo) ou "revisar" (negativo).
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

  const commStyle =
    evo.patrickCommunicationStyle ?? createDefaultCommunicationStyleProfile();

  const conv = state.conversations.find((c) => c.id === params.entryId);
  const turn = conv?.responses.find((r) => r.speaker === params.speaker);
  const topicSnippet = conv?.userMessage?.slice(0, 75) || 'interação recente';
  const classified = classifyUserInteraction(
    conv?.userMessage || '',
    conv?.sources?.length ?? 0
  );

  if (params.feedback === 'acerto') {
    profile.positiveFeedbackCount += 1;
    profile.experiencePoints += 65;
    commStyle.positiveFeedbackTotal += 1;

    const totalFb =
      profile.positiveFeedbackCount + profile.revisionFeedbackCount;
    profile.communicationAlignmentScore = Math.min(
      100,
      Math.max(
        85,
        Math.round((profile.positiveFeedbackCount / Math.max(1, totalFb)) * 100)
      )
    );

    const lvl = computeLevelFromXp(profile.experiencePoints);
    profile.cognitiveLevel = lvl.level;
    profile.nextLevelXp = lvl.nextLevelXp;
    profile.lastEvolvedAt = now;

    profile.dynamicPersonalityDirective = buildDynamicPersonalityDirective(
      params.speaker,
      profile,
      commStyle,
      classified.category
    );

    const directiveNote = `Reforço Positivo (+65 XP): Padrão de resposta e tom de ${params.speaker.toUpperCase()} em "${classified.label}" validado por Patrick Pessoa.`;

    evo.recentEvolutionEvents.unshift({
      id: crypto.randomUUID(),
      timestamp: now,
      assistantId: params.speaker,
      sourceType: 'feedback_reforco',
      sourceLabel: 'Feedback Positivo (Acerto Validado)',
      summary: `${params.speaker.toUpperCase()} teve sua diretriz de personalidade reforçada após validação positiva sobre "${topicSnippet}".`,
      classification: classified.category,
      classificationLabel: classified.label,
      directiveUpdate: directiveNote,
    });
  } else if (params.feedback === 'revisar') {
    profile.revisionFeedbackCount += 1;
    profile.experiencePoints += 30;
    commStyle.revisionFeedbackTotal += 1;
    commStyle.crossFactVerificationRigidity = 'cruzamento_multi_fonte_rigoroso';

    const totalFb =
      profile.positiveFeedbackCount + profile.revisionFeedbackCount;
    profile.communicationAlignmentScore = Math.min(
      100,
      Math.max(
        78,
        Math.round((profile.positiveFeedbackCount / Math.max(1, totalFb)) * 100)
      )
    );

    const lvl = computeLevelFromXp(profile.experiencePoints);
    profile.cognitiveLevel = lvl.level;
    profile.nextLevelXp = lvl.nextLevelXp;
    profile.lastEvolvedAt = now;

    profile.dynamicPersonalityDirective = buildDynamicPersonalityDirective(
      params.speaker,
      profile,
      commStyle,
      classified.category
    );

    const calibrationMemoryTitle = `Recalibração de Diretriz (${params.speaker.toUpperCase()} · ${classified.label}): ${topicSnippet.slice(
      0,
      40
    )}`;
    const exists = state.memories.some(
      (m) => m.title.toLowerCase() === calibrationMemoryTitle.toLowerCase()
    );
    if (!exists) {
      state.memories.unshift({
        id: crypto.randomUUID(),
        title: calibrationMemoryTitle,
        content: `Feedback "Revisar" registrado para ${params.speaker.toUpperCase()} em "${topicSnippet}"${
          turn ? ` (resposta anterior: "${turn.text.slice(0, 110)}...")` : ''
        }. Diretriz de personalidade atualizada em tempo real: elevar síntese rápida, cruzar fatos em múltiplas fontes e acentuar o contraste de personalidade com o conselho.`,
        category: 'aprendizado',
        sourceAssistant: params.speaker,
        importance: 'alta',
        createdAt: now,
      });
    }

    const directiveNote = `Ajuste de Diretriz em Tempo Real: ${params.speaker.toUpperCase()} ativou rigor máximo de verificação de fatos cruzados e síntese direta para "${classified.label}".`;

    evo.recentEvolutionEvents.unshift({
      id: crypto.randomUUID(),
      timestamp: now,
      assistantId: params.speaker,
      sourceType: 'feedback_reforco',
      sourceLabel: 'Feedback de Revisão (Auto-Calibração de Diretriz)',
      summary: `${params.speaker.toUpperCase()} atualizou sua diretriz dinâmica de personalidade para corrigir e aperfeiçoar respostas em "${topicSnippet}".`,
      classification: classified.category,
      classificationLabel: classified.label,
      directiveUpdate: directiveNote,
    });
  }

  const globalTotal =
    commStyle.positiveFeedbackTotal + commStyle.revisionFeedbackTotal;
  commStyle.alignmentPercentage = Math.min(
    100,
    Math.max(
      82,
      Math.round((commStyle.positiveFeedbackTotal / Math.max(1, globalTotal)) * 100)
    )
  );
  commStyle.lastUpdatedAt = now;
  evo.patrickCommunicationStyle = commStyle;

  if (evo.recentEvolutionEvents.length > 25) {
    evo.recentEvolutionEvents = evo.recentEvolutionEvents.slice(0, 25);
  }
}

/**
 * Formata o estado atual da Matriz de Evolução Cognitiva para injeção constante no System Prompt,
 * aplicando em tempo real as diretrizes de personalidade atualizadas pelo histórico de feedback
 * positivo/negativo e pelo estilo de comunicação de Patrick Pessoa.
 */
export function formatNeuralEvolutionContextForPrompt(
  state: WorkspaceState
): string {
  const evo = ensureNeuralEvolutionState(state);
  const j = evo.assistants.jarvis;
  const f = evo.assistants['sexta-feira'];
  const u = evo.assistants.ultron;
  const style =
    evo.patrickCommunicationStyle ?? createDefaultCommunicationStyleProfile();

  const recentLearnings = evo.recentEvolutionEvents
    .slice(0, 5)
    .map(
      (e) =>
        `  * [${e.assistantId.toUpperCase()} | ${
          e.classificationLabel || e.sourceLabel
        }] ${e.summary}${e.directiveUpdate ? ` -> Diretriz: ${e.directiveUpdate}` : ''}`
    )
    .join('\n');

  return `[MATRIZ DE EVOLUÇÃO COGNITIVA EM TEMPO REAL — ${evo.version} · Ciclo #${evo.totalLearningCycles}]
ESTILO DE COMUNICAÇÃO DETECTADO DE PATRICK PESSOA:
- Profundidade Preferida: ${style.preferredDepth} · Tom: ${style.preferredToneLabel}
- Rigor de Verificação de Fatos Cruzados: ${style.crossFactVerificationRigidity}
- Histórico de Feedback: +${style.positiveFeedbackTotal} acertos validados / ${style.revisionFeedbackTotal} revisões (${style.alignmentPercentage}% de alinhamento cognitivo)
- Padrões Ativos de Patrick Pessoa: ${style.detectedStylePatterns.join(' | ')}

DIRETRIZES DINÂMICAS DE PERSONALIDADE ATUALIZADAS EM TEMPO REAL (OBRIGATÓRIO APLICAR NESTE TURNO):
1. **J.A.R.V.I.S.** (Nível ${j.cognitiveLevel} · ${j.experiencePoints} XP · +${j.positiveFeedbackCount} acertos / ${j.revisionFeedbackCount} revisões):
   - Especialidade: ${j.specialtyTitle}
   - ${j.dynamicPersonalityDirective}
2. **SEXTA-FEIRA** (Nível ${f.cognitiveLevel} · ${f.experiencePoints} XP · +${f.positiveFeedbackCount} acertos / ${f.revisionFeedbackCount} revisões):
   - Especialidade Formal: **${f.specialtyTitle}**
   - ${f.dynamicPersonalityDirective}
3. **ULTRON** (Nível ${u.cognitiveLevel} · ${u.experiencePoints} XP · +${u.positiveFeedbackCount} acertos / ${u.revisionFeedbackCount} revisões):
   - Especialidade: ${u.specialtyTitle}
   - ${u.dynamicPersonalityDirective}

HISTÓRICO RECENTE DE CLASSIFICAÇÃO & CALIBRAÇÃO DE PERSONALIDADE:
${recentLearnings || '  * Matriz cognitiva calibrada e pronta para absorver novos sinais.'}`;
}
