import type { AssistantId, DailyIntelSourceKey } from '../types/assistant';

export type MandatorySearchSourceKey = 'g1' | 'ge' | 'b3' | 'cepea';
export type MandatorySearchDomain = 'g1.com.br' | 'ge.com.br' | 'b3.com.br' | 'cepea.com.br';
export type MandatorySearchUrl =
  | 'https://g1.com.br'
  | 'https://ge.com.br'
  | 'https://b3.com.br'
  | 'https://cepea.com.br';

export interface MandatorySearchRouteConfig {
  sourceKey: MandatorySearchSourceKey;
  domain: MandatorySearchDomain;
  url: MandatorySearchUrl;
  canonicalFeedUrls: string[];
  siteSearchOperator: string;
  topicLabel: string;
  recommendedAssistant: AssistantId;
  topicRegex: RegExp;
}

export interface RoutedSearchTarget {
  sourceKey: MandatorySearchSourceKey;
  domain: MandatorySearchDomain;
  url: MandatorySearchUrl;
  canonicalFeedUrls: string[];
  siteSearchOperator: string;
  topicLabel: string;
  recommendedAssistant: AssistantId;
  matchReason: string;
  scopedSearchQuery: string;
}

export interface TopicSearchRoutePlan {
  rawMessage: string;
  cleanTopicQuery: string;
  routedTargets: RoutedSearchTarget[];
  forcedSourceKeys: DailyIntelSourceKey[];
  forcedDomains: MandatorySearchDomain[];
  forcedUrls: MandatorySearchUrl[];
  wantsSocial: boolean;
  wantsGeneralWeb: boolean;
  wantsChristianStudy: boolean;
  explicitUrls: string[];
  forceCacheRefresh: true;
  directivePromptBlock: string;
}

export const MANDATORY_SEARCH_ROUTES: Record<
  MandatorySearchSourceKey,
  MandatorySearchRouteConfig
> = {
  g1: {
    sourceKey: 'g1',
    domain: 'g1.com.br',
    url: 'https://g1.com.br',
    canonicalFeedUrls: [
      'https://g1.globo.com/rss/g1/',
      'https://g1.globo.com/rss/g1/rj/rio-de-janeiro/',
      'https://g1.globo.com/rss/g1/economia/',
      'https://g1.globo.com/rss/g1/tecnologia/',
    ],
    siteSearchOperator: 'site:g1.com.br OR site:g1.globo.com',
    topicLabel: 'Notícias Gerais, Brasil, Rio de Janeiro, Política & Atualidades',
    recommendedAssistant: 'sexta-feira',
    topicRegex:
      /\b(g1|g1\.com|g1\.globo|not[íi]cia|noticias|manchete|manchetes|jornal|hoje|atual|atuais|[úu]ltimas|ultimas|brasil|rio|rj|fluminense|carioca|mundo|pol[íi]tica|elei[çc][ãa]o|governo|senado|c[âa]mara|stf|economia geral|tecnologia|ci[êe]ncia|acontecendo|resumo do dia|novidades|previs[ãa]o|tr[âa]nsito|seguran[çc]a p[úu]blica)\b/i,
  },
  ge: {
    sourceKey: 'ge',
    domain: 'ge.com.br',
    url: 'https://ge.com.br',
    canonicalFeedUrls: ['https://ge.globo.com/rss/ge/'],
    siteSearchOperator: 'site:ge.com.br OR site:ge.globo.com',
    topicLabel: 'Esportes, Futebol, Placares, Tabelas & Competições',
    recommendedAssistant: 'sexta-feira',
    topicRegex:
      /\b(ge|ge\.com|ge\.globo|globo esporte|esporte|esportes|futebol|campeonato|brasileir[ãa]o|libertadores|sul-americana|copa do brasil|copa do mundo|champions|premier league|sele[çc][ãa]o|jogo|jogos|partida|placar|gols|tabela|classifica[çc][ãa]o|rodada|t[ée]cnico|contrata[çc][ãa]o|flamengo|vasco|botafogo|fluminense|palmeiras|corinthians|s[ãa]o paulo|santos|gr[êe]mio|internacional|atl[ée]tico|cruzeiro|bahia|fortaleza|nba|basquete|f1|f[óo]rmula 1|ufc|mma|t[êe]nis|olimp[íi]ada|atleta)\b/i,
  },
  b3: {
    sourceKey: 'b3',
    domain: 'b3.com.br',
    url: 'https://b3.com.br',
    canonicalFeedUrls: [
      'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/cotacoes/',
    ],
    siteSearchOperator: 'site:b3.com.br',
    topicLabel: 'Bolsa de Valores (Ibovespa, Ações, FIIs) & Cotações de Moedas',
    recommendedAssistant: 'jarvis',
    topicRegex:
      /\b(b3|b3\.com|bovespa|bolsa|bolsa de valores|ibovespa|ibov|a[çc][õo]es|a[çc][ãa]o|ativo|ativos|fii|fiis|etf|bdr|d[óo]lar|dolar|ptax|euro|libra|ienes|moeda|moedas|c[âa]mbio|cambio|cota[çc][ãa]o|cota[çc][õo]es|selic|cdi|juros|tesouro direto|renda fixa|renda vari[áa]vel|dividendos|bitcoin|btc|cripto|criptomoeda|mercado financeiro|petr4|vale3|itub4|bbas3|bbdc4|wege3|abev3|mglu3|[a-z]{4}\d{1,2})\b/i,
  },
  cepea: {
    sourceKey: 'cepea',
    domain: 'cepea.com.br',
    url: 'https://cepea.com.br',
    canonicalFeedUrls: [
      'https://www.cepea.org.br/br',
      'https://www.cepea.org.br/br/indicador/boi-gordo.aspx',
      'https://www.cepea.org.br/br/indicador/soja.aspx',
      'https://www.cepea.org.br/br/indicador/milho.aspx',
      'https://www.cepea.org.br/br/indicador/cafe.aspx',
      'https://www.cepea.org.br/br/indicador/arroz.aspx',
      'https://www.cepea.org.br/br/indicador/acucar.aspx',
      'https://www.cepea.org.br/br/indicador/trigo.aspx',
      'https://www.cepea.org.br/br/indicador/frango.aspx',
    ],
    siteSearchOperator: 'site:cepea.com.br OR site:cepea.org.br',
    topicLabel: 'Bolsa Alimentícia, Agronegócio & Commodities Agrícolas (CEPEA)',
    recommendedAssistant: 'ultron',
    topicRegex:
      /\b(cepea|cepea\.com|cepea\.org|esalq|aliment[íi]cia|alimenticia|alimento|alimentos|bolsa aliment[íi]cia|agro|agroneg[óo]cio|agropecu[áa]ria|safra|commodity|commodities|boi|boi gordo|arroba|gado|pecu[áa]ria|carne|soja|milho|caf[ée]|arabica|robusta|a[çc][úu]car|cana|etanol|arroz|feij[ãa]o|trigo|farinha|frango|aves|su[íi]no|porco|leite|algod[ãa]o|laranja|mandioca|batata|hortifruti)\b/i,
  },
};

const ALL_MANDATORY_KEYS: MandatorySearchSourceKey[] = ['g1', 'ge', 'b3', 'cepea'];

const BROAD_SYNC_REGEX =
  /\b(tudo|todas as fontes|todos os sites|resumo geral|resumo do dia|panorama completo|panorama do dia|atualize tudo|alimente a base|sincronize as fontes|radar completo)\b/i;

const SOCIAL_TOPIC_REGEX =
  /\b(rede social|redes sociais|instagram|insta|facebook|twitter|x\.com|tiktok|youtube|threads|linkedin|kwai|reddit|trending|viral|assunto do momento|assuntos do momento|bombando|repercuss[ãa]o|opini[ãa]o p[úu]blica|postagem|stories|reels)\b/i;

const GENERAL_WEB_REGEX =
  /\b(pesquis|busque|busca|procur|internet|web|site|sites|consult|verifiq|quem [ée]|quem foi|documenta[çc][ãa]o|stack|github)\b/i;

export const CHRISTIAN_STUDY_REGEX =
  /\b(b[íi]blia|biblia|bibliaon|bibliaon\.com|b[íi]blia online|a mensagem|escolabiblicadominical|escola b[íi]blica|ebd|jesus|cristo|crist[ãa]o|crist[ãa]|cristoc[êe]ntric|evangelho|vers[íi]culo|vers[íi]culos|salmo|salmos|prov[ée]rbios|eclesiastes|isa[íi]as|g[êe]nesis|[êe]xodo|apocalipse|mateus|marcos|lucas|jo[ãa]o|atos|romanos|cor[íi]ntios|g[áa]latas|ef[ée]sios|filipenses|colossenses|tessalonicenses|tim[óo]teo|hebreus|tiago|pedro|devocional|ora[çc][ãa]o|orar|f[ée]|gra[çc]a|miseric[óo]rdia|esperan[çc]a|sabedoria b[íi]blica|teologia|estudo b[íi]blico|li[çc][ãa]o da ebd|igreja|deus|esp[íi]rito santo|palavra de deus|conselho espiritual|paz espiritual|b[êe]n[çc][ãa]o|prop[óo]sito de vida|perd[ãa]o|conforto espiritual|escrituras)\b/i;

export function stripTopicSearchNoise(rawMessage: string): string {
  return rawMessage
    .replace(/https?:\/\/[^\s]+/gi, ' ')
    .replace(
      /\b(jarvis|sexta[\s-]?feira|friday|ultron|[uú]ltron|todos|por favor|pesquise|pesquisa|busque|busca|procure|procura|consulte|consulta|veja|verifique|na internet|na web|nas redes sociais|para mim|me diga|o que voc[eê]s acham|analisem|me atualize|alimente)\b/gi,
      ' '
    )
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

export function extractExplicitUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>()]+/gi) ?? [];
  return Array.from(new Set(matches)).slice(0, 4);
}

/**
 * Resolve o plano de roteamento de busca baseado no tópico da solicitação do usuário,
 * forçando as IAs a consultarem especificamente g1.com.br, ge.com.br, b3.com.br e cepea.com.br
 * com atualização obrigatória de cache em cada interação, além de escolabiblicadominical.org
 * e Bíblia de Estudos A Mensagem para temas cristãos e bíblicos de J.A.R.V.I.S.
 */
export function resolveTopicSearchRoute(userMessage: string): TopicSearchRoutePlan {
  const cleanMessage = (userMessage || '').trim();
  const cleanTopicQuery = stripTopicSearchNoise(cleanMessage) || cleanMessage.slice(0, 100);
  const explicitUrls = extractExplicitUrls(cleanMessage);
  const wantsBroadBriefing = BROAD_SYNC_REGEX.test(cleanMessage);
  const wantsSocial = SOCIAL_TOPIC_REGEX.test(cleanMessage);
  const wantsChristianStudy = CHRISTIAN_STUDY_REGEX.test(cleanMessage);
  const wantsGeneralWeb = explicitUrls.length > 0 || GENERAL_WEB_REGEX.test(cleanMessage);

  const routedTargets: RoutedSearchTarget[] = [];

  for (const key of ALL_MANDATORY_KEYS) {
    const cfg = MANDATORY_SEARCH_ROUTES[key];
    const matchedKeyword = cleanMessage.match(cfg.topicRegex)?.[0] ?? null;

    if (wantsBroadBriefing || matchedKeyword) {
      routedTargets.push({
        sourceKey: cfg.sourceKey,
        domain: cfg.domain,
        url: cfg.url,
        canonicalFeedUrls: cfg.canonicalFeedUrls,
        siteSearchOperator: cfg.siteSearchOperator,
        topicLabel: cfg.topicLabel,
        recommendedAssistant: cfg.recommendedAssistant,
        matchReason: wantsBroadBriefing
          ? `Panorama completo solicitado — roteamento forçado para ${cfg.domain}`
          : `Tópico "${matchedKeyword}" detectado — roteamento obrigatório para ${cfg.url}`,
        scopedSearchQuery: cleanTopicQuery
          ? `${cfg.siteSearchOperator} ${cleanTopicQuery}`
          : `${cfg.siteSearchOperator} hoje brasil`,
      });
    }
  }

  // Fallback de roteamento quando nenhuma palavra-chave específica de esportes/bolsa/agro for detectada:
  // força g1.com.br por padrão para manter atualidades frescas no cache a cada interação.
  if (routedTargets.length === 0) {
    const g1 = MANDATORY_SEARCH_ROUTES.g1;
    routedTargets.push({
      sourceKey: g1.sourceKey,
      domain: g1.domain,
      url: g1.url,
      canonicalFeedUrls: g1.canonicalFeedUrls,
      siteSearchOperator: g1.siteSearchOperator,
      topicLabel: g1.topicLabel,
      recommendedAssistant: g1.recommendedAssistant,
      matchReason: 'Roteamento padrão de atualidades em tempo real para g1.com.br',
      scopedSearchQuery: cleanTopicQuery
        ? `${g1.siteSearchOperator} ${cleanTopicQuery}`
        : `${g1.siteSearchOperator} principais notícias hoje`,
    });
  }

  const forcedSourceKeys: DailyIntelSourceKey[] = routedTargets.map((t) => t.sourceKey);
  if (wantsSocial || wantsBroadBriefing) {
    forcedSourceKeys.push('redes_sociais');
  }
  if (wantsChristianStudy || wantsBroadBriefing) {
    forcedSourceKeys.push('bibliaon');
  }

  const forcedDomains = routedTargets.map((t) => t.domain);
  const forcedUrls = routedTargets.map((t) => t.url);

  const directiveLines = [
    `[UTILITÁRIO DE ROTEAMENTO DE BUSCA — CONSULTA FORÇADA & CACHE ATUALIZADO NA INTERAÇÃO]`,
    `URLs obrigatórias roteadas para este tópico: ${forcedUrls.join(', ')}${
      wantsChristianStudy
        ? ', https://www.bibliaon.com, https://escolabiblicadominical.org'
        : ''
    }`,
    ...routedTargets.map(
      (t) =>
        `• Tópico (${t.topicLabel}) -> CONSULTAR OBRIGATORIAMENTE ${t.url} (${t.domain}) [${t.matchReason}]`
    ),
    ...(wantsChristianStudy
      ? [
          `• Tópico Cristão / Bíblico / EBD (Especialidade Cristocêntrica de J.A.R.V.I.S.) -> CONSULTAR OBRIGATORIAMENTE https://www.bibliaon.com (bibliaon.com) e https://escolabiblicadominical.org (escolabiblicadominical.org), fundamentando a reflexão na Bíblia de Estudos "A Mensagem" (Eugene H. Peterson) com sabedoria bíblica, paciência, cuidado pastoral e aplicação prática centrada em Cristo.`,
        ]
      : []),
    `REGRA ESTRITA: As respostas de J.A.R.V.I.S., SEXTA-FEIRA e ULTRON DEVEM utilizar e citar explicitamente os dados recém-atualizados em cache obtidos das URLs roteadas (${forcedDomains.join(', ')}${
      wantsChristianStudy ? ', bibliaon.com, escolabiblicadominical.org' : ''
    }).`,
  ];

  return {
    rawMessage: cleanMessage,
    cleanTopicQuery,
    routedTargets,
    forcedSourceKeys,
    forcedDomains,
    forcedUrls,
    wantsSocial,
    wantsGeneralWeb,
    wantsChristianStudy,
    explicitUrls,
    forceCacheRefresh: true,
    directivePromptBlock: directiveLines.join('\n'),
  };
}
