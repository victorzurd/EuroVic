import { timingSafeEqual, createHash } from 'node:crypto';
import { createAdminClient } from '../lib/auth.js';
import { analizarCorreoBancario } from '../lib/bank-email.js';

function coincideSecreto(recibido, esperado) {
  if (typeof recibido !== 'string' || !esperado) return false;
  const a = createHash('sha256').update(recibido).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b) && recibido.length === esperado.length;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const expectedSecret = process.env.EMAIL_IMPORT_SECRET;
  const receivedSecret = req.headers['x-eurovic-secret'];
  if (!coincideSecreto(receivedSecret, expectedSecret)) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const userId = process.env.EMAIL_IMPORT_USER_ID;
  if (!userId) return res.status(500).json({ error: 'Falta configurar la cuenta de destino.' });

  const { message_id: messageId, from, subject, date, text } = req.body || {};
  if (typeof messageId !== 'string' || !messageId.trim() || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Faltan el identificador del correo o su contenido.' });
  }
  if (messageId.length > 300 || text.length > 30000) {
    return res.status(413).json({ error: 'El correo supera el tamaño permitido.' });
  }

  try {
    const correo = {
      from: typeof from === 'string' ? from.slice(0, 300) : '',
      subject: typeof subject === 'string' ? subject.slice(0, 500) : '',
      date: typeof date === 'string' ? date.slice(0, 100) : '',
      text: text.slice(0, 30000)
    };
    const gasto = await analizarCorreoBancario(correo);
    if (!gasto.esPago) return res.status(200).json({ success: true, ignored: true });

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
      return res.status(200).json({ success: true, duplicate: true });
    }
    if (error) throw error;
    return res.status(200).json({ success: true, gasto: data });
  } catch (error) {
    console.error('Error importando correo bancario:', error.message);
    return res.status(500).json({ error: 'No se pudo procesar el correo.' });
  }
}
