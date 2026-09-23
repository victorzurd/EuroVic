import { createClient } from '@supabase/supabase-js';

// 1. Inicialización y validación de variables de entorno
const supabaseUrl = process.env.POSTGRES_SUPABASE_URL;
const supabaseServiceKey = process.env.POSTGRES_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Faltan las variables POSTGRES_SUPABASE_URL o POSTGRES_SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

export default async function handler(req, res) {
  // Configuración de CORS previa a cualquier retornos temprano
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // Parsing seguro del cuerpo de la petición
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  // Extracción unificada del texto enviado
  const texto = body?.text || body?.notificacion || req.query?.text;

  if (!texto) {
    return res.status(400).json({ error: 'No se envió texto para analizar' });
  }

  try {
    const gasto = await analizarGastoConGemini(texto);

    if (!gasto || !gasto.monto) {
      return res.status(400).json({ error: 'No se pudo detectar un importe válido en el texto' });
    }

    const { data, error } = await supabase
      .from('gastos')
      .insert([
        {
          comercio: gasto.comercio,
          monto: gasto.monto,
          categoria: gasto.categoria,
          emoji: gasto.emoji,
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

  if (!apiKey) {
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