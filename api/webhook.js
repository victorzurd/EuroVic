import { randomUUID } from 'node:crypto';
import { createAdminClient, requireUser } from '../lib/auth.js';
import { analizarAvisoBancario } from '../lib/bank-email.js';
import { logFlow, logFlowError } from '../lib/flow-log.js';

export default async function handler(req, res) {
  const traceId = randomUUID();
  const flow = 'bank_notification_webhook';
  const startedAt = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  logFlow(flow, traceId, 'request_received', { method: req.method });
  if (req.method !== 'POST') {
    logFlow(flow, traceId, 'request_rejected', { reason: 'method_not_allowed', status: 405 });
    return res.status(405).json({ error: 'Método no permitido' });
  }

  let stage = 'authentication';
  try {
    const user = await requireUser(req, res);
    if (!user) {
      logFlow(flow, traceId, 'authentication_failed', { status: 401 });
      return;
    }
    logFlow(flow, traceId, 'authentication_succeeded');

    stage = 'payload_validation';
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = { text: body };
      }
    }

    const texto = body?.text || body?.notificacion || body?.message || body?.contenido || req.query?.text;
    if (typeof texto !== 'string' || !texto.trim()) {
      logFlow(flow, traceId, 'payload_rejected', { reason: 'missing_text', status: 400 });
      return res.status(400).json({ error: 'No se recibió ningún texto válido para analizar.' });
    }
    if (texto.length > 30000) {
      logFlow(flow, traceId, 'payload_rejected', { reason: 'payload_too_large', status: 413 });
      return res.status(413).json({ error: 'El texto supera el tamaño permitido.' });
    }
    logFlow(flow, traceId, 'payload_validated', { text_length: texto.length });

    stage = 'ai_analysis';
    const aiStartedAt = Date.now();
    logFlow(flow, traceId, 'ai_analysis_started');
    const gasto = await analizarAvisoBancario(texto.trim());
    logFlow(flow, traceId, 'ai_analysis_completed', {
      duration_ms: Date.now() - aiStartedAt,
      accepted: gasto.esPago
    });
    if (!gasto.esPago) {
      logFlow(flow, traceId, 'notification_ignored', {
        reason: gasto.motivo || 'not_a_confirmed_expense',
        duration_ms: Date.now() - startedAt,
        status: 422
      });
      return res.status(422).json({ error: 'El texto no permite confirmar un cargo en euros con comercio e importe.' });
    }

    stage = 'database_insert';
    logFlow(flow, traceId, 'database_insert_started');
    const dbStartedAt = Date.now();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('gastos')
      .insert({
        user_id: user.id,
        comercio: gasto.comercio,
        monto: gasto.monto,
        categoria: gasto.categoria,
        emoji: gasto.emoji,
        fecha: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    logFlow(flow, traceId, 'database_insert_completed', {
      duration_ms: Date.now() - dbStartedAt,
      total_duration_ms: Date.now() - startedAt,
      status: 200
    });

    return res.status(200).json({
      success: true,
      mensaje: `${gasto.emoji} ${data.comercio}: -${Number(data.monto).toFixed(2)}€ (${gasto.categoria})`,
      gasto: data
    });
  } catch (error) {
    logFlowError(flow, traceId, 'processing_failed', error, {
      stage,
      error_code: error?.code || undefined,
      total_duration_ms: Date.now() - startedAt,
      status: 500
    });
    return res.status(500).json({ error: 'No se pudo analizar o guardar el gasto.' });
  }
}
