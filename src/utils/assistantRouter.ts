import type { AssistantId, InteractionMode } from '../types/assistant';
import { CHRISTIAN_STUDY_REGEX, resolveTopicSearchRoute } from './searchRouter';

export interface AssistantRoutingDecision {
  resolvedMode: AssistantId | 'ambos' | 'todos';
  activeAssistants: AssistantId[];
  reasoningTaskByAssistant: Record<AssistantId, string>;
  directMentionDetected: boolean;
}

export interface AssistantMentionMatch {
  mentionsJarvis: boolean;
  mentionsFriday: boolean;
  mentionsUltron: boolean;
  mentionsAll: boolean;
  mentionsBoth: boolean;
  anyMention: boolean;
  directTargetMode: AssistantId | 'ambos' | 'todos' | null;
}

/**
 * Normalizes Brazilian Portuguese text/transcripts for robust phonetic wake & routing detection.
 * Crucially handles pt-BR ASR mishearings of "ULTRON" (ultrom, ultran, ultrão, utron, altron,
 * oltron, outron, autron, hultron, eltron, u-tron, ul tron, vocative "ultra"/"outro").
 */
function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function detectAssistantMentions(rawText: string): AssistantMentionMatch {
  const clean = rawText.trim();
  const norm = normalizeText(clean);

  if (!norm) {
    return {
      mentionsJarvis: false,
      mentionsFriday: false,
      mentionsUltron: false,
      mentionsAll: false,
      mentionsBoth: false,
      anyMention: false,
      directTargetMode: null,
    };
  }

  const mentionsJarvis =
    /\b(jarvis|j\.?\s*a\.?\s*r\.?\s*v\.?\s*i\.?\s*s|ja\s*vis|jarves|jarvez|jarbis|yarvis|charvis|jarvins)\b/i.test(
      norm
    );

  const mentionsFriday =
    /\b(sexta[\s-]?feira|sexta|friday|f\.?\s*r\.?\s*i\.?\s*d\.?\s*a\.?\s*y|fraidei)\b/i.test(
      norm
    );

  // Explicit + Brazilian Portuguese phonetic variants of ULTRON
  const hasExplicitUltronVariant =
    /\b(ultron|ultrons|ultrom|ultran|ultram|ultrao|utron|utrom|utrao|altron|altrom|oltron|oltrom|autron|autrom|outron|outrao|hultron|eltron|voltron|ul[\s-]?tron|ul[\s-]?trom|u[\s-]?tron|u\.?\s*l\.?\s*t\.?\s*r\.?\s*o\.?\s*n)\b/i.test(
      norm
    );

  // Vocative / direct-call ASR mishearings ("ultra", "ei outro", "chama o ultra", "fala outro")
  // Only matched when clearly used as a wake/call address to avoid false positives in normal sentences
  const hasVocativeUltronVariant =
    /^(ei|oi|ola|hey|ok|fala|escuta|chama|chamar|ativa|ativar|acorda|desperta|cade|e\s+ai|fala\s+ai|vem\s+ca|quero\s+falar\s+com|falar\s+com|conectar\s+com)?\s*,?\s*(o\s+)?(ultra|ultrao|ultran|outro|outrao|neutro|neutron)\s*([,:.!?-]|$|\s+(voce|vc|me|fala|faz|faca|analisa|verifica|busca|pesquisa|diz|diga|responde|responda|ajuda|ajude|estou|ta\s+ai|esta\s+ai|tudo\s+bem|como|qual|quais|preciso|quero))/i.test(
      norm
    ) ||
    /\b(chama|chamar|ativa|ativar|acorda|desperta|falar\s+com|conversar\s+com|cade)\s+(o\s+)?(ultra|outro|ultron)\b/i.test(
      norm
    );

  const mentionsUltron = hasExplicitUltronVariant || hasVocativeUltronVariant;

  const mentionsAll =
    /\b(todos|os\s+tres|tres|conselho|equipe\s+completa|opiniao\s+de\s+todos|debatam|todo\s+mundo|as\s+tres\s+ias|os\s+tres\s+assistentes)\b/i.test(
      norm
    );

  const mentionsBoth =
    (mentionsJarvis && mentionsFriday && !mentionsUltron) ||
    /\b(voces\s+dois|os\s+dois|ambos|juntos)\b/i.test(norm);

  const anyMention =
    mentionsJarvis || mentionsFriday || mentionsUltron || mentionsAll || mentionsBoth;

  let directTargetMode: AssistantId | 'ambos' | 'todos' | null = null;
  if (
    mentionsAll ||
    (mentionsUltron && (mentionsJarvis || mentionsFriday)) ||
    (mentionsJarvis && mentionsFriday && mentionsUltron)
  ) {
    directTargetMode = 'todos';
  } else if (mentionsUltron) {
    directTargetMode = 'ultron';
  } else if (mentionsBoth) {
    directTargetMode = 'ambos';
  } else if (mentionsJarvis) {
    directTargetMode = 'jarvis';
  } else if (mentionsFriday) {
    directTargetMode = 'sexta-feira';
  }

  return {
    mentionsJarvis,
    mentionsFriday,
    mentionsUltron,
    mentionsAll,
    mentionsBoth,
    anyMention,
    directTargetMode,
  };
}

export function resolveAssistantRouting(
  message: string,
  explicitMode: InteractionMode
): AssistantRoutingDecision {
  const clean = message.trim();
  const lower = clean.toLowerCase();
  const mentions = detectAssistantMentions(clean);

  let resolvedMode: AssistantId | 'ambos' | 'todos' = 'todos';

  // CRITICAL FIX: Direct invocation by name (e.g. "Ultron, ...", "Sexta-feira, ...", "Jarvis, ...")
  // MUST ALWAYS activate the called assistant even if another explicitMode was previously selected!
  if (mentions.directTargetMode) {
    resolvedMode = mentions.directTargetMode;
  } else if (explicitMode !== 'auto') {
    resolvedMode = explicitMode;
  } else if (clean.length > 0) {
    const wantsDebate =
      /\b(opini[oõ]es|dividam|comparem|debater|debate|qual a melhor|o que voc[eê]s acham|voc[eê]s|conselho|auditoria completa|equipe|os tr[eê]s|todos)\b/i.test(
        lower
      );
    const wantsUltron =
      /\b(diagn[oó]stico|previs[aã]o|prever|futuro|falha|colapso|gargalo|probabilidade|risco|anomalia|estresse|subdesenvolvid|humano|humanidade|mente|consci[eê]ncia|evolu[cç][aã]o|vulnerabilidade|entropia|imp[eé]rio|cepea|commodity|commodities|safra|agro)\b/i.test(
        lower
      );
    const wantsJarvis =
      CHRISTIAN_STUDY_REGEX.test(clean) ||
      /\b(arquitetura|seguran[cç]a|criptografia|autentica[cç][aã]o|servidor|banco de dados|api|estrutura|estrat[eé]gia|padroniza[cç][aã]o|protocolo|escalabilidade|sabedoria|conselho s[aá]bio|b3|bolsa|d[oó]lar|cota[cç][aã]o|mercado financeiro|c[oó]digo|sistema)\b/i.test(
        lower
      );
    const wantsFriday =
      /\b(r[aá]pido|pr[aá]tico|tarefa|agenda|hoje|rotina|interface|ux|design|tela|bot[aã]o|cansado|foco|produtividade|resumo|direto ao ponto|clima|tempo|temperatura|chuva|futebol|esporte|flamengo|vasco|botafogo|fluminense|ge|g1|not[ií]cia|manchete|assuntos gerais|conhecimentos gerais|curiosidade|hist[oó]ria|geografia|ci[eê]ncia|cultura|arte|cinema|m[uú]sica|filme|livro|sa[uú]de|culin[aá]ria|receita|viagem|pa[ií]s|planeta|como funciona|o que [eé]|quem foi|onde fica|me explica|explica)\b/i.test(
        lower
      );

    const matchedDomains = [wantsUltron, wantsJarvis, wantsFriday].filter(Boolean).length;

    if (wantsDebate || matchedDomains >= 2) {
      resolvedMode = 'todos';
    } else if (wantsUltron) {
      resolvedMode = 'ultron';
    } else if (wantsJarvis) {
      resolvedMode = 'jarvis';
    } else if (wantsFriday) {
      resolvedMode = 'sexta-feira';
    } else {
      // SEXTA-FEIRA is the specialist for open general-knowledge / everyday questions unless Jarvis or Ultron's specific domains are invoked
      resolvedMode = clean.includes('?') ? 'sexta-feira' : 'jarvis';
    }
  }

  const activeAssistants: AssistantId[] =
    resolvedMode === 'todos'
      ? ['jarvis', 'sexta-feira', 'ultron']
      : resolvedMode === 'ambos'
      ? ['jarvis', 'sexta-feira']
      : [resolvedMode];

  const routePlan = resolveTopicSearchRoute(clean);
  const domainsLabel = routePlan.forcedDomains.join(', ');
  const isSearchQuery =
    routePlan.routedTargets.length > 0 ||
    /\b(pesquis|busque|busca|internet|web|not[ií]cia|hoje|atual|site|rede social)\b/i.test(
      lower
    );
  const isCodeQuery =
    /\b(c[oó]digo|bug|erro|typescript|react|api|fun[cç][aã]o|auditoria|performance)\b/i.test(
      lower
    );

  const reasoningTaskByAssistant: Record<AssistantId, string> = {
    jarvis: routePlan.wantsChristianStudy
      ? 'Consultando a Bíblia de Estudos A Mensagem e estudos de escolabiblicadominical.org...'
      : isCodeQuery
      ? 'Auditando arquitetura, contratos de tipo e blindagem de segurança...'
      : isSearchQuery
      ? `Consultando ${domainsLabel} e atualizando memória evolutiva em tempo real...`
      : 'Processando matriz estratégica, sabedoria cristocêntrica e aprendizado contínuo...',
    'sexta-feira': isCodeQuery
      ? 'Mapeando solução prática, fluidez de execução e estabilidade...'
      : isSearchQuery
      ? `Especialista em Assuntos Gerais: cruzando dados ao vivo de ${domainsLabel}...`
      : 'Especialista em Assuntos Gerais: sintetizando conhecimento prático, rotina e resposta ágil...',
    ultron: isCodeQuery
      ? 'Dissecando gargalos, falhas em cascata e previsões de risco...'
      : isSearchQuery
      ? `Cruzando dados atualizados de ${domainsLabel} na matriz preditiva...`
      : 'Calculando diagnósticos preditivos e evoluindo grafo da mente de Patrick...',
  };

  return {
    resolvedMode,
    activeAssistants,
    reasoningTaskByAssistant,
    directMentionDetected: Boolean(mentions.directTargetMode),
  };
}
