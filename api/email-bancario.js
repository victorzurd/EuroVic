import { timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '../lib/auth.js';
import { analizarAvisoBancario } from '../lib/bank-email.js';
import { logFlow, logFlowError } from '../lib/flow-log.js';

function coincideSecreto(recibido, esperado) {
  if (typeof recibido !== 'string' || !esperado) return false;
  const a = createHash('sha256').update(recibido).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b) && recibido.length === esperado.length;
}

export default async function handler(req, res) {
  const traceId = randomUUID();
  const flow = 'bank_notification_push';
  const startedAt = Date.now();
  logFlow(flow, traceId, 'request_received', { method: req.method });

  if (req.method !== 'POST') {
    logFlow(flow, traceId, 'request_rejected', { reason: 'method_not_allowed', status: 405 });
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const expectedSecret = process.env.EMAIL_IMPORT_SECRET;
  const receivedSecret = req.headers['x-eurovic-secret'];
  if (!coincideSecreto(receivedSecret, expectedSecret)) {
    logFlow(flow, traceId, 'authentication_failed', { status: 401 });
    return res.status(401).json({ error: 'No autorizado.' });
  }
  logFlow(flow, traceId, 'authentication_succeeded');

  const userId = process.env.EMAIL_IMPORT_USER_ID;
  if (!userId) {
    logFlow(flow, traceId, 'configuration_failed', { reason: 'destination_user_missing', status: 500 });
    return res.status(500).json({ error: 'Falta configurar la cuenta de destino.' });
  }

  const { message_id: messageId, from, subject, date, text } = req.body || {};
  if (typeof messageId !== 'string' || !messageId.trim() || typeof text !== 'string' || !text.trim()) {
    logFlow(flow, traceId, 'payload_rejected', { reason: 'missing_message_id_or_text', status: 400 });
    return res.status(400).json({ error: 'Faltan el identificador del correo o su contenido.' });
  }
  if (messageId.length > 300 || text.length > 30000) {
    logFlow(flow, traceId, 'payload_rejected', { reason: 'payload_too_large', status: 413 });
    return res.status(413).json({ error: 'El correo supera el tamaño permitido.' });
  }
  logFlow(flow, traceId, 'payload_validated', { text_length: text.length });

  let stage = 'prepare_notification';
  try {
    const correo = {
      from: typeof from === 'string' ? from.slice(0, 300) : '',
      subject: typeof subject === 'string' ? subject.slice(0, 500) : '',
      date: typeof date === 'string' ? date.slice(0, 100) : '',
      text: text.slice(0, 30000)
    };

    stage = 'ai_analysis';
    const aiStartedAt = Date.now();
    logFlow(flow, traceId, 'ai_analysis_started');
    const gasto = await analizarAvisoBancario(correo);
    logFlow(flow, traceId, 'ai_analysis_completed', {
      duration_ms: Date.now() - aiStartedAt,
      accepted: gasto.esPago
    });
    if (!gasto.esPago) {
      logFlow(flow, traceId, 'notification_ignored', {
        reason: gasto.motivo || 'not_a_confirmed_expense',
        duration_ms: Date.now() - startedAt,
        status: 200
      });
      return res.status(200).json({ success: true, ignored: true });
    }

    stage = 'database_insert';
    logFlow(flow, traceId, 'database_insert_started');
    const dbStartedAt = Date.now();
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('gastos').insert({
      user_id: userId,
      comercio: gasto.comercio,
      monto: gasto.monto,
      categoria: gasto.categoria,
      emoji: gasto.emoji,
      fecha: Number.isNaN(Date.parse(correo.date)) ? new Date().toISOString() : new Date(correo.date).toISOString(),
      source_message_id: messageId
    }).select().single();

    if (error?.code === '23505') {
      logFlow(flow, traceId, 'duplicate_ignored', {
        duration_ms: Date.now() - dbStartedAt,
        total_duration_ms: Date.now() - startedAt,
        status: 200
      });
      return res.status(200).json({ success: true, duplicate: true });
    }
    if (error) throw error;

    logFlow(flow, traceId, 'database_insert_completed', {
      duration_ms: Date.now() - dbStartedAt,
      total_duration_ms: Date.now() - startedAt,
      status: 200
    });
    return res.status(200).json({ success: true, gasto: data });
  } catch (error) {
    logFlowError(flow, traceId, 'processing_failed', error, {
      stage,
      error_code: error?.code || undefined,
      total_duration_ms: Date.now() - startedAt,
      status: 500
    });
    return res.status(500).json({ error: 'No se pudo procesar el correo.' });
  }
}
