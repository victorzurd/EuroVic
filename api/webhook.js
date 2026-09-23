import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.POSTGRES_SUPABASE_URL;
  const supabaseServiceKey = process.env.POSTGRES_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Faltan las variables POSTGRES_SUPABASE_URL o POSTGRES_SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = { text: body };
    }
  }

  const texto = body?.text || body?.notificacion || body?.message || body?.contenido || req.query?.text;

  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    return res.status(400).json({ error: 'No se recibió ningún texto válido para analizar.' });
  }

  try {
    const supabase = getSupabaseClient();
    const gasto = await analizarGastoConGemini(texto);

    if (!gasto || !gasto.monto || isNaN(gasto.monto) || gasto.monto <= 0) {
      return res.status(400).json({
        error: 'No se pudo detectar un importe/monto válido en el texto provisto.',
        textoProcesado: texto
      });
    }

    const { data, error } = await supabase
      .from('gastos')
      .insert([
        {
          comercio: gasto.comercio || 'Compra Detectada',
          monto: parseFloat(gasto.monto),
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

// Extracción mediante Expresión Regular (Fallback confiable)
function extraerGastoPorRegex(texto) {
  const matchMonto = texto.match(/(\d+[\.,]?\d*)\s*(?:€|EUR|euros)/i) || 
                     texto.match(/(?:pago|compra|importe) (?:de )?(\d+[\.,]?\d*)/i);
  
  const monto = matchMonto ? parseFloat(matchMonto[1].replace(',', '.')) : 0;

  // Extracción simple del comercio
  let comercio = 'Compra Detectada';
  const matchComercio = texto.match(/(?:en|de)\s+([A-Za-z0-9\s]+?)(?:\s+\d+|\s*$)/i);
  if (matchComercio && matchComercio[1]) {
    comercio = matchComercio[1].trim();
  }

  return { comercio, monto, categoria: 'Varios', emoji: '✨' };
}

async function analizarGastoConGemini(texto) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return extraerGastoPorRegex(texto);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `Extrae la información del gasto bancario del siguiente texto:\n"${texto}"` }]
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
                  enum: ['Shopping', 'Self Care', 'Brunch & Desayunos', 'Cenas & Copas', 'Fiesta & Eventos', 'Supermercado', 'Escapadas', 'Movilidad', 'Varios'] 
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

    if (data.error || !data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.warn('Falló la llamada a Gemini API, activando fallback Regex. Error:', data.error);
      return extraerGastoPorRegex(texto);
    }

    return JSON.parse(data.candidates[0].content.parts[0].text);

  } catch (err) {
    console.warn('Excepción invocando Gemini API, usando fallback Regex:', err);
    return extraerGastoPorRegex(texto);
  }
}