import type { GroundingSource } from '../src/types/assistant.ts';

export interface ExternalResearchResult {
  summaryText: string;
  sources: GroundingSource[];
  enginesUsed: string[];
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 1450
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  maxItems = 5
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

function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>()]+/gi) ?? [];
  return Array.from(new Set(matches)).slice(0, 3);
}

function stripQueryForSearch(rawMessage: string): string {
  // Remove conversational filler & URLs so search engines get crisp keywords
  return rawMessage
    .replace(/https?:\/\/[^\s]+/gi, ' ')
    .replace(
      /\b(jarvis|sexta[\s-]?feira|friday|ultron|[uú]ltron|todos|por favor|pesquise|pesquisa|busque|busca|procure|procura|na internet|na web|nas redes sociais|para mim|me diga|o que vocês acham|analisem|consultem)\b/gi,
      ' '
    )
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

async function searchBingWeb(
  query: string,
  sourceType: string,
  maxItems = 5
): Promise<Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&cc=BR&setlang=pt-BR`;
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml, maxItems).map((item) => ({
      title: item.title,
      uri: item.link,
      snippet: item.description,
      sourceType,
      date: item.pubDate,
    }));
  } catch {
    return [];
  }
}

async function searchGoogleNews(
  query: string,
  maxItems = 4
): Promise<Array<{ title: string; uri: string; snippet: string; sourceType: string; date?: string }>> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml, maxItems).map((item) => ({
      title: item.title,
      uri: item.link,
      snippet: item.description || item.title,
      sourceType: 'Notícias',
      date: item.pubDate,
    }));
  } catch {
    return [];
  }
}

async function searchWikipedia(
  query: string
): Promise<Array<{ title: string; uri: string; snippet: string; sourceType: string }>> {
  try {
    const url = `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&srlimit=2&format=json&utf8=1`;
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'StarkLabAssistant/1.0' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: { search?: Array<{ title: string; pageid: number; snippet: string }> };
    };
    return (data.query?.search ?? []).map((item) => ({
      title: `${item.title} — Wikipédia`,
      uri: `https://pt.wikipedia.org/?curid=${item.pageid}`,
      snippet: decodeHtmlEntities(item.snippet),
      sourceType: 'Enciclopédia',
    }));
  } catch {
    return [];
  }
}

async function searchHackerNews(
  query: string
): Promise<Array<{ title: string; uri: string; snippet: string; sourceType: string }>> {
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=3`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      hits?: Array<{ title?: string; url?: string; objectID: string; points?: number; num_comments?: number }>;
    };
    return (data.hits ?? [])
      .filter((h) => Boolean(h.title))
      .map((h) => ({
        title: h.title || 'Discussão Hacker News',
        uri: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        snippet: `Discussão da comunidade tech (${h.points ?? 0} pontos, ${h.num_comments ?? 0} comentários).`,
        sourceType: 'Comunidade Tech',
      }));
  } catch {
    return [];
  }
}

async function searchStackOverflow(
  query: string
): Promise<Array<{ title: string; uri: string; snippet: string; sourceType: string }>> {
  try {
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(
      query
    )}&site=stackoverflow&pagesize=3`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{ title: string; link: string; score: number; answer_count: number; is_answered: boolean }>;
    };
    return (data.items ?? []).map((item) => ({
      title: decodeHtmlEntities(item.title),
      uri: item.link,
      snippet: `${item.answer_count} resposta(s) · score ${item.score}${item.is_answered ? ' · resolvida' : ''}.`,
      sourceType: 'StackOverflow',
    }));
  } catch {
    return [];
  }
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
      2200
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

    const textOnly = decodeHtmlEntities(cleaned).slice(0, 2200);
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

export function shouldTriggerExternalSearch(message: string): boolean {
  if (/https?:\/\/[^\s]+/i.test(message)) return true;
  return /\b(pesquis|busque|busca|procur|internet|web|site|rede social|redes sociais|twitter|x\.com|instagram|reddit|youtube|linkedin|tiktok|notícia|noticias|hoje|atual|atuais|últimas|ultimas|lançamento|preço|cotação|clima|tempo|quem é|quem foi|documentação|stack|github|tendência|tendencias|opinião pública|repercussão|novidade)\b/i.test(
    message
  );
}

const SEARCH_CACHE = new Map<
  string,
  { expiresAt: number; result: ExternalResearchResult }
>();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

export async function researchExternalWeb(rawMessage: string): Promise<ExternalResearchResult> {
  const explicitUrls = extractUrlsFromText(rawMessage);
  const cleanQuery = stripQueryForSearch(rawMessage) || rawMessage.slice(0, 100);
  const cacheKey = `${cleanQuery.toLowerCase()}::${explicitUrls.join(',')}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const lower = rawMessage.toLowerCase();

  const wantsSocial =
    /\b(rede social|redes sociais|reddit|twitter|x\.com|instagram|youtube|linkedin|tiktok|opinião|repercussão|comentando|viral|comunidade)\b/i.test(
      lower
    );
  const wantsDev =
    /\b(código|codigo|erro|bug|api|typescript|javascript|react|node|express|python|sql|docker|stack|github|biblioteca|framework|documentação)\b/i.test(
      lower
    );
  const wantsNews =
    /\b(notícia|noticias|hoje|recente|últimas|ultimas|lançamento|mercado|economia|política|mundo|atualidade)\b/i.test(
      lower
    );

  // Run multi-source external searches in a single fast parallel round
  const tasks: Array<
    Promise<
      Array<{
        title: string;
        uri: string;
        snippet: string;
        sourceType: string;
        date?: string;
      }>
    >
  > = [
    searchBingWeb(cleanQuery, 'Web', 5),
    searchGoogleNews(cleanQuery, wantsNews ? 5 : 3),
    searchWikipedia(cleanQuery),
  ];

  if (wantsSocial) {
    tasks.push(searchBingWeb(`site:reddit.com ${cleanQuery}`, 'Reddit', 3));
    tasks.push(searchBingWeb(`site:x.com ${cleanQuery}`, 'X / Social', 2));
    tasks.push(searchHackerNews(cleanQuery));
  } else {
    tasks.push(searchBingWeb(`site:reddit.com ${cleanQuery}`, 'Social / Reddit', 2));
  }

  if (wantsDev) {
    tasks.push(searchStackOverflow(cleanQuery));
    tasks.push(searchHackerNews(cleanQuery));
  }

  const [resultsMatrix, explicitPages] = await Promise.all([
    Promise.all(tasks),
    Promise.all(explicitUrls.map((u) => fetchPageReadableExcerpt(u))),
  ]);

  const allItems = resultsMatrix.flat();
  const seenUris = new Set<string>();
  const dedupedItems: typeof allItems = [];

  for (const item of allItems) {
    if (!seenUris.has(item.uri)) {
      seenUris.add(item.uri);
      dedupedItems.push(item);
    }
  }

  const allPages = explicitPages.filter(
    (p): p is NonNullable<typeof p> => p !== null
  );

  const sources: GroundingSource[] = [];
  const enginesUsed = new Set<string>();

  for (const page of allPages) {
    if (!sources.some((s) => s.uri === page.uri)) {
      sources.push({ title: page.title, uri: page.uri, sourceType: 'Página Lida' });
    }
    enginesUsed.add('Leitura de Páginas');
  }

  for (const item of dedupedItems.slice(0, 10)) {
    if (!sources.some((s) => s.uri === item.uri)) {
      sources.push({
        title: item.title,
        uri: item.uri,
        sourceType: item.sourceType,
      });
    }
    enginesUsed.add(item.sourceType);
  }

  const lines: string[] = [];

  if (allPages.length > 0) {
    lines.push('=== CONTEÚDO EXTRAÍDO DE SITES / LINKS ===');
    for (const p of allPages) {
      lines.push(`[Página: ${p.title} | URL: ${p.uri}]\n${p.excerpt}`);
    }
  }

  if (dedupedItems.length > 0) {
    lines.push('=== RESULTADOS DE PESQUISA EXTERNA (WEB, NOTÍCIAS, REDES SOCIAIS & COMUNIDADES) ===');
    for (const item of dedupedItems.slice(0, 10)) {
      lines.push(
        `- [${item.sourceType}${item.date ? ` · ${item.date}` : ''}] ${item.title}\n  URL: ${item.uri}\n  Resumo: ${item.snippet}`
      );
    }
  }

  const finalResult: ExternalResearchResult = {
    summaryText: lines.join('\n\n'),
    sources: sources.slice(0, 10),
    enginesUsed: Array.from(enginesUsed),
  };

  if (SEARCH_CACHE.size > 60) {
    const oldestKey = SEARCH_CACHE.keys().next().value;
    if (oldestKey) SEARCH_CACHE.delete(oldestKey);
  }
  SEARCH_CACHE.set(cacheKey, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    result: finalResult,
  });

  return finalResult;
}
