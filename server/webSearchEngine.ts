import crypto from 'node:crypto';
import type {
  DailyIntelRecordItem,
  DailyIntelSourceKey,
  DailySourceSnapshot,
  GroundingSource,
} from '../src/types/assistant.ts';
import {
  MANDATORY_SEARCH_ROUTES,
  extractExplicitUrls,
  resolveTopicSearchRoute,
  stripTopicSearchNoise,
  type TopicSearchRoutePlan,
} from '../src/utils/searchRouter.ts';

export interface ExternalResearchResult {
  summaryText: string;
  sources: GroundingSource[];
  enginesUsed: string[];
  snapshots: DailySourceSnapshot[];
  routePlan: TopicSearchRoutePlan;
  cacheUpdatedAt: string;
  interactionSequence: number;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&rsquo;/gi, '’')
    .replace(/&hellip;/gi, '…')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ecirc;/gi, 'ê')
    .replace(/&ocirc;/gi, 'ô')
    .replace(/&agrave;/gi, 'à')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const IS_SERVERLESS_ENV = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 3600
): Promise<Response> {
  const effectiveTimeout = IS_SERVERLESS_ENV ? Math.max(timeoutMs, 5400) : timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseRssItems(
  xml: string,
  maxItems = 6
): Array<{ title: string; link: string; description: string; pubDate?: string }> {
  const items: Array<{ title: string; link: string; description: string; pubDate?: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);
    const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
    const link = linkMatch ? decodeHtmlEntities(linkMatch[1]) : '';
    const description = descMatch ? decodeHtmlEntities(descMatch[1]) : '';
    const pubDate = dateMatch ? decodeHtmlEntities(dateMatch[1]) : undefined;

    if (title && link && /^https?:\/\//i.test(link)) {
      items.push({ title, link, description, pubDate });
    }
  }
  return items;
}

const extractUrlsFromText = extractExplicitUrls;
const stripQueryForSearch = stripTopicSearchNoise;

export function getQueryDateSaoPaulo(clientTimeIso?: string, clientTimezone?: string): string {
  const now = clientTimeIso ? new Date(clientTimeIso) : new Date();
  const tz = clientTimezone || 'America/Sao_Paulo';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

async function searchWikipediaPt(
  query: string,
  sourceType = 'Enciclopédia / Web',
  maxItems = 3
): Promise<Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>> {
  const clean = query.replace(/site:[^\s]+/gi, '').trim();
  if (clean.length < 3) return [];
  try {
    const url = `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      clean
    )}&srlimit=${maxItems}&utf8=1&format=json&origin=*`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } }, 3600);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: {
        search?: Array<{ title: string; snippet?: string; timestamp?: string }>;
      };
    };
    return (data.query?.search ?? []).slice(0, maxItems).map((item) => ({
      title: item.title,
      uri: `https://pt.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
      snippet: decodeHtmlEntities(item.snippet || item.title),
      sourceType,
      date: item.timestamp,
    }));
  } catch {
    return [];
  }
}

async function searchBingWeb(
  query: string,
  sourceType: string,
  maxItems = 5
): Promise<Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&cc=BR&setlang=pt-BR`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
      },
      3200
    );
    if (res.ok) {
      const xml = await res.text();
      const bingItems = parseRssItems(xml, maxItems).map((item) => ({
        title: item.title,
        uri: item.link,
        snippet: item.description || item.title,
        sourceType,
        date: item.pubDate,
      }));
      if (bingItems.length > 0) {
        return bingItems;
      }
    }
  } catch {
    // Fall through to cloud-friendly search fallbacks (Google News RSS + Wikipedia PT-BR)
  }

  // Fallback for cloud datacenter IPs (e.g., Vercel AWS) where Bing RSS returns CAPTCHA/empty
  const [gNewsFallback, wikiFallback] = await Promise.all([
    searchGoogleNews(query, sourceType, maxItems),
    searchWikipediaPt(query, `${sourceType} · Referência`, Math.min(2, maxItems)),
  ]);
  return [...gNewsFallback, ...wikiFallback].slice(0, maxItems);
}

async function searchGoogleNews(
  query: string,
  sourceType = 'Notícias',
  maxItems = 5
): Promise<Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } }, 3200);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml, maxItems).map((item) => ({
      title: item.title,
      uri: item.link,
      snippet: item.description || item.title,
      sourceType,
      date: item.pubDate,
    }));
  } catch {
    return [];
  }
}

// 1. G1 (g1.com.br -> g1.globo.com RSS & search)
async function fetchG1News(
  query: string,
  queryDate: string
): Promise<{
  items: Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>;
  snapshot: DailySourceSnapshot | null;
}> {
  const lower = query.toLowerCase();
  const feedUrls = ['https://g1.globo.com/rss/g1/'];
  if (/\b(rio|rj|fluminense|carioca)\b/i.test(lower)) {
    feedUrls.unshift('https://g1.globo.com/rss/g1/rj/rio-de-janeiro/');
  } else if (/\b(economia|infla[çc][ãa]o|imposto|sal[áa]rio|mercado|governo)\b/i.test(lower)) {
    feedUrls.unshift('https://g1.globo.com/rss/g1/economia/');
  } else if (/\b(tecnologia|ia|intelig[êe]ncia artificial|ci[êe]ncia|celular)\b/i.test(lower)) {
    feedUrls.unshift('https://g1.globo.com/rss/g1/tecnologia/');
  }

  const [rssResults, siteSearch] = await Promise.all([
    Promise.all(
      feedUrls.slice(0, 2).map(async (u) => {
        try {
          const res = await fetchWithTimeout(u, { headers: { 'User-Agent': BROWSER_UA } }, 3500);
          if (!res.ok) return [];
          const xml = await res.text();
          return parseRssItems(xml, 15).map((it) => ({
            title: it.title,
            uri: it.link,
            snippet: it.description || it.title,
            sourceType: 'G1 (g1.com.br)',
            date: it.pubDate,
          }));
        } catch {
          return [];
        }
      })
    ),
    query.trim().length >= 3
      ? searchGoogleNews(
          `(${MANDATORY_SEARCH_ROUTES.g1.siteSearchOperator}) ${query} when:2d`,
          'G1 (g1.com.br)',
          5
        )
      : Promise.resolve([]),
  ]);

  const combined = [...siteSearch, ...rssResults.flat()];
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !/^(g1|com|br|noticias|notícia|hoje|site|sobre)$/.test(w));

  const seen = new Set<string>();
  const unique = combined.filter((it) => {
    if (seen.has(it.uri)) return false;
    seen.add(it.uri);
    return true;
  });

  // Prioritize keyword matches if query is specific, then keep top headlines
  unique.sort((a, b) => {
    const aText = `${a.title} ${a.snippet}`.toLowerCase();
    const bText = `${b.title} ${b.snippet}`.toLowerCase();
    const aHits = words.reduce((acc, w) => acc + (aText.includes(w) ? 1 : 0), 0);
    const bHits = words.reduce((acc, w) => acc + (bText.includes(w) ? 1 : 0), 0);
    return bHits - aHits;
  });

  const top = unique.slice(0, 6);
  if (top.length === 0) return { items: [], snapshot: null };

  const snapshot: DailySourceSnapshot = {
    id: `intel_g1_${queryDate}`,
    sourceKey: 'g1',
    sourceLabel: 'G1 Notícias (g1.com.br)',
    domainUrl: MANDATORY_SEARCH_ROUTES.g1.url,
    queryDate,
    updatedAt: new Date().toISOString(),
    queryTerm: query || 'Manchetes do dia G1',
    headlineSummary: top
      .slice(0, 3)
      .map((i) => i.title)
      .join(' | '),
    items: top.map((i) => ({
      title: i.title,
      detail: i.snippet.slice(0, 260),
      uri: i.uri,
      publishedAt: i.date,
    })),
  };

  return { items: top, snapshot };
}

// 2. GE (ge.com.br -> ge.globo.com Sports RSS & search)
async function fetchGeSportsNews(
  query: string,
  queryDate: string
): Promise<{
  items: Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>;
  snapshot: DailySourceSnapshot | null;
}> {
  const [rssRes, teamSearch] = await Promise.all([
    (async () => {
      try {
        const res = await fetchWithTimeout(
          'https://ge.globo.com/rss/ge/',
          { headers: { 'User-Agent': BROWSER_UA } },
          3600
        );
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRssItems(xml, 16).map((it) => ({
          title: it.title,
          uri: it.link,
          snippet: it.description || it.title,
          sourceType: 'GE Esportes (ge.com.br)',
          date: it.pubDate,
        }));
      } catch {
        return [];
      }
    })(),
    query.trim().length >= 3
      ? searchGoogleNews(
          `(${MANDATORY_SEARCH_ROUTES.ge.siteSearchOperator}) ${query} when:3d`,
          'GE Esportes (ge.com.br)',
          5
        )
      : Promise.resolve([]),
  ]);

  const combined = [...teamSearch, ...rssRes];
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^(ge|com|br|esporte|esportes|hoje|sobre|futebol)$/.test(w));

  const seen = new Set<string>();
  const unique = combined.filter((it) => {
    if (seen.has(it.uri)) return false;
    seen.add(it.uri);
    return true;
  });

  unique.sort((a, b) => {
    const aText = `${a.title} ${a.snippet}`.toLowerCase();
    const bText = `${b.title} ${b.snippet}`.toLowerCase();
    const aHits = words.reduce((acc, w) => acc + (aText.includes(w) ? 1 : 0), 0);
    const bHits = words.reduce((acc, w) => acc + (bText.includes(w) ? 1 : 0), 0);
    return bHits - aHits;
  });

  const top = unique.slice(0, 6);
  if (top.length === 0) return { items: [], snapshot: null };

  const snapshot: DailySourceSnapshot = {
    id: `intel_ge_${queryDate}`,
    sourceKey: 'ge',
    sourceLabel: 'GE Esportes (ge.com.br)',
    domainUrl: MANDATORY_SEARCH_ROUTES.ge.url,
    queryDate,
    updatedAt: new Date().toISOString(),
    queryTerm: query || 'Principais notícias esportivas GE',
    headlineSummary: top
      .slice(0, 3)
      .map((i) => i.title)
      .join(' | '),
    items: top.map((i) => ({
      title: i.title,
      detail: i.snippet.slice(0, 260),
      uri: i.uri,
      publishedAt: i.date,
    })),
  };

  return { items: top, snapshot };
}

// 3. B3 (b3.com.br) Stock Exchange & Currency Quotes + BCB PTAX
async function fetchYahooQuote(
  symbol: string,
  displayName: string,
  unitPrefix: string
): Promise<DailyIntelRecordItem | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?interval=1d&range=5d`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } }, 3200);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            regularMarketChangePercent?: number;
            regularMarketDayHigh?: number;
            regularMarketDayLow?: number;
            currency?: string;
          };
        }>;
      };
    };
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') return null;

    const price = meta.regularMarketPrice;
    const chg = meta.regularMarketChangePercent ?? 0;
    const chgSign = chg >= 0 ? '+' : '';
    const formattedPrice =
      price >= 1000
        ? price.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
        : price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

    return {
      title: `${displayName}: ${unitPrefix}${formattedPrice} (${chgSign}${chg.toFixed(2)}%)`,
      detail: `Mín. dia: ${unitPrefix}${(meta.regularMarketDayLow ?? price).toLocaleString(
        'pt-BR',
        { maximumFractionDigits: 4 }
      )} · Máx. dia: ${unitPrefix}${(meta.regularMarketDayHigh ?? price).toLocaleString(
        'pt-BR',
        { maximumFractionDigits: 4 }
      )} · Fonte B3/Mercado`,
      uri: 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/cotacoes/',
      publishedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fetchBcbPtaxUsd(): Promise<DailyIntelRecordItem | null> {
  // Try today and up to 4 previous days in case of weekend/holiday
  for (let offset = 0; offset <= 4; offset++) {
    const d = new Date(Date.now() - offset * 86400_000);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    const bcbDate = `${mm}-${dd}-${yyyy}`;
    try {
      const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao=%27${bcbDate}%27&$top=5&$format=json`;
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } }, 2800);
      if (!res.ok) continue;
      const json = (await res.json()) as {
        value?: Array<{
          cotacaoCompra?: number;
          cotacaoVenda?: number;
          dataHoraCotacao?: string;
        }>;
      };
      const last = json.value?.[json.value.length - 1];
      if (last && typeof last.cotacaoVenda === 'number') {
        return {
          title: `Dólar PTAX Oficial (BC/B3): Compra R$ ${last.cotacaoCompra?.toFixed(4)} · Venda R$ ${last.cotacaoVenda.toFixed(4)}`,
          detail: `Boletim Banco Central do Brasil em ${last.dataHoraCotacao || `${dd}/${mm}/${yyyy}`}.`,
          uri: 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/cotacoes/',
          publishedAt: last.dataHoraCotacao,
        };
      }
    } catch {
      // try previous day
    }
  }
  return null;
}

async function fetchAwesomeApiCurrencies(): Promise<DailyIntelRecordItem[]> {
  try {
    const url = 'https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL';
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } }, 3600);
    if (!res.ok) return [];
    const data = (await res.json()) as Record<
      string,
      { name?: string; bid?: string; ask?: string; pctChange?: string; high?: string; low?: string; create_date?: string }
    >;
    const pairs: Array<{ key: string; label: string }> = [
      { key: 'USDBRL', label: 'Dólar Comercial (USD/BRL)' },
      { key: 'EURBRL', label: 'Euro (EUR/BRL)' },
      { key: 'BTCBRL', label: 'Bitcoin (BTC/BRL)' },
    ];
    const records: DailyIntelRecordItem[] = [];
    for (const pair of pairs) {
      const q = data[pair.key];
      const bid = Number(q?.bid);
      if (!q || !Number.isFinite(bid)) continue;
      const pct = Number(q.pctChange ?? 0);
      const sign = pct >= 0 ? '+' : '';
      const formatted =
        bid >= 1000
          ? bid.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
          : bid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      records.push({
        title: `${pair.label}: R$ ${formatted} (${sign}${pct.toFixed(2)}%)`,
        detail: `Mín. dia: R$ ${q.low ?? formatted} · Máx. dia: R$ ${q.high ?? formatted} · Câmbio em tempo real`,
        uri: 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/cotacoes/',
        publishedAt: q.create_date || new Date().toISOString(),
      });
    }
    return records;
  } catch {
    return [];
  }
}

async function fetchB3MarketAndCurrencies(
  query: string,
  queryDate: string
): Promise<{
  items: Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>;
  snapshot: DailySourceSnapshot | null;
}> {
  const [ibov, usd, eur, btc, petr4, vale3, ptax, b3News] = await Promise.all([
    fetchYahooQuote('^BVSP', 'Ibovespa (B3)', ''),
    fetchYahooQuote('USDBRL=X', 'Dólar Comercial (USD/BRL)', 'R$ '),
    fetchYahooQuote('EURBRL=X', 'Euro (EUR/BRL)', 'R$ '),
    fetchYahooQuote('BTC-BRL', 'Bitcoin (BTC/BRL)', 'R$ '),
    fetchYahooQuote('PETR4.SA', 'Petrobras PN (PETR4)', 'R$ '),
    fetchYahooQuote('VALE3.SA', 'Vale ON (VALE3)', 'R$ '),
    fetchBcbPtaxUsd(),
    searchGoogleNews(`site:b3.com.br OR "Ibovespa" OR "dólar B3" ${query} when:2d`, 'B3 (b3.com.br)', 4),
  ]);

  let quoteRecords = [ibov, usd, ptax, eur, btc, petr4, vale3].filter(
    (q): q is DailyIntelRecordItem => q !== null
  );

  // Cloud-IP fallback: if Yahoo Finance / BCB PTAX failed or rate-limited from Vercel US IPs
  if (!usd && !eur && !ptax) {
    const awesomeFallback = await fetchAwesomeApiCurrencies();
    quoteRecords = [...quoteRecords, ...awesomeFallback];
  }

  const items: Array<{
    title: string;
    uri: string;
    snippet: string;
    sourceType: string;
    date?: string;
  }> = [
    ...quoteRecords.map((q) => ({
      title: q.title,
      uri: q.uri,
      snippet: q.detail,
      sourceType: 'B3 & Câmbio (b3.com.br)',
      date: q.publishedAt,
    })),
    ...b3News.map((n) => ({
      ...n,
      sourceType: 'B3 & Mercado (b3.com.br)',
    })),
  ];

  const allRecords: DailyIntelRecordItem[] = [
    ...quoteRecords,
    ...b3News.map((n) => ({
      title: n.title,
      detail: n.snippet,
      uri: n.uri,
      publishedAt: n.date,
    })),
  ];

  if (allRecords.length === 0) return { items: [], snapshot: null };

  const snapshot: DailySourceSnapshot = {
    id: `intel_b3_${queryDate}`,
    sourceKey: 'b3',
    sourceLabel: 'B3 Bolsa & Cotações de Moedas (b3.com.br)',
    domainUrl: MANDATORY_SEARCH_ROUTES.b3.url,
    queryDate,
    updatedAt: new Date().toISOString(),
    queryTerm: query || 'Ibovespa, Ações B3 e Moedas',
    headlineSummary: allRecords
      .slice(0, 3)
      .map((r) => r.title)
      .join(' | '),
    items: allRecords.slice(0, 8),
  };

  return { items: items.slice(0, 8), snapshot };
}

// 4. CEPEA (cepea.com.br / cepea.org.br) Food & Agricultural Commodities Exchange
const CEPEA_INDICATORS: Array<{ slug: string; label: string; unit: string; keywords: RegExp }> = [
  { slug: 'boi-gordo', label: 'Boi Gordo CEPEA/B3', unit: 'R$/@ (15 kg)', keywords: /\b(boi|boi gordo|arroba|carne|pecu[áa]ria)\b/i },
  { slug: 'soja', label: 'Soja CEPEA (Paranaguá/PR)', unit: 'R$/sc 60kg', keywords: /\b(soja|gr[ãa]os)\b/i },
  { slug: 'milho', label: 'Milho CEPEA/B3', unit: 'R$/sc 60kg', keywords: /\b(milho|gr[ãa]os)\b/i },
  { slug: 'cafe', label: 'Café Arábica CEPEA', unit: 'R$/sc 60kg', keywords: /\b(caf[ée]|arabica|robusta)\b/i },
  { slug: 'arroz', label: 'Arroz em Casca CEPEA', unit: 'R$/sc 50kg', keywords: /\b(arroz)\b/i },
  { slug: 'acucar', label: 'Açúcar Cristal CEPEA', unit: 'R$/sc 50kg', keywords: /\b(a[çc][úu]car|cana)\b/i },
  { slug: 'trigo', label: 'Trigo CEPEA', unit: 'R$/ton', keywords: /\b(trigo|farinha|p[ãa]o)\b/i },
  { slug: 'frango', label: 'Frango Resfriado CEPEA', unit: 'R$/kg', keywords: /\b(frango|aves)\b/i },
];

async function fetchCepeaIndicatorRow(ind: {
  slug: string;
  label: string;
  unit: string;
}): Promise<DailyIntelRecordItem | null> {
  const url = `https://www.cepea.org.br/br/indicador/${ind.slug}.aspx`;
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } }, 3800);
    if (!res.ok) return null;
    const html = await res.text();
    const cleaned = decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    );
    // Pattern: DD/MM/YYYY VALUE VAR_DAY VAR_MONTH [USD_VALUE]
    const match = cleaned.match(
      /(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([-+]?[\d.,]+%?)\s+([-+]?[\d.,]+%?)(?:\s+([\d.,]+))?/
    );
    if (!match) return null;
    const [, dateStr, priceBrl, varDay, varMonth, priceUsd] = match;
    return {
      title: `${ind.label}: R$ ${priceBrl} (${ind.unit}) em ${dateStr}`,
      detail: `Variação dia: ${varDay} · Variação mês: ${varMonth}${
        priceUsd ? ` · US$ ${priceUsd}` : ''
      } — Fonte oficial CEPEA/ESALQ.`,
      uri: url,
      publishedAt: dateStr,
    };
  } catch {
    return null;
  }
}

async function fetchCepeaHomeNews(): Promise<DailyIntelRecordItem[]> {
  try {
    const res = await fetchWithTimeout(
      'https://www.cepea.org.br/br',
      { headers: { 'User-Agent': BROWSER_UA } },
      3600
    );
    if (!res.ok) return [];
    const html = await res.text();
    const cleaned = decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    );
    const items: DailyIntelRecordItem[] = [];
    const regex = /(\d{2}\|\d{2}\|\d{4})\s+([A-ZÇÃÕÁÉÍÓÚ\/\-]+CEPEA:\s*[^|]{12,180}?)\s+Leia mais/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(cleaned)) !== null && items.length < 4) {
      items.push({
        title: m[2].trim(),
        detail: `Diária de Mercado CEPEA-Esalq/USP (${m[1].replace(/\|/g, '/')}).`,
        uri: 'https://www.cepea.org.br/br',
        publishedAt: m[1].replace(/\|/g, '/'),
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchCepeaFoodCommodities(
  query: string,
  queryDate: string
): Promise<{
  items: Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>;
  snapshot: DailySourceSnapshot | null;
}> {
  const matched = CEPEA_INDICATORS.filter((i) => i.keywords.test(query));
  const selected =
    matched.length > 0
      ? [...matched, ...CEPEA_INDICATORS.filter((i) => !matched.includes(i)).slice(0, 3)].slice(0, 4)
      : CEPEA_INDICATORS.slice(0, 4); // Boi Gordo, Soja, Milho, Café

  const [quotes, homeNews] = await Promise.all([
    Promise.all(selected.map((s) => fetchCepeaIndicatorRow(s))),
    fetchCepeaHomeNews(),
  ]);

  const validQuotes = quotes.filter((q): q is DailyIntelRecordItem => q !== null);
  const allRecords = [...validQuotes, ...homeNews];

  if (allRecords.length === 0) return { items: [], snapshot: null };

  const items = allRecords.map((r) => ({
    title: r.title,
    uri: r.uri,
    snippet: r.detail,
    sourceType: 'CEPEA Alimentício (cepea.com.br)',
    date: r.publishedAt,
  }));

  const snapshot: DailySourceSnapshot = {
    id: `intel_cepea_${queryDate}`,
    sourceKey: 'cepea',
    sourceLabel: 'CEPEA Bolsa Alimentícia & Agro (cepea.com.br)',
    domainUrl: MANDATORY_SEARCH_ROUTES.cepea.url,
    queryDate,
    updatedAt: new Date().toISOString(),
    queryTerm: query || 'Boi Gordo, Soja, Milho, Café & Diárias CEPEA',
    headlineSummary: allRecords
      .slice(0, 3)
      .map((r) => r.title)
      .join(' | '),
    items: allRecords.slice(0, 8),
  };

  return { items: items.slice(0, 8), snapshot };
}

// 5. Traditional Social Media (Instagram, X/Twitter, TikTok, Facebook, YouTube, Threads, Reddit, LinkedIn)
async function fetchTraditionalSocialMedia(
  query: string,
  queryDate: string
): Promise<{
  items: Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>;
  snapshot: DailySourceSnapshot | null;
}> {
  const topic = query.trim().length >= 2 ? query : 'Brasil assuntos do momento';
  const [bingSocial, newsSocial, redditSearch] = await Promise.all([
    searchBingWeb(
      `(site:instagram.com OR site:x.com OR site:twitter.com OR site:tiktok.com OR site:youtube.com OR site:facebook.com OR site:threads.net) ${topic}`,
      'Redes Sociais',
      6
    ),
    searchGoogleNews(
      `(Instagram OR Twitter OR "X" OR TikTok OR YouTube OR Facebook) ${topic} when:2d`,
      'Repercussão Redes Sociais',
      4
    ),
    searchBingWeb(`site:reddit.com ${topic}`, 'Reddit / Comunidade', 3),
  ]);

  const combined = [...bingSocial, ...newsSocial, ...redditSearch];
  const seen = new Set<string>();
  const unique = combined.filter((it) => {
    if (seen.has(it.uri)) return false;
    seen.add(it.uri);
    const lowerUri = it.uri.toLowerCase();
    if (lowerUri.includes('instagram.com')) it.sourceType = 'Instagram';
    else if (lowerUri.includes('x.com') || lowerUri.includes('twitter.com')) it.sourceType = 'X / Twitter';
    else if (lowerUri.includes('youtube.com')) it.sourceType = 'YouTube';
    else if (lowerUri.includes('tiktok.com')) it.sourceType = 'TikTok';
    else if (lowerUri.includes('facebook.com')) it.sourceType = 'Facebook';
    else if (lowerUri.includes('threads.net')) it.sourceType = 'Threads';
    else if (lowerUri.includes('linkedin.com')) it.sourceType = 'LinkedIn';
    return true;
  });

  const top = unique.slice(0, 8);
  if (top.length === 0) return { items: [], snapshot: null };

  const snapshot: DailySourceSnapshot = {
    id: `intel_redes_sociais_${queryDate}`,
    sourceKey: 'redes_sociais',
    sourceLabel: 'Redes Sociais Tradicionais (Instagram, X, YouTube, TikTok, Facebook, Reddit)',
    domainUrl: 'https://www.instagram.com/',
    queryDate,
    updatedAt: new Date().toISOString(),
    queryTerm: topic,
    headlineSummary: top
      .slice(0, 3)
      .map((i) => `[${i.sourceType}] ${i.title}`)
      .join(' | '),
    items: top.map((i) => ({
      title: `[${i.sourceType}] ${i.title}`,
      detail: i.snippet.slice(0, 260),
      uri: i.uri,
      publishedAt: i.date,
    })),
  };

  return { items: top, snapshot };
}

async function fetchPageReadableExcerpt(
  pageUrl: string
): Promise<{ title: string; uri: string; excerpt: string } | null> {
  try {
    const res = await fetchWithTimeout(
      pageUrl,
      {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
        },
        redirect: 'follow',
      },
      3200
    );
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null;
    }
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : pageUrl;

    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');

    const textOnly = decodeHtmlEntities(cleaned).slice(0, 2400);
    if (textOnly.length < 80) return null;

    return {
      title,
      uri: res.url || pageUrl,
      excerpt: textOnly,
    };
  } catch {
    return null;
  }
}

export async function fetchEscolaBiblicaDominical(
  query = ''
): Promise<Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>> {
  const sourceLabel = 'Escola Bíblica Dominical (escolabiblicadominical.org)';
  const cleanTerm = query
    .replace(/\b(escolabiblicadominical(\.org)?|b[íi]blia a mensagem|a mensagem|estudo b[íi]blico|estudos b[íi]blicos)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const fetchWordPressRss = async (feedUrl: string, limit: number) => {
    try {
      const res = await fetchWithTimeout(
        feedUrl,
        {
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9',
          },
          redirect: 'follow',
        },
        3600
      );
      if (!res.ok) return [];
      const xml = await res.text();
      return parseRssItems(xml, limit).map((item) => ({
        title: item.title,
        uri: item.link,
        snippet: (item.description || item.title).slice(0, 340),
        sourceType: sourceLabel,
        date: item.pubDate,
      }));
    } catch {
      return [];
    }
  };

  const searchRssUrl =
    cleanTerm.length >= 3
      ? `https://escolabiblicadominical.org/?s=${encodeURIComponent(cleanTerm)}&feed=rss2`
      : null;

  const [searchRssItems, mainFeedItems, siteSearchItems] = await Promise.all([
    searchRssUrl ? fetchWordPressRss(searchRssUrl, 5) : Promise.resolve([]),
    fetchWordPressRss('https://escolabiblicadominical.org/feed/', 5),
    searchBingWeb(
      cleanTerm.length >= 3
        ? `site:escolabiblicadominical.org ${cleanTerm}`
        : 'site:escolabiblicadominical.org estudo bíblico escola bíblica dominical',
      sourceLabel,
      5
    ),
  ]);

  const ebdOnlySiteItems = siteSearchItems.filter((item) =>
    item.uri.toLowerCase().includes('escolabiblicadominical.org')
  );

  const merged = [...searchRssItems, ...ebdOnlySiteItems, ...mainFeedItems, ...siteSearchItems];
  const seen = new Set<string>();
  const unique: Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }> = [];

  for (const item of merged) {
    if (!seen.has(item.uri)) {
      seen.add(item.uri);
      unique.push(item);
    }
  }

  if (unique.length === 0) {
    const homeExcerpt = await fetchPageReadableExcerpt('https://escolabiblicadominical.org/');
    if (homeExcerpt) {
      unique.push({
        title: homeExcerpt.title || 'Escola Bíblica Dominical — Estudos Cristãos',
        uri: homeExcerpt.uri,
        snippet: homeExcerpt.excerpt.slice(0, 360),
        sourceType: sourceLabel,
      });
    }
  }

  return unique.slice(0, 6);
}

export async function fetchBibliaOn(
  query = '',
  queryDate = getQueryDateSaoPaulo()
): Promise<{
  items: Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>;
  snapshot: DailySourceSnapshot | null;
}> {
  const sourceLabel = 'Bíblia Online (bibliaon.com)';
  const cleanTerm = query
    .replace(
      /\b(bibliaon(\.com)?|b[íi]blia online|escolabiblicadominical(\.org)?|b[íi]blia a mensagem|a mensagem)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  const fetchDailyVerseFromBibliaOn = async (): Promise<
    Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>
  > => {
    try {
      const res = await fetchWithTimeout(
        'https://www.bibliaon.com/versiculo_do_dia/',
        {
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9',
          },
          redirect: 'follow',
        },
        3600
      );
      if (!res.ok) return [];
      const html = await res.text();
      const verseMatch = html.match(/<p[^>]*id=["']versiculo_hoje["'][^>]*>([\s\S]*?)<\/p>/i);
      if (!verseMatch) return [];
      const inner = verseMatch[1];
      const linkMatch = inner.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      const refText = linkMatch ? decodeHtmlEntities(linkMatch[2]) : 'Versículo do Dia';
      const rawHref = linkMatch ? linkMatch[1] : '/versiculo_do_dia/';
      const fullUri = /^https?:\/\//i.test(rawHref)
        ? rawHref
        : `https://www.bibliaon.com${rawHref.startsWith('/') ? rawHref : `/${rawHref}`}`;
      const verseText = decodeHtmlEntities(inner.replace(/<a[\s\S]*?<\/a>/gi, ' '));
      const dateMatch = html.match(/<h4[^>]*class=["']v_date["'][^>]*>([^<]+)<\/h4>/i);
      const dateLabel = dateMatch ? decodeHtmlEntities(dateMatch[1]) : queryDate;

      if (!verseText) return [];
      return [
        {
          title: `Versículo do Dia (${refText}) — Bíblia Online`,
          uri: fullUri,
          snippet: verseText.slice(0, 340),
          sourceType: sourceLabel,
          date: dateLabel,
        },
      ];
    } catch {
      return [];
    }
  };

  const fetchDevocionalFromBibliaOn = async (): Promise<
    Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>
  > => {
    try {
      const res = await fetchWithTimeout(
        'https://www.bibliaon.com/devocional_diario/',
        {
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9',
          },
          redirect: 'follow',
        },
        3600
      );
      if (!res.ok) return [];
      const html = await res.text();
      const results: Array<{
        title: string;
        uri: string;
        snippet: string;
        sourceType: string;
        date?: string;
      }> = [];
      const titleRegex = /<h3[^>]*class=["']dev-title["'][^>]*>([\s\S]*?)<\/h3>/gi;
      let match: RegExpExecArray | null;
      const labels = ['Devocional de Hoje', 'Devocional de Ontem', 'Devocional Recente'];
      let idx = 0;

      while ((match = titleRegex.exec(html)) !== null && results.length < 3) {
        const heading = decodeHtmlEntities(match[1]);
        const afterBlock = html.slice(match.index, match.index + 900);
        const subMatch = afterBlock.match(/<h3(?![^>]*dev-title)[^>]*>([\s\S]*?)<\/h3>/i);
        const pMatch = afterBlock.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const subtitle = subMatch ? decodeHtmlEntities(subMatch[1]) : '';
        const paragraph = pMatch ? decodeHtmlEntities(pMatch[1]) : '';
        const snippet = [subtitle, paragraph].filter(Boolean).join(' — ').slice(0, 320);

        if (heading) {
          results.push({
            title: `${labels[idx] || 'Devocional'}: ${heading}`,
            uri:
              idx === 0
                ? 'https://www.bibliaon.com/devocional_diario/'
                : `https://www.bibliaon.com/devocional_diario/#devocional-${idx + 1}`,
            snippet: snippet || 'Reflexão devocional diária em bibliaon.com.',
            sourceType: sourceLabel,
            date: queryDate,
          });
          idx += 1;
        }
      }
      return results;
    } catch {
      return [];
    }
  };

  const [dailyVerseItems, devotionalItems, siteSearchItems] = await Promise.all([
    fetchDailyVerseFromBibliaOn(),
    fetchDevocionalFromBibliaOn(),
    searchBingWeb(
      cleanTerm.length >= 3
        ? `site:bibliaon.com ${cleanTerm}`
        : 'site:bibliaon.com estudo bíblico versículos explicação',
      sourceLabel,
      5
    ),
  ]);

  const bibliaOnOnlyItems = siteSearchItems.filter((item) =>
    item.uri.toLowerCase().includes('bibliaon.com')
  );

  const merged = [
    ...dailyVerseItems,
    ...devotionalItems,
    ...bibliaOnOnlyItems,
    ...siteSearchItems,
  ];
  const seen = new Set<string>();
  const unique: Array<{
    title: string;
    uri: string;
    snippet: string;
    sourceType: string;
    date?: string;
  }> = [];

  for (const item of merged) {
    if (!seen.has(item.uri)) {
      seen.add(item.uri);
      unique.push(item);
    }
  }

  if (unique.length === 0) {
    const excerpt = await fetchPageReadableExcerpt('https://www.bibliaon.com/estudos_biblicos/');
    if (excerpt) {
      unique.push({
        title: excerpt.title || 'Bíblia Online — Estudos Bíblicos e Versículos',
        uri: excerpt.uri,
        snippet: excerpt.excerpt.slice(0, 340),
        sourceType: sourceLabel,
        date: queryDate,
      });
    }
  }

  const top = unique.slice(0, 6);
  if (top.length === 0) return { items: [], snapshot: null };

  const snapshot: DailySourceSnapshot = {
    id: `intel_bibliaon_${queryDate}`,
    sourceKey: 'bibliaon',
    sourceLabel: 'Bíblia Online · Versículos & Estudos (bibliaon.com)',
    domainUrl: 'https://www.bibliaon.com',
    queryDate,
    updatedAt: new Date().toISOString(),
    queryTerm: cleanTerm || 'versículo do dia e devocional',
    headlineSummary: top
      .slice(0, 3)
      .map((it) => it.title)
      .join(' | '),
    items: top.map((it) => ({
      title: it.title,
      detail: it.snippet.slice(0, 260),
      uri: it.uri,
      publishedAt: it.date,
    })),
  };

  return { items: top, snapshot };
}

export function detectRequestedDomains(message: string): {
  wantsG1: boolean;
  wantsGe: boolean;
  wantsB3: boolean;
  wantsCepea: boolean;
  wantsSocial: boolean;
  wantsGeneralWeb: boolean;
  wantsChristianStudy: boolean;
} {
  const plan = resolveTopicSearchRoute(message);
  const keys = new Set(plan.forcedSourceKeys);
  return {
    wantsG1: keys.has('g1'),
    wantsGe: keys.has('ge'),
    wantsB3: keys.has('b3'),
    wantsCepea: keys.has('cepea'),
    wantsSocial: plan.wantsSocial,
    wantsGeneralWeb: plan.wantsGeneralWeb,
    wantsChristianStudy: plan.wantsChristianStudy,
  };
}

export function shouldTriggerExternalSearch(message: string): boolean {
  const plan = resolveTopicSearchRoute(message);
  return (
    plan.forcedSourceKeys.length > 0 ||
    plan.wantsSocial ||
    plan.wantsGeneralWeb ||
    plan.wantsChristianStudy
  );
}

const SEARCH_CACHE = new Map<
  string,
  { expiresAt: number; updatedAt: string; interactionSequence: number; result: ExternalResearchResult }
>();
const SOURCE_CACHE = new Map<
  DailyIntelSourceKey,
  {
    sourceKey: DailyIntelSourceKey;
    domainUrl: string;
    queryDate: string;
    updatedAt: string;
    interactionSequence: number;
    snapshot: DailySourceSnapshot;
  }
>();
const SEARCH_CACHE_TTL_MS = 4 * 60 * 1000;
let interactionSequenceCounter = 0;

export function getSearchCacheSnapshot() {
  return {
    interactionSequence: interactionSequenceCounter,
    totalQueryCacheEntries: SEARCH_CACHE.size,
    sources: Array.from(SOURCE_CACHE.values()).map((entry) => ({
      sourceKey: entry.sourceKey,
      domainUrl: entry.domainUrl,
      queryDate: entry.queryDate,
      updatedAt: entry.updatedAt,
      interactionSequence: entry.interactionSequence,
      itemsCount: entry.snapshot.items.length,
      headlineSummary: entry.snapshot.headlineSummary,
    })),
  };
}

export async function researchExternalWeb(
  rawMessage: string,
  options?: {
    queryDate?: string;
    forceSources?: DailyIntelSourceKey[];
    forceRefresh?: boolean;
    routePlan?: TopicSearchRoutePlan;
  }
): Promise<ExternalResearchResult> {
  const queryDate = options?.queryDate || getQueryDateSaoPaulo();
  const routePlan = options?.routePlan ?? resolveTopicSearchRoute(rawMessage);
  const explicitUrls = extractUrlsFromText(rawMessage);
  const cleanQuery = stripQueryForSearch(rawMessage) || rawMessage.slice(0, 100);
  const forceRefresh = options?.forceRefresh ?? true;

  const forceSet = new Set<DailyIntelSourceKey>([
    ...routePlan.forcedSourceKeys,
    ...(options?.forceSources ?? []),
  ]);
  const forceKey = Array.from(forceSet).sort().join(',');
  const cacheKey = `${queryDate}::${forceKey}::ebd:${routePlan.wantsChristianStudy ? 1 : 0}::${cleanQuery.toLowerCase()}::${explicitUrls.join(',')}`;

  if (!forceRefresh) {
    const cached = SEARCH_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  const runG1 = forceSet.has('g1');
  const runGe = forceSet.has('ge');
  const runB3 = forceSet.has('b3');
  const runCepea = forceSet.has('cepea');
  const runSocial = forceSet.has('redes_sociais') || routePlan.wantsSocial;
  const runChristianStudy = routePlan.wantsChristianStudy;
  const runBibliaOn = forceSet.has('bibliaon') || routePlan.wantsChristianStudy;

  const [
    g1Res,
    geRes,
    b3Res,
    cepeaRes,
    socialRes,
    bibliaOnRes,
    ebdItems,
    bingGeneral,
    explicitPages,
  ] = await Promise.all([
    runG1 ? fetchG1News(cleanQuery, queryDate) : Promise.resolve({ items: [], snapshot: null }),
    runGe ? fetchGeSportsNews(cleanQuery, queryDate) : Promise.resolve({ items: [], snapshot: null }),
    runB3 ? fetchB3MarketAndCurrencies(cleanQuery, queryDate) : Promise.resolve({ items: [], snapshot: null }),
    runCepea ? fetchCepeaFoodCommodities(cleanQuery, queryDate) : Promise.resolve({ items: [], snapshot: null }),
    runSocial ? fetchTraditionalSocialMedia(cleanQuery, queryDate) : Promise.resolve({ items: [], snapshot: null }),
    runBibliaOn ? fetchBibliaOn(cleanQuery, queryDate) : Promise.resolve({ items: [], snapshot: null }),
    runChristianStudy ? fetchEscolaBiblicaDominical(cleanQuery) : Promise.resolve([]),
    routePlan.wantsGeneralWeb && cleanQuery.length >= 3
      ? searchBingWeb(cleanQuery, 'Web Geral', 4)
      : Promise.resolve([]),
    Promise.all(explicitUrls.map((u) => fetchPageReadableExcerpt(u))),
  ]);

  const interactionSequence = ++interactionSequenceCounter;
  const cacheUpdatedAt = new Date().toISOString();

  // If a forced remote fetch momentarily yields nothing, gracefully preserve any cached snapshot of the same date
  // while stamping cacheUpdatedAt if fresh data arrived.
  const resolveWithCacheFallback = (
    key: DailyIntelSourceKey,
    res: {
      items: Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>;
      snapshot: DailySourceSnapshot | null;
    }
  ) => {
    if (res.snapshot && res.snapshot.items.length > 0) {
      const stamped: DailySourceSnapshot = {
        ...res.snapshot,
        updatedAt: cacheUpdatedAt,
      };
      SOURCE_CACHE.set(key, {
        sourceKey: key,
        domainUrl: stamped.domainUrl,
        queryDate,
        updatedAt: cacheUpdatedAt,
        interactionSequence,
        snapshot: stamped,
      });
      return { items: res.items, snapshot: stamped };
    }
    const existingSourceCache = SOURCE_CACHE.get(key);
    if (existingSourceCache && existingSourceCache.queryDate === queryDate) {
      return {
        items: existingSourceCache.snapshot.items.map((it) => ({
          title: it.title,
          uri: it.uri,
          snippet: it.detail,
          sourceType: existingSourceCache.snapshot.sourceLabel,
          date: it.publishedAt,
        })),
        snapshot: existingSourceCache.snapshot,
      };
    }
    return res;
  };

  const resolvedG1 = runG1 ? resolveWithCacheFallback('g1', g1Res) : g1Res;
  const resolvedGe = runGe ? resolveWithCacheFallback('ge', geRes) : geRes;
  const resolvedB3 = runB3 ? resolveWithCacheFallback('b3', b3Res) : b3Res;
  const resolvedCepea = runCepea ? resolveWithCacheFallback('cepea', cepeaRes) : cepeaRes;
  const resolvedSocial = runSocial
    ? resolveWithCacheFallback('redes_sociais', socialRes)
    : socialRes;
  const resolvedBibliaOn = runBibliaOn
    ? resolveWithCacheFallback('bibliaon', bibliaOnRes)
    : bibliaOnRes;

  const allItems = [
    ...(routePlan.wantsChristianStudy ? resolvedBibliaOn.items : []),
    ...ebdItems,
    ...resolvedB3.items,
    ...resolvedCepea.items,
    ...resolvedGe.items,
    ...resolvedSocial.items,
    ...resolvedG1.items,
    ...(!routePlan.wantsChristianStudy ? resolvedBibliaOn.items : []),
    ...bingGeneral,
  ];

  const snapshots = [
    resolvedG1.snapshot,
    resolvedGe.snapshot,
    resolvedB3.snapshot,
    resolvedCepea.snapshot,
    resolvedSocial.snapshot,
    resolvedBibliaOn.snapshot,
  ].filter((s): s is DailySourceSnapshot => s !== null);

  const seenUris = new Set<string>();
  const dedupedItems: typeof allItems = [];
  for (const item of allItems) {
    if (!seenUris.has(item.uri)) {
      seenUris.add(item.uri);
      dedupedItems.push(item);
    }
  }

  const allPages = explicitPages.filter((p): p is NonNullable<typeof p> => p !== null);
  const sources: GroundingSource[] = [];
  const enginesUsed = new Set<string>();

  for (const page of allPages) {
    if (!sources.some((s) => s.uri === page.uri)) {
      sources.push({ title: page.title, uri: page.uri, sourceType: 'Página Lida' });
    }
    enginesUsed.add('Leitura de Páginas');
  }

  for (const item of dedupedItems.slice(0, 14)) {
    if (!sources.some((s) => s.uri === item.uri)) {
      sources.push({
        title: item.title,
        uri: item.uri,
        sourceType: item.sourceType,
      });
    }
    enginesUsed.add(item.sourceType);
  }

  const lines: string[] = [routePlan.directivePromptBlock];

  if (allPages.length > 0) {
    lines.push('=== CONTEÚDO EXTRAÍDO DE SITES / LINKS ===');
    for (const p of allPages) {
      lines.push(`[Página: ${p.title} | URL: ${p.uri}]\n${p.excerpt}`);
    }
  }

  if (resolvedBibliaOn.items.length > 0 && routePlan.wantsChristianStudy) {
    lines.push(
      '=== BÍBLIA ONLINE · VERSÍCULOS, DEVOCIONAIS & ESTUDOS · BIBLIAON.COM (REFERÊNCIA DE J.A.R.V.I.S.) ==='
    );
    for (const item of resolvedBibliaOn.items) {
      lines.push(`- [${item.sourceType}] ${item.title}\n  URL: ${item.uri}\n  Resumo: ${item.snippet}`);
    }
  }

  if (ebdItems.length > 0) {
    lines.push(
      '=== ESTUDOS BÍBLICOS & CONTEÚDO CRISTÃO · ESCOLABIBLICADOMINICAL.ORG (REFERÊNCIA DE J.A.R.V.I.S.) ==='
    );
    for (const item of ebdItems) {
      lines.push(`- [${item.sourceType}] ${item.title}\n  URL: ${item.uri}\n  Resumo: ${item.snippet}`);
    }
  }

  if (snapshots.length > 0) {
    lines.push(
      `=== CONSULTA ATUALIZADA EM CACHE NA INTERAÇÃO #${interactionSequence} (${queryDate} · ${cacheUpdatedAt}) ===`
    );
    for (const snap of snapshots) {
      lines.push(`>>> ${snap.sourceLabel} (${snap.domainUrl}) [Data: ${snap.queryDate}]`);
      for (const it of snap.items.slice(0, 5)) {
        lines.push(`  • ${it.title} — ${it.detail} (${it.uri})`);
      }
    }
  }

  if (bingGeneral.length > 0) {
    lines.push('=== RESULTADOS COMPLEMENTARES DA WEB ===');
    for (const item of bingGeneral) {
      lines.push(`- [${item.sourceType}] ${item.title}\n  URL: ${item.uri}\n  Resumo: ${item.snippet}`);
    }
  }

  const finalResult: ExternalResearchResult = {
    summaryText: lines.join('\n\n'),
    sources: sources.slice(0, 12),
    enginesUsed: Array.from(enginesUsed),
    snapshots,
    routePlan,
    cacheUpdatedAt,
    interactionSequence,
  };

  if (SEARCH_CACHE.size > 60) {
    const oldestKey = SEARCH_CACHE.keys().next().value;
    if (oldestKey) SEARCH_CACHE.delete(oldestKey);
  }
  SEARCH_CACHE.set(cacheKey, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    updatedAt: cacheUpdatedAt,
    interactionSequence,
    result: finalResult,
  });

  return finalResult;
}

export async function refreshAllDailySourcesForDate(
  queryDate = getQueryDateSaoPaulo(),
  extraQuery = ''
): Promise<DailySourceSnapshot[]> {
  const result = await researchExternalWeb(
    extraQuery || 'notícias g1 esportes ge bolsa moedas b3 alimentos cepea redes sociais bibliaon',
    {
      queryDate,
      forceSources: ['g1', 'ge', 'b3', 'cepea', 'redes_sociais', 'bibliaon'],
      forceRefresh: true,
    }
  );
  return result.snapshots;
}

export function formatDailySnapshotsContext(
  snapshots: DailySourceSnapshot[],
  todayDate: string
): string {
  const todayItems = snapshots.filter((s) => s.queryDate === todayDate);
  if (todayItems.length === 0) return '';
  return `[BASE DE DADOS EXTERNA DO DIA ${todayDate} (ATUALIZADA NA CONSULTA)]\n${todayItems
    .map(
      (s) =>
        `• ${s.sourceLabel} [${s.queryDate} · Atualizado: ${s.updatedAt}]: ${s.items
          .slice(0, 3)
          .map((i) => `${i.title}${i.detail ? ` (${i.detail.slice(0, 110)})` : ''}`)
          .join(' | ')}`
    )
    .join('\n')}`;
}

// Keep unused import warning clean if needed
void crypto;
