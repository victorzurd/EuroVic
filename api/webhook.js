import { createAdminClient, requireUser } from '../lib/auth.js';
import { analizarAvisoBancario } from '../lib/bank-email.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const user = await requireUser(req, res);
  if (!user) return;

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
    return res.status(400).json({ error: 'No se recibió ningún texto válido para analizar.' });
  }
  if (texto.length > 30000) {
    return res.status(413).json({ error: 'El texto supera el tamaño permitido.' });
  }

  try {
    const gasto = await analizarAvisoBancario(texto.trim());
    if (!gasto.esPago) {
      return res.status(422).json({ error: 'El texto no permite confirmar un cargo en euros con comercio e importe.' });
    }

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

    return res.status(200).json({
      success: true,
      mensaje: `${gasto.emoji} ${data.comercio}: -${Number(data.monto).toFixed(2)}€ (${gasto.categoria})`,
      gasto: data
    });
  } catch (error) {
    console.error('Error en webhook.js:', error.message);
    return res.status(500).json({ error: 'No se pudo analizar o guardar el gasto.' });
  }
}
