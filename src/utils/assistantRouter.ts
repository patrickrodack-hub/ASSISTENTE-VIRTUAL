import type { AssistantId, InteractionMode } from '../types/assistant';
import { resolveTopicSearchRoute } from './searchRouter';

export interface AssistantRoutingDecision {
  resolvedMode: AssistantId | 'ambos' | 'todos';
  activeAssistants: AssistantId[];
  reasoningTaskByAssistant: Record<AssistantId, string>;
}

export function resolveAssistantRouting(
  message: string,
  explicitMode: InteractionMode
): AssistantRoutingDecision {
  const clean = message.trim();
  const lower = clean.toLowerCase();

  let resolvedMode: AssistantId | 'ambos' | 'todos' = 'todos';

  if (explicitMode !== 'auto') {
    resolvedMode = explicitMode;
  } else if (clean.length > 0) {
    const mentionsJarvis = /\b(jarvis|j\.a\.r\.v\.i\.s|já vis|jarves)\b/i.test(lower);
    const mentionsFriday = /\b(sexta[\s-]?feira|sexta|friday|f\.r\.i\.d\.a\.y)\b/i.test(lower);
    const mentionsUltron = /\b(ultron|[uú]ltron)\b/i.test(lower);
    const mentionsAll =
      /\b(todos|os tr[eê]s|tr[eê]s|conselho|equipe completa|opini[aã]o de todos|debatam)\b/i.test(
        lower
      );
    const mentionsBoth = /\b(vocês dois|os dois|ambos|juntos)\b/i.test(lower);

    if (
      mentionsAll ||
      (mentionsUltron && (mentionsJarvis || mentionsFriday)) ||
      (mentionsJarvis && mentionsFriday && mentionsUltron)
    ) {
      resolvedMode = 'todos';
    } else if (mentionsUltron) {
      resolvedMode = 'ultron';
    } else if (mentionsBoth || (mentionsJarvis && mentionsFriday)) {
      resolvedMode = 'ambos';
    } else if (mentionsJarvis) {
      resolvedMode = 'jarvis';
    } else if (mentionsFriday) {
      resolvedMode = 'sexta-feira';
    } else {
      const wantsDebate =
        /\b(opini[oõ]es|dividam|comparem|debater|debate|qual a melhor|o que voc[eê]s acham|conselho|auditoria completa)\b/i.test(
          lower
        );
      const wantsUltron =
        /\b(diagn[oó]stico|previs[aã]o|prever|futuro|falha|colapso|gargalo|probabilidade|risco oculto|anomalia|estresse|subdesenvolvid|humano|vulnerabilidade cr[ií]tica)\b/i.test(
          lower
        );
      const wantsJarvis =
        /\b(arquitetura|seguran[cç]a|criptografia|autentica[cç][aã]o|servidor|banco de dados|api|estrutura|estrat[eé]gia|padroniza[cç][aã]o|protocolo|escalabilidade)\b/i.test(
          lower
        );
      const wantsFriday =
        /\b(r[aá]pido|pr[aá]tico|tarefa|agenda|hoje|rotina|interface|ux|design|tela|bot[aã]o|cansado|foco|produtividade|resumo|direto ao ponto)\b/i.test(
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
        resolvedMode = 'todos';
      }
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
    jarvis: isCodeQuery
      ? 'Auditando arquitetura, contratos de tipo e blindagem de segurança...'
      : isSearchQuery
      ? `Consultando ${domainsLabel} e atualizando cache em tempo real...`
      : 'Processando matriz estratégica e memória contextual de Patrick...',
    'sexta-feira': isCodeQuery
      ? 'Mapeando solução prática, fluidez de execução e estabilidade...'
      : isSearchQuery
      ? `Filtrando sinais ao vivo de ${domainsLabel} para resposta tática...`
      : 'Sincronizando prioridades do dia, empatia e resposta ágil...',
    ultron: isCodeQuery
      ? 'Dissecando gargalos, falhas em cascata e previsões de risco...'
      : isSearchQuery
      ? `Cruzando dados atualizados de ${domainsLabel} na matriz preditiva...`
      : 'Calculando diagnósticos preditivos e catalogando padrões humanos...',
  };

  return {
    resolvedMode,
    activeAssistants,
    reasoningTaskByAssistant,
  };
}
