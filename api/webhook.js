import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.POSTGRES_SUPABASE_URL;
  const supabaseServiceKey = process.env.POSTGRES_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Faltan las variables POSTGRES_SUPABASE_URL o POSTGRES_SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export default async function handler(req, res) {
  // 1. Configuración de cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // 2. Parseo flexible del body
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      // Si viene como string plano, asumimos que todo el string es el texto enviado
      body = { text: req.body };
    }
  }

  // Acepta text, notificacion, message o req.query.text
  const texto = body?.text || body?.notificacion || body?.message || req.query?.text;

  if (!texto || typeof texto !== 'string' || texto.trim() === '') {
    return res.status(400).json({ 
      error: 'No se envió texto para analizar. Asegúrate de enviar un JSON con el campo "text" o "notificacion".',
      receivedBody: req.body 
    });
  }

  try {
    const supabase = getSupabaseClient();
    const gasto = await analizarGastoConGemini(texto);

    if (!gasto || !gasto.monto || isNaN(gasto.monto) || gasto.monto <= 0) {
      return res.status(400).json({ 
        error: 'No se pudo detectar un importe/monto válido en el texto enviado.',
        textoProcesado: texto,
        resultadoGemini: gasto 
      });
    }

    const { data, error } = await supabase
      .from('gastos')
      .insert([
        {
          comercio: gasto.comercio || 'Compra Detectada',
          monto: gasto.monto,
          categoria: gasto.categoria || 'Varios',
          emoji: gasto.emoji || '✨',
          fecha: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      mensaje: `${gasto.emoji} ${gasto.comercio}: -${gasto.monto.toFixed(2)}€ (${gasto.categoria})`,
      gasto: data
    });

  } catch (error) {
    console.error('Error en webhook.js:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function analizarGastoConGemini(texto) {
  const apiKey = process.env.GEMINI_API_KEY;

  // Fallback si no hay API Key de Gemini configurada
  if (!apiKey) {
    console.warn('GEMINI_API_KEY no encontrada. Usando extracción básica por Regex.');
    const match = texto.match(/(\d+[\.,]?\d*)\s*(?:€|EUR|euros)/i) || texto.match(/(?:pago|compra|importe) (?:de )?(\d+[\.,]?\d*)/i);
    const monto = match ? parseFloat(match[1].replace(',', '.')) : 0;
    return { comercio: 'Compra Detectada', monto, categoria: 'Varios', emoji: '✨' };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `Extrae la información del gasto bancario del siguiente texto de correo/notificación:\n"${texto}"` }]
            }
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            response_schema: {
              type: 'OBJECT',
              properties: {
                comercio: { type: 'STRING' },
                monto: { type: 'NUMBER' },
                categoria: { 
                  type: 'STRING', 
                  enum: [
                    'Shopping',
                    'Self Care',
                    'Brunch & Desayunos',
                    'Cenas & Copas',
                    'Fiesta & Eventos',
                    'Supermercado',
                    'Escapadas',
                    'Movilidad',
                    'Varios'
                  ] 
                },
                emoji: { type: 'STRING' }
              },
              required: ['comercio', 'monto', 'categoria', 'emoji']
            }
          }
        })
      }
    );

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return resultText ? JSON.parse(resultText) : null;
  } catch (err) {
    console.error('Error al invocar la API de Gemini:', err);
    return null;
  }
}