import type { AssistantId, AssistantTurn, DetectedEmotion } from '../src/types/assistant.ts';

export interface PartialStreamSnapshot {
  detectedEmotion?: DetectedEmotion;
  resolvedMode?: AssistantId | 'ambos' | 'todos';
  turns: Array<{
    speaker: AssistantId;
    stance: string;
    text: string;
    ttsScript: string;
    isComplete: boolean;
  }>;
}

function unescapeJsonFragment(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    if (i + 1 >= raw.length) break; // Trailing incomplete escape at chunk boundary
    const next = raw[i + 1];
    i += 1;
    if (next === '"') out += '"';
    else if (next === '\\') out += '\\';
    else if (next === '/') out += '/';
    else if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === 'b') out += '\b';
    else if (next === 'f') out += '\f';
    else if (next === 'u') {
      const hex = raw.slice(i + 1, i + 5);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        // Incomplete unicode escape at end of chunk
        break;
      }
    } else {
      out += next;
    }
  }
  return out;
}

function extractStringProperty(
  objSlice: string,
  key: string
): { value: string; closed: boolean } | null {
  const keyPattern = new RegExp(`"${key}"\\s*:\\s*"`);
  const match = keyPattern.exec(objSlice);
  if (!match) return null;

  const start = match.index + match[0].length;
  let escaped = false;
  for (let i = start; i < objSlice.length; i++) {
    const ch = objSlice[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      return {
        value: unescapeJsonFragment(objSlice.slice(start, i)),
        closed: true,
      };
    }
  }

  return {
    value: unescapeJsonFragment(objSlice.slice(start)),
    closed: false,
  };
}

function findMatchingBrace(input: string, openIdx: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = openIdx; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Extracts partial emotion, mode, and live-streaming assistant turns from an
 * incomplete JSON buffer produced by Gemini structured streaming.
 */
export function extractPartialStreamSnapshot(buffer: string): PartialStreamSnapshot {
  const snapshot: PartialStreamSnapshot = { turns: [] };

  // 1. Extract detectedEmotion if closed
  const emoMatch = /"detectedEmotion"\s*:\s*\{/.exec(buffer);
  if (emoMatch) {
    const openIdx = buffer.indexOf('{', emoMatch.index);
    const closeIdx = findMatchingBrace(buffer, openIdx);
    if (closeIdx !== -1) {
      try {
        snapshot.detectedEmotion = JSON.parse(
          buffer.slice(openIdx, closeIdx + 1)
        ) as DetectedEmotion;
      } catch {
        // ignore partial emotion parse
      }
    }
  }

  // 2. Extract resolvedMode if complete
  const modeMatch = extractStringProperty(buffer, 'resolvedMode');
  if (modeMatch?.closed) {
    const v = modeMatch.value;
    if (
      v === 'jarvis' ||
      v === 'sexta-feira' ||
      v === 'ultron' ||
      v === 'ambos' ||
      v === 'todos'
    ) {
      snapshot.resolvedMode = v;
    }
  }

  // 3. Extract objects inside "responses": [ ... ]
  const respMatch = /"responses"\s*:\s*\[/.exec(buffer);
  if (!respMatch) return snapshot;

  let cursor = respMatch.index + respMatch[0].length;
  while (cursor < buffer.length) {
    // Skip whitespace and commas
    while (cursor < buffer.length && /[\s,]/.test(buffer[cursor])) {
      cursor += 1;
    }
    if (cursor >= buffer.length || buffer[cursor] === ']') break;
    if (buffer[cursor] !== '{') {
      cursor += 1;
      continue;
    }

    const closeIdx = findMatchingBrace(buffer, cursor);
    const isComplete = closeIdx !== -1;
    const objSlice = isComplete
      ? buffer.slice(cursor, closeIdx + 1)
      : buffer.slice(cursor);

    const speakerProp = extractStringProperty(objSlice, 'speaker');
    const stanceProp = extractStringProperty(objSlice, 'stance');
    const textProp = extractStringProperty(objSlice, 'text');
    const ttsProp = extractStringProperty(objSlice, 'ttsScript');

    if (speakerProp?.closed) {
      const sp = speakerProp.value;
      if (sp === 'jarvis' || sp === 'sexta-feira' || sp === 'ultron') {
        snapshot.turns.push({
          speaker: sp,
          stance: stanceProp?.value || 'Analisando...',
          text: textProp?.value || '',
          ttsScript: ttsProp?.value || textProp?.value || '',
          isComplete: isComplete && Boolean(textProp?.closed),
        });
      }
    }

    if (!isComplete) break;
    cursor = closeIdx + 1;
  }

  return snapshot;
}

export function sanitizeCompletedTurns(turns: AssistantTurn[]): AssistantTurn[] {
  return turns.filter((t) => t && t.speaker && t.text);
}
