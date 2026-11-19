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

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url || '/api';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const forwardedPath = parsed.searchParams.get('__api_path');
    if (forwardedPath !== null) {
      parsed.searchParams.delete('__api_path');
      const remainingQs = parsed.searchParams.toString();
      const normalizedPath = forwardedPath.replace(/^\/+/, '');
      req.url = `/api/${normalizedPath}${remainingQs ? `?${remainingQs}` : ''}`;
    } else if (!rawUrl.startsWith('/api')) {
      req.url = `/api${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;
    }
  } catch {
    // Preserve raw URL if parsing fails
  }

  return app(
    req as unknown as Parameters<typeof app>[0],
    res as unknown as Parameters<typeof app>[1]
  );
}
