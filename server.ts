import 'dotenv/config';
import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { createApiApp } from './server/createApiApp.ts';

async function startServer() {
  const app = createApiApp();
  const httpServer = createHttpServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor RODACK SISTEMA DE IA ativo na porta ${PORT}`);
  });
}

startServer();
