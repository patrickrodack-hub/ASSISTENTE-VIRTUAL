import crypto from 'node:crypto';
import type {
  CreatorDossier,
  GroundingSource,
  LiveIntelBriefing,
  LiveNewsItem,
  LiveWeatherForecastDay,
  LiveWeatherReport,
} from '../src/types/assistant.ts';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function decodeHtml(input: string): string {
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
  timeoutMs = 2600
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

const WMO_LABELS_PT: Record<number, string> = {
  0: 'Céu limpo',
  1: 'Predominantemente limpo',
  2: 'Parcialmente nublado',
  3: 'Encoberto',
  45: 'Neblina',
  48: 'Nevoeiro úmido',
  51: 'Garoa leve',
  53: 'Garoa moderada',
  55: 'Garoa intensa',
  61: 'Chuva fraca',
  63: 'Chuva moderada',
  65: 'Chuva forte',
  80: 'Pancadas de chuva leves',
  81: 'Pancadas de chuva moderadas',
  82: 'Pancadas de chuva intensas',
  95: 'Tempestade com trovoadas',
  96: 'Tempestade severa',
  99: 'Tempestade elétrica intensa',
};

function mapWmoCode(code?: number): string {
  if (typeof code !== 'number') return 'Estável';
  return WMO_LABELS_PT[code] ?? 'Parcialmente nublado';
}

interface CityCoords {
  name: string;
  lat: number;
  lon: number;
}

const DEFAULT_RIO_COORDS: CityCoords = {
  name: 'Rio de Janeiro, RJ',
  lat: -22.9068,
  lon: -43.1729,
};

async function resolveCityCoordinates(cityQuery?: string): Promise<CityCoords> {
  const clean = (cityQuery || '').trim();
  if (
    !clean ||
    /^(rio|rio de janeiro|rj|capital fluminense)/i.test(clean)
  ) {
    return DEFAULT_RIO_COORDS;
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      clean
    )}&count=1&language=pt&format=json`;
    const res = await fetchWithTimeout(url, {}, 1800);
    if (!res.ok) return DEFAULT_RIO_COORDS;
    const data = (await res.json()) as {
      results?: Array<{
        name: string;
        admin1?: string;
        country_code?: string;
        latitude: number;
        longitude: number;
      }>;
    };
    const match = data.results?.[0];
    if (!match) return DEFAULT_RIO_COORDS;
    return {
      name: `${match.name}${match.admin1 ? `, ${match.admin1}` : ''}`,
      lat: match.latitude,
      lon: match.longitude,
    };
  } catch {
    return DEFAULT_RIO_COORDS;
  }
}

export async function fetchLiveWeather(cityQuery?: string): Promise<LiveWeatherReport> {
  const coords = await resolveCityCoordinates(cityQuery);
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FSao_Paulo&forecast_days=4`;
    const res = await fetchWithTimeout(url, {}, 2400);
    if (!res.ok) throw new Error('Falha ao consultar Open-Meteo');
    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        apparent_temperature?: number;
        is_day?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    };

    const forecast: LiveWeatherForecastDay[] = [];
    const days = data.daily?.time ?? [];
    for (let i = 0; i < Math.min(days.length, 4); i++) {
      forecast.push({
        date: days[i],
        tempMaxC: Math.round(data.daily?.temperature_2m_max?.[i] ?? 28),
        tempMinC: Math.round(data.daily?.temperature_2m_min?.[i] ?? 21),
        precipitationProb: Math.round(
          data.daily?.precipitation_probability_max?.[i] ?? 15
        ),
        conditionLabel: mapWmoCode(data.daily?.weather_code?.[i]),
      });
    }

    return {
      city: coords.name,
      temperatureC: Math.round((data.current?.temperature_2m ?? 26) * 10) / 10,
      apparentTemperatureC:
        Math.round((data.current?.apparent_temperature ?? 28) * 10) / 10,
      humidityPercent: Math.round(data.current?.relative_humidity_2m ?? 68),
      windSpeedKmh: Math.round((data.current?.wind_speed_10m ?? 12) * 10) / 10,
      conditionLabel: mapWmoCode(data.current?.weather_code),
      isDay: (data.current?.is_day ?? 1) === 1,
      updatedAt: new Date().toISOString(),
      forecast,
    };
  } catch {
    return {
      city: coords.name,
      temperatureC: 26,
      apparentTemperatureC: 28,
      humidityPercent: 68,
      windSpeedKmh: 14,
      conditionLabel: 'Parcialmente nublado',
      isDay: true,
      updatedAt: new Date().toISOString(),
      forecast: [],
    };
  }
}

async function fetchGoogleNewsFeed(
  query: string,
  region: 'rio' | 'brasil' | 'mundo',
  maxItems = 5
): Promise<LiveNewsItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const res = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': BROWSER_UA } },
      2400
    );
    if (!res.ok) return [];
    const xml = await res.text();

    const items: LiveNewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
      const block = match[1];
      const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
      const rawLink = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '';
      const rawSource = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? '';
      const rawDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '';

      const fullTitle = decodeHtml(rawTitle);
      const link = decodeHtml(rawLink);
      let source = decodeHtml(rawSource);
      let cleanTitle = fullTitle;

      const dashIdx = fullTitle.lastIndexOf(' - ');
      if (dashIdx > 20) {
        if (!source) source = fullTitle.slice(dashIdx + 3).trim();
        cleanTitle = fullTitle.slice(0, dashIdx).trim();
      }

      if (cleanTitle && link && /^https?:\/\//i.test(link)) {
        items.push({
          id: crypto.randomUUID(),
          region,
          title: cleanTitle,
          link,
          source: source || 'Imprensa',
          pubDate: rawDate ? decodeHtml(rawDate) : undefined,
        });
      }
    }

    return items;
  } catch {
    return [];
  }
}

async function fetchDirectG1Feed(
  feedUrl: string,
  region: 'rio' | 'brasil',
  maxItems = 4
): Promise<LiveNewsItem[]> {
  try {
    const res = await fetchWithTimeout(feedUrl, { headers: { 'User-Agent': BROWSER_UA } }, 2800);
    if (!res.ok) return [];
    const xml = await res.text();
    const items: LiveNewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
      const block = match[1];
      const title = decodeHtml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '');
      const link = decodeHtml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '');
      const pubDate = decodeHtml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '');
      if (title && link && /^https?:\/\//i.test(link)) {
        items.push({
          id: crypto.randomUUID(),
          region,
          title,
          link,
          source: 'G1 (g1.com.br)',
          pubDate: pubDate || undefined,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

let cachedBriefing: {
  key: string;
  expiresAt: number;
  data: LiveIntelBriefing;
} | null = null;

export async function getLiveIntelBriefing(
  city = 'Rio de Janeiro, RJ',
  forceRefresh = false
): Promise<LiveIntelBriefing> {
  const key = city.trim().toLowerCase() || 'rio de janeiro, rj';
  if (
    !forceRefresh &&
    cachedBriefing &&
    cachedBriefing.key === key &&
    cachedBriefing.expiresAt > Date.now()
  ) {
    return cachedBriefing.data;
  }

  const [weather, g1Rio, g1Brasil, rioGoogle, brasilGoogle, mundoNews] = await Promise.all([
    fetchLiveWeather(city),
    fetchDirectG1Feed('https://g1.globo.com/rss/g1/rj/rio-de-janeiro/', 'rio', 4),
    fetchDirectG1Feed('https://g1.globo.com/rss/g1/', 'brasil', 4),
    fetchGoogleNewsFeed('"Rio de Janeiro" when:2d', 'rio', 4),
    fetchGoogleNewsFeed('Brasil política OR economia OR cidades when:1d', 'brasil', 4),
    fetchGoogleNewsFeed('Mundo internacional OR tecnologia global when:1d', 'mundo', 6),
  ]);

  const rioNews = [...g1Rio, ...rioGoogle].slice(0, 6);
  const brasilNews = [...g1Brasil, ...brasilGoogle].slice(0, 6);

  const data: LiveIntelBriefing = {
    weather,
    news: {
      rio: rioNews,
      brasil: brasilNews,
      mundo: mundoNews,
    },
    fetchedAt: new Date().toISOString(),
  };

  cachedBriefing = {
    key,
    expiresAt: Date.now() + 3 * 60 * 1000,
    data,
  };

  return data;
}

export function formatIntelContextForPrompt(intel: LiveIntelBriefing): string {
  const w = intel.weather;
  const forecastLine = w.forecast
    .slice(0, 3)
    .map(
      (d) =>
        `${d.date}: mín ${d.tempMinC}°C / máx ${d.tempMaxC}°C (${d.conditionLabel}, chuva ${d.precipitationProb}%)`
    )
    .join(' | ');

  const rioList = intel.news.rio
    .slice(0, 4)
    .map((n) => `  • [RJ - ${n.source}] ${n.title}`)
    .join('\n');
  const brList = intel.news.brasil
    .slice(0, 4)
    .map((n) => `  • [Brasil - ${n.source}] ${n.title}`)
    .join('\n');
  const worldList = intel.news.mundo
    .slice(0, 4)
    .map((n) => `  • [Mundo - ${n.source}] ${n.title}`)
    .join('\n');

  return `[CLIMA EM TEMPO REAL — ${w.city.toUpperCase()}]
Temperatura atual: ${w.temperatureC}°C (Sensação: ${w.apparentTemperatureC}°C) · Condição: ${w.conditionLabel} · Umidade: ${w.humidityPercent}% · Vento: ${w.windSpeedKmh} km/h.
Previsão próximos dias: ${forecastLine || 'Sem dados adicionais.'}

[MANCHETES DO DIA — RIO DE JANEIRO, BRASIL & MUNDO]
Rio de Janeiro:
${rioList || '  • Sem manchetes locais no momento.'}
Brasil:
${brList || '  • Sem manchetes nacionais no momento.'}
Mundo & Tecnologia:
${worldList || '  • Sem manchetes globais no momento.'}`;
}

export async function scanCreatorOnlinePresence(
  dossier: CreatorDossier,
  extraQuery?: string
): Promise<{
  discoveredFacts: string[];
  sources: GroundingSource[];
  updatedProfiles: CreatorDossier['socialProfiles'];
}> {
  const discoveredFacts: string[] = [];
  const sources: GroundingSource[] = [];
  const updatedProfiles = dossier.socialProfiles.map((p) => ({ ...p }));

  // 1. Check GitHub API for patrickrodack or configured GitHub handle
  const githubProfile = updatedProfiles.find((p) => p.platform === 'GitHub');
  const rawGhHandle = (githubProfile?.handleOrUrl || 'patrickrodack')
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .split('/')[0]
    .trim();

  if (rawGhHandle) {
    try {
      const ghRes = await fetchWithTimeout(
        `https://api.github.com/users/${encodeURIComponent(rawGhHandle)}`,
        {
          headers: {
            'User-Agent': 'RodackAISystem/2.0',
            Accept: 'application/vnd.github+json',
          },
        },
        2200
      );
      if (ghRes.ok) {
        const ghUser = (await ghRes.json()) as {
          login: string;
          name?: string;
          bio?: string;
          location?: string;
          public_repos?: number;
          followers?: number;
          html_url: string;
        };
        const summary = `GitHub @${ghUser.login}${
          ghUser.name ? ` (${ghUser.name})` : ''
        } · ${ghUser.public_repos ?? 0} repositórios públicos · ${
          ghUser.followers ?? 0
        } seguidores${ghUser.bio ? ` · Bio: ${ghUser.bio}` : ''}${
          ghUser.location ? ` · Local: ${ghUser.location}` : ''
        }`;
        discoveredFacts.push(summary);
        sources.push({
          title: `GitHub · ${ghUser.login}`,
          uri: ghUser.html_url,
          sourceType: 'GitHub',
        });
        if (githubProfile) {
          githubProfile.verifiedNotes = summary;
          githubProfile.lastScannedAt = new Date().toISOString();
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Search Bing RSS for Patrick Pessoa / patrickrodack / Rodack across social & web
  const queries = [
    `"Patrick Pessoa" OR "patrickrodack" ${extraQuery || ''}`.trim(),
    `site:linkedin.com/in "Patrick Pessoa" OR "patrickrodack"`,
    `site:instagram.com "patrickrodack" OR "Patrick Pessoa"`,
  ];

  const rssResults = await Promise.all(
    queries.map(async (q) => {
      try {
        const url = `https://www.bing.com/search?q=${encodeURIComponent(
          q
        )}&format=rss&cc=BR&setlang=pt-BR`;
        const res = await fetchWithTimeout(
          url,
          { headers: { 'User-Agent': BROWSER_UA } },
          2200
        );
        if (!res.ok) return [];
        const xml = await res.text();
        const out: Array<{ title: string; link: string; desc: string }> = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let m: RegExpExecArray | null;
        while ((m = itemRegex.exec(xml)) !== null && out.length < 4) {
          const b = m[1];
          const t = decodeHtml(b.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '');
          const l = decodeHtml(b.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '');
          const d = decodeHtml(
            b.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? ''
          );
          if (t && l && /^https?:\/\//i.test(l)) {
            out.push({ title: t, link: l, desc: d });
          }
        }
        return out;
      } catch {
        return [];
      }
    })
  );

  for (const item of rssResults.flat()) {
    if (!sources.some((s) => s.uri === item.link)) {
      sources.push({
        title: item.title,
        uri: item.link,
        sourceType: item.link.includes('linkedin.com')
          ? 'LinkedIn'
          : item.link.includes('instagram.com')
          ? 'Instagram'
          : item.link.includes('github.com')
          ? 'GitHub'
          : 'Web / Social',
      });
      discoveredFacts.push(`${item.title}: ${item.desc}`);
    }
  }

  const nowIso = new Date().toISOString();
  for (const p of updatedProfiles) {
    if (!p.lastScannedAt) {
      p.lastScannedAt = nowIso;
    }
  }

  return {
    discoveredFacts: discoveredFacts.slice(0, 8),
    sources: sources.slice(0, 8),
    updatedProfiles,
  };
}
