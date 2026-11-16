import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import {
  addMemory,
  addTask,
  clearConversations,
  deleteAlert,
  deleteMemory,
  deleteTask,
  readWorkspace,
  setTurnFeedback,
  toggleAlertResolved,
  updateTask,
} from './server/memoryStore.ts';
import {
  formatGeminiErrorMessage,
  processAssistantInteraction,
  synthesizeAssistantSpeech,
  transcribeUserAudio,
} from './server/assistantEngine.ts';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  // Workspace state
  app.get('/api/workspace', async (_req, res) => {
    try {
      const workspace = await readWorkspace();
      res.json(workspace);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar workspace.';
      res.status(500).json({ error: message });
    }
  });

  // Main dual-AI interaction
  app.post('/api/assistant/interact', async (req, res) => {
    try {
      const {
        message,
        targetMode = 'auto',
        triggerType = 'texto',
        useWebSearch = 'auto',
        clientTimeIso,
        clientTimezone,
      } = req.body ?? {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Envie uma mensagem válida para os assistentes.' });
        return;
      }

      const result = await processAssistantInteraction({
        message: message.trim(),
        targetMode,
        triggerType,
        useWebSearch,
        clientTimeIso,
        clientTimezone,
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  // Code / Architecture security & instability audit
  app.post('/api/assistant/audit', async (req, res) => {
    try {
      const { codeOrSpec, contextNote = '' } = req.body ?? {};
      if (!codeOrSpec || typeof codeOrSpec !== 'string' || !codeOrSpec.trim()) {
        res.status(400).json({ error: 'Forneça código, arquitetura ou log para auditoria.' });
        return;
      }

      const auditPrompt = `Auditoria técnica solicitada por Patrick Pessoa.${
        contextNote ? ` Contexto: ${contextNote}.` : ''
      }\nAnalisem juntos (J.A.R.V.I.S. focado em segurança e arquitetura; SEXTA-FEIRA focada em instabilidade, edge cases e legibilidade; ULTRON focado em diagnóstico implacável de falhas em cascata e previsões de colapso) e gerem alertas reais se encontrarem riscos:\n\n\`\`\`\n${codeOrSpec.trim()}\n\`\`\``;

      const result = await processAssistantInteraction({
        message: auditPrompt,
        targetMode: 'todos',
        triggerType: 'auditoria',
        useWebSearch: false,
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  // Authentic Voice Synthesis (Gemini 3.8 TTS)
  app.post('/api/assistant/tts', async (req, res) => {
    try {
      const { turns, jarvisVoice, fridayVoice, ultronVoice } = req.body ?? {};
      if (!Array.isArray(turns) || turns.length === 0) {
        res.status(400).json({ error: 'Turnos de fala inválidos.' });
        return;
      }
      const audio = await synthesizeAssistantSpeech({
        turns,
        jarvisVoice,
        fridayVoice,
        ultronVoice,
      });
      res.json(audio);
    } catch (err) {
      res.status(500).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  // Audio Transcription fallback via Gemini 3.5 Transcribe
  app.post('/api/assistant/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body ?? {};
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Áudio não fornecido.' });
        return;
      }
      const text = await transcribeUserAudio({ audioBase64, mimeType });
      res.json({ text });
    } catch (err) {
      res.status(500).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  // Memory CRUD
  app.post('/api/memories', async (req, res) => {
    try {
      const { title, content, category = 'aprendizado', sourceAssistant = 'ambos', importance = 'media' } =
        req.body ?? {};
      if (!title?.trim() || !content?.trim()) {
        res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
        return;
      }
      const created = await addMemory({
        title: title.trim(),
        content: content.trim(),
        category,
        sourceAssistant,
        importance,
      });
      const workspace = await readWorkspace();
      res.json({ created, workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao salvar memória.' });
    }
  });

  app.delete('/api/memories/:id', async (req, res) => {
    try {
      const workspace = await deleteMemory(req.params.id);
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao excluir memória.' });
    }
  });

  // Tasks CRUD
  app.post('/api/tasks', async (req, res) => {
    try {
      const {
        title,
        description = '',
        priority = 'media',
        status = 'pendente',
        assignedTo = 'ambos',
        dueTime = 'Hoje',
      } = req.body ?? {};
      if (!title?.trim()) {
        res.status(400).json({ error: 'Título da tarefa é obrigatório.' });
        return;
      }
      const created = await addTask({
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
        assignedTo,
        dueTime,
      });
      const workspace = await readWorkspace();
      res.json({ created, workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao criar tarefa.' });
    }
  });

  app.patch('/api/tasks/:id', async (req, res) => {
    try {
      const workspace = await updateTask(req.params.id, req.body ?? {});
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao atualizar tarefa.' });
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      const workspace = await deleteTask(req.params.id);
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao excluir tarefa.' });
    }
  });

  // Alerts CRUD
  app.patch('/api/alerts/:id', async (req, res) => {
    try {
      const workspace = await toggleAlertResolved(req.params.id, Boolean(req.body?.resolved));
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao atualizar alerta.' });
    }
  });

  app.delete('/api/alerts/:id', async (req, res) => {
    try {
      const workspace = await deleteAlert(req.params.id);
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao remover alerta.' });
    }
  });

  // Turn accuracy feedback
  app.patch('/api/conversations/:entryId/feedback', async (req, res) => {
    try {
      const { speaker, feedback } = req.body ?? {};
      if (speaker !== 'jarvis' && speaker !== 'sexta-feira' && speaker !== 'ultron') {
        res.status(400).json({ error: 'Assistente inválido para avaliação.' });
        return;
      }
      if (feedback !== 'acerto' && feedback !== 'revisar' && feedback !== null) {
        res.status(400).json({ error: 'Feedback inválido.' });
        return;
      }
      const workspace = await setTurnFeedback(req.params.entryId, speaker, feedback);
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao registrar avaliação.' });
    }
  });

  // Clear history
  app.post('/api/conversations/clear', async (_req, res) => {
    try {
      const workspace = await clearConversations();
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao limpar histórico.' });
    }
  });

  // Ensure unknown /api/* routes always return valid JSON rather than HTML/text 404
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: `Rota da API não encontrada (${req.method} ${req.originalUrl}).`,
    });
  });

  // Global JSON error handler for body-parser / Express middleware errors
  app.use(
    (
      err: Error & { status?: number; type?: string },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (req.path.startsWith('/api/')) {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        res.status(status).json({
          error:
            err.type === 'entity.parse.failed'
              ? 'Payload JSON inválido enviado na requisição.'
              : formatGeminiErrorMessage(err),
        });
        return;
      }
      next(err);
    }
  );

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Stark Lab ativo na porta ${PORT}`);
  });
}

startServer();
