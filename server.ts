import 'dotenv/config';
import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import {
  CREATOR_HARDCODED_ACCOUNT,
  addAgendaEvent,
  addMemory,
  addRoutineRule,
  addTask,
  answerCreatorQuestion,
  authenticateSystemUser,
  clearConversations,
  deleteAgendaEvent,
  deleteAlert,
  deleteMemory,
  deleteRoutineRule,
  deleteTask,
  readWorkspace,
  registerSystemUser,
  setTurnFeedback,
  toggleAlertResolved,
  updateAgendaEvent,
  updateCreatorDossier,
  updateRoutineRule,
  updateTask,
} from './server/memoryStore.ts';
import {
  formatGeminiErrorMessage,
  generateProactiveInitiative,
  processAssistantInteraction,
  processAssistantInteractionStream,
  synthesizeAssistantSpeech,
  transcribeUserAudio,
} from './server/assistantEngine.ts';
import {
  getLiveIntelBriefing,
  scanCreatorOnlinePresence,
} from './server/liveIntelService.ts';

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  // Authentication & User Registration Module
  app.get('/api/auth/users', async (_req, res) => {
    try {
      const workspace = await readWorkspace();
      res.json({
        users: workspace.users ?? [],
        creatorUsername: CREATOR_HARDCODED_ACCOUNT.username,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao listar usuários.',
      });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
        res.status(400).json({ error: 'Informe o nome de usuário e a senha de acesso.' });
        return;
      }

      const result = await authenticateSystemUser(username, password);
      res.json({
        user: result.user,
        workspace: result.workspace,
      });
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Erro ao autenticar usuário no sistema.',
      });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, password, email = '', roleLabel = 'Operador Credenciado' } = req.body ?? {};
      const result = await registerSystemUser({
        username: String(username ?? ''),
        password: String(password ?? ''),
        email: String(email ?? ''),
        roleLabel: String(roleLabel ?? 'Operador Credenciado'),
      });

      res.json({
        user: result.user,
        workspace: result.workspace,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Erro ao cadastrar novo usuário.',
      });
    }
  });

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

  // Live Weather (Rio de Janeiro / custom city) + Rio, Brazil & World News Briefing
  app.get('/api/intel/briefing', async (req, res) => {
    try {
      const city =
        typeof req.query.city === 'string' && req.query.city.trim()
          ? req.query.city.trim()
          : 'Rio de Janeiro, RJ';
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const briefing = await getLiveIntelBriefing(city, forceRefresh);
      res.json(briefing);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao obter radar de clima e notícias.',
      });
    }
  });

  // Main tri-AI interaction (non-streaming)
  app.post('/api/assistant/interact', async (req, res) => {
    try {
      const {
        message,
        targetMode = 'auto',
        triggerType = 'texto',
        useWebSearch = 'auto',
        clientTimeIso,
        clientTimezone,
        activeUser,
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
        activeUser,
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  // Proactive autonomous assistant call (initiated by background daemon, routine timer, login/logout, or manual trigger)
  app.post('/api/assistant/proactive', async (req, res) => {
    try {
      const {
        reason,
        preferredMode = 'todos',
        eventOrRoutineTitle,
        clientTimeIso,
        clientTimezone,
        activeUser,
        sessionEvent,
      } = req.body ?? {};

      const result = await generateProactiveInitiative({
        reason,
        preferredMode,
        eventOrRoutineTitle,
        clientTimeIso,
        clientTimezone,
        activeUser,
        sessionEvent:
          sessionEvent === 'login' || sessionEvent === 'logout'
            ? sessionEvent
            : undefined,
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  // Main tri-AI interaction (Server-Sent Events streaming)
  app.post('/api/assistant/interact/stream', async (req, res) => {
    const {
      message,
      targetMode = 'auto',
      triggerType = 'texto',
      useWebSearch = 'auto',
      clientTimeIso,
      clientTimezone,
      activeUser,
    } = req.body ?? {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'Envie uma mensagem válida para os assistentes.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let clientClosed = false;
    res.on('close', () => {
      clientClosed = true;
    });

    const sendEvent = (eventName: string, data: unknown) => {
      if (clientClosed || res.writableEnded) return;
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await processAssistantInteractionStream(
        {
          message: message.trim(),
          targetMode,
          triggerType,
          useWebSearch,
          clientTimeIso,
          clientTimezone,
          activeUser,
        },
        (event) => {
          sendEvent(event.type, event);
        }
      );
    } catch (err) {
      sendEvent('error', {
        type: 'error',
        error: formatGeminiErrorMessage(err),
      });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
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

  // Agenda & Calendar Events CRUD
  app.post('/api/agenda', async (req, res) => {
    try {
      const {
        title,
        date,
        startTime,
        endTime = '',
        category = 'rotina',
        locationOrLink = '',
        notes = '',
        assignedAssistant = 'todos',
        autoCallOnTime = true,
      } = req.body ?? {};
      if (!title?.trim() || !date?.trim() || !startTime?.trim()) {
        res.status(400).json({ error: 'Título, data e horário são obrigatórios.' });
        return;
      }
      const created = await addAgendaEvent({
        title: title.trim(),
        date: date.trim(),
        startTime: startTime.trim(),
        endTime: endTime ? String(endTime).trim() : undefined,
        category,
        locationOrLink: locationOrLink ? String(locationOrLink).trim() : undefined,
        notes: notes ? String(notes).trim() : undefined,
        assignedAssistant,
        completed: false,
        autoCallOnTime: Boolean(autoCallOnTime),
      });
      const workspace = await readWorkspace();
      res.json({ created, workspace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao criar evento na agenda.',
      });
    }
  });

  app.patch('/api/agenda/:id', async (req, res) => {
    try {
      const workspace = await updateAgendaEvent(req.params.id, req.body ?? {});
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao atualizar evento da agenda.',
      });
    }
  });

  app.delete('/api/agenda/:id', async (req, res) => {
    try {
      const workspace = await deleteAgendaEvent(req.params.id);
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao remover evento da agenda.',
      });
    }
  });

  // Routines CRUD
  app.post('/api/routines', async (req, res) => {
    try {
      const {
        title,
        time,
        frequencyLabel = 'Diário',
        leadAssistant = 'todos',
        instructions = '',
        enabled = true,
      } = req.body ?? {};
      if (!title?.trim() || !time?.trim()) {
        res.status(400).json({ error: 'Título e horário da rotina são obrigatórios.' });
        return;
      }
      const created = await addRoutineRule({
        title: title.trim(),
        time: time.trim(),
        frequencyLabel: String(frequencyLabel).trim(),
        leadAssistant,
        instructions: String(instructions).trim(),
        enabled: Boolean(enabled),
      });
      const workspace = await readWorkspace();
      res.json({ created, workspace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao adicionar rotina.',
      });
    }
  });

  app.patch('/api/routines/:id', async (req, res) => {
    try {
      const workspace = await updateRoutineRule(req.params.id, req.body ?? {});
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao atualizar rotina.',
      });
    }
  });

  app.delete('/api/routines/:id', async (req, res) => {
    try {
      const workspace = await deleteRoutineRule(req.params.id);
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao excluir rotina.',
      });
    }
  });

  // Creator Dossier & Online Social Scan
  app.patch('/api/dossier', async (req, res) => {
    try {
      const workspace = await updateCreatorDossier(req.body ?? {});
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao atualizar dossiê do criador.',
      });
    }
  });

  app.post('/api/dossier/questions/:id/answer', async (req, res) => {
    try {
      const { answerText } = req.body ?? {};
      if (!answerText || typeof answerText !== 'string' || !answerText.trim()) {
        res.status(400).json({ error: 'Forneça uma resposta válida.' });
        return;
      }
      const { question, workspace } = await answerCreatorQuestion(
        req.params.id,
        answerText.trim()
      );

      // Also let the asking assistant acknowledge and evolve based on the answer
      if (question) {
        const result = await processAssistantInteraction({
          message: `Respondendo à pergunta de ${question.askedBy.toUpperCase()} ("${question.question}"): ${answerText.trim()}`,
          targetMode: question.askedBy,
          triggerType: 'texto',
          useWebSearch: false,
        });
        res.json(result);
        return;
      }

      res.json({ workspace });
    } catch (err) {
      res.status(500).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  app.post('/api/dossier/scan-socials', async (req, res) => {
    try {
      const { extraQuery = '' } = req.body ?? {};
      const currentWorkspace = await readWorkspace();
      const dossier = currentWorkspace.creatorDossier;
      if (!dossier) {
        res.status(400).json({ error: 'Dossiê não inicializado.' });
        return;
      }

      const scan = await scanCreatorOnlinePresence(dossier, String(extraQuery));
      await updateCreatorDossier({
        socialProfiles: scan.updatedProfiles,
        lastOnlineScanAt: new Date().toISOString(),
      });

      const factsSummary =
        scan.discoveredFacts.length > 0
          ? scan.discoveredFacts.join('\n- ')
          : 'Perfis verificados (@patrickrodack / Patrick Pessoa).';

      const result = await processAssistantInteraction({
        message: `[VARREDURA ONLINE DE REDES SOCIAIS & PERFIL DE PATRICK PESSOA] Analisem os dados encontrados online sobre o criador Patrick Pessoa (${
          extraQuery ? `foco adicional: ${extraQuery}` : 'GitHub, LinkedIn, Instagram, X e Web'
        }):\n- ${factsSummary}\nConsolidem aprendizados úteis em newMemories e formulem novas perguntas estratégicas em newQuestions para expandir nosso banco de informações sobre ele.`,
        targetMode: 'todos',
        triggerType: 'proativo',
        useWebSearch: true,
        proactiveReason: 'Varredura Online de Redes Sociais & Dossiê Patrick Pessoa',
      });

      res.json({
        ...result,
        discoveredFacts: scan.discoveredFacts,
        sources: scan.sources,
      });
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
