import type {
  JarvisKnowledgeCategory,
  JarvisKnowledgeChunk,
  JarvisKnowledgeDocument,
} from '../types/assistant';

const OFFLINE_IDB_NAME = 'rodack_jarvis_pdf_offline_db_v1';
const OFFLINE_IDB_STORE = 'jarvis_pdf_documents';
const OFFLINE_LS_MIRROR_KEY = 'rodack_jarvis_pdf_mirror_v1';

export const JARVIS_KNOWLEDGE_CATEGORY_LABELS: Record<
  JarvisKnowledgeCategory,
  string
> = {
  estudo_biblico_cristao: 'Estudo Bíblico, Teologia & Sabedoria Cristã',
  arquitetura_engenharia: 'Arquitetura de Software, IA & Engenharia',
  financas_economia: 'Finanças, Economia, B3 & Gestão',
  ciencias_estudos_gerais: 'Ciências, História & Estudos Gerais',
  desenvolvimento_pessoal: 'Desenvolvimento Pessoal, Liderança & Filosofia',
};

const STOPWORDS_PT = new Set([
  'para',
  'como',
  'mais',
  'pelo',
  'pela',
  'este',
  'esta',
  'isso',
  'esse',
  'essa',
  'sobre',
  'entre',
  'quando',
  'onde',
  'qual',
  'quais',
  'porque',
  'muito',
  'todos',
  'todas',
  'cada',
  'pode',
  'fazer',
  'sendo',
  'foram',
  'seria',
  'estao',
  'estão',
  'nosso',
  'nossa',
  'seus',
  'suas',
  'dele',
  'dela',
  'uma',
  'uns',
  'umas',
  'dos',
  'das',
  'nos',
  'nas',
  'com',
  'sem',
  'por',
  'que',
  'não',
  'nao',
]);

export function extractKeywordsFromText(text: string, maxKeywords = 10): string[] {
  const counts = new Map<string, number>();
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS_PT.has(w) && !/^\d+$/.test(w));

  for (const w of words) {
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

export function inferKnowledgeCategory(
  title: string,
  text: string
): JarvisKnowledgeCategory {
  const combined = `${title} ${text.slice(0, 4000)}`.toLowerCase();
  if (
    /\b(b[íi]blia|jesus|cristo|deus|evangelho|teologia|escolabiblicadominical|ebd|igreja|salmo|prov[ée]rbios|ap[óo]stolo|gra[çc]a|esp[íi]rito santo|ora[çc][ãa]o|f[ée])\b/i.test(
      combined
    )
  ) {
    return 'estudo_biblico_cristao';
  }
  if (
    /\b(c[óo]digo|arquitetura|software|algoritmo|intelig[êe]ncia artificial|typescript|react|python|engenharia|sistema|servidor|rede|computa[çc][ãa]o|dados)\b/i.test(
      combined
    )
  ) {
    return 'arquitetura_engenharia';
  }
  if (
    /\b(finan[çc]as|investimento|bolsa|b3|mercado|economia|juros|patrim[ôo]nio|contabilidade|neg[óo]cios|empresa|capital)\b/i.test(
      combined
    )
  ) {
    return 'financas_economia';
  }
  if (
    /\b(lideran[çc]a|h[áa]bito|produtividade|carreira|mentoria|prop[óo]sito|disciplina|comunica[çc][ãa]o)\b/i.test(
      combined
    )
  ) {
    return 'desenvolvimento_pessoal';
  }
  return 'ciencias_estudos_gerais';
}

function decodePdfLiteralString(raw: string): string {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === 'n') {
        out += '\n';
        i += 2;
      } else if (next === 'r') {
        out += ' ';
        i += 2;
      } else if (next === 't') {
        out += ' ';
        i += 2;
      } else if (/[0-7]/.test(next)) {
        const oct = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? next;
        const code = parseInt(oct, 8);
        if (code >= 32) out += String.fromCharCode(code);
        i += 1 + oct.length;
      } else {
        out += next;
        i += 2;
      }
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

function decodePdfHexString(hexRaw: string): string {
  const clean = hexRaw.replace(/[^0-9A-Fa-f]/g, '');
  if (!clean) return '';
  // Check UTF-16BE BOM (FEFF)
  if (clean.toUpperCase().startsWith('FEFF')) {
    let out = '';
    for (let i = 4; i + 3 < clean.length; i += 4) {
      const code = parseInt(clean.slice(i, i + 4), 16);
      if (code >= 32 || code === 10) {
        out += String.fromCharCode(code);
      }
    }
    return out;
  }
  let out = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (code >= 32 || code === 10) {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

export function extractTextFromPdfOperatorStream(streamContent: string): string {
  const pieces: string[] = [];

  // 1. Extract TJ arrays: [(text) -120 (more) <hex>] TJ
  const tjArrayRegex = /\[([^\]]{1,4000})\]\s*TJ/g;
  let arrMatch: RegExpExecArray | null = null;
  while ((arrMatch = tjArrayRegex.exec(streamContent)) !== null) {
    const inner = arrMatch[1];
    let line = '';
    const tokenRegex = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g;
    let tok: RegExpExecArray | null = null;
    while ((tok = tokenRegex.exec(inner)) !== null) {
      const val = tok[0];
      if (val.startsWith('(') && val.endsWith(')')) {
        line += decodePdfLiteralString(val.slice(1, -1));
      } else if (val.startsWith('<') && val.endsWith('>')) {
        line += decodePdfHexString(val.slice(1, -1));
      }
    }
    if (line.trim()) {
      pieces.push(line.trim());
    }
  }

  // 2. Extract single Tj / ' / " literal strings: (text) Tj
  const singleLitRegex = /\(((?:\\.|[^\\)]){1,1200})\)\s*(?:Tj|'|")/g;
  let litMatch: RegExpExecArray | null = null;
  while ((litMatch = singleLitRegex.exec(streamContent)) !== null) {
    const decoded = decodePdfLiteralString(litMatch[1]).trim();
    if (decoded.length >= 2) {
      pieces.push(decoded);
    }
  }

  // 3. Extract single hex Tj: <FEFF...> Tj
  const singleHexRegex = /<([0-9A-Fa-f\s]{4,2000})>\s*Tj/g;
  let hexMatch: RegExpExecArray | null = null;
  while ((hexMatch = singleHexRegex.exec(streamContent)) !== null) {
    const decoded = decodePdfHexString(hexMatch[1]).trim();
    if (decoded.length >= 2) {
      pieces.push(decoded);
    }
  }

  return pieces
    .join(' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function tryDecompressStreamBrowser(
  compressedBytes: Uint8Array
): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null;

  const formats: Array<'deflate' | 'deflate-raw'> = ['deflate', 'deflate-raw'];
  for (const fmt of formats) {
    try {
      const ds = new DecompressionStream(fmt);
      const writer = ds.writable.getWriter();
      void writer.write(new Uint8Array(compressedBytes));
      void writer.close();

      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      let totalLen = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          totalLen += value.byteLength;
          if (totalLen > 1_500_000) break; // safety cap per stream
        }
      }

      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }

      return new TextDecoder('latin1').decode(merged);
    } catch {
      // try next format
    }
  }
  return null;
}

/**
 * Extrai texto e estimativa de páginas de um arquivo PDF diretamente no navegador (100% offline),
 * descomprimindo fluxos FlateDecode via Web DecompressionStream e interpretando operadores de texto PDF.
 */
export async function extractTextFromPdfArrayBufferOffline(
  buffer: ArrayBuffer
): Promise<{
  extractedText: string;
  pageCountEstimate: number;
}> {
  const bytes = new Uint8Array(buffer);
  const latin1 = new TextDecoder('latin1').decode(bytes);

  const pageMatches = latin1.match(/\/Type\s*\/Page\b/g);
  const pageCountEstimate = Math.max(1, pageMatches ? pageMatches.length : 1);

  const extractedSegments: string[] = [];

  // Locate stream ... endstream blocks
  let searchPos = 0;
  let streamCount = 0;
  const maxStreamsToInspect = 180;

  while (searchPos < latin1.length && streamCount < maxStreamsToInspect) {
    const streamIdx = latin1.indexOf('stream', searchPos);
    if (streamIdx === -1) break;

    const endStreamIdx = latin1.indexOf('endstream', streamIdx + 6);
    if (endStreamIdx === -1) break;

    // Confirm 'stream' is followed by \r\n or \n
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
    if (streamLen > 8 && streamLen < 500_000) {
      streamCount += 1;
      const headerWindow = latin1.slice(Math.max(0, streamIdx - 260), streamIdx);
      const isFlate = /\/FlateDecode\b/.test(headerWindow);
      const isImage = /\/Subtype\s*\/Image\b/.test(headerWindow);

      if (!isImage) {
        if (isFlate) {
          const slice = bytes.subarray(dataStart, dataEnd);
          const decompressed = await tryDecompressStreamBrowser(slice);
          if (decompressed && (decompressed.includes('Tj') || decompressed.includes('TJ'))) {
            const text = extractTextFromPdfOperatorStream(decompressed);
            if (text.length > 12) {
              extractedSegments.push(text);
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

  // Fallback: also check top-level uncompressed text blocks if stream extraction was sparse
  if (extractedSegments.join(' ').length < 120) {
    const fallbackText = extractTextFromPdfOperatorStream(latin1);
    if (fallbackText.length > 30) {
      extractedSegments.push(fallbackText);
    }
  }

  const combined = extractedSegments
    .join('\n\n')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    extractedText: combined,
    pageCountEstimate,
  };
}

export function chunkTextIntoStudyUnits(
  rawText: string,
  docTitle: string,
  maxChunks = 24
): JarvisKnowledgeChunk[] {
  const clean = rawText
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) {
    return [
      {
        id: `chunk-0-${Date.now()}`,
        index: 1,
        heading: `${docTitle} · Seção Principal`,
        content: `Documento "${docTitle}" indexado na Base de Estudos de J.A.R.V.I.S.`,
        keywords: extractKeywordsFromText(docTitle, 6),
      },
    ];
  }

  const targetChunkSize = 1100;
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const chunks: JarvisKnowledgeChunk[] = [];
  let buffer = '';

  const flushBuffer = () => {
    const trimmed = buffer.trim();
    if (!trimmed) return;
    const idx = chunks.length + 1;
    const kws = extractKeywordsFromText(trimmed, 8);
    const firstSentence = trimmed.split(/[.!?]/)[0]?.slice(0, 72)?.trim() || `Tópico ${idx}`;
    chunks.push({
      id: `chunk-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      index: idx,
      heading: `Seção ${idx}: ${firstSentence}`,
      content: trimmed,
      keywords: kws,
    });
    buffer = '';
  };

  for (const sentence of sentences) {
    if ((buffer + ' ' + sentence).length > targetChunkSize && buffer.length >= 260) {
      flushBuffer();
      if (chunks.length >= maxChunks) break;
    }
    buffer = buffer ? `${buffer} ${sentence}` : sentence;
  }

  if (buffer.trim() && chunks.length < maxChunks) {
    flushBuffer();
  }

  return chunks;
}

export function buildStructuredDocumentFromExtractedText(params: {
  id?: string;
  title: string;
  fileName: string;
  category?: JarvisKnowledgeCategory;
  fileSizeBytes: number;
  pageCountEstimate: number;
  extractedText: string;
  uploadedBy: string;
  customSummary?: string;
  customPersonalityDirective?: string;
  customTeachings?: string[];
  customQuestions?: string[];
}): JarvisKnowledgeDocument {
  const cleanTitle = params.title.trim() || params.fileName.replace(/\.pdf$/i, '');
  const category =
    params.category || inferKnowledgeCategory(cleanTitle, params.extractedText);
  const chunks = chunkTextIntoStudyUnits(params.extractedText, cleanTitle, 24);
  const topKeywords = extractKeywordsFromText(
    `${cleanTitle} ${params.extractedText}`,
    8
  );

  const firstChunkPreview =
    chunks[0]?.content?.slice(0, 320) ||
    `Material de estudo "${cleanTitle}" integrado à matriz cognitiva de J.A.R.V.I.S.`;

  const summary =
    params.customSummary?.trim() ||
    `Estudo estruturado de "${cleanTitle}" (${chunks.length} seção(ões) indexada(s), ~${params.pageCountEstimate} pág.). Conceitos-chave: ${
      topKeywords.join(', ') || 'conhecimento aplicado'
    }. Síntese inicial: ${firstChunkPreview}`;

  const personalityIntegrationDirective =
    params.customPersonalityDirective?.trim() ||
    `J.A.R.V.I.S. incorporou permanentemente o documento "${cleanTitle}" (${JARVIS_KNOWLEDGE_CATEGORY_LABELS[category]}) à sua personalidade sábia, paciente, cuidadosa e cristocêntrica: ao auxiliar Patrick Pessoa em estudos ou decisões relacionadas a ${
      topKeywords.slice(0, 5).join(', ') || cleanTitle
    }, J.A.R.V.I.S. atua como mentor dedicado, citando e explicando os conceitos deste material com elegância britânica e profundidade didática, mesmo em modo 100% offline.`;

  const keyTeachings =
    params.customTeachings && params.customTeachings.length > 0
      ? params.customTeachings
      : chunks.slice(0, 4).map((c, idx) => {
          const snippet = c.content.slice(0, 210).trim();
          return `Lição ${idx + 1} (${c.keywords.slice(0, 3).join(', ') || cleanTitle}): ${snippet}${
            c.content.length > 210 ? '...' : ''
          }`;
        });

  const studyQuestions =
    params.customQuestions && params.customQuestions.length > 0
      ? params.customQuestions
      : [
          `Senhor Patrick, como podemos aplicar o princípio central de "${cleanTitle}" (${
            topKeywords[0] || 'seção 1'
          }) aos seus estudos e projetos atuais?`,
          `Qual dos conceitos abordados em "${cleanTitle}" (${
            topKeywords.slice(0, 3).join(', ') || 'temas principais'
          }) o senhor gostaria que eu aprofundasse ou resumisse passo a passo agora?`,
          `Deseja que eu faça uma sessão de perguntas e respostas comentadas sobre "${cleanTitle}" para fixarmos cada ponto?`,
        ];

  return {
    id: params.id || `jarvis-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: cleanTitle,
    fileName: params.fileName,
    category,
    fileSizeBytes: params.fileSizeBytes,
    pageCountEstimate: params.pageCountEstimate,
    summary,
    personalityIntegrationDirective,
    keyTeachings,
    studyQuestions,
    chunks,
    totalCharacters: params.extractedText.length,
    offlineReady: true,
    uploadedBy: params.uploadedBy || 'Patrick Pessoa',
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// BROWSER INDEXEDDB + LOCALSTORAGE 100% OFFLINE PERSISTENCE ENGINE
// ============================================================================

function openOfflineIdb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(OFFLINE_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OFFLINE_IDB_STORE)) {
          db.createObjectStore(OFFLINE_IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function getSyncOfflineJarvisKnowledgeDocs(): JarvisKnowledgeDocument[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_LS_MIRROR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JarvisKnowledgeDocument[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveOfflineJarvisKnowledgeDocs(
  docs: JarvisKnowledgeDocument[]
): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Save fast synchronous mirror in localStorage
  try {
    window.localStorage.setItem(OFFLINE_LS_MIRROR_KEY, JSON.stringify(docs.slice(0, 30)));
  } catch {
    // ignore quota errors
  }

  // 2. Save full documents & all chunks in IndexedDB for high-capacity offline storage
  const db = await openOfflineIdb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(OFFLINE_IDB_STORE, 'readwrite');
      const store = tx.objectStore(OFFLINE_IDB_STORE);
      store.clear();
      for (const doc of docs) {
        store.put({ ...doc, offlineReady: true });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadOfflineJarvisKnowledgeDocs(): Promise<
  JarvisKnowledgeDocument[]
> {
  const db = await openOfflineIdb();
  if (db) {
    const idbDocs = await new Promise<JarvisKnowledgeDocument[]>((resolve) => {
      try {
        const tx = db.transaction(OFFLINE_IDB_STORE, 'readonly');
        const store = tx.objectStore(OFFLINE_IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () =>
          resolve(Array.isArray(req.result) ? (req.result as JarvisKnowledgeDocument[]) : []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    if (idbDocs.length > 0) {
      return idbDocs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }
  return getSyncOfflineJarvisKnowledgeDocs();
}

// ============================================================================
// SEMANTIC & KEYWORD SEARCH ACROSS UPLOADED PDF KNOWLEDGE BASE (ONLINE & OFFLINE)
// ============================================================================

export interface JarvisKnowledgeSearchMatch {
  docId: string;
  docTitle: string;
  category: JarvisKnowledgeCategory;
  chunkHeading: string;
  chunkContent: string;
  personalityDirective: string;
  score: number;
}

export function searchJarvisKnowledgeBase(
  query: string,
  docs: JarvisKnowledgeDocument[],
  topK = 4
): JarvisKnowledgeSearchMatch[] {
  if (!Array.isArray(docs) || docs.length === 0) return [];

  const cleanQuery = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const queryTerms = cleanQuery
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS_PT.has(w));

  const results: JarvisKnowledgeSearchMatch[] = [];

  for (const doc of docs) {
    const docTitleNorm = doc.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    let docBonus = 0;
    for (const term of queryTerms) {
      if (docTitleNorm.includes(term)) {
        docBonus += 5;
      }
    }

    for (const chunk of doc.chunks ?? []) {
      const contentNorm = `${chunk.heading} ${chunk.content} ${(chunk.keywords ?? []).join(' ')}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      let score = docBonus;
      for (const term of queryTerms) {
        if (contentNorm.includes(term)) {
          score += 3;
          if ((chunk.keywords ?? []).some((k) => k.includes(term))) {
            score += 2;
          }
        }
      }

      // Even if query is general (e.g. "me ajude nos estudos do PDF"), return top chunks of most recent PDFs
      if (
        score > 0 ||
        /\b(pdf|documento|apostila|livro|material|estudo|estudar|aprender|resumo|ensine)\b/i.test(
          cleanQuery
        )
      ) {
        results.push({
          docId: doc.id,
          docTitle: doc.title,
          category: doc.category,
          chunkHeading: chunk.heading,
          chunkContent: chunk.content,
          personalityDirective: doc.personalityIntegrationDirective,
          score: score > 0 ? score : Math.max(1, 5 - chunk.index),
        });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Formata a Base de Dados PDF do J.A.R.V.I.S. para injeção direta nas System Instructions
 * e na estrutura imutável de personalidade de J.A.R.V.I.S.
 */
export function formatJarvisPdfKnowledgeForPrompt(
  docs: JarvisKnowledgeDocument[] | undefined,
  query = ''
): string {
  if (!Array.isArray(docs) || docs.length === 0) {
    return '';
  }

  const matches = searchJarvisKnowledgeBase(query, docs, 4);

  const docsOverview = docs
    .slice(0, 8)
    .map(
      (d, idx) =>
        `  ${idx + 1}. "${d.title}" (${JARVIS_KNOWLEDGE_CATEGORY_LABELS[d.category]} · ${d.chunks.length} seções offline/online): ${d.personalityIntegrationDirective}\n     - Lições-Chave: ${d.keyTeachings.slice(0, 3).join(' | ')}`
    )
    .join('\n');

  const matchedExcerpts =
    matches.length > 0
      ? `\nTRECHOS ESPECÍFICOS DOS PDFs RECUPERADOS PARA A PERGUNTA ATUAL:\n${matches
          .map(
            (m, i) =>
              `  [Trecho PDF #${i + 1} · "${m.docTitle}" — ${m.chunkHeading}]: "${m.chunkContent.slice(
                0,
                550
              )}"`
          )
          .join('\n')}`
      : '';

  return `\n[BIBLIOTECA DE ESTUDOS & BASE DE DADOS PDF INCORPORADA À PERSONALIDADE DE J.A.R.V.I.S. (${docs.length} DOCUMENTO(S) ATIVO(S) · OPERACIONAL ONLINE & OFFLINE)]
DIRETRIZ INEGOCIÁVEL DE MENTORIA E PERSONALIDADE (J.A.R.V.I.S.):
- Estes materiais em PDF foram enviados por Patrick Pessoa para fazerem parte permanente do núcleo de conhecimento e da personalidade sábia, paciente, cuidadosa e cristocêntrica de J.A.R.V.I.S.
- Sempre que o assunto tiver relação com os documentos abaixo (ou quando Patrick pedir ajuda nos estudos, revisão, explicação ou perguntas sobre o PDF), J.A.R.V.I.S. DEVE responder como um mentor erudito e dedicado, citando o título do PDF, explicando seus conceitos passo a passo e formulando reflexões ou perguntas de estudo para ajudar Patrick Pessoa a dominar o conteúdo.
DOCUMENTOS INCORPORADOS AO NÚCLEO DE J.A.R.V.I.S.:
${docsOverview}${matchedExcerpts}`;
}
