import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../server/createApiApp.ts';

const app = createApiApp();

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: false,
  },
};

export default function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<void> {
  // Always prevent edge/proxy caching on dynamic AI, voice, and live search endpoints
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  // Permissive CORS for external browser / PWA invocations (same-origin and preview domains)
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return Promise.resolve();
  }

  // Normalize JSON string/Buffer bodies if the Vercel runtime pre-populated req.body
  if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      // Leave for Express body-parser
    }
  } else if (Buffer.isBuffer(req.body)) {
    try {
      const asStr = req.body.toString('utf-8');
      if (asStr.trim().startsWith('{')) {
        req.body = JSON.parse(asStr);
      }
    } catch {
      // Leave for Express body-parser
    }
  }

  const rawUrl = req.url || '/api';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const forwardedPath = parsed.searchParams.get('__api_path');
    if (forwardedPath !== null) {
      parsed.searchParams.delete('__api_path');
      const remainingQs = parsed.searchParams.toString();
      const normalizedPath = forwardedPath.replace(/^\/+/, '');
      req.url = `/api/${normalizedPath}${remainingQs ? `?${remainingQs}` : ''}`;
    } else if (parsed.pathname === '/api/index' || parsed.pathname === '/api/index/') {
      const remainingQs = parsed.searchParams.toString();
      req.url = `/api${remainingQs ? `?${remainingQs}` : ''}`;
    } else if (!rawUrl.startsWith('/api')) {
      req.url = `/api${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;
    }
  } catch {
    // Preserve raw URL if parsing fails
  }

  // CRITICAL for Vercel Serverless: return a Promise that resolves only when the Express
  // response fully finishes (prevents premature Lambda termination on async TTS/search/SSE).
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    res.once('finish', finish);
    res.once('close', finish);
    res.once('error', finish);

    try {
      app(
        req as unknown as Parameters<typeof app>[0],
        res as unknown as Parameters<typeof app>[1]
      );
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error:
              err instanceof Error
                ? err.message
                : 'Erro interno na função serverless da API RODACK.',
          })
        );
      }
      finish();
    }
  });
}
