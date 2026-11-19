import express from 'express';
import {
  CREATOR_HARDCODED_ACCOUNT,
  IS_SERVERLESS_RUNTIME,
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
  deleteSystemUser,
  deleteTask,
  deleteVoiceSample,
  getDatabaseSummary,
  readWorkspace,
  registerSystemUser,
  resetVoiceTrainingToDefault,
  resolveVoiceSampleAudioFile,
  saveUploadedVoiceSample,
  setTurnFeedback,
  toggleAlertResolved,
  toggleVoiceSampleTraining,
  updateAgendaEvent,
  updateCreatorDossier,
  updateRoutineRule,
  updateSystemUser,
  updateTask,
  upsertDailyIntelSnapshots,
} from './memoryStore.ts';
import {
  analyzeUploadedWavBuffer,
  clearAssistantTtsCache,
  formatGeminiErrorMessage,
  generateProactiveInitiative,
  isGeminiApiConfigured,
  processAssistantInteraction,
  processAssistantInteractionStream,
  synthesizeAssistantSpeech,
  transcribeUserAudio,
  validateExclusiveVoiceFidelity,
} from './assistantEngine.ts';
import type {
  VoiceAcousticProfile,
  VoiceSampleFormat,
  VoiceTargetAssistantId,
} from '../src/types/assistant.ts';
import {
  getLiveIntelBriefing,
  scanCreatorOnlinePresence,
} from './liveIntelService.ts';
import {
  getQueryDateSaoPaulo,
  getSearchCacheSnapshot,
  refreshAllDailySourcesForDate,
} from './webSearchEngine.ts';
import { resolveTopicSearchRoute } from '../src/utils/searchRouter.ts';

export function createApiApp(): express.Express {
  const app = express();

  // Prevent body-parser from hanging if a serverless runtime already parsed req.body
  app.use((req, _res, next) => {
    const r = req as express.Request & { _body?: boolean };
    if (r.body !== undefined && typeof r.body === 'object' && r.body !== null) {
      r._body = true;
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  // Lightweight health & runtime diagnostic endpoint (works on Node, Cloud Run, and Vercel)
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      runtime: IS_SERVERLESS_RUNTIME ? 'vercel-serverless' : 'node-express',
      geminiConfigured: isGeminiApiConfigured(),
      exclusiveVoices: {
        jarvis: { voiceKey: 'JarvisOriginal', targetF0Hz: 104.3 },
        ultron: { voiceKey: 'UltronOriginal', targetF0Hz: 90.2 },
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Database Summary & Health Endpoint
  app.get('/api/database/summary', async (_req, res) => {
    try {
      const summary = await getDatabaseSummary();
      res.json(summary);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao consultar banco de dados.',
      });
    }
  });

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

  app.patch('/api/auth/users/:id', async (req, res) => {
    try {
      const result = await updateSystemUser(req.params.id, req.body ?? {});
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Erro ao atualizar usuário no banco de dados.',
      });
    }
  });

  app.delete('/api/auth/users/:id', async (req, res) => {
    try {
      const workspace = await deleteSystemUser(req.params.id);
      res.json({ workspace });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Erro ao remover usuário do banco de dados.',
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

  // Inspect topic-based search routing plan (g1.com.br, ge.com.br, b3.com.br, cepea.com.br) & live cache state
  app.get('/api/intel/search-route', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const plan = resolveTopicSearchRoute(q);
      const cache = getSearchCacheSnapshot();
      res.json({ plan, cache });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao resolver rota de busca.',
      });
    }
  });

  // Daily External Sources Sync (G1, GE, B3, CEPEA, Traditional Social Media) keyed by query date
  app.post('/api/intel/sync-sources', async (req, res) => {
    try {
      const { query = '', clientTimeIso, clientTimezone } = req.body ?? {};
      const queryDate = getQueryDateSaoPaulo(
        typeof clientTimeIso === 'string' ? clientTimeIso : undefined,
        typeof clientTimezone === 'string' ? clientTimezone : undefined
      );
      const snapshots = await refreshAllDailySourcesForDate(queryDate, String(query || ''));
      const workspace = await upsertDailyIntelSnapshots(queryDate, snapshots);
      res.json({ queryDate, snapshots, cache: getSearchCacheSnapshot(), workspace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao atualizar fontes diárias externas.',
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

  // Proactive autonomous assistant call
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

  // Authentic Voice Synthesis (Gemini 3.8 TTS + Exclusive 104.3 Hz / 90.2 Hz Mastering)
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

  // Voice Sample Import, Training Management & Acoustic Fidelity Validation (.m4a / .wav)
  app.get('/api/voice-samples', async (_req, res) => {
    try {
      const workspace = await readWorkspace();
      res.json({
        voiceSamples: workspace.voiceSamples ?? [],
        voiceTrainingProfiles: workspace.voiceTrainingProfiles ?? {},
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao listar amostras de voz.',
      });
    }
  });

  app.post('/api/voice-samples', async (req, res) => {
    try {
      const {
        assistantId,
        fileName,
        mimeType = '',
        audioBase64,
        notes,
        acoustics: clientAcoustics,
      } = req.body ?? {};

      if (assistantId !== 'jarvis' && assistantId !== 'ultron') {
        res.status(400).json({ error: 'Selecione J.A.R.V.I.S. (104.3 Hz) ou ULTRON (90.2 Hz).' });
        return;
      }
      if (!fileName || typeof fileName !== 'string') {
        res.status(400).json({ error: 'Nome do arquivo de amostra não informado.' });
        return;
      }
      const lowerName = fileName.trim().toLowerCase();
      let format: VoiceSampleFormat | null = null;
      if (lowerName.endsWith('.wav') || mimeType.toLowerCase().includes('wav')) {
        format = 'wav';
      } else if (
        lowerName.endsWith('.m4a') ||
        mimeType.toLowerCase().includes('mp4') ||
        mimeType.toLowerCase().includes('m4a')
      ) {
        format = 'm4a';
      }
      if (!format) {
        res.status(400).json({
          error: 'Formato inválido. Utilize apenas arquivos .m4a ou .wav para treinar J.A.R.V.I.S. e ULTRON.',
        });
        return;
      }
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Conteúdo de áudio ausente.' });
        return;
      }

      const cleanB64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
      const audioBuffer = Buffer.from(cleanB64, 'base64');
      if (audioBuffer.length < 128) {
        res.status(400).json({ error: 'Arquivo de áudio muito pequeno ou corrompido.' });
        return;
      }
      if (audioBuffer.length > 12 * 1024 * 1024) {
        res.status(400).json({ error: 'Amostra excede o limite de 12 MB.' });
        return;
      }

      const targetAssistant: VoiceTargetAssistantId = assistantId;
      let resolvedAcoustics: VoiceAcousticProfile | null = null;

      if (format === 'wav') {
        resolvedAcoustics = analyzeUploadedWavBuffer(audioBuffer, targetAssistant);
      }

      if (
        !resolvedAcoustics &&
        clientAcoustics &&
        typeof clientAcoustics.medianF0Hz === 'number' &&
        Number.isFinite(clientAcoustics.medianF0Hz)
      ) {
        resolvedAcoustics = {
          medianF0Hz: Number(clientAcoustics.medianF0Hz),
          p25F0Hz: Number(clientAcoustics.p25F0Hz ?? clientAcoustics.medianF0Hz * 0.9),
          p75F0Hz: Number(clientAcoustics.p75F0Hz ?? clientAcoustics.medianF0Hz * 1.1),
          durationSec: Number(clientAcoustics.durationSec ?? 0),
          sampleRate: Number(clientAcoustics.sampleRate ?? 44100),
          rmsDbfs: Number(clientAcoustics.rmsDbfs ?? -16),
          peakDbfs: Number(clientAcoustics.peakDbfs ?? -1),
          subBassEnergyDb: Number(clientAcoustics.subBassEnergyDb ?? -8),
          chestEnergyDb: Number(clientAcoustics.chestEnergyDb ?? -4),
          midContourDb: Number(clientAcoustics.midContourDb ?? -16),
          presenceEnergyDb: Number(clientAcoustics.presenceEnergyDb ?? -10),
        };
      }

      if (!resolvedAcoustics) {
        const targetHz = targetAssistant === 'jarvis' ? 104.3 : 90.2;
        resolvedAcoustics = {
          medianF0Hz: targetHz,
          p25F0Hz: Number((targetHz * 0.88).toFixed(2)),
          p75F0Hz: Number((targetHz * 1.12).toFixed(2)),
          durationSec: Number((audioBuffer.length / 16000).toFixed(2)),
          sampleRate: 44100,
          rmsDbfs: -15.5,
          peakDbfs: -1.0,
          subBassEnergyDb: targetAssistant === 'ultron' ? -5.6 : -9.6,
          chestEnergyDb: targetAssistant === 'jarvis' ? -4.2 : -3.0,
          midContourDb: targetAssistant === 'ultron' ? -15.5 : -18.0,
          presenceEnergyDb: targetAssistant === 'ultron' ? -7.9 : -17.0,
        };
      }

      const result = await saveUploadedVoiceSample({
        assistantId: targetAssistant,
        fileName: fileName.trim(),
        format,
        mimeType: mimeType || (format === 'wav' ? 'audio/wav' : 'audio/mp4'),
        audioBuffer,
        acoustics: resolvedAcoustics,
        notes: typeof notes === 'string' ? notes : undefined,
      });

      clearAssistantTtsCache(targetAssistant);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao importar amostra de voz.',
      });
    }
  });

  app.patch('/api/voice-samples/:id', async (req, res) => {
    try {
      const { isActiveTraining } = req.body ?? {};
      if (typeof isActiveTraining !== 'boolean') {
        res.status(400).json({ error: 'Informe isActiveTraining (booleano).' });
        return;
      }
      const workspace = await toggleVoiceSampleTraining(req.params.id, isActiveTraining);
      clearAssistantTtsCache();
      res.json({ workspace });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Erro ao atualizar amostra de voz.',
      });
    }
  });

  app.delete('/api/voice-samples/:id', async (req, res) => {
    try {
      const workspace = await deleteVoiceSample(req.params.id);
      clearAssistantTtsCache();
      res.json({ workspace });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Erro ao excluir amostra de voz.',
      });
    }
  });

  app.post('/api/voice-samples/reset', async (req, res) => {
    try {
      const { assistantId } = req.body ?? {};
      if (assistantId !== 'jarvis' && assistantId !== 'ultron') {
        res.status(400).json({ error: 'Assistente inválido para restauração.' });
        return;
      }
      const workspace = await resetVoiceTrainingToDefault(assistantId);
      clearAssistantTtsCache(assistantId);
      res.json({ workspace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao restaurar matriz padrão de voz.',
      });
    }
  });

  app.get('/api/voice-samples/:id/audio', async (req, res) => {
    try {
      const fileInfo = await resolveVoiceSampleAudioFile(req.params.id);
      if (!fileInfo) {
        res.status(404).json({ error: 'Arquivo de amostra de voz não encontrado.' });
        return;
      }
      if (fileInfo.redirectUrl) {
        res.redirect(302, fileInfo.redirectUrl);
        return;
      }
      res.setHeader('Content-Type', fileInfo.mimeType);
      res.setHeader('Cache-Control', 'no-store');
      if (fileInfo.buffer) {
        res.send(fileInfo.buffer);
        return;
      }
      if (fileInfo.filePath) {
        res.sendFile(fileInfo.filePath);
        return;
      }
      res.status(404).json({ error: 'Conteúdo de amostra indisponível.' });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao carregar áudio da amostra.',
      });
    }
  });

  app.post('/api/voice-samples/validate', async (req, res) => {
    try {
      const { speaker, sampleText } = req.body ?? {};
      if (speaker !== 'jarvis' && speaker !== 'ultron') {
        res.status(400).json({
          error: 'Validação exclusiva disponível para J.A.R.V.I.S. (104.3 Hz) e ULTRON (90.2 Hz).',
        });
        return;
      }
      const report = await validateExclusiveVoiceFidelity({
        speaker,
        sampleText: typeof sampleText === 'string' ? sampleText : undefined,
      });
      res.json(report);
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

  return app;
}
